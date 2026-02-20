/* global BigInt */
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const RPC_URL          = 'https://testnet.hashio.io/api';
const CONTRACT_ADDRESS = '0xc4A1Ef40bC4771D8c2f5352429A737a980B40692';
const STREAM_ID        = 2; // stream 2 — 15-min settlement interval
const POLL_INTERVAL_MS = 30_000; // re-fetch every 30 seconds
const LOOKBACK_BLOCKS  = 12_000;  // ~10 hours on Hedera testnet (~3 s/block)

const ABI = [
  'event UsageReported(uint256 indexed streamId, uint256 deltaUsage, uint256 effectiveRate, uint256 cost, uint256 totalAccrued)',
];

/**
 * Fetches all UsageReported events for STREAM_ID and returns them as a flat
 * array sorted by block time, newest first.
 *
 * Each element: { timestamp, usageDelta, effectiveRate, cost, txHash }
 * Monetary fields (cost) are in tinybar (1 HBAR = 10^8 tinybar).
 */
export function useOnChainUsage() {
  const [events,  setEvents]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchEvents() {
      try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

        const currentBlock = await provider.getBlockNumber();
        const fromBlock    = Math.max(0, currentBlock - LOOKBACK_BLOCKS);

        const filter = contract.filters.UsageReported(STREAM_ID);
        const logs   = await contract.queryFilter(filter, fromBlock, currentBlock);

        // Fetch block timestamps in parallel (cache avoids duplicate fetches)
        const blockCache = {};
        const getTs = async (bn) => {
          if (!blockCache[bn]) {
            const blk = await provider.getBlock(bn);
            blockCache[bn] = Number(blk.timestamp) * 1000;
          }
          return blockCache[bn];
        };

        const parsed = await Promise.all(
          logs.map(async (log) => {
            const ts = await getTs(log.blockNumber);
            return {
              timestamp:     ts,
              usageDelta:    Number(log.args.deltaUsage),
              effectiveRate: log.args.effectiveRate,
              cost:          log.args.cost,        // bigint tinybar
              txHash:        log.transactionHash,
            };
          })
        );

        if (!cancelled) {
          setEvents(parsed.sort((a, b) => a.timestamp - b.timestamp));
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[useOnChainUsage] fetch failed:', err.message);
          setError(err.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchEvents();
    const interval = setInterval(fetchEvents, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return { events, loading, error };
}
