import React, { forwardRef } from 'react';
import { LogEntry, Summary, formatDate, formatDateTime, labelType, monStart, sunEnd } from '../lib/logParser';

interface WeeklyReportProps {
  weekLogs: LogEntry[];
  summary: Summary;
  onDownload: () => void;
}

const WeeklyReport = forwardRef<HTMLElement, WeeklyReportProps>(function WeeklyReport(
  { weekLogs, summary, onDownload },
  ref,
) {
  const start = monStart(new Date());
  const end = sunEnd(new Date());
  const asc = [...weekLogs].sort((a, b) => a.date.getTime() - b.date.getTime());

  const tdStyle: React.CSSProperties = {
    padding: '11px 10px',
    verticalAlign: 'top',
    borderBottom: '1px solid var(--soft-line)',
    fontSize: '13px',
  };

  return (
    <article
      ref={ref}
      style={{
        background: 'var(--paper)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)',
        padding: '16px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', marginBottom: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '17px' }}>Weekly report preview</h3>
          <div className="mini">{formatDate(start)} – {formatDate(end)}</div>
        </div>
      </div>

      <div className="eyebrow" style={{ marginBottom: '8px' }}>ALL GAMING LOGS REPORT</div>
      <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '17px' }}>
        Week of {formatDate(start)} – {formatDate(end)}
      </p>
      <p className="muted" style={{ margin: '0 0 12px', fontSize: '13px' }}>
        Total Logged Playtime: {summary.total} minutes · Games: {summary.games} · Entries: {asc.length}
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '8px',
        margin: '12px 0',
      }}
        className="report-meta-grid"
      >
        {[
          ['Total Playtime', `${summary.total} min`],
          ['Games Logged', String(summary.games)],
          ['Entries', String(asc.length)],
          ['Needs Work', String(summary.total > 0 ? '—' : '0')],
        ].map(([k, v]) => (
          <div key={k} style={{
            border: '1px solid var(--line)',
            padding: '10px',
            background: '#fffdfa',
            borderRadius: 'var(--radius-sm)',
          }}>
            <div className="mini">{k}</div>
            <strong style={{ display: 'block', marginTop: '3px', fontSize: '15px' }}>{v}</strong>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
        {(summary.bullets.length ? summary.bullets : ['No entries this week yet.']).map((t, i) => (
          <div key={i} style={{
            border: '1px solid var(--soft-line)',
            borderRadius: '12px',
            background: '#fffdfa',
            padding: '12px',
            fontSize: '13px',
          }}>{t}</div>
        ))}
      </div>

      <div style={{
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch' as any,
        border: '1px solid var(--soft-line)',
        borderRadius: '14px',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '740px' }}>
          <thead>
            <tr>
              {['Timestamp', 'Game', 'Action', 'Type', 'Playtime'].map(h => (
                <th key={h} style={{
                  background: '#f8f3eb',
                  textAlign: 'left',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--muted)',
                  borderBottom: '1px solid var(--line)',
                  padding: '11px 10px',
                  verticalAlign: 'top',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {asc.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>
                  No entries for this week.
                </td>
              </tr>
            ) : asc.map((l, i) => (
              <tr key={l.id} style={{ background: i % 2 === 0 ? '#fffdfa' : undefined }}>
                <td style={tdStyle}>{formatDateTime(l.date)}</td>
                <td style={tdStyle}>{l.game}</td>
                <td style={tdStyle}>{l.action}</td>
                <td style={tdStyle}><span className={`badge ${l.type}`}>{labelType(l.type)}</span></td>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{l.minutes} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '14px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <button className="btn primary" onClick={onDownload}>↓ Download this week</button>
      </div>
    </article>
  );
});

export default WeeklyReport;
