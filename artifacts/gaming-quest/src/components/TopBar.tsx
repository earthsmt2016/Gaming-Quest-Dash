import React from 'react';

interface TopBarProps {
  onHamburger: () => void;
  onWeekReport: () => void;
  onDownloadWeek: () => void;
}

export default function TopBar({ onHamburger, onWeekReport, onDownloadWeek }: TopBarProps) {
  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 10,
      background: 'var(--paper)',
      borderBottom: '1px solid var(--line)',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          className="btn icon"
          onClick={onHamburger}
          aria-label="Open filters"
          style={{ flexShrink: 0 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" width="30" height="30" style={{ color: 'var(--accent)', flexShrink: 0 }}>
          <path d="M12 20L32 8l20 12v24L32 56 12 44V20Z" stroke="currentColor" strokeWidth="4" />
          <path d="M24 30h16M32 22v16" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <h1 style={{ margin: 0, fontSize: '18px', lineHeight: 1.1 }}>Quest Dashboard</h1>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button className="btn soft" onClick={onWeekReport}>Weekly</button>
        <button className="btn primary" onClick={onDownloadWeek}>↓ This week</button>
      </div>
    </header>
  );
}
