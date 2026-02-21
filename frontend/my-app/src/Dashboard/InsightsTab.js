import { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceArea,
} from 'recharts';
import './InsightsTab.css';
import { formatUsdc } from '../hooks/useHbarPrice';

// ── Config ────────────────────────────────────────────────────────────────────
const SLOT_MS = 15 * 60 * 1000; // 15 minutes per slot

const TIERS = {
  'Off-Peak': { color: '#10b981', rate: 0.008 },
  'Standard': { color: '#6366f1', rate: 0.015 },
  'Peak':     { color: '#f59e0b', rate: 0.025 },
};

function classifyHour(h) {
  if (h < 6)  return 'Off-Peak';
  if (h < 17) return 'Standard';
  if (h < 22) return 'Peak';
  return 'Off-Peak'; // 10pm–midnight matches pricingEngine OFF_PEAK
}

function slotLabel(ms) {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h < 12 ? 'am' : 'pm';
  return m === 0 ? `${displayH}${ampm}` : `${displayH}:${String(m).padStart(2, '0')}`;
}

/** Build one entry per 15-min slot, filled with real events where they exist */
function buildSlots(events) {
  // Start from 1 hour before the first event, or 2 hours ago if no events yet.
  // Snapped to 15-min boundary so slot labels line up cleanly.
  const anchorMs = events.length
    ? events[0].timestamp - 60 * 60 * 1000
    : Date.now() - 2 * 60 * 60 * 1000;
  const startMs = Math.floor(anchorMs / SLOT_MS) * SLOT_MS;
  const currentSlot = Math.floor(Date.now() / SLOT_MS) * SLOT_MS;
  const slots = [];

  for (let t = startMs; t <= currentSlot; t += SLOT_MS) {
    const h      = new Date(t).getHours();
    const period = classifyHour(h);
    const color  = TIERS[period].color;

    const slotEvs      = events.filter(e => e.timestamp >= t && e.timestamp < t + SLOT_MS);
    const isReal       = slotEvs.length > 0;
    const kwhUnits     = slotEvs.reduce((s, e) => s + e.usageDelta, 0);
    const costTinybar  = slotEvs.reduce((s, e) => s + Number(e.cost), 0);
    const kwh          = parseFloat((kwhUnits / 1000).toFixed(3));
    const costHbar     = costTinybar / 1e8;
    const pricePerKwh  = isReal && kwh > 0 ? costHbar / kwh : null;

    slots.push({
      slotMs: t,
      label: slotLabel(t),
      kwh:         isReal ? kwh : 0,
      pricePerKwh,           // null = no dot on price line
      cost:        costHbar,
      period, color, isReal,
    });
  }
  return slots;
}

// ── Price chart helpers ────────────────────────────────────────────────────────

const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => {
  if (h === 0)  return '12am';
  if (h === 12) return '12pm';
  if (h < 12)   return `${h}am`;
  return `${h - 12}pm`;
});

// Base rates from PricingEngine (no congestion) in HBAR/kWh
const TIER_BASE_HBAR = {
  'Off-Peak': 20000 * 1000 / 1e8,  // 0.20
  'Standard': 50000 * 1000 / 1e8,  // 0.50
  'Peak':     85000 * 1000 / 1e8,  // 0.85
};

function buildPriceChart(events) {
  const now         = new Date();
  const currentHour = now.getHours();
  const midnight    = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const midnightMs  = midnight.getTime();

  return Array.from({ length: 24 }, (_, h) => {
    const hourStartMs = midnightMs + h * 3_600_000;
    const hourEndMs   = hourStartMs + 3_600_000;
    const period      = classifyHour(h);
    const isFuture    = h > currentHour;

    const hourEvents = events.filter(
      e => e.timestamp >= hourStartMs && e.timestamp < hourEndMs
    );

    // Average effective rate across all reports in this hour (HBAR/kWh)
    const actualRate = hourEvents.length > 0
      ? hourEvents.reduce((s, e) => s + Number(e.effectiveRate) * 1000 / 1e8, 0) / hourEvents.length
      : null;

    return {
      hour: h,
      label: HOUR_LABELS[h],
      actualRate,
      baseRate: TIER_BASE_HBAR[period],
      period,
      isFuture,
      hasData: hourEvents.length > 0,
    };
  });
}

function PriceTooltip({ active, payload, hbarPriceUsd }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  const fmt = (hbar) => {
    if (hbar == null) return '—';
    if (hbarPriceUsd != null)
      return (hbar * hbarPriceUsd * 100).toFixed(2) + '¢/kWh';
    return hbar.toFixed(3) + ' HBAR/kWh';
  };

  const congestionPct = d.hasData && d.baseRate
    ? Math.round((d.actualRate / d.baseRate - 1) * 100)
    : null;

  return (
    <div className="it-tooltip">
      <p className="it-tooltip-time">{d.label}</p>
      <p className="it-tooltip-period" style={{ color: TIERS[d.period]?.color }}>
        {d.period}{d.isFuture ? ' · upcoming' : ''}
      </p>
      <p className="it-tooltip-row">
        <span className="it-tooltip-key">Base rate</span>
        <span className="it-tooltip-val">{fmt(d.baseRate)}</span>
      </p>
      {d.hasData && (
        <>
          <p className="it-tooltip-row">
            <span className="it-tooltip-key">Actual rate</span>
            <span className="it-tooltip-val">{fmt(d.actualRate)}</span>
          </p>
          {congestionPct !== null && congestionPct > 0 && (
            <p className="it-tooltip-row">
              <span className="it-tooltip-key">Congestion</span>
              <span className="it-tooltip-val">+{congestionPct}%</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, hbarPriceUsd }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const costUsdc = hbarPriceUsd != null ? d.cost * hbarPriceUsd : null;
  return (
    <div className="it-tooltip">
      <p className="it-tooltip-time">{d.label}</p>
      <p className="it-tooltip-period" style={{ color: TIERS[d.period]?.color }}>
        {d.period} &nbsp;·&nbsp; {d.isReal ? '✓ on-chain' : 'awaiting report'}
      </p>
      {d.isReal && (
        <>
          <p className="it-tooltip-row">
            <span className="it-tooltip-key">Usage</span>
            <span className="it-tooltip-val">{d.kwh.toFixed(3)} kWh</span>
          </p>
          <p className="it-tooltip-row">
            <span className="it-tooltip-key">Rate</span>
            <span className="it-tooltip-val">{(d.pricePerKwh ?? 0).toFixed(5)} HBAR/kWh</span>
          </p>
          <p className="it-tooltip-row">
            <span className="it-tooltip-key">Cost</span>
            <span className="it-tooltip-val">
              {costUsdc != null ? formatUsdc(costUsdc) + ' USDC' : d.cost.toFixed(6) + ' HBAR'}
            </span>
          </p>
        </>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function InsightsTab({ events = [], loading = false, hbarPriceUsd = null }) {

  const slots      = useMemo(() => buildSlots(events),      [events]);
  const priceSlots = useMemo(() => buildPriceChart(events), [events]);

  // Stats from real events only
  const totalKwh      = events.reduce((s, e) => s + e.usageDelta / 1000, 0).toFixed(3);
  const totalCostHbar = events.reduce((s, e) => s + Number(e.cost), 0) / 1e8;
  const totalCostUsdc = hbarPriceUsd != null ? totalCostHbar * hbarPriceUsd : null;
  const realSlots  = slots.filter(s => s.isReal);
  const avgRate    = realSlots.length
    ? (realSlots.reduce((s, d) => s + (d.pricePerKwh ?? 0), 0) / realSlots.length).toFixed(5)
    : '—';

  // Countdown to next report (15 min from last event)
  const lastTs   = events.length ? events[events.length - 1].timestamp : null;
  const nextMs   = lastTs ? lastTs + SLOT_MS : null;
  const minsLeft = nextMs ? Math.max(0, Math.ceil((nextMs - Date.now()) / 60000)) : null;

  return (
    <div className="it-root">

      {/* ── Header ── */}
      <div className="it-header-row">
        <p className="it-date">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          &nbsp;·&nbsp; 15-min oracle reports
        </p>
        {loading ? (
          <span className="it-sync-badge it-sync-badge--loading">Syncing…</span>
        ) : events.length > 0 ? (
          <span className="it-sync-badge it-sync-badge--live">
            <span className="it-sync-dot" />
            {events.length} report{events.length !== 1 ? 's' : ''} on-chain
          </span>
        ) : (
          <span className="it-sync-badge it-sync-badge--est">Waiting for oracle</span>
        )}
      </div>

      {/* ── Stat cards ── */}
      <div className="it-stats">
        <div className="it-stat-card">
          <span className="it-stat-label">Reports</span>
          <span className="it-stat-value">{events.length}</span>
          <span className="it-stat-sub">on-chain</span>
        </div>
        <div className="it-stat-card">
          <span className="it-stat-label">Total Usage</span>
          <span className="it-stat-value">{totalKwh} kWh</span>
          <span className="it-stat-sub">since 2 pm</span>
        </div>
        <div className="it-stat-card">
          <span className="it-stat-label">Total Cost</span>
          <span className="it-stat-value">
            {totalCostUsdc != null ? formatUsdc(totalCostUsdc) + ' USDC' : totalCostHbar.toFixed(6) + ' HBAR'}
          </span>
          <span className="it-stat-sub">stream charged</span>
        </div>
        <div className="it-stat-card">
          <span className="it-stat-label">Next Report</span>
          <span className="it-stat-value" style={{ color: '#6366f1' }}>
            {minsLeft !== null ? `~${minsLeft} min` : '—'}
          </span>
          <span className="it-stat-sub">avg {avgRate} HBAR/kWh</span>
        </div>
      </div>

      {/* ── Chart ── */}
      <div className="it-chart-card">
        <div className="it-chart-header">
          <span className="it-chart-title">kWh per 15-min slot</span>
          <div className="it-legend">
            {Object.entries(TIERS).map(([name, { color }]) => (
              <span key={name} className="it-legend-item">
                <span className="it-legend-dot" style={{ background: color }} />
                {name}
              </span>
            ))}
          </div>
        </div>

        {events.length === 0 && !loading ? (
          <div className="it-empty-state">
            <p className="it-empty-title">No oracle reports yet</p>
            <p className="it-empty-sub">
              Run <code>npm run start:oracle</code> — bars appear here every 15 minutes as reports land on-chain.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={slots} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="kwh"
                orientation="left"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => v.toFixed(2)}
                width={38}
              />
              <YAxis
                yAxisId="price"
                orientation="right"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => v === 0 ? '' : v.toFixed(4)}
                width={52}
              />
              <Tooltip content={(props) => <CustomTooltip {...props} hbarPriceUsd={hbarPriceUsd} />} />

              <Bar yAxisId="kwh" dataKey="kwh" name="Usage" radius={[4, 4, 0, 0]} maxBarSize={32}>
                {slots.map((s, i) => (
                  <Cell key={i} fill={s.color} fillOpacity={s.isReal ? 0.9 : 0.12} />
                ))}
              </Bar>

              <Line
                yAxisId="price"
                type="monotone"
                dataKey="pricePerKwh"
                name="Rate"
                stroke="#0A2540"
                strokeWidth={2}
                connectNulls={false}
                dot={(props) => {
                  if (props.payload?.pricePerKwh == null) return null;
                  return <circle key={props.key} cx={props.cx} cy={props.cy} r={4} fill="#0A2540" />;
                }}
                activeDot={{ r: 6, fill: '#0A2540' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Pricing chart ── */}
      <div className="it-chart-card">
        <div className="it-chart-header">
          <span className="it-chart-title">
            Electricity rate · today&nbsp;
            <span className="it-chart-unit">
              ({hbarPriceUsd != null ? '¢ / kWh' : 'HBAR / kWh'})
            </span>
          </span>
          <div className="it-legend">
            {Object.entries(TIERS).map(([name, { color }]) => (
              <span key={name} className="it-legend-item">
                <span className="it-legend-dot" style={{ background: color }} />
                {name}
              </span>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={priceSlots} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />

            {/* Time-period background bands */}
            <ReferenceArea x1={0}  x2={5}  fill={TIERS['Off-Peak'].color} fillOpacity={0.07} label={false} />
            <ReferenceArea x1={6}  x2={16} fill={TIERS['Standard'].color} fillOpacity={0.07} label={false} />
            <ReferenceArea x1={17} x2={21} fill={TIERS['Peak'].color}     fillOpacity={0.07} label={false} />
            <ReferenceArea x1={22} x2={23} fill={TIERS['Standard'].color} fillOpacity={0.07} label={false} />

            <XAxis
              dataKey="hour"
              tickFormatter={h => HOUR_LABELS[h]}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              interval={2}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v =>
                hbarPriceUsd != null
                  ? (v * hbarPriceUsd * 100).toFixed(1) + '¢'
                  : v.toFixed(2)
              }
              width={44}
            />
            <Tooltip content={props => <PriceTooltip {...props} hbarPriceUsd={hbarPriceUsd} />} />

            {/* Expected base rate (dashed reference) */}
            <Line
              type="stepAfter"
              dataKey="baseRate"
              stroke="#cbd5e1"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              activeDot={false}
              name="Base rate"
            />

            {/* Actual on-chain rate */}
            <Line
              type="monotone"
              dataKey="actualRate"
              stroke="#0A2540"
              strokeWidth={2.5}
              connectNulls={false}
              dot={props => {
                if (props.payload?.actualRate == null) return null;
                return (
                  <circle
                    key={props.key}
                    cx={props.cx} cy={props.cy} r={5}
                    fill={TIERS[props.payload.period]?.color ?? '#0A2540'}
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                );
              }}
              activeDot={{ r: 7 }}
              name="Actual rate"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── Recent reports list ── */}
      {events.length > 0 && (
        <div className="it-reports-card">
          <p className="it-reports-title">Recent reports</p>
          {[...events].reverse().slice(0, 8).map((ev, i) => {
            const h        = new Date(ev.timestamp).getHours();
            const per      = classifyHour(h);
            const kwh      = (ev.usageDelta / 1000).toFixed(3);
            const costHbar = Number(ev.cost) / 1e8;
            const costUsdc = hbarPriceUsd != null ? costHbar * hbarPriceUsd : null;
            const cost     = costUsdc != null ? formatUsdc(costUsdc) + ' USDC' : costHbar.toFixed(6) + ' HBAR';
            return (
              <div key={i} className="it-report-row">
                <span className="it-report-dot" style={{ background: TIERS[per].color }} />
                <span className="it-report-time">
                  {new Date(ev.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="it-report-period" style={{ color: TIERS[per].color }}>{per}</span>
                <span className="it-report-kwh">{kwh} kWh</span>
                <span className="it-report-cost">{cost}</span>
                {ev.txHash && (
                  <a
                    className="it-report-hash"
                    href={`https://hashscan.io/testnet/transaction/${ev.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {ev.txHash.slice(0, 8)}…
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

export default InsightsTab;
