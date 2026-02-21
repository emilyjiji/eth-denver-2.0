import { useState, useEffect } from 'react';

export function useHbarPrice() {
  const [priceUsd, setPriceUsd] = useState(null);

  useEffect(() => {
    async function fetch() {
      try {
        const res  = await window.fetch('https://api.coingecko.com/api/v3/simple/price?ids=hedera-hashgraph&vs_currencies=usd');
        const data = await res.json();
        setPriceUsd(data['hedera-hashgraph']?.usd ?? null);
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
