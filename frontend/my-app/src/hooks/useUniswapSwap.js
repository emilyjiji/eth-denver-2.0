/* global BigInt */
import { useState, useCallback } from 'react';
import { ethers } from 'ethers';

const UNISWAP_API = 'https://trade-api.gateway.uniswap.org/v1';

const CHAIN_ID = parseInt(process.env.REACT_APP_CHAIN_ID || '11155111');

// Token addresses per chain
const WETH_ADDRESS = {
  11155111: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // Sepolia
  84532:    '0x4200000000000000000000000000000000000006', // Base Sepolia
  8453:     '0x4200000000000000000000000000000000000006', // Base mainnet
}[CHAIN_ID] ?? '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';

const USDC_ADDRESS = {
  11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia USDC
  84532:    '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia USDC
  8453:     '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base mainnet USDC
}[CHAIN_ID] ?? '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

const NETWORK_META = {
  11155111: { name: 'Sepolia',      rpc: 'https://rpc.sepolia.org',      explorer: 'https://sepolia.etherscan.io' },
  84532:    { name: 'Base Sepolia', rpc: 'https://sepolia.base.org',      explorer: 'https://sepolia.basescan.org' },
  8453:     { name: 'Base',         rpc: 'https://mainnet.base.org',      explorer: 'https://basescan.org' },
}[CHAIN_ID] ?? { name: 'Sepolia', rpc: 'https://rpc.sepolia.org', explorer: 'https://sepolia.etherscan.io' };

export { NETWORK_META };
export const EXPLORER_BASE = NETWORK_META.explorer;

const BASE_NETWORK = {
  chainId: '0x' + CHAIN_ID.toString(16),
  chainName: NETWORK_META.name,
  nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
  rpcUrls: [NETWORK_META.rpc],
  blockExplorerUrls: [NETWORK_META.explorer],
};

async function switchToBase() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BASE_NETWORK.chainId }],
    });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [BASE_NETWORK],
      });
    } else {
      throw err;
    }
  }
}

export function useUniswapSwap() {
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [swapLoading, setSwapLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchQuote = useCallback(async (ethAmount, swapper) => {
    if (!ethAmount || parseFloat(ethAmount) <= 0 || !swapper) return null;
    setQuoteLoading(true);
    setError(null);
    try {
      const amountWei = ethers.parseEther(ethAmount).toString();
      const res = await fetch(`${UNISWAP_API}/quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.REACT_APP_UNISWAP_API_KEY || '',
        },
        body: JSON.stringify({
          type: 'EXACT_INPUT',
          amount: amountWei,
          tokenInChainId: CHAIN_ID,
          tokenOutChainId: CHAIN_ID,
          tokenIn: WETH_ADDRESS,
          tokenOut: USDC_ADDRESS,
          swapper,
          slippageTolerance: 0.5,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Quote failed (${res.status})`);
      }
      const data = await res.json();
      setQuote(data);
      return data;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setQuoteLoading(false);
    }
  }, []);

  const executeSwap = useCallback(async (quoteData, swapper, ethAmountWei, onStep) => {
    setSwapLoading(true);
    setError(null);
    try {
      await switchToBase();

      // Step 1: Wrap ETH → WETH automatically
      onStep?.('Wrapping ETH → WETH…');
      const wrapTxHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          to: WETH_ADDRESS,
          from: swapper,
          data: '0xd0e30db0', // deposit() selector
          value: '0x' + BigInt(ethAmountWei).toString(16),
        }],
      });

      // Wait for wrap to confirm
      onStep?.('Waiting for wrap confirmation…');
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.waitForTransaction(wrapTxHash);

      // Step 2: Sign Permit2 for WETH
      onStep?.('Sign Permit2 approval…');
      let signature;
      if (quoteData.permitData) {
        const { domain, types, values } = quoteData.permitData;
        const { EIP712Domain: _unused, ...signTypes } = types;
        signature = await window.ethereum.request({
          method: 'eth_signTypedData_v4',
          params: [swapper, JSON.stringify({ domain, types: signTypes, primaryType: 'PermitSingle', message: values })],
        });
      }

      // Step 3: Get swap calldata and execute
      onStep?.('Confirm swap in MetaMask…');
      const res = await fetch(`${UNISWAP_API}/swap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.REACT_APP_UNISWAP_API_KEY || '',
        },
        body: JSON.stringify({
          quote: quoteData.quote,
          ...(signature && { signature, permitData: quoteData.permitData }),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Swap failed (${res.status})`);
      }
      const { swap } = await res.json();

      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          to: swap.to,
          from: swapper,
          data: swap.data,
          value: '0x' + BigInt(swap.value || '0').toString(16),
          ...(swap.gasLimit && { gas: '0x' + BigInt(swap.gasLimit).toString(16) }),
        }],
      });

      return { txHash, explorerUrl: `${EXPLORER_BASE}/tx/${txHash}` };
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setSwapLoading(false);
    }
  }, []);

  return {
    quote,
    fetchQuote,
    executeSwap,
    quoteLoading,
    swapLoading,
    error,
    setError,
    CHAIN_ID,
  };
}
