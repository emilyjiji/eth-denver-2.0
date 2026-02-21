/**
 * @file pricingEngine.ts
 * @notice Calculates electricity pricing for oracle reports.
 *
 * Three pricing factors:
 *
 *   Factor 1 — Time-of-Use base rate (at HBAR ≈ $0.10):
 *     OFF-PEAK  00:00–06:00, 22:00–24:00  →  50 000 tinybar/unit  ≈ $0.02–0.03/period
 *     STANDARD  06:00–17:00               →  65 000 tinybar/unit  ≈ $0.04–0.05/period
 *     PEAK      17:00–22:00               →  80 000 tinybar/unit  ≈ $0.06–0.10/period
 *
 *   Factor 2 — Grid congestion multiplier (basis points):
 *     < 70 % load  → 10 000  (1.0×)
 *     70–80 % load → 11 000  (1.1×)
 *     80–90 % load → 12 000  (1.2×)
 *     ≥ 90 % load  → 13 000  (1.3×)
 *
 *   Factor 3 — Effective rate:
 *     effectiveRate = (baseRate × congestionFactor) / 10 000
 *     cost = usageDelta × effectiveRate
 *
 * Rate units: tinybar per kWh-unit (1 unit = 0.001 kWh).
 *   Hedera EVM uses tinybar (1 HBAR = 10^8 tinybar) as the base monetary unit.
 *
 * Math check at HBAR = $0.10, avg usage ~600 units, avg congestion ~1.09×:
 *   STANDARD: 600 × 65 000 × 1.09 / 10^8 × $0.10 ≈ $0.043  ✓
 *   PEAK:     720 × 80 000 × 1.09 / 10^8 × $0.10 ≈ $0.063  ✓
 *   OFF-PEAK: 420 × 50 000 × 1.09 / 10^8 × $0.10 ≈ $0.023  ✓
 */

export class PricingEngine {
  // Base rates in tinybar per kWh-unit (1 unit = 0.001 kWh).
  // Hedera: 1 HBAR = 10^8 tinybar.  HBAR ≈ $0.10.
  // Usage simulator generates ~330–840 units/period (avg ~600 at STANDARD).
  private static readonly RATES = {
    OFF_PEAK: 50_000n, // overnight/low-use  ≈ $0.02–0.03/period
    STANDARD: 65_000n, // daytime            ≈ $0.04–0.05/period
    PEAK:     80_000n, // evening            ≈ $0.06–0.10/period
  } as const;

  /**
   * Returns the time-of-use base rate in tinybar per kWh-unit for the given local hour.
   */
  getBaseRate(hour: number): bigint {
    if (hour < 6)  return PricingEngine.RATES.OFF_PEAK; // 00:00–06:00
    if (hour < 17) return PricingEngine.RATES.STANDARD; // 06:00–17:00
    if (hour < 22) return PricingEngine.RATES.PEAK;     // 17:00–22:00
    return PricingEngine.RATES.OFF_PEAK;                 // 22:00–24:00
  }

  /**
   * Maps a grid load percentage to a congestion multiplier in basis points.
   * Capped at 1.3× to keep per-period costs within the target range.
   * @param loadPercent  0–100 representing percentage grid load.
   */
  getCongestionFactor(loadPercent: number): number {
    if (loadPercent < 70) return 10_000; // 1.0×
    if (loadPercent < 80) return 11_000; // 1.1×
    if (loadPercent < 90) return 12_000; // 1.2×
    return                       13_000; // 1.3×
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
