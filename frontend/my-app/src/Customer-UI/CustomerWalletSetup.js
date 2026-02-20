import { useState } from 'react';
import './CustomerWalletSetup.css';
import { useMetaMask } from '../hooks/useMetaMask';

const WALLET_OPTIONS = [
  {
    id: 'metamask',
    icon: (
      <svg width="28" height="28" viewBox="0 0 212 189" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="204,1 114,65 131,28" fill="#E2761B" stroke="#E2761B" strokeLinecap="round" strokeLinejoin="round"/>
        <polygon points="8,1 97,66 81,28" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round"/>
        <polygon points="174,135 150,172 199,185 212,136" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round"/>
        <polygon points="0,136 13,185 62,172 38,135" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round"/>
        <polygon points="59,82 46,102 95,104 93,51" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round"/>
        <polygon points="153,82 118,50 117,104 166,102" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round"/>
        <polygon points="62,172 91,158 66,136" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round"/>
        <polygon points="121,158 150,172 146,136" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    name: 'MetaMask',
    description: 'Connect using your MetaMask browser extension',
  },
  {
    id: 'coinbase',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="14" cy="14" r="14" fill="#0052FF"/>
        <circle cx="14" cy="14" r="9" fill="white"/>
        <rect x="10.5" y="12.25" width="7" height="3.5" rx="1.75" fill="#0052FF"/>
      </svg>
    ),
    name: 'Coinbase Wallet',
    description: 'Connect with Coinbase Wallet or Coinbase CDP',
  },
  {
    id: 'bank',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="28" height="28" rx="6" fill="#F3F4F6"/>
        <rect x="6" y="13" width="3" height="8" rx="1" fill="#6B7280"/>
        <rect x="12.5" y="13" width="3" height="8" rx="1" fill="#6B7280"/>
        <rect x="19" y="13" width="3" height="8" rx="1" fill="#6B7280"/>
        <rect x="5" y="22" width="18" height="2" rx="1" fill="#6B7280"/>
        <polygon points="14,4 5,11 23,11" fill="#6B7280"/>
      </svg>
    ),
    name: 'Bank Account',
    description: 'Link your bank via secure ACH transfer',
  },
];

function CustomerWalletSetup({ onNext }) {
  const [selected, setSelected] = useState(null);
  const { address, shortAddress, error, connecting, connect } = useMetaMask();

  const handleOptionClick = async (id) => {
    setSelected(id);
    if (id === 'metamask') {
      await connect();
    }
  };

  // MetaMask is "ready" only when actually connected
  const canProceed = selected === 'metamask'
    ? !!address
    : !!selected;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (canProceed && onNext) onNext({ type: selected, address: address ?? null });
  };

  const getMetaMaskDesc = () => {
    if (connecting) return 'Connecting…';
    if (address)    return shortAddress;
    if (error)      return error;
    return 'Connect using your MetaMask browser extension';
  };

  return (
    <div className="cw-page">
      <div className="cw-card">
        <div className="cw-header">
          <div className="cw-logo">⚡</div>
          <h1 className="cw-title">Connect your Wallet</h1>
          <p className="cw-subtitle">Choose how you'd like to connect to get started.</p>
        </div>

        <form className="cw-form" onSubmit={handleSubmit}>
          <div className="cw-options">
            {WALLET_OPTIONS.map((opt) => {
              const isSelected = selected === opt.id;
              const isConnected = opt.id === 'metamask' && !!address;
              const isError = opt.id === 'metamask' && !!error && !address && !connecting;

              return (
                <button
                  key={opt.id}
                  type="button"
                  className={[
                    'cw-option',
                    isSelected ? 'cw-option--selected' : '',
                    isConnected ? 'cw-option--connected' : '',
                    isError ? 'cw-option--error' : '',
                  ].join(' ').trim()}
                  onClick={() => handleOptionClick(opt.id)}
                  disabled={connecting && opt.id === 'metamask'}
                >
                  <span className="cw-option-icon">{opt.icon}</span>
                  <span className="cw-option-text">
                    <span className="cw-option-name">{opt.name}</span>
                    <span className={`cw-option-desc${isError ? ' cw-option-desc--error' : ''}${isConnected ? ' cw-option-desc--connected' : ''}`}>
                      {opt.id === 'metamask' ? getMetaMaskDesc() : opt.description}
                    </span>
                  </span>
                  <span className="cw-option-check">
                    {isConnected ? (
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <circle cx="9" cy="9" r="9" fill="#10b981"/>
                        <path d="M5 9l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : isSelected ? (
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <circle cx="9" cy="9" r="9" fill="#6366f1"/>
                        <path d="M5 9l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <circle cx="9" cy="9" r="8.5" stroke="#D1D5DB"/>
                      </svg>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="cw-footer">
            <span className="cw-secure">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1L2 2.5V6c0 2.5 1.8 4.3 4 5 2.2-.7 4-2.5 4-5V2.5L6 1z" fill="#9CA3AF"/>
              </svg>
              Secured by encryption
            </span>
            <button
              className={`cw-next-btn${canProceed ? '' : ' cw-next-btn--disabled'}`}
              type="submit"
              disabled={!canProceed}
            >
              Next →
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CustomerWalletSetup;
