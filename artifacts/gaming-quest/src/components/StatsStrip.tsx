import React from 'react';

interface StatsStripProps {
  entries: number;
  playtime: number;
  games: number;
  needsWork: number;
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

export default function StatsStrip({ entries, playtime, games, needsWork }: StatsStripProps) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '12px',
    }}
      className="stats-grid"
    >
      <StatCard label="Entries shown" value={String(entries)} sub="Newest first" />
      <StatCard label="Playtime" value={`${playtime}m`} sub="Filtered total" />
      <StatCard label="Games active" value={String(games)} sub="Distinct titles" />
      <StatCard label="Needs work" value={String(needsWork)} sub="From weekly review" />
    </div>
  );
}
