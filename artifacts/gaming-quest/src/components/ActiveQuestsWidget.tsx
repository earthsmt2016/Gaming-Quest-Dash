import React, { useState, useEffect } from 'react';
import { Quest, fetchActiveQuests } from '../lib/api';

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  easy:      { bg: '#e8f5e9', text: '#2e7d32' },
  medium:    { bg: '#fff3e0', text: '#e65100' },
  hard:      { bg: '#fce4ec', text: '#c62828' },
  legendary: { bg: '#f3e5f5', text: '#6a1b9a' },
};

const TYPE_ICONS: Record<string, string> = {
  challenge:   '⚔️',
  exploration: '🗺️',
  grind:       '⚙️',
  skill:       '🎯',
};

interface ActiveQuestsWidgetProps {
  onNavigate: () => void;
}

export default function ActiveQuestsWidget({ onNavigate }: ActiveQuestsWidgetProps) {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActiveQuests()
      .then(q => setQuests(q.slice(0, 3)))
      .catch(() => setQuests([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="dash-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div className="dash-section-label" style={{ margin: 0 }}>Active Quests</div>
        <button
          onClick={onNavigate}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--accent)', fontWeight: 600, padding: 0 }}
        >
          See all →
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: '13px', color: 'var(--muted)', padding: '8px 0' }}>Loading…</div>
      ) : quests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>🗺️</div>
          <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '12px' }}>
            No active quests yet. Generate some to get started!
          </div>
          <button
            className="btn"
            onClick={onNavigate}
            style={{ fontSize: '13px', padding: '8px 18px' }}
          >
            Generate Quests
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {quests.map((q, i) => {
            const pct = q.target > 0 ? Math.min(100, Math.round((q.progress / q.target) * 100)) : 0;
            const col = DIFFICULTY_COLORS[q.difficulty] ?? { bg: '#f5f5f5', text: '#555' };
            return (
              <div
                key={q.id}
                onClick={onNavigate}
                style={{
                  cursor: 'pointer',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: 'var(--paper-2)',
                  borderBottom: i < quests.length - 1 ? 'none' : 'none',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px' }}>{TYPE_ICONS[q.type] ?? '📋'}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {q.title}
                  </span>
                  <span style={{
                    background: col.bg, color: col.text,
                    fontSize: '10px', fontWeight: 700,
                    padding: '2px 7px', borderRadius: '20px', textTransform: 'capitalize', flexShrink: 0,
                  }}>{q.difficulty}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {q.game}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'var(--soft-line)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${pct}%`,
                      borderRadius: '3px',
                      background: pct >= 100 ? '#43a047' : 'var(--accent)',
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0, minWidth: '32px', textAlign: 'right' }}>
                    {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
