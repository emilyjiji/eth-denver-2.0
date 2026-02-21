import { useState } from 'react';
import './MerchantDashboard.css';
import CustomersTab from './CustomersTab';
import ReceivablesTab from './ReceivablesTab';
import MerchantHomeTab from './MerchantHomeTab';

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
    id: 'customers',
    label: 'Customers',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M1 13c0-2.761 2.239-4 5-4s5 1.239 5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M11.5 7.5a2 2 0 100-4M15 13c0-1.8-1.2-3-3.5-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'receivables',
    label: 'Receivables',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M5 7h3M5 9.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M10 6l1.5 1.5L10 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

function MerchantDashboard({ accountData }) {
  const [active, setActive] = useState('home');

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
              {accountData?.fullName?.[0]?.toUpperCase() ?? 'M'}
            </div>
            <div className="db-account-info">
              <span className="db-account-name">{accountData?.fullName ?? 'Merchant'}</span>
              <span className="db-account-email">{accountData?.company ?? ''}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="db-main">
        <div className="db-main-inner">

          {active === 'home' && (
            <MerchantHomeTab />
          )}

          {active === 'customers' && (
            <div>
              <h2 className="db-page-title">Customers</h2>
              <CustomersTab />
            </div>
          )}

          {active === 'receivables' && (
            <div>
              <h2 className="db-page-title">Receivables</h2>
              <ReceivablesTab />
            </div>
          )}

        </div>
      </main>

    </div>
  );
}

export default MerchantDashboard;
