import React from 'react';

interface HeroProps {
  rangeLabel: string;
}

export default function Hero({ rangeLabel }: HeroProps) {
  return (
    <section style={{
      background: 'var(--paper)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow)',
      padding: '16px',
      backgroundImage: 'linear-gradient(135deg,#fffaf2 0%,#f4ece2 100%)',
    }}>
      <div className="eyebrow">Quest tracking</div>
      <h2 style={{ margin: '4px 0 6px', fontSize: 'clamp(20px, 5vw, 28px)', lineHeight: 1.1 }}>Gaming Quest Log</h2>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: '14px' }}>{rangeLabel}</p>
    </section>
  );
}
