import { useStreamBalance } from '../hooks/useStreamBalance';
import './HomeTab.css';

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

function HomeTab({ accountData, events = [], hbarPriceUsd = null }) {
  const wallet = accountData?.generatedWallet;
  const { depositBalance, loading: balanceLoading } = useStreamBalance();

  const totalSpentHbar = events.reduce((s, e) => s + Number(e.cost), 0) / 1e8;
  const totalSpentUsdc = hbarPriceUsd != null ? totalSpentHbar * hbarPriceUsd : null;
  const usdcDisplay    = totalSpentUsdc != null ? '$' + totalSpentUsdc.toFixed(4) : '…';

  const balanceHbar    = depositBalance != null ? Number(depositBalance) / 1e8 : null;
  const balanceUsd     = balanceHbar != null && hbarPriceUsd != null
    ? '$' + (balanceHbar * hbarPriceUsd).toFixed(2)
    : null;
  const balanceDisplay = balanceLoading ? '…' : balanceHbar != null
    ? balanceHbar.toFixed(2) + ' HBAR'
    : '—';

  const lastEvent      = events.length > 0 ? events[events.length - 1] : null;

  const kwhDisplay     = lastEvent
    ? (Number(lastEvent.usageDelta) / 1000).toFixed(3) + ' kWh'
    : '—';

  const rateUsdPerKwh  = lastEvent && hbarPriceUsd != null
    ? (Number(lastEvent.effectiveRate) * 1000 / 1e8) * hbarPriceUsd
    : null;
  const rateDisplay    = rateUsdPerKwh != null
    ? '$' + rateUsdPerKwh.toFixed(4) + ' / kWh'
    : '—';

  return (
    <div className="ht-root">

      {/* ── Stat row ── */}
      <div className="ht-stats">

        <div className="ht-stat-card">
          <span className="ht-stat-label">Stream Balance</span>
          <span className="ht-stat-value">{balanceDisplay}</span>
          <span className="ht-stat-sub">{balanceUsd ? `≈ ${balanceUsd}` : 'Loading price…'}</span>
        </div>

        <div className="ht-stat-card">
          <span className="ht-stat-label">Spent (last 10h)</span>
          <span className="ht-stat-value">{usdcDisplay}</span>
          <span className="ht-stat-sub">Rolling 10-hour window</span>
        </div>

        <div className="ht-stat-card">
          <span className="ht-stat-label">Current Usage</span>
          <span className="ht-stat-value">{kwhDisplay}</span>
          <span className="ht-stat-sub">{lastEvent ? new Date(lastEvent.timestamp).toLocaleTimeString() : 'No data'}</span>
        </div>

        <div className="ht-stat-card">
          <span className="ht-stat-label">Current Rate</span>
          <span className="ht-stat-value">{rateDisplay}</span>
          <span className="ht-stat-sub">Current pricing rate</span>
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

    </div>
  );
}

export default HomeTab;
