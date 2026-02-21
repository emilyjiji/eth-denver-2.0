import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const ADI_RPC = 'https://rpc.ab.testnet.adifoundation.ai';
const CONTRACT_ADDRESS = '0x31246c37f75cC7fe6f669651c66d27E6708De1b1';
const POLL_INTERVAL_MS = 60_000; // 60 seconds (reduce polling frequency)

const ABI = [
  "function totalReceivables() external view returns (uint256)",
  "function getReceivable(uint256) external view returns (tuple(uint256 tokenId, address utilityProvider, address customer, uint256 amountUSD, uint256 amountADI, uint256 dueDate, uint8 status, bytes32 hederaTxHash, uint256 mintedAt))",
  "function ownerOf(uint256) external view returns (address)",
  "function balanceOf(address) external view returns (uint256)",
  "function totalOutstanding() external view returns (uint256)",
  "function totalPaid() external view returns (uint256)"
];

const ReceivableStatus = {
  OUTSTANDING: 0,
  FACTORED: 1,
  PARTIAL: 2,
  PAID: 3,
  DEFAULTED: 4
};

/**
 * Fetch receivable NFTs from ADI Chain
 * Returns: { outstanding[], paid[], totalOutstandingADI, totalPaidADI, loading, error }
 */
export function useADIReceivables() {
  const [outstanding, setOutstanding] = useState([]);
  const [paid, setPaid] = useState([]);
  const [totalOutstandingADI, setTotalOutstandingADI] = useState(0n);
  const [totalPaidADI, setTotalPaidADI] = useState(0n);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      try {
        const provider = new ethers.JsonRpcProvider(ADI_RPC);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

        // Get totals
        const totalCount = await contract.totalReceivables();
        const totalOut = await contract.totalOutstanding();
        const totalP = await contract.totalPaid();

        const outstandingReceivables = [];
        const paidReceivables = [];

        // Fetch all receivables
        for (let tokenId = 1; tokenId <= totalCount; tokenId++) {
          try {
            const receivable = await contract.getReceivable(tokenId);
            const owner = await contract.ownerOf(tokenId);

            const data = {
              tokenId: Number(receivable.tokenId),
              owner: owner,
              utilityProvider: receivable.utilityProvider,
              customer: receivable.customer,
              amountUSD: Number(receivable.amountUSD) / 1e6,  // Convert to USD
              amountADI: ethers.formatEther(receivable.amountADI),
              dueDate: new Date(Number(receivable.dueDate) * 1000),
              status: Number(receivable.status),
              hederaTxHash: receivable.hederaTxHash,
              mintedAt: new Date(Number(receivable.mintedAt) * 1000)
            };

            // Categorize by status
            if (data.status === ReceivableStatus.OUTSTANDING) {
              outstandingReceivables.push(data);
            } else if (data.status === ReceivableStatus.PAID) {
              paidReceivables.push(data);
            }

          } catch (err) {
            console.warn(`Failed to fetch receivable ${tokenId}:`, err.message);
          }
        }

        if (!cancelled) {
          setOutstanding(outstandingReceivables);
          setPaid(paidReceivables);
          setTotalOutstandingADI(totalOut);
          setTotalPaidADI(totalP);
          setError(null);
        }

      } catch (err) {
        if (!cancelled) {
          console.warn('[useADIReceivables] fetch failed:', err.message);
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

  return { outstanding, paid, totalOutstandingADI, totalPaidADI, loading, error };
}
