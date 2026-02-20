import { useState, useCallback, useEffect } from 'react';

export function useMetaMask() {
  const [address, setAddress]     = useState(null);
  const [error, setError]         = useState(null);
  const [connecting, setConnecting] = useState(false);

  // If user already connected in a previous session, pick it up
  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum
      .request({ method: 'eth_accounts' })
      .then((accounts) => { if (accounts[0]) setAddress(accounts[0]); })
      .catch(() => {});

    // Keep in sync if user switches accounts in MetaMask
    const onAccountsChanged = (accounts) => setAddress(accounts[0] ?? null);
    window.ethereum.on('accountsChanged', onAccountsChanged);
    return () => window.ethereum.removeListener('accountsChanged', onAccountsChanged);
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError('MetaMask not found. Install it at metamask.io');
      return false;
    }
    // If already unlocked, grab the account without opening a popup
    try {
      const existing = await window.ethereum.request({ method: 'eth_accounts' });
      if (existing?.[0]) {
        setAddress(existing[0]);
        setError(null);
        return true;
      }
    } catch { /* ignore */ }

    try {
      setConnecting(true);
      setError(null);
      // Call window.ethereum directly — avoids ethers BrowserProvider
      // stacking a second permission request on top of a pending one.
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setAddress(accounts[0]);
      return true;
    } catch (err) {
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        setError('Connection cancelled.');
      } else if (err.message?.toLowerCase().includes('pending')) {
        setError('Open MetaMask and approve the pending request.');
      } else {
        setError(err.message ?? 'Failed to connect.');
      }
      return false;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setError(null);
  }, []);

  // Shorten 0xABCD...1234
  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null;

  return { address, shortAddress, error, connecting, connect, disconnect };
}
