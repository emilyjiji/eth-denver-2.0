import { useState } from 'react';
import './CustomersTab.css';

const CUSTOMERS = [
  {
    id: 1,
    name: 'Emily Jiji',
    email: 'emilyjiji418@gmail.com',
    created: 'Feb 18, 2026',
    status: 'Active',
    balance: '$12.40',
  },
  {
    id: 2,
    name: 'Marcus Webb',
    email: 'mwebb@homepower.io',
    created: 'Feb 15, 2026',
    status: 'Active',
    balance: '$8.73',
  },
  {
    id: 3,
    name: 'Priya Nair',
    email: 'priya.nair@outlook.com',
    created: 'Feb 12, 2026',
    status: 'Active',
    balance: '$21.05',
  },
  {
    id: 4,
    name: 'Jordan Tate',
    email: 'jtate@gridwise.co',
    created: 'Feb 10, 2026',
    status: 'Paused',
    balance: '$0.00',
  },
  {
    id: 5,
    name: 'Sofia Reyes',
    email: 'sofia.r@cleanwatts.com',
    created: 'Feb 7, 2026',
    status: 'Active',
    balance: '$5.18',
  },
  {
    id: 6,
    name: 'Daniel Osei',
    email: 'd.osei@ampflow.net',
    created: 'Feb 3, 2026',
    status: 'Active',
    balance: '$34.90',
  },
  {
    id: 7,
    name: 'Leila Haddad',
    email: 'leila.haddad@voltpath.io',
    created: 'Jan 29, 2026',
    status: 'Paused',
    balance: '$0.00',
  },
];

function avatar(name) {
  const parts = name.trim().split(' ');
  return parts.length >= 2
    ? parts[0][0] + parts[1][0]
    : parts[0][0];
}

function CustomersTab() {
  const [search, setSearch] = useState('');

  const filtered = CUSTOMERS.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="ct-wrap">
      {/* ── Toolbar ── */}
      <div className="ct-toolbar">
        <div className="ct-search-wrap">
          <svg className="ct-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="#9ca3af" strokeWidth="1.5"/>
            <path d="M10.5 10.5L14 14" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            className="ct-search"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="ct-filters">
          {['Email', 'Name', 'Created date', 'Status'].map((f) => (
            <button key={f} className="ct-filter-pill">{f}</button>
          ))}
        </div>

        <div className="ct-actions">
          <button className="ct-action-btn">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M5 8h6M5 5.5h6M5 10.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            Export
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="ct-table-wrap">
        <table className="ct-table">
          <thead>
            <tr>
              <th className="ct-th">Name</th>
              <th className="ct-th">Email</th>
              <th className="ct-th">Created</th>
              <th className="ct-th">Status</th>
              <th className="ct-th ct-th--right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="ct-row">
                <td className="ct-td">
                  <div className="ct-name-cell">
                    <div className="ct-avatar">{avatar(c.name)}</div>
                    <span className="ct-name">{c.name}</span>
                  </div>
                </td>
                <td className="ct-td ct-email">{c.email}</td>
                <td className="ct-td ct-muted">{c.created}</td>
                <td className="ct-td">
                  <span className={`ct-badge ct-badge--${c.status.toLowerCase()}`}>
                    {c.status}
                  </span>
                </td>
                <td className="ct-td ct-td--right ct-balance">{c.balance}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="ct-empty">No customers match your search.</div>
        )}
      </div>
    </div>
  );
}

export default CustomersTab;
