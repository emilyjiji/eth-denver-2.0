/**
 * @file oraclePricing.test.ts
 * @notice Unit tests for PricingEngine and UsageSimulator.
 *
 * Verifies that per-15-min costs land in the target ranges at HBAR = $0.10:
 *   Off-Peak  (midnight–6am, 10pm–midnight) → $0.02–0.04
 *   Standard  (6am–5pm)                     → $0.03–0.07
 *   Peak      (5pm–10pm)                    → $0.05–0.11
 *
 * Run: npx hardhat test test/oraclePricing.test.ts
 */

import { expect } from 'chai';
import { PricingEngine }   from '../oracle/pricingEngine';
import { UsageSimulator }  from '../oracle/usageSimulator';

const HBAR_USD   = 0.10;   // assumed live price
const TINYBAR    = 1e8;    // 1 HBAR = 1e8 tinybar

/** Convert tinybar cost to USD cents at the given HBAR price */
function tinybarToCents(tinybar: number | bigint, hbarUsd = HBAR_USD): number {
  return (Number(tinybar) / TINYBAR) * hbarUsd * 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// PricingEngine
// ─────────────────────────────────────────────────────────────────────────────

describe('PricingEngine', () => {
  const engine = new PricingEngine();

  // ── Base rate tiers ──

  describe('getBaseRate()', () => {
    it('returns OFF_PEAK (50 000) for hours 0–5', () => {
      for (let h = 0; h < 6; h++) {
        expect(engine.getBaseRate(h)).to.equal(50_000n, `hour ${h}`);
      }
    });

    it('returns STANDARD (65 000) for hours 6–16', () => {
      for (let h = 6; h < 17; h++) {
        expect(engine.getBaseRate(h)).to.equal(65_000n, `hour ${h}`);
      }
    });

    it('returns PEAK (80 000) for hours 17–21', () => {
      for (let h = 17; h < 22; h++) {
        expect(engine.getBaseRate(h)).to.equal(80_000n, `hour ${h}`);
      }
    });

    it('returns OFF_PEAK (50 000) for hours 22–23 (winding down)', () => {
      for (let h = 22; h < 24; h++) {
        expect(engine.getBaseRate(h)).to.equal(50_000n, `hour ${h}`);
      }
    });
  });

  // ── Congestion factors ──

  describe('getCongestionFactor()', () => {
    it('returns 1.0× (10 000) for load < 70 %', () => {
      expect(engine.getCongestionFactor(0)).to.equal(10_000);
      expect(engine.getCongestionFactor(50)).to.equal(10_000);
      expect(engine.getCongestionFactor(69)).to.equal(10_000);
    });

    it('returns 1.1× (11 000) for load 70–79 %', () => {
      expect(engine.getCongestionFactor(70)).to.equal(11_000);
      expect(engine.getCongestionFactor(75)).to.equal(11_000);
      expect(engine.getCongestionFactor(79)).to.equal(11_000);
    });

    it('returns 1.2× (12 000) for load 80–89 %', () => {
      expect(engine.getCongestionFactor(80)).to.equal(12_000);
      expect(engine.getCongestionFactor(85)).to.equal(12_000);
      expect(engine.getCongestionFactor(89)).to.equal(12_000);
    });

    it('returns 1.3× (13 000) — maximum — for load ≥ 90 %', () => {
      expect(engine.getCongestionFactor(90)).to.equal(13_000);
      expect(engine.getCongestionFactor(100)).to.equal(13_000);
    });

    it('max congestion factor does not exceed 13 000 (1.3×)', () => {
      // Exhaustive: every integer load 0–100
      for (let load = 0; load <= 100; load++) {
        expect(engine.getCongestionFactor(load)).to.be.at.most(
          13_000,
          `load=${load} exceeded max congestion`,
        );
      }
    });
  });

  // ── Effective rate ──

  describe('getEffectiveRate()', () => {
    it('effective = base when congestion is 1.0× (10 000)', () => {
      expect(engine.getEffectiveRate(65_000n, 10_000)).to.equal(65_000n);
    });

    it('effective = base × 1.3 at max congestion', () => {
      expect(engine.getEffectiveRate(80_000n, 13_000)).to.equal(104_000n);
    });
  });

  // ── simulateCongestion() ──

  describe('simulateCongestion()', () => {
    it('always returns a value in [50, 95)', () => {
      for (let i = 0; i < 200; i++) {
        const load = engine.simulateCongestion();
        expect(load).to.be.at.least(50, 'below minimum');
        expect(load).to.be.below(95,   'at or above maximum');
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UsageSimulator
// ─────────────────────────────────────────────────────────────────────────────

describe('UsageSimulator', () => {
  const sim = new UsageSimulator();

  // ── Hour config ──

  describe('getHourConfig()', () => {
    it('LOW (0.70×) for hours 0–5', () => {
      for (let h = 0; h < 6; h++) {
        const cfg = sim.getHourConfig(h);
        expect(cfg.multiplier).to.equal(0.70, `hour ${h}`);
        expect(cfg.period).to.equal('LOW');
      }
    });

    it('MEDIUM (1.00×) for hours 6–16', () => {
      for (let h = 6; h < 17; h++) {
        const cfg = sim.getHourConfig(h);
        expect(cfg.multiplier).to.equal(1.00, `hour ${h}`);
        expect(cfg.period).to.equal('MEDIUM');
      }
    });

    it('HIGH (1.20×) for hours 17–21', () => {
      for (let h = 17; h < 22; h++) {
        const cfg = sim.getHourConfig(h);
        expect(cfg.multiplier).to.equal(1.20, `hour ${h}`);
        expect(cfg.period).to.equal('HIGH');
      }
    });

    it('LOW (0.70×) for hours 22–23 (winding down)', () => {
      for (let h = 22; h < 24; h++) {
        const cfg = sim.getHourConfig(h);
        expect(cfg.multiplier).to.equal(0.70, `hour ${h}`);
      }
    });
  });

  // ── Output ranges ──

  describe('generateHourlyUsage() output ranges', () => {
    const N = 500; // samples per tier

    function sampleUsage(hour: number, n: number): number[] {
      const s = new UsageSimulator();
      s.setCumulative(0n);
      let prev = 0n;
      const deltas: number[] = [];
      for (let i = 0; i < n; i++) {
        const { cumulativeKWh } = s.generateHourlyUsage(hour);
        deltas.push(Number(cumulativeKWh - prev));
        prev = cumulativeKWh;
      }
      return deltas;
    }

    it('OFF-PEAK (hour=3): usage in [266, 588]', () => {
      // base [400,800) × 0.70 multiplier × ±5% jitter
      // min: 400 × 0.70 × 0.95 ≈ 266   max: 799 × 0.70 × 1.05 ≈ 588
      const samples = sampleUsage(3, N);
      for (const u of samples) {
        expect(u).to.be.at.least(260, `off-peak sample ${u} below minimum`);
        expect(u).to.be.at.most(600, `off-peak sample ${u} above maximum`);
      }
    });

    it('STANDARD (hour=12): usage in [380, 840]', () => {
      // base [400,800) × 1.00 × ±5%
      // min: 400 × 0.95 = 380   max: 799 × 1.05 ≈ 839
      const samples = sampleUsage(12, N);
      for (const u of samples) {
        expect(u).to.be.at.least(370, `standard sample ${u} below minimum`);
        expect(u).to.be.at.most(850, `standard sample ${u} above maximum`);
      }
    });

    it('PEAK (hour=19): usage in [455, 1008]', () => {
      // base [400,800) × 1.20 × ±5%
      // min: 400 × 1.20 × 0.95 ≈ 456   max: 799 × 1.20 × 1.05 ≈ 1007
      const samples = sampleUsage(19, N);
      for (const u of samples) {
        expect(u).to.be.at.least(445, `peak sample ${u} below minimum`);
        expect(u).to.be.at.most(1020, `peak sample ${u} above maximum`);
      }
    });

    it('cumulative total increases monotonically', () => {
      const s = new UsageSimulator();
      s.setCumulative(0n);
      let prev = 0n;
      for (let i = 0; i < 50; i++) {
        const { cumulativeKWh } = s.generateHourlyUsage(12);
        expect(cumulativeKWh).to.be.greaterThan(prev);
        prev = cumulativeKWh;
      }
    });

    it('setCumulative() seeds the running total correctly', () => {
      const s = new UsageSimulator();
      s.setCumulative(100_000n);
      expect(s.getCumulative()).to.equal(100_000n);
      const { cumulativeKWh } = s.generateHourlyUsage(12);
      expect(cumulativeKWh).to.be.greaterThan(100_000n);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Combined cost validation  (the real goal)
// ─────────────────────────────────────────────────────────────────────────────

describe('Combined cost per 15-min period at HBAR = $0.10', () => {
  const engine = new PricingEngine();
  const N      = 1_000; // Monte-Carlo samples

  /**
   * Simulate N oracle cycles for the given hour.
   * Returns the cost in USD cents for each sample.
   */
  function sampleCosts(hour: number, n: number): number[] {
    const costs: number[] = [];
    for (let i = 0; i < n; i++) {
      const sim = new UsageSimulator();
      sim.setCumulative(0n);

      const { hourlyKWh } = sim.generateHourlyUsage(hour);
      const usageDelta    = Number(hourlyKWh);

      const baseRate        = engine.getBaseRate(hour);
      const load            = engine.simulateCongestion();
      const congestion      = engine.getCongestionFactor(load);
      const effectiveRate   = engine.getEffectiveRate(baseRate, congestion);

      const costTinybar = usageDelta * Number(effectiveRate);
      costs.push(tinybarToCents(costTinybar));
    }
    return costs;
  }

  function stats(costs: number[]) {
    const avg = costs.reduce((s, c) => s + c, 0) / costs.length;
    const min = Math.min(...costs);
    const max = Math.max(...costs);
    return { avg, min, max };
  }

  // ── OFF-PEAK: 2–4 ¢ ──

  describe('OFF-PEAK hours (hour=3)', () => {
    let costs: number[];
    before(() => { costs = sampleCosts(3, N); });

    it('average cost is between 1.5 ¢ and 3.5 ¢', () => {
      const { avg } = stats(costs);
      expect(avg).to.be.within(1.5, 3.5,
        `off-peak avg = ${avg.toFixed(2)} ¢ — outside 1.5–3.5 ¢ target`);
    });

    it('p95 cost does not exceed 5 ¢', () => {
      const sorted = [...costs].sort((a, b) => a - b);
      const p95    = sorted[Math.floor(N * 0.95)];
      expect(p95).to.be.below(5,
        `off-peak p95 = ${p95.toFixed(2)} ¢ — exceeds 5 ¢ ceiling`);
    });
  });

  // ── STANDARD: 3–7 ¢ ──

  describe('STANDARD hours (hour=12)', () => {
    let costs: number[];
    before(() => { costs = sampleCosts(12, N); });

    it('average cost is between 3 ¢ and 6 ¢', () => {
      const { avg } = stats(costs);
      expect(avg).to.be.within(3, 6,
        `standard avg = ${avg.toFixed(2)} ¢ — outside 3–6 ¢ target`);
    });

    it('p95 cost does not exceed 9 ¢', () => {
      const sorted = [...costs].sort((a, b) => a - b);
      const p95    = sorted[Math.floor(N * 0.95)];
      expect(p95).to.be.below(9,
        `standard p95 = ${p95.toFixed(2)} ¢ — exceeds 9 ¢ ceiling`);
    });
  });

  // ── PEAK: 5–11 ¢ ──

  describe('PEAK hours (hour=19)', () => {
    let costs: number[];
    before(() => { costs = sampleCosts(19, N); });

    it('average cost is between 5 ¢ and 9 ¢', () => {
      const { avg } = stats(costs);
      expect(avg).to.be.within(5, 9,
        `peak avg = ${avg.toFixed(2)} ¢ — outside 5–9 ¢ target`);
    });

    it('p95 cost does not exceed 12 ¢', () => {
      const sorted = [...costs].sort((a, b) => a - b);
      const p95    = sorted[Math.floor(N * 0.95)];
      expect(p95).to.be.below(12,
        `peak p95 = ${p95.toFixed(2)} ¢ — exceeds 12 ¢ ceiling`);
    });

    it('average peak cost is higher than average standard cost', () => {
      const standardCosts = sampleCosts(12, N);
      const { avg: peakAvg }     = stats(costs);
      const { avg: standardAvg } = stats(standardCosts);
      expect(peakAvg).to.be.greaterThan(standardAvg,
        'peak should cost more than standard on average');
    });
  });

  // ── Tier ordering ──

  describe('Cost ordering across tiers', () => {
    it('OFF-PEAK avg < STANDARD avg < PEAK avg', () => {
      const offPeakAvg  = stats(sampleCosts(3,  500)).avg;
      const standardAvg = stats(sampleCosts(12, 500)).avg;
      const peakAvg     = stats(sampleCosts(19, 500)).avg;

      expect(offPeakAvg).to.be.below(standardAvg,
        `off-peak (${offPeakAvg.toFixed(2)}¢) not cheaper than standard (${standardAvg.toFixed(2)}¢)`);
      expect(standardAvg).to.be.below(peakAvg,
        `standard (${standardAvg.toFixed(2)}¢) not cheaper than peak (${peakAvg.toFixed(2)}¢)`);
    });
  });
});
