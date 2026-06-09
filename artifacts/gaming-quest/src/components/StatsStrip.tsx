import React from 'react';

interface StatsStripProps {
  entries: number;
  playtime: number;
  games: number;
  needsWork: number;
  streak: number;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <article style={{
      background: 'var(--paper)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow)',
      padding: '14px',
    }}>
      <div className="eyebrow">{label}</div>
      <div style={{
        fontSize: '28px',
        fontWeight: 900,
        lineHeight: 1,
        marginTop: '6px',
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
      <div className="mini">{sub}</div>
    </article>
  );
}

export default function StatsStrip({ entries, playtime, games, needsWork, streak }: StatsStripProps) {
  const hours = Math.floor(playtime / 60);
  const minutes = playtime % 60;
  const playtimeLabel = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '12px',
    }}
      className="stats-grid"
    >
      <StatCard label="Sessions" value={String(entries)} sub="This week" />
      <StatCard label="Playtime" value={playtimeLabel} sub="This week" />
      <StatCard label="Games active" value={String(games)} sub="This week" />
      <StatCard label="Needs work" value={String(needsWork)} sub="From weekly review" />
      <StatCard
        label="Play streak"
        value={streak > 0 ? `${streak}d` : '—'}
        sub={streak > 1 ? `${streak} days in a row` : streak === 1 ? 'Played today' : 'No streak yet'}
      />
    </div>
  );
}
