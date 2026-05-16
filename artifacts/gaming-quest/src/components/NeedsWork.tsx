import React from 'react';
import { NeedsWorkItem, badgeFor } from '../lib/logParser';

interface NeedsWorkProps {
  items: NeedsWorkItem[];
}

export default function NeedsWork({ items }: NeedsWorkProps) {
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
          <h3 style={{ margin: 0, fontSize: '17px' }}>What needs work next</h3>
          <div className="mini">Based on last 28 days of activity</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {items.length === 0 ? (
          <div style={{
            border: '1px solid var(--soft-line)',
            borderRadius: '12px',
            background: '#fffdfa',
            padding: '12px',
          }}>Add more logs to generate suggestions.</div>
        ) : items.map(item => (
          <div key={item.game} style={{
            border: '1px solid var(--soft-line)',
            borderRadius: '12px',
            background: '#fffdfa',
            padding: '12px',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '8px',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}>
              <strong>{item.game}</strong>
              <span className={`badge ${badgeFor(item.status)}`}>{item.status}</span>
            </div>
            <div className="mini" style={{ marginTop: '6px' }}>{item.note}</div>
          </div>
        ))}
      </div>
    </article>
  );
}
