/* global BigInt */
import { useState } from 'react';
import './Transactions.css';
import { tinybarToUsdc } from '../hooks/useHbarPrice';

const HASHSCAN = 'https://hashscan.io/testnet/transaction/';

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function formatDayLabel(dateKey) {
  const d = new Date(dateKey + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.getTime() === today.getTime())     return 'Today';
  if (d.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatKwh(units) {
  return (units / 1000).toFixed(3) + ' kWh';
}

function tinybarNum(costTinybar) {
  try {
    return typeof costTinybar === 'bigint' ? Number(costTinybar) : Number(BigInt(costTinybar.toString()));
  } catch { return 0; }
}

function formatUsdc(usdc) {
  return usdc < 0.000001 ? '<$0.001' : '$' + usdc.toFixed(3);
}

function groupByDay(transactions) {
  const map = {};
  for (const tx of transactions) {
    const key = new Date(tx.timestamp).toLocaleDateString('en-CA'); // YYYY-MM-DD
    if (!map[key]) map[key] = [];
    map[key].push(tx);
  }
  // Sort days newest first
  return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
}

function DayGroup({ dateKey, txs, hbarPriceUsd, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);

  // Day totals
  const totalTb   = txs.reduce((s, tx) => s + tinybarNum(tx.costWei), 0);
  const totalUsdc = tinybarToUsdc(totalTb, hbarPriceUsd);
  const totalKwh  = txs.reduce((s, tx) => s + tx.kwhUnits, 0);

  return (
    <div className="tx-day-group">
      {/* ── Day header (clickable) ── */}
      <button className="tx-day-header" onClick={() => setOpen(o => !o)}>
        <span className="tx-day-chevron" data-open={open}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
        <span className="tx-day-label">{formatDayLabel(dateKey)}</span>
        <span className="tx-day-count">{txs.length} report{txs.length !== 1 ? 's' : ''}</span>
        <span className="tx-day-spacer" />
        <span className="tx-day-kwh">{(totalKwh / 1000).toFixed(2)} kWh</span>
        <span className="tx-day-total">
          {totalUsdc != null ? formatUsdc(totalUsdc) + ' USDC' : (totalTb / 1e8).toFixed(3) + ' HBAR'}
        </span>
      </button>

      {/* ── Expanded rows ── */}
      {open && (
        <div className="tx-day-rows">
          <div className="tx-header-row">
            <span className="tx-col tx-col--time">Time</span>
            <span className="tx-col tx-col--usage">Usage</span>
            <span className="tx-col tx-col--price">Amount</span>
            <span className="tx-col tx-col--status">Status</span>
            <span className="tx-col tx-col--hash">Tx Hash</span>
          </div>

          {[...txs].reverse().map((tx, i) => {
            const tb   = tinybarNum(tx.costWei);
            const usdc = tinybarToUsdc(tb, hbarPriceUsd);
            const hbar = (tb / 1e8).toFixed(3);
            return (
              <div key={i} className="tx-row">
                <span className="tx-col tx-col--time">{formatTime(tx.timestamp)}</span>

                <span className="tx-col tx-col--usage">
                  <span className="tx-kwh">{formatKwh(tx.kwhUnits)}</span>
                  <span className="tx-units">{tx.kwhUnits} units</span>
                </span>

                <span className="tx-col tx-col--price">
                  {usdc != null ? (
                    <>
                      <span className="tx-price">{formatUsdc(usdc)} USDC</span>
                      <span className="tx-units">{hbar} HBAR</span>
                    </>
                  ) : (
                    <span className="tx-price">{hbar} HBAR</span>
                  )}
                </span>

                <span className="tx-col tx-col--status">
                  {tx.onChain
                    ? <span className="tx-badge tx-badge--live">On-chain</span>
                    : <span className="tx-badge tx-badge--sim">Simulated</span>}
                </span>

                <span className="tx-col tx-col--hash">
                  {tx.hash ? (
                    <a href={HASHSCAN + tx.hash} target="_blank" rel="noopener noreferrer" className="tx-link">
                      {tx.hash.slice(0, 8)}…{tx.hash.slice(-6)}
                    </a>
                  ) : (
                    <span className="tx-no-hash">—</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Transactions({ transactions = [], hbarPriceUsd = null }) {
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

  const days = groupByDay(transactions);

  return (
    <div className="tx-wrap">
      {days.map(([dateKey, txs], i) => (
        <DayGroup
          key={dateKey}
          dateKey={dateKey}
          txs={txs}
          hbarPriceUsd={hbarPriceUsd}
          defaultOpen={i === 0}  // today open by default
        />
      ))}
    </div>
  );
}

export default Transactions;
