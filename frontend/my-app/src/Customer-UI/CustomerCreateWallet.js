import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './CustomerCreateWallet.css';
import { useHederaContract } from '../hooks/useHederaContract';

function CustomerCreateWallet({ onNext }) {
  const [accepted, setAccepted]   = useState(false);
  const [wallet, setWallet]       = useState(null);  // generated wallet
  const { reportUsage, loading }  = useHederaContract();

  // Generate a fresh wallet the moment this page mounts
  useEffect(() => {
    const w = ethers.Wallet.createRandom();
    setWallet({ address: w.address, privateKey: w.privateKey });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!accepted || loading) return;

    const transaction = await reportUsage();
    onNext({ wallet, transaction });
  };

  const shortAddr = wallet
    ? `${wallet.address.slice(0, 10)}...${wallet.address.slice(-6)}`
    : 'Generating…';

  return (
    <div className="ccw-page">
      <div className="ccw-card">

        {/* ── Header ── */}
        <div className="ccw-header">
          <div className="ccw-logo">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="#0A2540"/>
              <rect x="5" y="10" width="18" height="12" rx="2" stroke="white" strokeWidth="1.5" fill="none"/>
              <path d="M5 14h18" stroke="white" strokeWidth="1.5"/>
              <circle cx="9" cy="18" r="1.5" fill="white"/>
            </svg>
          </div>
          <h1 className="ccw-title">Your Auto-Reload Wallet</h1>
          <p className="ccw-subtitle">
            A dedicated wallet has been created and will be managed on your
            behalf using the Hedera Schedule Service.
          </p>
        </div>

        <form className="ccw-form" onSubmit={handleSubmit}>

          {/* ── Generated wallet address ── */}
          <div className="ccw-wallet-card">
            <span className="ccw-wallet-label">Your new wallet address</span>
            <span className="ccw-wallet-address" title={wallet?.address}>
              {wallet ? wallet.address : 'Generating…'}
            </span>
            <div className="ccw-wallet-badge">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <circle cx="5" cy="5" r="4" fill="#10b981"/>
              </svg>
              Hedera Testnet · {shortAddr}
            </div>
          </div>

          {/* ── How it works ── */}
          <div className="ccw-how">
            <p className="ccw-how-title">How automatic reloads work</p>
            <ul className="ccw-how-list">
              <li>
                <span className="ccw-how-icon">⏱</span>
                <span>Every hour, the Hedera Schedule Service checks your wallet's HBAR balance automatically — no action needed from you.</span>
              </li>
              <li>
                <span className="ccw-how-icon">💧</span>
                <span>If your balance drops below your set threshold, HBAR is automatically transferred to keep it funded.</span>
              </li>
              <li>
                <span className="ccw-how-icon">🔒</span>
                <span>You stay in control — you can pause or cancel auto-reloads at any time from your dashboard.</span>
              </li>
            </ul>
          </div>

          {/* ── Opt-in consent ── */}
          <label className="ccw-consent">
            <input
              type="checkbox"
              className="ccw-checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span className="ccw-consent-text">
              I authorize StreamPay to automatically reload this wallet using the
              Hedera Schedule Service on my behalf.
            </span>
          </label>

          {/* ── Footer ── */}
          <div className="ccw-footer">
            <span className="ccw-secure">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1L2 2.5V6c0 2.5 1.8 4.3 4 5 2.2-.7 4-2.5 4-5V2.5L6 1z" fill="#9CA3AF"/>
              </svg>
              Non-custodial · You own your keys
            </span>
            <button
              type="submit"
              className={`ccw-next-btn${accepted && !loading ? '' : ' ccw-next-btn--disabled'}`}
              disabled={!accepted || loading}
            >
              {loading ? 'Setting up…' : 'Opt in & Continue →'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

export default CustomerCreateWallet;
