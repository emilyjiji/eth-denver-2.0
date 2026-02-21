import './LandingPage.css';

const CUSTOMER_URL = 'http://localhost:3000';

function LandingPage({ onSelectProvider }) {
  return (
    <div className="lp-root">
      <div className="lp-hero">
        <div className="lp-badge">Powered by Hedera &amp; ADI Chain</div>
        <h1 className="lp-title">Decentralized utility payments,<br />built for everyone.</h1>
        <p className="lp-sub">
          Gimme connects electricity customers and utility providers on-chain —
          automated billing, real-time usage, and tokenized receivables.
        </p>
      </div>

      <div className="lp-cards">
        {/* Customer card */}
        <div className="lp-card lp-card--customer">
          <div className="lp-card-icon">⚡</div>
          <div className="lp-card-label">For customers</div>
          <h2 className="lp-card-title">Pay My Bill</h2>
          <p className="lp-card-desc">
            View your live energy usage, track payment history, and manage
            your streaming electricity payments — all in one place.
          </p>
          <ul className="lp-card-features">
            <li>Real-time kWh tracking</li>
            <li>Automatic streaming payments</li>
            <li>Usage insights &amp; cost breakdown</li>
          </ul>
          <a
            className="lp-btn lp-btn--outline"
            href={CUSTOMER_URL}
            target="_self"
          >
            Go to customer portal →
          </a>
        </div>

        {/* Provider card */}
        <div className="lp-card lp-card--provider">
          <div className="lp-card-icon">🏭</div>
          <div className="lp-card-label">For utility providers</div>
          <h2 className="lp-card-title">Manage Receivables</h2>
          <p className="lp-card-desc">
            Monitor your customers, track settlements, and access tokenized
            receivables on ADI Chain — your back-office on the blockchain.
          </p>
          <ul className="lp-card-features">
            <li>Live settlement tracking</li>
            <li>On-chain receivable NFTs</li>
            <li>Customer portfolio overview</li>
          </ul>
          <button
            className="lp-btn lp-btn--primary"
            onClick={onSelectProvider}
          >
            Go to provider portal →
          </button>
        </div>
      </div>

      <p className="lp-footer-note">
        Transactions settle on Hedera Testnet · Receivables issued on ADI Testnet
      </p>
    </div>
  );
}

export default LandingPage;
