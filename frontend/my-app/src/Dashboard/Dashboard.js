import { useState } from 'react';
import './Dashboard.css';
import Transactions from './Transactions';
import HomeTab from './HomeTab';
import InsightsTab from './InsightsTab';
import { useOnChainUsage } from '../hooks/useOnChainUsage';
import { useHbarPrice } from '../hooks/useHbarPrice';

const NAV_ITEMS = [
  {
    id: 'home',
    label: 'Home',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 6.5L8 2l6 4.5V14a1 1 0 01-1 1H3a1 1 0 01-1-1V6.5z" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round"/>
        <path d="M6 15v-5h4v5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'transactions',
    label: 'Transactions',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 5h12M2 8h8M2 11h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M11 10l2 2 2-2M13 12V8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'insights',
    label: 'Insights',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 12l3.5-4 3 2.5L12 5l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="14" cy="7" r="1" fill="currentColor"/>
      </svg>
    ),
  },
];

function Dashboard({ accountData }) {
  const [active, setActive] = useState('home');
  const { events: rawEvents, loading: eventsLoading } = useOnChainUsage();
  const hbarPriceUsd = useHbarPrice();

  // Fixed cutoff: hide the one stream-3 report that ran at old (too-high) rates.
  // Fixed date (not rolling) so it works correctly tomorrow and beyond.
  const CUTOFF_MS = new Date('2026-02-20T15:55:00').getTime();
  const events = rawEvents.filter(ev => ev.timestamp >= CUTOFF_MS);

  // Normalize on-chain events → transaction row format.
  // Chain events are the source of truth — don't merge stale React state.
  const allTransactions = events.map(ev => ({
    hash:      ev.txHash,
    timestamp: ev.timestamp,
    kwhUnits:  ev.usageDelta,
    costWei:   ev.cost,   // BigInt tinybar
    onChain:   true,
  }));

  return (
    <div className="db-layout">

      {/* ── Sidebar ── */}
      <aside className="db-sidebar">
        <div className="db-sidebar-top">
          <div className="db-brand">
            <span className="db-brand-logo">⚡</span>
            <span className="db-brand-name">Gimme</span>
          </div>

          <nav className="db-nav">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                className={`db-nav-item${active === item.id ? ' db-nav-item--active' : ''}`}
                onClick={() => setActive(item.id)}
              >
                <span className="db-nav-icon">{item.icon}</span>
                <span className="db-nav-label">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* ── Sidebar footer: account ── */}
        <div className="db-sidebar-footer">
          <div className="db-account">
            <div className="db-account-avatar">
              {accountData?.fullName?.[0]?.toUpperCase() ?? 'G'}
            </div>
            <div className="db-account-info">
              <span className="db-account-name">{accountData?.fullName ?? 'Account'}</span>
              <span className="db-account-email">{accountData?.email ?? ''}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="db-main">
        <div className="db-main-inner">

          {active === 'home' && (
            <div>
              <h2 className="db-page-title">Home</h2>
              <HomeTab accountData={accountData} events={events} hbarPriceUsd={hbarPriceUsd} />
            </div>
          )}

          {active === 'transactions' && (
            <div>
              <h2 className="db-page-title">Transactions</h2>
              <div className="db-card">
                <Transactions transactions={allTransactions} hbarPriceUsd={hbarPriceUsd} />
              </div>
            </div>
          )}

          {active === 'insights' && (
            <div>
              <h2 className="db-page-title">Insights</h2>
              <InsightsTab events={events} loading={eventsLoading} hbarPriceUsd={hbarPriceUsd} />
            </div>
          )}

        </div>
      </main>

    </div>
  );
}

export default Dashboard;
