/* global BigInt */
import { useState, useCallback } from 'react';
import { ethers } from 'ethers';

const UNISWAP_API = 'https://trade-api.gateway.uniswap.org/v1';
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

const CHAIN_ID = parseInt(process.env.REACT_APP_CHAIN_ID || '11155111');

// Zero address = native ETH in Uniswap Trading API
const NATIVE_ETH = '0x0000000000000000000000000000000000000000';

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

const RELAY_URL = process.env.REACT_APP_RELAY_URL || 'http://localhost:3001';
function rlog(msg) {
  console.log('[swap]', msg);
  fetch(`${RELAY_URL}/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg }),
  }).catch(() => {});
}

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

// Try native ETH first, fall back to WETH. Retries up to 3 times on 404.
async function fetchQuoteForToken(tokenIn, amountWei, swapper) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt));
    try {
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
          tokenIn,
          tokenOut: USDC_ADDRESS,
          swapper,
          slippageTolerance: 5.0,
          protocols: ['V2', 'V3'],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return { ...data, _tokenIn: tokenIn };
      }
    } catch (_) {}
  }
  return null;
}

// Patch the deadline in Universal Router execute() calldata to now + 10 min.
// execute(bytes,bytes[],uint256) ABI layout (after "0x" + 4-byte selector = 10 chars):
//   params[0] offset to commands : 32 bytes = 64 hex chars  → chars 10–73
//   params[1] offset to inputs   : 32 bytes = 64 hex chars  → chars 74–137
//   params[2] deadline           : 32 bytes = 64 hex chars  → chars 138–201
function patchDeadline(data) {
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const deadlineHex = deadline.toString(16).padStart(64, '0');
  return data.slice(0, 138) + deadlineHex + data.slice(202);
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
      // Try native ETH first (simpler — no Permit2), fall back to WETH
      let data = await fetchQuoteForToken(NATIVE_ETH, amountWei, swapper);
      if (!data) data = await fetchQuoteForToken(WETH_ADDRESS, amountWei, swapper);
      if (!data) throw new Error('No quotes available for this amount');
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
      const provider = new ethers.BrowserProvider(window.ethereum);
      const isNative = quoteData._tokenIn === NATIVE_ETH || !quoteData.permitData;

      if (isNative) {
        // ── Native ETH path: single transaction, router wraps internally ──
        rlog('Using native ETH path');
        onStep?.('Fetching fresh quote…');
        let fresh = await fetchQuoteForToken(NATIVE_ETH, ethAmountWei, swapper);
        if (!fresh) throw new Error('Could not get a quote. Please try again.');
        rlog(`Fresh quote output: ${fresh?.quote?.output?.amount} USDC raw`);
        rlog(`permitData: ${fresh?.permitData ? 'present' : 'none'}`);

        onStep?.('Confirm swap in MetaMask…');
        const swapRes = await fetch(`${UNISWAP_API}/swap`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.REACT_APP_UNISWAP_API_KEY || '',
          },
          body: JSON.stringify({ quote: fresh.quote }),
        });
        if (!swapRes.ok) {
          const err = await swapRes.json().catch(() => ({}));
          throw new Error(err.detail || `Swap failed (${swapRes.status})`);
        }
        const { swap } = await swapRes.json();
        rlog(`swap.to: ${swap.to}`);
        rlog(`swap.value: ${swap.value}`);
        rlog(`swap.gasLimit: ${swap.gasLimit}`);
        rlog(`sending value (ethAmountWei): ${ethAmountWei}`);

        const deadlineBefore = parseInt(swap.data.slice(138, 202), 16);
        rlog(`original deadline: ${new Date(deadlineBefore * 1000).toISOString()}`);
        const patchedData = patchDeadline(swap.data);
        const deadlineAfter = parseInt(patchedData.slice(138, 202), 16);
        rlog(`patched deadline: ${new Date(deadlineAfter * 1000).toISOString()}`);

        const txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{
            to: swap.to,
            from: swapper,
            data: patchedData,
            value: '0x' + BigInt(ethAmountWei).toString(16),
            ...(swap.gasLimit && { gas: '0x' + (BigInt(swap.gasLimit) * 130n / 100n).toString(16) }),
          }],
        });
        rlog(`tx submitted: ${txHash}`);

        onStep?.('Waiting for confirmation…');
        const receipt = await provider.waitForTransaction(txHash);
        rlog(`receipt status: ${receipt.status} | gasUsed: ${receipt.gasUsed?.toString()}`);
        if (receipt.status === 0) throw new Error('Swap transaction reverted on-chain');

        const usdcOut = fresh?.quote?.output?.amount || quoteData?.quote?.output?.amount || '0';
        return { txHash, explorerUrl: `${EXPLORER_BASE}/tx/${txHash}`, usdcOut };

      } else {
        // ── WETH Permit2 path: fresh quote → wrap → approve Permit2 → sign → swap ──
        rlog('Using WETH Permit2 path');

        // Fetch fresh quote FIRST so we have the current Permit2 nonce
        onStep?.('Fetching fresh quote…');
        let freshWethQuote = await fetchQuoteForToken(WETH_ADDRESS, ethAmountWei, swapper);
        if (!freshWethQuote) throw new Error('Could not get a fresh quote. Please try again.');
        rlog(`Fresh WETH quote output: ${freshWethQuote?.quote?.output?.amount} USDC raw`);
        rlog(`Fresh permit nonce: ${freshWethQuote?.permitData?.values?.details?.nonce ?? freshWethQuote?.permitData?.values?.nonce ?? 'n/a'}`);
        const activeQuote = freshWethQuote;

        onStep?.('Wrapping ETH → WETH…');
        const wrapTxHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{
            to: WETH_ADDRESS,
            from: swapper,
            data: '0xd0e30db0',
            value: '0x' + BigInt(ethAmountWei).toString(16),
          }],
        });
        rlog(`wrap tx: ${wrapTxHash}`);
        onStep?.('Waiting for wrap confirmation…');
        await provider.waitForTransaction(wrapTxHash);
        rlog('wrap confirmed');

        const signer = await provider.getSigner();
        const weth = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, signer);
        const allowance = await weth.allowance(swapper, PERMIT2_ADDRESS);
        rlog(`Permit2 allowance: ${allowance.toString()}`);
        if (allowance < BigInt(ethAmountWei)) {
          onStep?.('Approving Permit2…');
          const approveTx = await weth.approve(PERMIT2_ADDRESS, ethers.MaxUint256);
          rlog(`approve tx: ${approveTx.hash}`);
          await approveTx.wait();
          rlog('approve confirmed');
        } else {
          rlog('Permit2 already approved, skipping');
        }

        rlog(`using fresh quote output: ${activeQuote?.quote?.output?.amount} USDC raw`);
        rlog(`permitData: ${activeQuote?.permitData ? 'present' : 'MISSING'}`);

        onStep?.('Sign Permit2 approval…');
        let signature;
        if (activeQuote.permitData) {
          const { domain, types, values } = activeQuote.permitData;
          rlog(`permit expiration: ${new Date(Number(values.details?.expiration ?? values.expiration ?? 0) * 1000).toISOString()}`);
          rlog(`permit nonce: ${values.details?.nonce ?? values.nonce}`);
          const { EIP712Domain: _unused, ...signTypes } = types;
          signature = await window.ethereum.request({
            method: 'eth_signTypedData_v4',
            params: [swapper, JSON.stringify({ domain, types: signTypes, primaryType: 'PermitSingle', message: values })],
          });
          rlog(`signature obtained: ${signature?.slice(0, 20)}...`);
        } else {
          rlog('no permitData, proceeding without signature');
        }

        onStep?.('Confirm swap in MetaMask…');
        const swapRes = await fetch(`${UNISWAP_API}/swap`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.REACT_APP_UNISWAP_API_KEY || '',
          },
          body: JSON.stringify({
            quote: activeQuote.quote,
            ...(signature && { signature, permitData: activeQuote.permitData }),
          }),
        });
        if (!swapRes.ok) {
          const err = await swapRes.json().catch(() => ({}));
          throw new Error(err.detail || `Swap failed (${swapRes.status})`);
        }
        const { swap } = await swapRes.json();
        rlog(`swap.to: ${swap.to}`);
        rlog(`swap.value: ${swap.value}`);
        rlog(`swap.gasLimit: ${swap.gasLimit}`);

        const deadlineBefore = parseInt(swap.data.slice(138, 202), 16);
        rlog(`original deadline: ${new Date(deadlineBefore * 1000).toISOString()}`);
        const patched = patchDeadline(swap.data);
        const deadlineAfter = parseInt(patched.slice(138, 202), 16);
        rlog(`patched deadline: ${new Date(deadlineAfter * 1000).toISOString()}`);

        const txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{
            to: swap.to,
            from: swapper,
            data: patched,
            value: '0x' + BigInt(swap.value || '0').toString(16),
            ...(swap.gasLimit && { gas: '0x' + (BigInt(swap.gasLimit) * 130n / 100n).toString(16) }),
          }],
        });
        rlog(`swap tx submitted: ${txHash}`);

        onStep?.('Waiting for swap confirmation…');
        const receipt = await provider.waitForTransaction(txHash);
        rlog(`receipt status: ${receipt.status} | gasUsed: ${receipt.gasUsed?.toString()}`);
        if (receipt.status === 0) throw new Error('Swap transaction reverted on-chain');

        const usdcOut = activeQuote?.quote?.output?.amount || '0';
        return { txHash, explorerUrl: `${EXPLORER_BASE}/tx/${txHash}`, usdcOut };
      }
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
