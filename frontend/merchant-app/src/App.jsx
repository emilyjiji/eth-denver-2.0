import { useState } from 'react';
import Navbar from './Navbar';
import LandingPage from './LandingPage';
import MerchantSetup from './MerchantSetup';
import MerchantDashboard from './MerchantDashboard';

function App() {
  const [role, setRole] = useState(null);       // null | 'provider'
  const [merchant, setMerchant] = useState(null);

  // Landing — no role chosen yet
  if (!role) {
    return (
      <>
        <Navbar />
        <div className="navbar-spacer" />
        <LandingPage onSelectProvider={() => setRole('provider')} />
      </>
    );
  }

  // Provider — onboarding form
  if (!merchant) {
    return (
      <>
        <Navbar />
        <div className="navbar-spacer" />
        <MerchantSetup onNext={(data) => setMerchant(data)} />
      </>
    );
  }

  // Provider — full dashboard
  return <MerchantDashboard accountData={merchant} />;
}

export default App;
