import { useState } from 'react';
import Navbar from './Navbar';
import MerchantSetup from './MerchantSetup';
import MerchantDashboard from './MerchantDashboard';

function App() {
  const [merchant, setMerchant] = useState(null);

  if (!merchant) {
    return (
      <>
        <Navbar />
        <div className="navbar-spacer" />
        <MerchantSetup onNext={(data) => setMerchant(data)} />
      </>
    );
  }

  return <MerchantDashboard accountData={merchant} />;
}

export default App;
