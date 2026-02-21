import { useStreamBalance } from '../hooks/useStreamBalance';
import './HomeTab.css';

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function HomeTab({ accountData, events = [], hbarPriceUsd = null }) {
  const wallet = accountData?.generatedWallet;
  const { depositBalance, accruedAmount, loading: balanceLoading } = useStreamBalance();

  // Balance
  const balanceHbar = depositBalance != null ? Number(depositBalance) / 1e8 : null;
  const balanceUsd  = balanceHbar != null && hbarPriceUsd != null
    ? (balanceHbar * hbarPriceUsd).toFixed(2) : null;

  // Accrued cost (this cycle)
  const accruedHbar = accruedAmount != null ? Number(accruedAmount) / 1e8 : null;
  const accruedUsd  = accruedHbar != null && hbarPriceUsd != null
    ? (accruedHbar * hbarPriceUsd).toFixed(4) : null;

  // Health bar: accrued / deposit
  const healthPct = balanceHbar != null && accruedHbar != null && balanceHbar > 0
    ? Math.min(100, Math.round((accruedHbar / balanceHbar) * 100)) : 0;
  const healthColor = healthPct > 80 ? '#ef4444' : healthPct > 50 ? '#f59e0b' : '#10b981';

  // Stat cards
  const totalSpentHbar = events.reduce((s, e) => s + Number(e.cost), 0) / 1e8;
  const totalSpentUsd  = hbarPriceUsd != null
    ? '$' + (totalSpentHbar * hbarPriceUsd).toFixed(4) : '…';

  const lastEvent     = events.length > 0 ? events[events.length - 1] : null;
  const kwhDisplay    = lastEvent ? (Number(lastEvent.usageDelta) / 1000).toFixed(3) + ' kWh' : '—';
  const rateUsd       = lastEvent && hbarPriceUsd != null
    ? '$' + ((Number(lastEvent.effectiveRate) * 1000 / 1e8) * hbarPriceUsd).toFixed(4) + '/kWh' : '—';
  const lastReportTime = lastEvent
    ? new Date(lastEvent.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : null;

  const name = accountData?.fullName?.split(' ')[0] ?? 'there';

  return (
    <div className="ht-root">

      {/* ── Greeting ── */}
      <div className="ht-greeting">
        <div>
          <h1 className="ht-greeting-title">{greeting()}, {name}</h1>
          <p className="ht-greeting-sub">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            &nbsp;·&nbsp; Hedera payment stream active
          </p>
        </div>
        <span className="ht-live-badge">
          <span className="ht-live-dot" />
          Live
        </span>
      </div>

      {/* ── Balance card + stat cards ── */}
      <div className="ht-top-row">

        {/* Big balance card */}
        <div className="ht-balance-card">
          <span className="ht-balance-label">Stream Balance</span>
          <span className="ht-balance-value">
            {balanceLoading ? '…' : balanceHbar != null ? balanceHbar.toFixed(2) : '—'}
            <span className="ht-balance-unit">HBAR</span>
          </span>
          {balanceUsd && <span className="ht-balance-usd">≈ ${balanceUsd}</span>}

          {/* Health bar */}
          <div className="ht-health-row">
            <div className="ht-health-bar-track">
              <div
                className="ht-health-bar-fill"
                style={{ width: healthPct + '%', background: healthColor }}
              />
            </div>
            <span className="ht-health-label" style={{ color: healthColor }}>
              {accruedUsd ? `$${accruedUsd} accrued` : `${healthPct}% used`}
            </span>
          </div>
        </div>

        {/* Stat cards */}
        <div className="ht-stats">

          <div className="ht-stat-card">
            <div className="ht-stat-icon ht-stat-icon--purple">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2v12M3 7l5-5 5 5" stroke="#6366f1" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="ht-stat-label">Spent (10h)</span>
            <span className="ht-stat-value">{totalSpentUsd}</span>
            <span className="ht-stat-sub">Rolling window</span>
          </div>

          <div className="ht-stat-card">
            <div className="ht-stat-icon ht-stat-icon--green">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1l1.5 4.5H14l-3.7 2.7 1.4 4.3L8 9.8l-3.7 2.7 1.4-4.3L2 5.5h4.5L8 1z" stroke="#10b981" strokeWidth="1.4" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="ht-stat-label">Current Usage</span>
            <span className="ht-stat-value">{kwhDisplay}</span>
            <span className="ht-stat-sub">{lastReportTime ? `Last report ${lastReportTime}` : 'No data'}</span>
          </div>

          <div className="ht-stat-card">
            <div className="ht-stat-icon ht-stat-icon--amber">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="#f59e0b" strokeWidth="1.4"/>
                <path d="M8 5v3.5l2 1.5" stroke="#f59e0b" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="ht-stat-label">Current Rate</span>
            <span className="ht-stat-value">{rateUsd}</span>
            <span className="ht-stat-sub">Current pricing rate</span>
          </div>

        </div>
      </div>

      {/* ── Stream info card ── */}
      <div className="ht-stream-card">
        <div className="ht-stream-left">
          <div className="ht-stream-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2l2 5h5l-4 3 1.5 5L10 12l-4.5 3L7 10 3 7h5L10 2z" stroke="#6366f1" strokeWidth="1.5" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
          <div>
            <p className="ht-stream-title">Hedera Payment Stream #3</p>
            <p className="ht-stream-sub">Oracle reports every 15 min · Settles hourly via Hedera Schedule Service</p>
          </div>
        </div>
        <span className="ht-badge-active">
          <span className="ht-badge-dot" />
          Active
        </span>
      </div>

      {/* ── Wallet card ── */}
      <div className="ht-wallet-card">
        <div className="ht-wallet-left">
          <div className="ht-wallet-icon">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
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
          {wallet?.address && (
            <button
              className="ht-copy-btn"
              onClick={() => copyToClipboard(wallet.address)}
              title="Copy address"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" fill="none"/>
                <path d="M2 10V2h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Copy
            </button>
          )}
        </div>
      </div>

    </div>
  );
}

export default HomeTab;
