import { useState, useEffect } from 'react';

export function useHbarPrice() {
  // Default to $0.10 immediately, update from API after
  const [priceUsd, setPriceUsd] = useState(0.10);

  useEffect(() => {
    async function fetch() {
      try {
        const res  = await window.fetch('https://api.coingecko.com/api/v3/simple/price?ids=hedera-hashgraph&vs_currencies=usd');
        const data = await res.json();
        const apiPrice = data['hedera-hashgraph']?.usd;
        if (apiPrice) setPriceUsd(apiPrice);
      } catch { /* keep previous price */ }
    }
    fetch();
    const id = setInterval(fetch, 60_000);
    return () => clearInterval(id);
  }, []);

  return priceUsd;
}

/** tinybar → USDC string, e.g. "$0.042" */
export function tinybarToUsd(tinybar, hbarPriceUsd) {
  if (!hbarPriceUsd) return null;
  const hbar = Number(tinybar) / 1e8;
  return hbar * hbarPriceUsd;
}
