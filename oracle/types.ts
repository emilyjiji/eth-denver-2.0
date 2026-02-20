// ── Shared types for the ElectricityPaymentStream oracle service ─────────────

/** Per-stream state tracked locally by the oracle (in-memory / persisted). */
export interface StreamState {
  streamId:           number;
  lastReportedUsage:  bigint;  // cumulative kWh × 1000 at last successful report
  currentNonce:       number;  // oracle nonce synced with the contract
  lastReportTime:     number;  // Unix ms timestamp of last successful report
  isActive:           boolean;
}

/** Payload submitted to `reportUsageWithPricing()`. */
export interface UsageReport {
  streamId:      number;
  newTotalUsage: bigint;  // cumulative kWh × 1000
  timestamp:     number;  // Unix seconds
  nonce:         number;
}

/** Pricing data included in each oracle report. */
export interface PricingData {
  baseRate:         bigint;  // wei per kWh-unit (1 unit = 0.001 kWh)
  congestionFactor: number;  // basis points (10 000 = 1.0×)
}

/** Output from UsageSimulator.generateHourlyUsage(). */
export interface UsageSample {
  cumulativeKWh: bigint;  // running total in kWh × 1000
  hourlyKWh:     bigint;  // this interval's usage in kWh × 1000
}

/** Time-of-day usage classification (mirrors MockElectricityOracle.UsagePeriod). */
export type UsagePeriod = 'LOW' | 'MEDIUM' | 'HIGH';

export interface HourConfig {
  multiplier: number;
  period:     UsagePeriod;
}
