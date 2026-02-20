import './HomeTab.css';

const RELOAD_THRESHOLD = '$5.00';   // trigger reload below this
const RELOAD_TARGET    = '$200.00'; // reload up to this cap

function truncate(addr) {
  if (!addr) return '—';
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

function HomeTab({ accountData }) {
  const wallet = accountData?.generatedWallet;

  return (
    <div className="ht-root">

      {/* ── Stat row ── */}
      <div className="ht-stats">

        <div className="ht-stat-card">
          <span className="ht-stat-label">USDC Balance</span>
          <span className="ht-stat-value">$0.00</span>
          <span className="ht-stat-sub">Hedera Testnet</span>
        </div>

        <div className="ht-stat-card">
          <span className="ht-stat-label">Auto-Reload Cap</span>
          <span className="ht-stat-value">{RELOAD_TARGET}</span>
          <span className="ht-stat-sub">Reload target in USDC</span>
        </div>

        <div className="ht-stat-card">
          <span className="ht-stat-label">Reload Threshold</span>
          <span className="ht-stat-value">{RELOAD_THRESHOLD}</span>
          <span className="ht-stat-sub">Triggers auto-reload</span>
        </div>

      </div>

      {/* ── Wallet card ── */}
      <div className="ht-wallet-card">
        <div className="ht-wallet-left">
          <div className="ht-wallet-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="6" width="16" height="11" rx="2" stroke="#6366f1" strokeWidth="1.5" fill="none"/>
              <path d="M2 10h16" stroke="#6366f1" strokeWidth="1.5"/>
              <circle cx="6" cy="14" r="1.2" fill="#6366f1"/>
            </svg>
          </div>
          <div className="ht-wallet-info">
            <span className="ht-wallet-label">Auto-Reload Wallet</span>
            <span className="ht-wallet-addr" title={wallet?.address}>
              {wallet?.address ?? 'Not generated'}
            </span>
          </div>
        </div>

        <div className="ht-wallet-right">
          <span className="ht-badge-active">
            <span className="ht-badge-dot" />
            Active
          </span>
          {wallet?.address && (
            <button
              className="ht-copy-btn"
              onClick={() => copyToClipboard(wallet.address)}
              title="Copy address"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" fill="none"/>
                <path d="M2 10V2h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Copy
            </button>
          )}
        </div>
      </div>

      {/* ── Reload info strip ── */}
      <div className="ht-reload-strip">
        <span className="ht-reload-icon">⚡</span>
        <span className="ht-reload-text">
          Hedera Schedule Service checks your balance every hour. If it drops below&nbsp;
          <strong>{RELOAD_THRESHOLD}</strong>, it automatically reloads to&nbsp;
          <strong>{RELOAD_TARGET} USDC</strong>.
        </span>
      </div>

    </div>
  );
}

export default HomeTab;
