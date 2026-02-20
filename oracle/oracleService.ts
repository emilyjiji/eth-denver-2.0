/**
 * @file oracleService.ts
 * @notice Off-chain oracle service for ElectricityPaymentStream.
 *
 * Responsibilities:
 *  • Every REPORT_INTERVAL_MS (default 5 min), for each monitored stream:
 *      1. Generate a usage sample from UsageSimulator.
 *      2. Calculate the current price + congestion from PricingEngine.
 *      3. ECDSA-sign the report with the oracle's private key.
 *      4. Call `reportUsageWithPricing()` on the contract.
 *  • Sync nonce and cumulative usage from the contract on startup.
 *  • Retry up to MAX_RETRIES times on transient errors.
 *  • Detect and skip paused / inactive streams.
 *
 * Usage:
 *   const oracle = new OracleService(rpcUrl, privateKey, contractAddress, abi);
 *   await oracle.addStream(0);
 *   oracle.start();
 */

import { ethers } from 'ethers';
import { UsageSimulator } from './usageSimulator';
import { PricingEngine }   from './pricingEngine';
import type { StreamState } from './types';

const REPORT_INTERVAL_MS = 15 * 60 * 1_000; // 15 minutes
const MAX_RETRIES        = 3;
const RETRY_DELAY_MS     = 30_000;          // 30 seconds

export class OracleService {
  private readonly provider:  ethers.JsonRpcProvider;
  private readonly wallet:    ethers.Wallet;
  private readonly contract:  ethers.Contract;
  private readonly simulator: UsageSimulator = new UsageSimulator();
  private readonly pricing:   PricingEngine  = new PricingEngine();
  private readonly streams:   Map<number, StreamState> = new Map();

  constructor(
    rpcUrl:          string,
    privateKey:      string,
    contractAddress: string,
    contractAbi:     ethers.InterfaceAbi,
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet   = new ethers.Wallet(privateKey, this.provider);
    this.contract = new ethers.Contract(contractAddress, contractAbi, this.wallet);
  }

  // ── Stream management ──────────────────────────────────────────────────────

  /**
   * Register a stream to monitor.  Syncs nonce and cumulative usage from
   * the contract so the oracle can resume after a restart without nonce drift.
   */
  async addStream(streamId: number): Promise<void> {
    const [, , active, , , totalUsageUnits] =
      await this.contract.getStreamInfo(streamId);

    // Read the oracle nonce directly from the packed struct storage field.
    const raw: any = await this.contract.streams(streamId);
    const nonce = Number(raw.oracleNonce ?? 0n);

    this.simulator.setCumulative(BigInt(totalUsageUnits));

    this.streams.set(streamId, {
      streamId,
      lastReportedUsage: BigInt(totalUsageUnits),
      currentNonce:      nonce,
      lastReportTime:    Date.now(),
      isActive:          Boolean(active),
    });

    console.log(
      `[Oracle] Stream ${streamId} registered — nonce=${nonce}, ` +
      `cumKWh=${totalUsageUnits}, active=${active}`,
    );
  }

  // ── Main loop ──────────────────────────────────────────────────────────────

  /**
   * Start the oracle reporting loop.  Runs immediately, then every
   * REPORT_INTERVAL_MS milliseconds.
   */
  start(): void {
    console.log(
      `[Oracle] Service started. Reporting every ${REPORT_INTERVAL_MS / 1_000}s ` +
      `for ${this.streams.size} stream(s).`,
    );
    this.runCycle();
    setInterval(() => this.runCycle(), REPORT_INTERVAL_MS);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async runCycle(): Promise<void> {
    for (const [streamId, state] of this.streams) {
      if (!state.isActive) {
        console.log(`[Oracle] Stream ${streamId} inactive — skipping.`);
        continue;
      }
      await this.reportWithRetry(streamId, state);
    }
  }

  private async reportWithRetry(
    streamId: number,
    state:    StreamState,
  ): Promise<void> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.reportForStream(streamId, state);
        return;
      } catch (err: any) {
        const isLast = attempt === MAX_RETRIES;
        console.error(
          `[Oracle] Stream ${streamId} report failed (attempt ${attempt}/${MAX_RETRIES}):`,
          err?.message ?? err,
        );

        // Detect nonce desync and resync from the contract.
        if (String(err?.message).includes('InvalidNonce')) {
          console.warn(`[Oracle] Nonce desync on stream ${streamId} — resyncing…`);
          try {
            const raw: any = await this.contract.streams(streamId);
            state.currentNonce = Number(raw.oracleNonce ?? 0n);
            console.log(`[Oracle] Nonce resynced to ${state.currentNonce}`);
          } catch { /* ignore */ }
        }

        if (!isLast) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    }
    console.error(
      `[Oracle] Stream ${streamId} failed after ${MAX_RETRIES} retries — will retry next cycle.`,
    );
  }

  private async reportForStream(
    streamId: number,
    state:    StreamState,
  ): Promise<void> {
    // 1. Verify stream is still active on-chain.
    const [, , active] = await this.contract.getStreamInfo(streamId);
    if (!active) {
      state.isActive = false;
      console.log(`[Oracle] Stream ${streamId} paused on-chain — disabling monitoring.`);
      return;
    }

    // 2. Generate usage sample.
    const sample = this.simulator.generateHourlyUsage();

    // 3. Calculate pricing.
    const hour             = new Date().getUTCHours();
    const baseRate         = this.pricing.getBaseRate(hour);
    const loadPercent      = this.pricing.simulateCongestion();
    const congestionFactor = this.pricing.getCongestionFactor(loadPercent);

    const timestamp = Math.floor(Date.now() / 1_000);
    const nonce     = state.currentNonce + 1;

    // 4. Sign the report.
    //    Contract hash: keccak256(abi.encodePacked(streamId, newTotalUsage, baseRate,
    //                                              congestionFactor, timestamp, nonce))
    //    We call wallet.signMessage(bytes) which adds the "\x19Ethereum Signed Message:\n32" prefix,
    //    matching ElectricityPaymentStream._recoverSigner().
    const hash = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256'],
      [streamId, sample.cumulativeKWh, baseRate, congestionFactor, timestamp, nonce],
    );
    const signature = await this.wallet.signMessage(ethers.getBytes(hash));

    // 5. Submit to the contract.
    const tx = await this.contract.reportUsageWithPricing(
      streamId,
      sample.cumulativeKWh,
      timestamp,
      nonce,
      baseRate,
      congestionFactor,
      signature,
    );
    const receipt = await tx.wait();

    // 6. Update local state.
    state.lastReportedUsage = sample.cumulativeKWh;
    state.currentNonce      = nonce;
    state.lastReportTime    = Date.now();

    const effectiveRate = this.pricing.getEffectiveRate(baseRate, congestionFactor);
    console.log(
      `[Oracle] Stream ${streamId} reported — ` +
      `hourlyKWh=${sample.hourlyKWh} (×1000), ` +
      `baseRate=${baseRate}, congestion=${congestionFactor}bps, ` +
      `effectiveRate=${effectiveRate}, tx=${receipt?.hash}`,
    );
  }
}
