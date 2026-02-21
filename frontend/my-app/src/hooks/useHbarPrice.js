import { useState, useEffect } from 'react';

// Fallback price used before CoinGecko responds or if the fetch fails.
const HBAR_FALLBACK_USD = 0.10;

// Fetches live HBAR/USD price from CoinGecko (free, no API key required).
// Refreshes every 60 seconds. Returns fallback price until the first fetch resolves.
export function useHbarPrice() {
  const [priceUsd, setPriceUsd] = useState(HBAR_FALLBACK_USD);

  useEffect(() => {
    async function fetchPrice() {
      try {
        const res = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=hedera-hashgraph&vs_currencies=usd'
        );
        const data = await res.json();
        const live = data['hedera-hashgraph']?.usd;
        if (live != null) setPriceUsd(live);
      } catch {
        // silently ignore — fallback/stale price stays displayed
      }
    }
    fetchPrice();
    const id = setInterval(fetchPrice, 60_000);
    return () => clearInterval(id);
  }, []);

  return priceUsd;
}

// Converts tinybar (Hedera native) → USDC
// 1 HBAR = 1e8 tinybar; USDC ≈ $1
export function tinybarToUsdc(tinybar, hbarPriceUsd) {
  if (hbarPriceUsd == null) return null;
  const hbar = Number(tinybar) / 1e8;
  return hbar * hbarPriceUsd;
}

export function formatUsdc(amount) {
  if (amount == null) return '…';
  if (amount < 0.000001) return '<$0.000001';
  return '$' + amount.toFixed(6);
}
