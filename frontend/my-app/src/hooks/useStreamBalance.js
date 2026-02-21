import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const RPC_URL          = 'https://testnet.hashio.io/api';
const CONTRACT_ADDRESS = '0xc4A1Ef40bC4771D8c2f5352429A737a980B40692';
const STREAM_ID        = 3;
const POLL_INTERVAL_MS = 30_000;

const ABI = [
  'function getStreamInfo(uint256 streamId) external view returns (address payer, address payee, bool active, uint256 depositBalance, uint256 accruedAmount, uint256 totalUsageUnits, uint256 lastSettlementTime, uint256 nextSettlementTime, uint256 settlementCount)',
];

/**
 * Fetches live depositBalance and accruedAmount for the stream.
 * Both values are in tinybar (1 HBAR = 1e8 tinybar).
 */
export function useStreamBalance() {
  const [depositBalance,  setDepositBalance]  = useState(null);
  const [accruedAmount,   setAccruedAmount]   = useState(null);
  const [totalUsageUnits, setTotalUsageUnits] = useState(null);
  const [loading, setLoading]                 = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchBalance() {
      try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
        const info     = await contract.getStreamInfo(STREAM_ID);
        if (!cancelled) {
          setDepositBalance(info.depositBalance);   // bigint tinybar
          setAccruedAmount(info.accruedAmount);     // bigint tinybar
          setTotalUsageUnits(info.totalUsageUnits); // bigint, units where 1000 = 1 kWh
        }
      } catch (err) {
        console.warn('[useStreamBalance] fetch failed:', err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchBalance();
    const interval = setInterval(fetchBalance, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return { depositBalance, accruedAmount, totalUsageUnits, loading };
}
