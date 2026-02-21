import './ReceivablesTab.css';
import { useReceivables } from './hooks/useReceivables';
import { useHbarPrice, tinybarToUsd } from './hooks/useHbarPrice';

const HASHSCAN = 'https://hashscan.io/testnet/transaction/';

function fmtTime(ts) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function fmtUsdc(usd) {
  if (usd == null) return '—';
  if (usd < 0.001) return '<$0.001';
  return '$' + usd.toFixed(3);
}

function fmtHbar(tinybar) {
  return (Number(tinybar) / 1e8).toFixed(3) + ' ℏ';
}

function Avatar({ name }) {
  const parts = name.trim().split(' ');
  const initials = parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0][0];
  return <div className="rv-avatar">{initials.toUpperCase()}</div>;
}

function SummaryCard({ label, value, sub }) {
  return (
    <div className="rv-stat">
      <span className="rv-stat-label">{label}</span>
      <span className="rv-stat-value">{value}</span>
      {sub && <span className="rv-stat-sub">{sub}</span>}
    </div>
  );
}

function ReceivablesTab() {
  const { charges, settlements, loading, error } = useReceivables();
  const hbarPrice = useHbarPrice();

  const totalCharged   = charges.reduce((s, c) => s + Number(c.cost), 0);
  const totalSettled   = settlements.reduce((s, e) => s + Number(e.amountPaid), 0);
  const totalOutstanding = Math.max(0, totalCharged - totalSettled);

  const totalChargedUsd = tinybarToUsd(totalCharged, hbarPrice);
  const totalSettledUsd = tinybarToUsd(totalSettled, hbarPrice);
  const outstandingUsd  = tinybarToUsd(totalOutstanding, hbarPrice);

  if (loading) {
    return <div className="rv-loading">Loading receivables…</div>;
  }

  if (error) {
    return <div className="rv-error">Could not load receivables: {error}</div>;
  }

  return (
    <div className="rv-wrap">

      {/* ── Summary row ── */}
      <div className="rv-stats">
        <SummaryCard
          label="Total billed"
          value={fmtUsdc(totalChargedUsd)}
          sub={fmtHbar(totalCharged)}
        />
        <SummaryCard
          label="Settled"
          value={fmtUsdc(totalSettledUsd)}
          sub={`${settlements.length} settlement${settlements.length !== 1 ? 's' : ''}`}
        />
        <SummaryCard
          label="Outstanding"
          value={fmtUsdc(outstandingUsd)}
          sub={`${charges.length} charge${charges.length !== 1 ? 's' : ''}`}
        />
      </div>

      {/* ── Charges table ── */}
      <div className="rv-section">
        <h3 className="rv-section-title">Usage Charges</h3>
        <div className="rv-table-wrap">
          {charges.length === 0 ? (
            <div className="rv-empty">No charges in the last ~10 hours.</div>
          ) : (
            <table className="rv-table">
              <thead>
                <tr>
                  <th className="rv-th">Customer</th>
                  <th className="rv-th">Time</th>
                  <th className="rv-th rv-th--right">kWh</th>
                  <th className="rv-th rv-th--right">Amount</th>
                  <th className="rv-th">Tx Hash</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((c, i) => {
                  const usd = tinybarToUsd(c.cost, hbarPrice);
                  return (
                    <tr key={i} className="rv-row">
                      <td className="rv-td">
                        <div className="rv-customer-cell">
                          <Avatar name={c.customer.name} />
                          <div className="rv-customer-info">
                            <span className="rv-customer-name">{c.customer.name}</span>
                            <span className="rv-customer-email">{c.customer.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="rv-td rv-muted">{fmtTime(c.timestamp)}</td>
                      <td className="rv-td rv-td--right rv-mono">
                        {(c.usageDelta / 1000).toFixed(3)}
                      </td>
                      <td className="rv-td rv-td--right">
                        <div className="rv-amount-cell">
                          <span className="rv-amount-usd">{fmtUsdc(usd)}</span>
                          <span className="rv-amount-hbar">{fmtHbar(c.cost)}</span>
                        </div>
                      </td>
                      <td className="rv-td">
                        {c.txHash ? (
                          <a
                            href={HASHSCAN + c.txHash}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rv-link"
                          >
                            {c.txHash.slice(0, 8)}…{c.txHash.slice(-6)}
                          </a>
                        ) : <span className="rv-no-hash">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Settlements table ── */}
      <div className="rv-section">
        <h3 className="rv-section-title">Settlements Received</h3>
        <div className="rv-table-wrap">
          {settlements.length === 0 ? (
            <div className="rv-empty">No settlements in the last ~10 hours.</div>
          ) : (
            <table className="rv-table">
              <thead>
                <tr>
                  <th className="rv-th">Customer</th>
                  <th className="rv-th">Time</th>
                  <th className="rv-th rv-th--right">Amount Paid</th>
                  <th className="rv-th rv-th--right">Remaining Deposit</th>
                  <th className="rv-th">Tx Hash</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s, i) => {
                  const usd = tinybarToUsd(s.amountPaid, hbarPrice);
                  const depUsd = tinybarToUsd(s.remainingDeposit, hbarPrice);
                  return (
                    <tr key={i} className="rv-row">
                      <td className="rv-td">
                        <div className="rv-customer-cell">
                          <Avatar name={s.customer.name} />
                          <div className="rv-customer-info">
                            <span className="rv-customer-name">{s.customer.name}</span>
                            <span className="rv-customer-email">{s.customer.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="rv-td rv-muted">{fmtTime(s.timestamp)}</td>
                      <td className="rv-td rv-td--right">
                        <div className="rv-amount-cell">
                          <span className="rv-amount-usd rv-paid">{fmtUsdc(usd)}</span>
                          <span className="rv-amount-hbar">{fmtHbar(s.amountPaid)}</span>
                        </div>
                      </td>
                      <td className="rv-td rv-td--right">
                        <div className="rv-amount-cell">
                          <span className="rv-amount-usd">{fmtUsdc(depUsd)}</span>
                          <span className="rv-amount-hbar">{fmtHbar(s.remainingDeposit)}</span>
                        </div>
                      </td>
                      <td className="rv-td">
                        {s.txHash ? (
                          <a
                            href={HASHSCAN + s.txHash}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rv-link"
                          >
                            {s.txHash.slice(0, 8)}…{s.txHash.slice(-6)}
                          </a>
                        ) : <span className="rv-no-hash">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
}

export default ReceivablesTab;
