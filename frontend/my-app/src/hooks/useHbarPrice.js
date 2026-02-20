import { useState, useEffect } from 'react';

// Fetches live HBAR/USD price from CoinGecko (free, no API key required).
// Refreshes every 60 seconds. Returns null until the first fetch resolves.
export function useHbarPrice() {
  const [priceUsd, setPriceUsd] = useState(null);

  useEffect(() => {
    async function fetchPrice() {
      try {
        const res = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=hedera-hashgraph&vs_currencies=usd'
        );
        const data = await res.json();
        setPriceUsd(data['hedera-hashgraph']?.usd ?? null);
      } catch {
        // silently ignore — stale price stays displayed
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
