import './MerchantHomeTab.css';
import { useReceivables } from './hooks/useReceivables';
import { useHbarPrice, tinybarToUsd } from './hooks/useHbarPrice';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

/* ── helpers ── */
function startOfDay(ts) {
  const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime();
}
function fmtUsdc(usd) {
  if (usd == null) return '—';
  if (usd < 0.0001) return '<$0.001';
  return '$' + usd.toFixed(3);
}
function fmtHour(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
}

/* Build hourly buckets for the last 5 hours */
function buildChartData(charges, hbarPrice) {
  const now = Date.now();
  const windowStart = now - 5 * 60 * 60 * 1000;
  const buckets = {};
  for (const c of charges) {
    if (c.timestamp < windowStart) continue;
    const hour = new Date(c.timestamp).getHours();
    buckets[hour] = (buckets[hour] || 0) + (tinybarToUsd(Number(c.cost), hbarPrice) ?? 0);
  }
  const points = [];
  let cumulative = 0;
  for (let i = 4; i >= 0; i--) {
    const ts = new Date(now - i * 60 * 60 * 1000);
    const hour = ts.getHours();
    cumulative += buckets[hour] || 0;
    points.push({
      label: fmtHour(ts),
      volume: parseFloat(cumulative.toFixed(4)),
      hourly: parseFloat((buckets[hour] || 0).toFixed(4)),
    });
  }
  return points;
}

function StatChip({ label, value, sub, dim }) {
  return (
    <div className="mh-chip">
      <span className="mh-chip-label">{label}</span>
      <span className={`mh-chip-value${dim ? ' mh-chip-value--dim' : ''}`}>{value}</span>
      {sub && <span className="mh-chip-sub">{sub}</span>}
    </div>
  );
}

function OverviewCard({ label, value, sub }) {
  return (
    <div className="mh-ov-card">
      <div className="mh-ov-label">{label}</div>
      <div className="mh-ov-value">{value}</div>
      {sub && <div className="mh-ov-sub">{sub}</div>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="mh-tooltip">
      <div className="mh-tooltip-label">{label}</div>
      <div className="mh-tooltip-value">${payload[0].value.toFixed(4)}</div>
      <div className="mh-tooltip-sub">cumulative</div>
    </div>
  );
};

export default function MerchantHomeTab() {
  const { charges, settlements, loading } = useReceivables();
  const hbarPrice = useHbarPrice();

  const todayStart     = startOfDay(Date.now());
  const yesterdayStart = todayStart - 86_400_000;

  const todayCharges     = charges.filter(c => c.timestamp >= todayStart);
  const yesterdayCharges = charges.filter(c => c.timestamp >= yesterdayStart && c.timestamp < todayStart);
  const todaySettlements = settlements.filter(s => s.timestamp >= todayStart);

  const todayGross     = todayCharges.reduce((s, c) => s + Number(c.cost), 0);
  const yesterdayGross = yesterdayCharges.reduce((s, c) => s + Number(c.cost), 0);
  const todaySettled   = todaySettlements.reduce((s, e) => s + Number(e.amountPaid), 0);
  const todayKwh       = todayCharges.reduce((s, c) => s + c.usageDelta, 0);

  const todayGrossUsd     = tinybarToUsd(todayGross, hbarPrice);
  const yesterdayGrossUsd = tinybarToUsd(yesterdayGross, hbarPrice);
  const todaySettledUsd   = tinybarToUsd(todaySettled, hbarPrice);

  // All-time stats
  const allGross   = charges.reduce((s, c) => s + Number(c.cost), 0);
  const allSettled = settlements.reduce((s, e) => s + Number(e.amountPaid), 0);
  const allKwh     = charges.reduce((s, c) => s + c.usageDelta, 0);

  const chartData = buildChartData(charges, hbarPrice);

  return (
    <div className="mh-wrap">

      {/* ── Today ── */}
      <section className="mh-section">
        <h2 className="mh-section-title">Today</h2>

        <div className="mh-today-stats">
          <StatChip
            label="Gross volume"
            value={loading ? '…' : fmtUsdc(todayGrossUsd)}
            sub={new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          />
          <StatChip
            label="Yesterday"
            value={loading ? '…' : fmtUsdc(yesterdayGrossUsd)}
            dim
          />
          <StatChip
            label="Settled today"
            value={loading ? '…' : fmtUsdc(todaySettledUsd)}
            sub={`${todaySettlements.length} settlement${todaySettlements.length !== 1 ? 's' : ''}`}
          />
          <StatChip
            label="Usage today"
            value={loading ? '…' : (todayKwh / 1000).toFixed(2) + ' kWh'}
            sub={`${todayCharges.length} report${todayCharges.length !== 1 ? 's' : ''}`}
          />
        </div>

        {/* Chart */}
        <div className="mh-chart-card">
          {loading || chartData.length === 0 ? (
            <div className="mh-chart-empty">
              {loading ? 'Loading chart…' : 'No data in the last 5 hours.'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false}/>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => `$${v.toFixed(2)}`}
                  width={52}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="volume"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#volGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#6366f1', strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* ── Overview ── */}
      <section className="mh-section">
        <h2 className="mh-section-title">Your overview</h2>

        <div className="mh-ov-grid">
          <OverviewCard
            label="Total payments received"
            value={fmtUsdc(tinybarToUsd(allSettled, hbarPrice))}
            sub={`${settlements.length} settlement${settlements.length !== 1 ? 's' : ''}`}
          />
          <OverviewCard
            label="Gross volume (all time)"
            value={fmtUsdc(tinybarToUsd(allGross, hbarPrice))}
            sub={`${charges.length} reports`}
          />
          <OverviewCard
            label="Total energy billed"
            value={(allKwh / 1000).toFixed(2) + ' kWh'}
            sub="across all streams"
          />
          <OverviewCard
            label="Active customers"
            value="1"
            sub="Emily Jiji · Stream 3"
          />
        </div>
      </section>

    </div>
  );
}
