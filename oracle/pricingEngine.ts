/**
 * @file pricingEngine.ts
 * @notice Calculates electricity pricing for oracle reports.
 *
 * Three pricing factors:
 *
 *   Factor 1 — Time-of-Use base rate ($/kWh mapped to wei per kWh-unit):
 *     OFF-PEAK  00:00–06:00, 22:00–24:00  → 0.08 HBAR/kWh
 *     STANDARD  06:00–17:00               → 0.15 HBAR/kWh
 *     PEAK      17:00–22:00               → 0.25 HBAR/kWh
 *
 *   Factor 2 — Grid congestion multiplier (basis points):
 *     < 70 % load  → 10 000  (1.0×)
 *     70–80 % load → 13 000  (1.3×)
 *     80–90 % load → 18 000  (1.8×)
 *     ≥ 90 % load  → 25 000  (2.5×)
 *
 *   Factor 3 — Effective rate:
 *     effectiveRate = (baseRate × congestionFactor) / 10 000
 *     cost = usageDelta × effectiveRate
 *
 * Rate units: tinybar per kWh-unit (1 unit = 0.001 kWh).
 *   Hedera EVM uses tinybar (1 HBAR = 10^8 tinybar) as the base monetary unit.
 *   Rates are intentionally small so the 30 HBAR deposit lasts hundreds of hours.
 */

export class PricingEngine {
  // Base rates in tinybar per kWh-unit (1 unit = 0.001 kWh).
  // Hedera EVM stores msg.value in tinybar (1 HBAR = 10^8 tinybar).
  // Rate = price_per_kWh_HBAR * 10^8 / 1000 (convert to per-unit tinybar).
  // Using 10× reduced scale so 30 HBAR deposit lasts hundreds of hours.
  private static readonly RATES = {
    OFF_PEAK:  80n, // ≈ 0.008 HBAR/kWh in tinybar scale
    STANDARD: 150n, // ≈ 0.015 HBAR/kWh in tinybar scale
    PEAK:     250n, // ≈ 0.025 HBAR/kWh in tinybar scale
  } as const;

  /**
   * Returns the time-of-use base rate in wei per kWh-unit for the given UTC hour.
   */
  getBaseRate(hour: number): bigint {
    if (hour < 6)  return PricingEngine.RATES.OFF_PEAK; // 00:00–06:00
    if (hour < 17) return PricingEngine.RATES.STANDARD; // 06:00–17:00
    if (hour < 22) return PricingEngine.RATES.PEAK;     // 17:00–22:00
    return PricingEngine.RATES.OFF_PEAK;                 // 22:00–24:00
  }

  /**
   * Maps a grid load percentage to a congestion multiplier in basis points.
   * @param loadPercent  0–100 representing percentage grid load.
   */
  getCongestionFactor(loadPercent: number): number {
    if (loadPercent < 70) return 10_000; // 1.0×
    if (loadPercent < 80) return 13_000; // 1.3×
    if (loadPercent < 90) return 18_000; // 1.8×
    return                       25_000; // 2.5×
  }

  /**
   * Returns the effective rate after applying the congestion multiplier.
   * Matches the contract formula: effectiveRate = (baseRate × congestionFactor) / 10 000.
   */
  getEffectiveRate(baseRate: bigint, congestionFactor: number): bigint {
    return (baseRate * BigInt(congestionFactor)) / 10_000n;
  }

  /**
   * Simulates the current grid load (50–95 %).
   * In production this would read from a real grid API.
   */
  simulateCongestion(): number {
    return 50 + Math.floor(Math.random() * 45); // [50, 95)
  }
}
