import React from 'react';
import { LogEntry, formatDateTime, labelType } from '../lib/logParser';

interface QuestTableProps {
  entries: LogEntry[];
  onEdit: (entry: LogEntry) => void;
}

export default function QuestTable({ entries, onEdit }: QuestTableProps) {
  return (
    <article style={{
      background: 'var(--paper)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow)',
      padding: '16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', marginBottom: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '17px' }}>Quest log</h3>
          <div className="mini">Sorted newest first · swipe to scroll on mobile</div>
        </div>
      </div>
      <div style={{
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch' as any,
        border: '1px solid var(--soft-line)',
        borderRadius: '14px',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
          <thead>
            <tr>
              <th style={thStyle('155px')}>Timestamp</th>
              <th style={thStyle('160px')}>Game</th>
              <th style={thStyle()}>Action</th>
              <th style={thStyle('110px')}>Type</th>
              <th style={thStyle('90px')}>Playtime</th>
              <th style={thStyle('44px')}></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
                  No entries match the current filters.
                </td>
              </tr>
            ) : entries.map((l, i) => (
              <tr key={l.id} style={{ background: i % 2 === 0 ? '#fffdfa' : undefined }}>
                <td style={tdStyle}>{formatDateTime(l.date)}</td>
                <td style={tdStyle}><strong>{l.game}</strong></td>
                <td style={tdStyle}>{l.action}</td>
                <td style={tdStyle}>
                  <span className={`badge ${l.type}`}>{labelType(l.type)}</span>
                </td>
                <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{l.minutes} min</td>
                <td style={{ ...tdStyle, padding: '6px 8px' }}>
                  <button
                    onClick={() => onEdit(l)}
                    title="Edit this entry"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--muted)',
                      padding: '5px',
                      borderRadius: '6px',
                      lineHeight: 0,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--soft-line)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function thStyle(width?: string): React.CSSProperties {
  return {
    background: '#f8f3eb',
    textAlign: 'left',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--muted)',
    borderBottom: '1px solid var(--line)',
    padding: '11px 10px',
    width: width,
    minWidth: width,
    verticalAlign: 'top',
  };
}

const tdStyle: React.CSSProperties = {
  padding: '11px 10px',
  verticalAlign: 'top',
  borderBottom: '1px solid var(--soft-line)',
  fontSize: '13px',
};
