/**
 * @file usageSimulator.ts
 * @notice Simulates electricity meter readings.
 *
 * Time-of-day bands mirror MockElectricityOracle._classifyHour():
 *   LOW    00:00–06:00  sleeping          base × 0.70
 *   MEDIUM 06:00–17:00  lights/appliances base × 1.00
 *   HIGH   17:00–22:00  cooking/AC/TV     base × 1.20
 *   LOW    22:00–24:00  winding down      base × 0.70
 *
 * All values are in kWh × 1000 (integer) matching MockElectricityOracle's scale.
 *
 * Target 15-min costs at HBAR ≈ $0.10 (see pricingEngine.ts for rates):
 *   avg base ~600 units → OFF-PEAK ~$0.02–0.03, STANDARD ~$0.04–0.05, PEAK ~$0.06–0.10
 */

import type { HourConfig, UsageSample } from './types';

export class UsageSimulator {
  /** Running meter total in kWh × 1000. */
  private cumulativeKWh: bigint = 0n;

  /**
   * Returns the multiplier and usage-period classification for a local hour.
   * Must stay in sync with MockElectricityOracle._classifyHour().
   */
  getHourConfig(hour: number): HourConfig {
    if (hour < 6)  return { multiplier: 0.70, period: 'LOW'    };
    if (hour < 17) return { multiplier: 1.00, period: 'MEDIUM' };
    if (hour < 22) return { multiplier: 1.20, period: 'HIGH'   };
    return             { multiplier: 0.70, period: 'MEDIUM' };
  }

  /**
   * Generates a new usage sample for the current 15-min period.
   *
   * Algorithm:
   *   1. Base usage: random value in [400, 800) (kWh × 1000) → avg ~600 units.
   *   2. Apply time-of-day multiplier (0.70 / 1.00 / 1.20).
   *   3. Add ±5% jitter.
   *   4. Floor at 1 to ensure strictly positive usage.
   *   5. Add to cumulative total.
   *
   * @param overrideHour  Optional local hour override for testing.
   */
  generateHourlyUsage(overrideHour?: number): UsageSample {
    const hour   = overrideHour ?? new Date().getHours();
    const config = this.getHourConfig(hour);

    // Base: 400–800 (kWh × 1000), avg ~600
    const baseRaw = 400 + Math.floor(Math.random() * 400);

    // Apply time-of-day multiplier.
    const scaled = Math.round(baseRaw * config.multiplier);

    // ±5% jitter.
    const jitter = Math.round(scaled * 0.05 * (Math.random() * 2 - 1));

    const hourlyKWh = BigInt(Math.max(1, scaled + jitter));
    this.cumulativeKWh += hourlyKWh;

    return { cumulativeKWh: this.cumulativeKWh, hourlyKWh };
  }

  /** Seed the cumulative total (e.g. when syncing from the contract on startup). */
  setCumulative(value: bigint): void {
    this.cumulativeKWh = value;
  }

  getCumulative(): bigint {
    return this.cumulativeKWh;
  }
}
