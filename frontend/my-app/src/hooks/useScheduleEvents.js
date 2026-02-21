import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const RPC_URL          = 'https://testnet.hashio.io/api';
const CONTRACT_ADDRESS = '0xc4A1Ef40bC4771D8c2f5352429A737a980B40692';
const STREAM_ID        = 3n;
const LOOKBACK_BLOCKS  = 100_000; // ~3 days of Hedera blocks
const POLL_MS          = 30_000;

const ABI = [
  'event StreamCreated(uint256 indexed streamId, address indexed payer, address indexed payee, uint256 intervalSecs, uint256 baseRate)',
  'event SettlementScheduled(uint256 indexed streamId, uint256 scheduledTime, uint256 desiredTime, address scheduleAddress)',
  'event SettlementExecuted(uint256 indexed streamId, uint256 timestamp, uint256 count, uint256 amountPaid, uint256 remainingDeposit, uint256 remainingAccrued)',
  'event SettlementFailed(uint256 indexed streamId, string reason, uint256 needed, uint256 available)',
  'event DepositAdded(uint256 indexed streamId, address indexed sender, uint256 amount)',
  'event StreamPaused(uint256 indexed streamId, string reason)',
  'event StreamResumed(uint256 indexed streamId)',
];

async function fetchBlockTs(provider, blockNumber, cache) {
  if (cache[blockNumber]) return cache[blockNumber];
  const block = await provider.getBlock(blockNumber);
  const ts = Number(block?.timestamp ?? 0) * 1000;
  cache[blockNumber] = ts;
  return ts;
}

/**
 * Returns schedule lifecycle events for the configured stream.
 * Each event has: { type, timestamp, txHash, blockNumber, ...fields }
 */
export function useScheduleEvents() {
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    const tsCache = {};

    async function load() {
      try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
        const current  = await provider.getBlockNumber();
        const from     = Math.max(0, current - LOOKBACK_BLOCKS);

        // Fetch all relevant event types in parallel
        const [
          scheduledLogs,
          executedLogs,
          failedLogs,
          createdLogs,
          depositLogs,
          pausedLogs,
          resumedLogs,
        ] = await Promise.all([
          contract.queryFilter(contract.filters.SettlementScheduled(STREAM_ID), from, current),
          contract.queryFilter(contract.filters.SettlementExecuted(STREAM_ID),  from, current),
          contract.queryFilter(contract.filters.SettlementFailed(STREAM_ID),    from, current),
          contract.queryFilter(contract.filters.StreamCreated(STREAM_ID),       from, current),
          contract.queryFilter(contract.filters.DepositAdded(STREAM_ID),        from, current),
          contract.queryFilter(contract.filters.StreamPaused(STREAM_ID),        from, current),
          contract.queryFilter(contract.filters.StreamResumed(STREAM_ID),       from, current),
        ]);

        if (cancelled) return;

        // Collect unique block numbers
        const allLogs = [
          ...scheduledLogs, ...executedLogs, ...failedLogs,
          ...createdLogs, ...depositLogs, ...pausedLogs, ...resumedLogs,
        ];
        const blockNums = [...new Set(allLogs.map(l => l.blockNumber))];
        await Promise.all(blockNums.map(bn => fetchBlockTs(provider, bn, tsCache)));

        if (cancelled) return;

        function normalize(log, type, extra) {
          return {
            type,
            txHash:      log.transactionHash,
            blockNumber: log.blockNumber,
            timestamp:   tsCache[log.blockNumber] ?? 0,
            ...extra,
          };
        }

        const parsed = [
          ...createdLogs.map(l => {
            const p = contract.interface.parseLog(l);
            return normalize(l, 'created', {
              intervalSecs: Number(p.args.intervalSecs),
              baseRate:     Number(p.args.baseRate),
            });
          }),
          ...scheduledLogs.map(l => {
            const p = contract.interface.parseLog(l);
            return normalize(l, 'scheduled', {
              scheduledTime:   Number(p.args.scheduledTime) * 1000,
              scheduleAddress: p.args.scheduleAddress,
            });
          }),
          ...executedLogs.map(l => {
            const p = contract.interface.parseLog(l);
            return normalize(l, 'executed', {
              count:            Number(p.args.count),
              amountPaid:       p.args.amountPaid,     // tinybar BigInt
              remainingDeposit: p.args.remainingDeposit,
            });
          }),
          ...failedLogs.map(l => {
            const p = contract.interface.parseLog(l);
            return normalize(l, 'failed', {
              reason:    p.args.reason,
              needed:    p.args.needed,
              available: p.args.available,
            });
          }),
          ...depositLogs.map(l => {
            const p = contract.interface.parseLog(l);
            return normalize(l, 'deposit', {
              amount: p.args.amount,
            });
          }),
          ...pausedLogs.map(l => {
            const p = contract.interface.parseLog(l);
            return normalize(l, 'paused', { reason: p.args.reason });
          }),
          ...resumedLogs.map(l => normalize(l, 'resumed', {})),
        ];

        parsed.sort((a, b) => b.timestamp - a.timestamp);
        setEvents(parsed);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return { events, loading, error };
}
