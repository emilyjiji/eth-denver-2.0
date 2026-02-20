/**
 * @file usageSimulator.ts
 * @notice Simulates electricity meter readings.
 *
 * Time-of-day bands mirror MockElectricityOracle._classifyHour():
 *   LOW    00:00–06:00  sleeping          base × 0.35
 *   MEDIUM 06:00–17:00  lights/appliances base × 1.00
 *   HIGH   17:00–22:00  cooking/AC/TV     base × 1.70
 *   MEDIUM 22:00–24:00  winding down      base × 0.55
 *
 * All values are in kWh × 1000 (integer) matching MockElectricityOracle's scale.
 */

import type { HourConfig, UsageSample } from './types';

export class UsageSimulator {
  /** Running meter total in kWh × 1000. */
  private cumulativeKWh: bigint = 0n;

  /**
   * Returns the multiplier and usage-period classification for a UTC hour.
   * Must stay in sync with MockElectricityOracle._classifyHour().
   */
  getHourConfig(hour: number): HourConfig {
    if (hour < 6)  return { multiplier: 0.35, period: 'LOW'    };
    if (hour < 17) return { multiplier: 1.00, period: 'MEDIUM' };
    if (hour < 22) return { multiplier: 1.70, period: 'HIGH'   };
    return             { multiplier: 0.55, period: 'MEDIUM' };
  }

  /**
   * Generates a new usage sample for the current hour.
   *
   * Algorithm:
   *   1. Base usage: random value in [500, 1500) (kWh × 1000) → 0.5–1.5 kWh/hour.
   *   2. Apply time-of-day multiplier.
   *   3. Add ±20 % Gaussian-ish jitter (uniform approximation).
   *   4. Floor at 1 to ensure strictly positive hourly usage.
   *   5. Add to cumulative total.
   *
   * @param overrideHour  Optional UTC hour override for testing.
   */
  generateHourlyUsage(overrideHour?: number): UsageSample {
    const hour   = overrideHour ?? new Date().getUTCHours();
    const config = this.getHourConfig(hour);

    // Base: 500–1500 (kWh × 1000)
    const baseRaw = 500 + Math.floor(Math.random() * 1000);

    // Apply time-of-day multiplier.
    const scaled = Math.round(baseRaw * config.multiplier);

    // ±20 % jitter.
    const jitter = Math.round(scaled * 0.20 * (Math.random() * 2 - 1));

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
