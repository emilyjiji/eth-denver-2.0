/* global BigInt */
import { useState, useCallback } from 'react';
import { ethers } from 'ethers';

// ── Testnet config (hardcoded for demo) ──────────────────────────────────────
const RPC_URL          = 'https://testnet.hashio.io/api';
const CONTRACT_ADDRESS = '0xc4A1Ef40bC4771D8c2f5352429A737a980B40692';
const ORACLE_KEY       = '0xcb3b838945bac89df6cf4e76e8a6395f29460ad1013cf4002c98c6e1070e5846';

// Hedera EVM stores msg.value in tinybar (1 HBAR = 10^8 tinybar).
// All monetary values (depositBalance, accruedAmount, cost) are in tinybar.
// BASE_RATE is tinybar per usage-unit (kWh×1000).
const STREAM_ID    = 3n;       // stream 3 — realistic rates, 200 HBAR deposit
const NEW_USAGE    = 1500n;    // first cumulative report: 1.500 kWh
const NONCE        = 1n;       // first nonce for stream 2
const BASE_RATE    = 50_000n;  // 50 000 tinybar/unit — STANDARD tier ≈ $0.04–0.06/period (matches oracle pricingEngine)
const CONGESTION   = 13000n;   // 1.3× moderate congestion (basis pts, 10000 = 1×)
const USAGE_DELTA  = 1500n;    // units (÷1000 = kWh)

const ABI = [
  'function reportUsageWithPricing(uint256 streamId, uint256 newTotalUsage, uint256 timestamp, uint256 nonce, uint256 baseRate, uint256 congestionFactor, bytes calldata signature) external',
  'event UsageReported(uint256 indexed streamId, uint256 deltaUsage, uint256 effectiveRate, uint256 cost, uint256 totalAccrued)',
];

// ── cost formula mirrors the contract ────────────────────────────────────────
const SIMULATED_COST = (USAGE_DELTA * BASE_RATE * CONGESTION) / 10000n;

export function useHederaContract() {
  const [loading, setLoading] = useState(false);

  const reportUsage = useCallback(async () => {
    setLoading(true);
    try {
      const provider    = new ethers.JsonRpcProvider(RPC_URL);
      const oracle      = new ethers.Wallet(ORACLE_KEY, provider);
      const contract    = new ethers.Contract(CONTRACT_ADDRESS, ABI, oracle);
      const timestamp   = BigInt(Math.floor(Date.now() / 1000));

      // Sign the report
      const msgHash  = ethers.solidityPackedKeccak256(
        ['uint256','uint256','uint256','uint256','uint256','uint256'],
        [STREAM_ID, NEW_USAGE, BASE_RATE, CONGESTION, timestamp, NONCE],
      );
      const signature = await oracle.signMessage(ethers.getBytes(msgHash));

      const tx      = await contract.reportUsageWithPricing(
        STREAM_ID, NEW_USAGE, timestamp, NONCE, BASE_RATE, CONGESTION, signature,
      );
      const receipt = await tx.wait();

      // Parse UsageReported event if present
      // Event: UsageReported(streamId, deltaUsage, effectiveRate, cost, totalAccrued)
      let usageDelta = USAGE_DELTA;
      let cost       = SIMULATED_COST;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed?.name === 'UsageReported') {
            usageDelta = parsed.args.deltaUsage;
            cost       = parsed.args.cost;
          }
        } catch { /* non-matching log */ }
      }

      return {
        hash:      receipt.hash,
        timestamp: Date.now(),
        kwhUnits:  Number(usageDelta),
        costWei:   cost,
        onChain:   true,
      };
    } catch (err) {
      // Fallback: simulated data so the demo always shows a result
      console.warn('Contract call failed — showing simulated tx:', err.message);
      return {
        hash:      null,
        timestamp: Date.now(),
        kwhUnits:  Number(USAGE_DELTA),
        costWei:   SIMULATED_COST,
        onChain:   false,
      };
    } finally {
      setLoading(false);
    }
  }, []);

  return { reportUsage, loading };
}
