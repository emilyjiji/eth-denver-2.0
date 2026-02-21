import { useState } from 'react';
import './MerchantSetup.css';

const COUNTRIES = [
  'United States', 'Canada', 'United Kingdom', 'Australia',
  'Germany', 'France', 'Japan', 'Singapore', 'India', 'Brazil',
];

function MerchantSetup({ onNext }) {
  const [form, setForm] = useState({
    email: '',
    fullName: '',
    company: '',
    country: 'United States',
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onNext) onNext(form);
  };

  const isValid = form.email.trim() && form.fullName.trim() && form.company.trim();

  return (
    <div className="cs-page">
      <div className="cs-card">
        <div className="cs-header">
          <div className="cs-logo">⚡</div>
          <h1 className="cs-title">Set up your Merchant Account</h1>
          <p className="cs-subtitle">Enter your details to get started.</p>
        </div>

        <form className="cs-form" onSubmit={handleSubmit}>
          <div className="cs-field">
            <label className="cs-label" htmlFor="email">Email</label>
            <input
              className="cs-input"
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
            />
          </div>

          <div className="cs-field">
            <label className="cs-label" htmlFor="fullName">Full name</label>
            <input
              className="cs-input"
              id="fullName"
              name="fullName"
              type="text"
              placeholder="Jane Smith"
              value={form.fullName}
              onChange={handleChange}
              autoComplete="name"
            />
          </div>

          <div className="cs-field">
            <label className="cs-label" htmlFor="company">Company</label>
            <input
              className="cs-input"
              id="company"
              name="company"
              type="text"
              placeholder="Acme Energy Co."
              value={form.company}
              onChange={handleChange}
              autoComplete="organization"
            />
          </div>

          <div className="cs-field">
            <label className="cs-label" htmlFor="country">
              Country&nbsp;
              <span className="cs-label-hint" title="Used to determine billing region">ⓘ</span>
            </label>
            <div className="cs-select-wrapper">
              <select
                className="cs-select"
                id="country"
                name="country"
                value={form.country}
                onChange={handleChange}
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <span className="cs-select-arrow">▾</span>
            </div>
          </div>

          <div className="cs-footer">
            <button
              className={`cs-next-btn${isValid ? '' : ' cs-next-btn--disabled'}`}
              type="submit"
              disabled={!isValid}
            >
              Next →
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default MerchantSetup;
