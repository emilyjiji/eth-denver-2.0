import { useState } from 'react';
import Navbar from './Navbar';
import CustomerSetup from './Customer-UI/CustomerSetup';
import CustomerWalletSetup from './Customer-UI/CustomerWalletSetup';
import CustomerCreateWallet from './Customer-UI/CustomerCreateWallet';
import Dashboard from './Dashboard/Dashboard';

function App() {
  const [step, setStep] = useState('account');
  const [accountData, setAccountData] = useState(null);

  let content;
  if (step === 'account') {
    content = (
      <CustomerSetup
        onNext={(formData) => {
          setAccountData(formData);
          setStep('wallet');
        }}
      />
    );
  } else if (step === 'wallet') {
    content = (
      <CustomerWalletSetup
        onNext={(walletChoice) => {
          setAccountData((prev) => ({ ...prev, wallet: walletChoice }));
          setStep('createWallet');
        }}
      />
    );
  } else if (step === 'createWallet') {
    content = (
      <CustomerCreateWallet
        onNext={({ wallet, transaction }) => {
          setAccountData((prev) => ({
            ...prev,
            generatedWallet: wallet,
            transactions: transaction ? [transaction] : [],
          }));
          setStep('dashboard');
        }}
      />
    );
  } else {
    return <Dashboard accountData={accountData} />;
  }

  return (
    <>
      <Navbar />
      <div className="navbar-spacer" />
      {content}
    </>
  );
}

export default App;
