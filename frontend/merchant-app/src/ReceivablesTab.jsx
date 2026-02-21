import { useState } from 'react';
import { ethers } from 'ethers';
import './ReceivablesTab.css';
import { useReceivables } from './hooks/useReceivables';
import { useADIReceivables } from './hooks/useADIReceivables';
import { useHbarPrice, tinybarToUsd } from './hooks/useHbarPrice';

const HASHSCAN = 'https://hashscan.io/testnet/transaction/';
const ADI_EXPLORER = 'https://explorer.ab.testnet.adifoundation.ai';

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function fmtDayLabel(dateKey) {
  const d = new Date(dateKey + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.getTime() === today.getTime())     return 'Today';
  if (d.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function fmtUsdc(usd) {
  if (usd == null) return '—';
  if (usd < 0.001) return '<$0.001';
  return '$' + usd.toFixed(3);
}

function fmtHbar(tinybar) {
  return (Number(tinybar) / 1e8).toFixed(3) + ' ℏ';
}

function groupByDay(items) {
  const map = {};
  for (const item of items) {
    const key = new Date(item.timestamp).toLocaleDateString('en-CA'); // YYYY-MM-DD
    if (!map[key]) map[key] = [];
    map[key].push(item);
  }
  return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
}

function Avatar({ name }) {
  const parts = name.trim().split(' ');
  const initials = parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0][0];
  return <div className="rv-avatar">{initials.toUpperCase()}</div>;
}

function SummaryCard({ label, value, sub, accent }) {
  return (
    <div className={`rv-stat${accent ? ' rv-stat--accent' : ''}`}>
      <span className="rv-stat-label">{label}</span>
      <span className="rv-stat-value">{value}</span>
      {sub && <span className="rv-stat-sub">{sub}</span>}
    </div>
  );
}

function ChargeDayGroup({ dateKey, charges, hbarPrice, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);

  const dayTotal  = charges.reduce((s, c) => s + Number(c.cost), 0);
  const dayKwh    = charges.reduce((s, c) => s + c.usageDelta, 0);
  const dayUsd    = tinybarToUsd(dayTotal, hbarPrice);

  return (
    <div className="rv-day-group">
      <button className="rv-day-header" onClick={() => setOpen(o => !o)}>
        <span className="rv-day-chevron" data-open={open}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
        <span className="rv-day-label">{fmtDayLabel(dateKey)}</span>
        <span className="rv-day-count">{charges.length} charge{charges.length !== 1 ? 's' : ''}</span>
        <span className="rv-day-spacer" />
        <span className="rv-day-kwh">{(dayKwh / 1000).toFixed(2)} kWh</span>
        <span className="rv-day-total">
          {dayUsd != null ? fmtUsdc(dayUsd) : fmtHbar(dayTotal)}
        </span>
      </button>

      {open && (
        <div className="rv-day-rows">
          {/* header */}
          <div className="rv-row-grid rv-row-grid--header">
            <span className="rv-col rv-col--dim">Time</span>
            <span className="rv-col rv-col--dim">Customer</span>
            <span className="rv-col rv-col--dim rv-col--right">kWh</span>
            <span className="rv-col rv-col--dim rv-col--right">Amount</span>
            <span className="rv-col rv-col--dim">Tx Hash</span>
          </div>

          {[...charges].reverse().map((c, i) => {
            const usd = tinybarToUsd(c.cost, hbarPrice);
            return (
              <div key={i} className="rv-row-grid rv-row-grid--data">
                <span className="rv-col rv-col--muted">{fmtTime(c.timestamp)}</span>

                <span className="rv-col">
                  <div className="rv-customer-cell">
                    <Avatar name={c.customer.name} />
                    <div className="rv-customer-info">
                      <span className="rv-customer-name">{c.customer.name}</span>
                      <span className="rv-customer-email">{c.customer.email}</span>
                    </div>
                  </div>
                </span>

                <span className="rv-col rv-col--right rv-mono">
                  {(c.usageDelta / 1000).toFixed(3)}
                </span>

                <span className="rv-col rv-col--right">
                  <div className="rv-amount-cell">
                    <span className="rv-amount-usd">{fmtUsdc(usd)}</span>
                    <span className="rv-amount-hbar">{fmtHbar(c.cost)}</span>
                  </div>
                </span>

                <span className="rv-col">
                  {c.txHash ? (
                    <a href={HASHSCAN + c.txHash} target="_blank" rel="noopener noreferrer" className="rv-link">
                      {c.txHash.slice(0, 8)}…{c.txHash.slice(-6)}
                    </a>
                  ) : <span className="rv-no-hash">—</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReceivablesTab() {
  const { charges, settlements, loading, error } = useReceivables();
  const { outstanding: adiOutstanding, totalOutstandingADI, loading: adiLoading, error: adiError } = useADIReceivables();
  const hbarPrice = useHbarPrice();

  const totalCharged     = charges.reduce((s, c) => s + Number(c.cost), 0);
  const totalSettled     = settlements.reduce((s, e) => s + Number(e.amountPaid), 0);
  const totalOutstanding = Math.max(0, totalCharged - totalSettled);
  const totalKwh         = charges.reduce((s, c) => s + c.usageDelta, 0);

  const totalChargedUsd = tinybarToUsd(totalCharged, hbarPrice);
  const totalSettledUsd = tinybarToUsd(totalSettled, hbarPrice);
  const outstandingUsd  = tinybarToUsd(totalOutstanding, hbarPrice);

  // Calculate total USD from ADI receivables
  const adiOutstandingUSD = adiOutstanding.reduce((sum, r) => sum + r.amountUSD, 0);

  const days = groupByDay(charges);

  if (loading) return <div className="rv-loading">Loading receivables…</div>;
  if (error)   return <div className="rv-error">Could not load receivables: {error}</div>;

  return (
    <div className="rv-wrap">

      {/* ── Summary cards ── */}
      <div className="rv-stats">
        <SummaryCard label="Current billed"  value={fmtUsdc(totalChargedUsd)} sub={fmtHbar(totalCharged)} />
        <SummaryCard label="Settled"       value={fmtUsdc(totalSettledUsd)} sub={`${settlements.length} settlement${settlements.length !== 1 ? 's' : ''}`} accent />
        <SummaryCard
          label="Outstanding"
          value={adiLoading ? '...' : <span className="rv-text-red">${adiOutstandingUSD.toFixed(5)}</span>}
          sub={adiLoading ? '' : `${adiOutstanding.length} receivable${adiOutstanding.length !== 1 ? 's' : ''}`}
        />
        <SummaryCard label="Total usage"   value={(totalKwh / 1000).toFixed(2) + ' kWh'} sub="this period" />
      </div>

      {/* ── Usage Charges (grouped by day) ── */}
      <div className="rv-section">
        <h3 className="rv-section-title">Usage Charges</h3>
        <div className="rv-table-wrap">
          {days.length === 0 ? (
            <div className="rv-empty">No charges in the last ~10 hours.</div>
          ) : (
            days.map(([dateKey, dayCharges], i) => (
              <ChargeDayGroup
                key={dateKey}
                dateKey={dateKey}
                charges={dayCharges}
                hbarPrice={hbarPrice}
                defaultOpen={i === 0}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Settlements Received ── */}
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
                  const usd    = tinybarToUsd(s.amountPaid, hbarPrice);
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
                          <a href={HASHSCAN + s.txHash} target="_blank" rel="noopener noreferrer" className="rv-link">
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

      {/* ── Outstanding Receivables (ADI RWA) ── */}
      <div className="rv-section">
        <h3 className="rv-section-title">Outstanding Receivables</h3>
        <div className="rv-table-wrap">
          {adiLoading ? (
            <div className="rv-empty">Loading ADI receivables...</div>
          ) : adiError ? (
            <div className="rv-error">Error loading ADI receivables: {adiError}</div>
          ) : adiOutstanding.length === 0 ? (
            <div className="rv-empty">No outstanding receivables on ADI Chain.</div>
          ) : (
            <table className="rv-table">
              <thead>
                <tr>
                  <th className="rv-th">Customer</th>
                  <th className="rv-th">Token ID</th>
                  <th className="rv-th rv-th--right">Amount</th>
                  <th className="rv-th">Due Date</th>
                  <th className="rv-th">Minted</th>
                  <th className="rv-th">Hedera Proof</th>
                  <th className="rv-th">ADI TX</th>
                </tr>
              </thead>
              <tbody>
                {adiOutstanding.map((receivable) => (
                  <tr key={receivable.tokenId} className="rv-row">
                    <td className="rv-td">
                      <div className="rv-customer-cell">
                        <Avatar name={`Customer ${receivable.tokenId}`} />
                        <div className="rv-customer-info">
                          <span className="rv-customer-name">Customer {receivable.tokenId}</span>
                          <span className="rv-customer-email">{receivable.customer.slice(0, 8)}...{receivable.customer.slice(-6)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="rv-td">
                      <span className="rv-token-id">#{receivable.tokenId}</span>
                    </td>
                    <td className="rv-td rv-td--right">
                      <div className="rv-amount-cell">
                        <span className="rv-amount-usd rv-outstanding">${receivable.amountUSD.toFixed(5)}</span>
                        <span className="rv-amount-adi">{parseFloat(receivable.amountADI).toFixed(4)} ADI</span>
                      </div>
                    </td>
                    <td className="rv-td">
                      {receivable.dueDate.toLocaleDateString()}
                    </td>
                    <td className="rv-td rv-muted">
                      {receivable.mintedAt.toLocaleDateString()}
                    </td>
                    <td className="rv-td">
                      <a
                        href={`https://hashscan.io/testnet/transaction/${receivable.hederaTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rv-link"
                      >
                        {receivable.hederaTxHash.slice(0, 8)}…{receivable.hederaTxHash.slice(-6)}
                      </a>
                    </td>
                    <td className="rv-td">
                      <a
                        href={`${ADI_EXPLORER}/address/0x31246c37f75cC7fe6f669651c66d27E6708De1b1`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rv-link"
                      >
                        View NFT↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
}

export default ReceivablesTab;
