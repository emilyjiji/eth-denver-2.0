/* global BigInt */
import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useUniswapSwap, NETWORK_META } from '../hooks/useUniswapSwap';
import { useMetaMask } from '../hooks/useMetaMask';
import './DepositTab.css';

const RELAY_URL = process.env.REACT_APP_RELAY_URL || 'http://localhost:3001';
const USDC_DECIMALS = 6;
const STREAM_ID = process.env.REACT_APP_STREAM_ID || '3';
const HASHSCAN_BASE = 'https://hashscan.io/testnet/transaction';

function formatUsdc(raw) {
  if (!raw) return '—';
  const val = Number(BigInt(raw)) / 10 ** USDC_DECIMALS;
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function EthIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 256 417" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M127.9 0L125 9.5V285.2l2.9 2.9 127.9-75.6L127.9 0z" fill="#343434"/>
      <path d="M127.9 0L0 212.5l127.9 75.6V0z" fill="#8C8C8C"/>
      <path d="M127.9 312.7L126.3 314.6V417l127.9-180.5L127.9 312.7z" fill="#3C3C3B"/>
      <path d="M127.9 417V312.7L0 236.5 127.9 417z" fill="#8C8C8C"/>
      <path d="M127.9 288.1l127.9-75.6-127.9-58.2V288.1z" fill="#141414"/>
      <path d="M0 212.5l127.9 75.6V154.3L0 212.5z" fill="#393939"/>
    </svg>
  );
}

function UniswapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="#FF007A"/>
      <path d="M8.5 6c-.3 0-.5.2-.5.5 0 .2.1.4.3.4.5.2.6.3.6.7 0 .2-.1.5-.2.9L7 12.5c-.4 1.3-.4 2 0 2.4.2.3.6.5 1.1.5.6 0 1.1-.3 1.4-.8l.9-1.6.9 1.6c.3.5.8.8 1.4.8.5 0 .9-.2 1.1-.5.4-.4.4-1.1 0-2.4L12 8.5c-.1-.4-.2-.7-.2-.9 0-.4.1-.5.6-.7.2-.1.3-.3.3-.4 0-.3-.2-.5-.5-.5H8.5z" fill="white"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" fill="#d1fae5" stroke="#10b981" strokeWidth="1.2"/>
      <path d="M5 8l2 2 4-4" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function DepositTab() {
  const [ethAmount, setEthAmount] = useState('');
  const [step, setStep] = useState('idle'); // idle | quoting | quoted | swapping | confirming | done | error
  const [stepLabel, setStepLabel] = useState('');
  const [swapTx, setSwapTx] = useState(null);
  const [hederaResult, setHederaResult] = useState(null);

  const { address, connect, connecting } = useMetaMask();
  const { quote, fetchQuote, executeSwap, quoteLoading, swapLoading, error, setError } = useUniswapSwap();

  // Debounced quote fetch whenever ETH amount or wallet changes
  useEffect(() => {
    if (!ethAmount || parseFloat(ethAmount) <= 0 || !address) return;
    setStep('quoting');
    const timer = setTimeout(async () => {
      const result = await fetchQuote(ethAmount, address);
      setStep(result ? 'quoted' : 'idle');
    }, 600);
    return () => clearTimeout(timer);
  }, [ethAmount, address, fetchQuote]);

  const handleSwap = useCallback(async () => {
    if (!quote || !address || !ethAmount) return;

    setStep('swapping');
    const amountWei = ethers.parseEther(ethAmount).toString();

    const tx = await executeSwap(quote, address, amountWei, (label) => {
      setStepLabel(label);
    });

    if (!tx) {
      setStep('error');
      return;
    }
    setSwapTx(tx);
    setStep('confirming');
    setStepLabel('Funding Hedera stream…');

    // Notify relay to top up the Hedera stream with equivalent HBAR
    try {
      const usdcOut = quote?.quote?.output?.amount || '0';
      const res = await fetch(`${RELAY_URL}/fund-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swapTxHash: tx.txHash,
          usdcAmount: usdcOut,
          streamId: STREAM_ID,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setHederaResult(data);
      } else {
        throw new Error(data.error || 'Relay failed');
      }
    } catch (e) {
      setError(`Hedera relay: ${e.message}`);
    }

    setStep('done');
  }, [quote, address, ethAmount, executeSwap, setError]);

  const reset = () => {
    setStep('idle');
    setEthAmount('');
    setSwapTx(null);
    setHederaResult(null);
    setError(null);
    setStepLabel('');
  };

  const usdcOut = quote?.quote?.output?.amount;
  const gasUsd = quote?.quote?.gasFeeUSD;
  const isBusy = swapLoading || step === 'swapping' || step === 'confirming';
  const canSwap = quote && usdcOut && !quoteLoading && !isBusy && step !== 'done' && step !== 'quoting';

  return (
    <div className="dt-root">
      <div className="dt-card">

        {/* Header */}
        <div className="dt-header">
          <div className="dt-header-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2v16M4 8l6-6 6 6" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h3 className="dt-title">Deposit Funds</h3>
            <p className="dt-subtitle">Swap ETH → USDC via Uniswap · funds your Hedera payment stream</p>
          </div>
          <div className="dt-powered-by">
            <UniswapIcon />
            <span>Uniswap API</span>
          </div>
        </div>

        {/* Not connected */}
        {!address ? (
          <div className="dt-connect-prompt">
            <p className="dt-connect-text">Connect your wallet to deposit funds</p>
            <button className="dt-btn dt-btn--primary" onClick={connect} disabled={connecting}>
              {connecting ? 'Connecting…' : 'Connect MetaMask'}
            </button>
            {error && <div className="dt-error">{error}</div>}
            {typeof window !== 'undefined' && !window.ethereum && (
              <div className="dt-error">
                MetaMask not detected.{' '}
                <a href="https://metamask.io/download" target="_blank" rel="noreferrer">Install it here ↗</a>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Connected wallet row */}
            <div className="dt-wallet-row">
              <span className="dt-wallet-dot" />
              <span className="dt-wallet-addr">
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
              <span className="dt-wallet-network">{NETWORK_META?.name ?? 'Base Sepolia'}</span>
            </div>

            {step !== 'done' && (
              <>
                {/* ETH input */}
                <div className="dt-field">
                  <label className="dt-label">You pay</label>
                  <div className="dt-input-wrap">
                    <input
                      className="dt-input"
                      type="number"
                      min="0"
                      step="0.001"
                      placeholder="0.01"
                      value={ethAmount}
                      onChange={e => {
                        setEthAmount(e.target.value);
                        setStep('idle');
                        setError(null);
                      }}
                      disabled={isBusy}
                    />
                    <span className="dt-token-badge">
                      <EthIcon />
                      ETH
                    </span>
                  </div>
                </div>

                {/* Quote loading */}
                {(quoteLoading || step === 'quoting') && ethAmount && (
                  <div className="dt-quote-loading">
                    <span className="dt-spinner" /> Fetching best route…
                  </div>
                )}

                {/* Quote result */}
                {quote && usdcOut && step !== 'quoting' && !quoteLoading && (
                  <div className="dt-quote-card">
                    <div className="dt-quote-row dt-quote-row--main">
                      <span className="dt-quote-label">You receive</span>
                      <span className="dt-quote-amount">{formatUsdc(usdcOut)} <span className="dt-quote-token">USDC</span></span>
                    </div>
                    <div className="dt-quote-divider" />
                    <div className="dt-quote-row">
                      <span className="dt-quote-label">Est. gas</span>
                      <span className="dt-quote-value">${Number(gasUsd || 0).toFixed(4)}</span>
                    </div>
                    <div className="dt-quote-row">
                      <span className="dt-quote-label">Route</span>
                      <span className="dt-quote-value">ETH → WETH → USDC · Uniswap V3</span>
                    </div>
                    <div className="dt-quote-row">
                      <span className="dt-quote-label">Slippage</span>
                      <span className="dt-quote-value">0.5%</span>
                    </div>
                    <div className="dt-quote-note">
                      ⚡ ETH is auto-wrapped to WETH then swapped. Equivalent HBAR deposited to your Hedera stream.
                    </div>
                  </div>
                )}

                {/* Error */}
                {error && <div className="dt-error">{error}</div>}

                {/* CTA */}
                <button
                  className="dt-btn dt-btn--primary dt-btn--full"
                  onClick={handleSwap}
                  disabled={!canSwap}
                >
                  {isBusy ? stepLabel || 'Processing…' : 'Swap & Fund Stream'}
                </button>

                {isBusy && (
                  <div className="dt-status-row">
                    <span className="dt-spinner" />
                    <span className="dt-status-text">{stepLabel}</span>
                  </div>
                )}
              </>
            )}

            {/* Success */}
            {step === 'done' && (
              <div className="dt-success">
                <div className="dt-success-title">Deposit complete</div>

                <div className="dt-success-steps">
                  {swapTx && (
                    <div className="dt-success-step">
                      <CheckIcon />
                      <div>
                        <div className="dt-success-step-label">Swapped via Uniswap on {NETWORK_META?.name}</div>
                        <a href={swapTx.explorerUrl} target="_blank" rel="noreferrer" className="dt-success-link">
                          {swapTx.txHash.slice(0, 12)}…{swapTx.txHash.slice(-8)} ↗
                        </a>
                      </div>
                    </div>
                  )}

                  {hederaResult ? (
                    <div className="dt-success-step">
                      <CheckIcon />
                      <div>
                        <div className="dt-success-step-label">
                          Stream funded with {hederaResult.hbarAmount} HBAR
                          <span className="dt-success-sub"> (≈ ${hederaResult.usdcValue} USDC)</span>
                        </div>
                        <a
                          href={`${HASHSCAN_BASE}/${hederaResult.hederaTxHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="dt-success-link"
                        >
                          View on Hashscan ↗
                        </a>
                      </div>
                    </div>
                  ) : error ? (
                    <div className="dt-success-step dt-success-step--warn">
                      <span className="dt-warn-icon">⚠</span>
                      <div>
                        <div className="dt-success-step-label">Swap succeeded — relay error</div>
                        <div className="dt-success-sub">{error}</div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <button className="dt-btn dt-btn--secondary dt-btn--full" onClick={reset}>
                  Make another deposit
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
