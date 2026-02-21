/* global BigInt */
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const RPC_URL          = 'https://testnet.hashio.io/api';
const CONTRACT_ADDRESS = '0xc4A1Ef40bC4771D8c2f5352429A737a980B40692';
const POLL_INTERVAL_MS = 30_000;
const LOOKBACK_BLOCKS  = 12_000; // ~10 hours on Hedera testnet

// Hide events before this cutoff (old test data at bad rates).
// Matches the same cutoff used in the customer Dashboard.
const CUTOFF_MS = new Date('2026-02-20T15:55:00').getTime();

// Stream ID → customer metadata
const STREAM_CUSTOMERS = {
  3: { name: 'Emily Jiji', email: 'emilyjiji418@gmail.com' },
};

const ABI = [
  'event UsageReported(uint256 indexed streamId, uint256 deltaUsage, uint256 effectiveRate, uint256 cost, uint256 totalAccrued)',
  'event SettlementExecuted(uint256 indexed streamId, uint256 timestamp, uint256 count, uint256 amountPaid, uint256 remainingDeposit, uint256 remainingAccrued)',
];

/**
 * Returns:
 *   charges[]    — UsageReported events (accruing receivables)
 *   settlements[] — SettlementExecuted events (payments received)
 *   loading, error
 *
 * Each charge:    { streamId, customer, timestamp, usageDelta, cost, totalAccrued, txHash }
 * Each settlement:{ streamId, customer, timestamp, amountPaid, remainingDeposit, count, txHash }
 */
export function useReceivables() {
  const [charges,     setCharges]     = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

        const currentBlock = await provider.getBlockNumber();
        const fromBlock    = Math.max(0, currentBlock - LOOKBACK_BLOCKS);

        // Fetch timestamps (cached by block number)
        const blockCache = {};
        const getTs = async (bn) => {
          if (!blockCache[bn]) {
            const blk = await provider.getBlock(bn);
            blockCache[bn] = Number(blk.timestamp) * 1000;
          }
          return blockCache[bn];
        };

        // ── UsageReported (charges) ──
        const usageLogs = await contract.queryFilter(
          contract.filters.UsageReported(), fromBlock, currentBlock,
        );

        const parsedCharges = await Promise.all(
          usageLogs.map(async (log) => {
            const streamId = Number(log.args.streamId);
            const ts = await getTs(log.blockNumber);
            return {
              streamId,
              customer:     STREAM_CUSTOMERS[streamId] ?? { name: `Stream ${streamId}`, email: '' },
              timestamp:    ts,
              usageDelta:   Number(log.args.deltaUsage),
              cost:         log.args.cost,          // bigint tinybar
              totalAccrued: log.args.totalAccrued,  // bigint tinybar
              txHash:       log.transactionHash,
            };
          })
        );

        // ── SettlementExecuted (payments received) ──
        const settleLogs = await contract.queryFilter(
          contract.filters.SettlementExecuted(), fromBlock, currentBlock,
        );

        const parsedSettlements = await Promise.all(
          settleLogs.map(async (log) => {
            const streamId = Number(log.args.streamId);
            const ts = await getTs(log.blockNumber);
            return {
              streamId,
              customer:         STREAM_CUSTOMERS[streamId] ?? { name: `Stream ${streamId}`, email: '' },
              timestamp:        ts,
              amountPaid:       log.args.amountPaid,       // bigint tinybar
              remainingDeposit: log.args.remainingDeposit, // bigint tinybar
              count:            Number(log.args.count),
              txHash:           log.transactionHash,
            };
          })
        );

        if (!cancelled) {
          // Charges: only known customers + after cutoff (drop test stream noise)
          setCharges(parsedCharges
            .filter(e => e.timestamp >= CUTOFF_MS && STREAM_CUSTOMERS[e.streamId])
            .sort((a, b) => b.timestamp - a.timestamp));
          // Settlements: all after cutoff — real money received, even from unnamed streams
          setSettlements(parsedSettlements
            .filter(e => e.timestamp >= CUTOFF_MS)
            .sort((a, b) => b.timestamp - a.timestamp));
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[useReceivables] fetch failed:', err.message);
          setError(err.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    const interval = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return { charges, settlements, loading, error };
}
