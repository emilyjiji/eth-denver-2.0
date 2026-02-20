/* global BigInt */
import './Transactions.css';

const HASHSCAN = 'https://hashscan.io/testnet/transaction/';

function formatTime(ts) {
  return new Date(ts).toLocaleString('en-US', {
    month:  'short', day:    'numeric',
    hour:   '2-digit', minute: '2-digit',
    hour12: true,
  });
}

function formatKwh(units) {
  return (units / 1000).toFixed(3) + ' kWh';
}

// Hedera stores values in tinybar (1 HBAR = 10^8 tinybar)
function formatHbar(costTinybar) {
  try {
    const tb = typeof costTinybar === 'bigint' ? Number(costTinybar) : Number(BigInt(costTinybar.toString()));
    return (tb / 1e8).toFixed(6) + ' HBAR';
  } catch {
    return '—';
  }
}

function Transactions({ transactions = [] }) {
  if (transactions.length === 0) {
    return (
      <div className="tx-empty">
        <div className="tx-empty-icon">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect x="4" y="8" width="24" height="18" rx="3" stroke="#D1D5DB" strokeWidth="1.8" fill="none"/>
            <path d="M4 14h24" stroke="#D1D5DB" strokeWidth="1.8"/>
            <rect x="8" y="19" width="6" height="2" rx="1" fill="#D1D5DB"/>
          </svg>
        </div>
        <p className="tx-empty-title">No transactions yet</p>
        <p className="tx-empty-sub">Your usage reports will appear here.</p>
      </div>
    );
  }

  return (
    <div className="tx-wrap">
      <div className="tx-header-row">
        <span className="tx-col tx-col--time">Time</span>
        <span className="tx-col tx-col--usage">Usage</span>
        <span className="tx-col tx-col--price">Amount</span>
        <span className="tx-col tx-col--status">Status</span>
        <span className="tx-col tx-col--hash">Tx Hash</span>
      </div>

      {transactions.map((tx, i) => (
        <div key={i} className="tx-row">
          <span className="tx-col tx-col--time">{formatTime(tx.timestamp)}</span>

          <span className="tx-col tx-col--usage">
            <span className="tx-kwh">{formatKwh(tx.kwhUnits)}</span>
            <span className="tx-units">{tx.kwhUnits} units</span>
          </span>

          <span className="tx-col tx-col--price">
            <span className="tx-price">{formatHbar(tx.costWei)}</span>
          </span>

          <span className="tx-col tx-col--status">
            {tx.onChain ? (
              <span className="tx-badge tx-badge--live">On-chain</span>
            ) : (
              <span className="tx-badge tx-badge--sim">Simulated</span>
            )}
          </span>

          <span className="tx-col tx-col--hash">
            {tx.hash ? (
              <a
                href={HASHSCAN + tx.hash}
                target="_blank"
                rel="noopener noreferrer"
                className="tx-link"
              >
                {tx.hash.slice(0, 8)}…{tx.hash.slice(-6)}
              </a>
            ) : (
              <span className="tx-no-hash">—</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export default Transactions;
