/* global BigInt */
import { useScheduleEvents } from '../hooks/useScheduleEvents';
import './ScheduleTab.css';

const HASHSCAN = 'https://hashscan.io/testnet/transaction/';

function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function shortHash(hash) {
  if (!hash) return '—';
  return hash.slice(0, 10) + '…' + hash.slice(-8);
}

function hbarFromTinybar(tinybar) {
  try {
    return (Number(BigInt(tinybar.toString())) / 1e8).toFixed(4);
  } catch { return '—'; }
}

function EventBadge({ type }) {
  const map = {
    created:   { label: 'Stream Created', cls: 'sb-badge--blue' },
    scheduled: { label: 'Scheduled',       cls: 'sb-badge--yellow' },
    executed:  { label: 'Executed',         cls: 'sb-badge--green' },
    failed:    { label: 'Failed',           cls: 'sb-badge--red' },
    deposit:   { label: 'Deposit Added',   cls: 'sb-badge--purple' },
    paused:    { label: 'Paused',           cls: 'sb-badge--orange' },
    resumed:   { label: 'Resumed',          cls: 'sb-badge--teal' },
  };
  const { label, cls } = map[type] ?? { label: type, cls: '' };
  return <span className={`sb-badge ${cls}`}>{label}</span>;
}

function EventIcon({ type }) {
  if (type === 'created')   return <span className="sb-icon sb-icon--blue">⚡</span>;
  if (type === 'scheduled') return <span className="sb-icon sb-icon--yellow">⏳</span>;
  if (type === 'executed')  return <span className="sb-icon sb-icon--green">✓</span>;
  if (type === 'failed')    return <span className="sb-icon sb-icon--red">✗</span>;
  if (type === 'deposit')   return <span className="sb-icon sb-icon--purple">↑</span>;
  if (type === 'paused')    return <span className="sb-icon sb-icon--orange">⏸</span>;
  if (type === 'resumed')   return <span className="sb-icon sb-icon--teal">▶</span>;
  return null;
}

function EventDetail({ ev }) {
  if (ev.type === 'executed') {
    return (
      <div className="sb-detail">
        <span>{hbarFromTinybar(ev.amountPaid)} HBAR paid</span>
        <span className="sb-dot">·</span>
        <span>Settlement #{ev.count}</span>
        <span className="sb-dot">·</span>
        <span>{hbarFromTinybar(ev.remainingDeposit)} HBAR remaining</span>
      </div>
    );
  }
  if (ev.type === 'scheduled') {
    return (
      <div className="sb-detail">
        <span>Next execution: {formatTime(ev.scheduledTime)}</span>
        <span className="sb-dot">·</span>
        <span className="sb-addr" title={ev.scheduleAddress}>
          Schedule {ev.scheduleAddress?.slice(0, 8)}…
        </span>
      </div>
    );
  }
  if (ev.type === 'failed') {
    return (
      <div className="sb-detail sb-detail--error">
        <span>{ev.reason}</span>
        <span className="sb-dot">·</span>
        <span>Needed {hbarFromTinybar(ev.needed)} HBAR, had {hbarFromTinybar(ev.available)} HBAR</span>
      </div>
    );
  }
  if (ev.type === 'deposit') {
    return (
      <div className="sb-detail">
        <span>+{hbarFromTinybar(ev.amount)} HBAR deposited</span>
      </div>
    );
  }
  if (ev.type === 'created') {
    return (
      <div className="sb-detail">
        <span>Interval: {ev.intervalSecs}s</span>
        <span className="sb-dot">·</span>
        <span>Base rate: {ev.baseRate?.toLocaleString()} tinybar/unit</span>
      </div>
    );
  }
  if (ev.type === 'paused') {
    return <div className="sb-detail sb-detail--error">{ev.reason}</div>;
  }
  return null;
}

export default function ScheduleTab() {
  const { events, loading, error } = useScheduleEvents();

  // Summary counts
  const executed  = events.filter(e => e.type === 'executed').length;
  const scheduled = events.filter(e => e.type === 'scheduled').length;
  const failed    = events.filter(e => e.type === 'failed').length;

  return (
    <div className="sb-root">

      {/* Summary cards */}
      <div className="sb-stats">
        <div className="sb-stat">
          <span className="sb-stat-value sb-stat-value--green">{executed}</span>
          <span className="sb-stat-label">Settlements Executed</span>
        </div>
        <div className="sb-stat">
          <span className="sb-stat-value sb-stat-value--yellow">{scheduled}</span>
          <span className="sb-stat-label">Schedules Created</span>
        </div>
        <div className="sb-stat">
          <span className="sb-stat-value sb-stat-value--red">{failed || '0'}</span>
          <span className="sb-stat-label">Failed Settlements</span>
        </div>
      </div>

      {/* Info strip */}
      <div className="sb-info">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{flexShrink:0,marginTop:1}}>
          <circle cx="7" cy="7" r="6" stroke="#6366f1" strokeWidth="1.3" fill="none"/>
          <path d="M7 6v4M7 4.5v.5" stroke="#6366f1" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <span>
          Settlements are executed automatically by the <strong>Hedera Schedule Service</strong> —
          no off-chain server required. Each execution reschedules the next one.
        </span>
      </div>

      {/* Event timeline */}
      <div className="sb-card">
        <div className="sb-card-header">
          <span className="sb-card-title">Schedule Lifecycle</span>
          {loading && <span className="sb-loading">Fetching…</span>}
        </div>

        {error && (
          <div className="sb-error">Could not load events: {error}</div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="sb-empty">No schedule events found in the last 10 days.</div>
        )}

        {events.length > 0 && (
          <div className="sb-timeline">
            {events.map((ev, i) => (
              <div key={i} className={`sb-event sb-event--${ev.type}`}>
                <div className="sb-event-left">
                  <EventIcon type={ev.type} />
                  <div className="sb-event-line" />
                </div>
                <div className="sb-event-body">
                  <div className="sb-event-top">
                    <EventBadge type={ev.type} />
                    <span className="sb-event-time">{formatTime(ev.timestamp)}</span>
                  </div>
                  <EventDetail ev={ev} />
                  {ev.txHash && (
                    <a
                      href={HASHSCAN + ev.txHash}
                      target="_blank"
                      rel="noreferrer"
                      className="sb-tx-link"
                    >
                      {shortHash(ev.txHash)} ↗ Hashscan
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
