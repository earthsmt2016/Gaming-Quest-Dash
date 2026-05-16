import React from 'react';

interface TopBarProps {
  onHamburger: () => void;
  onWeekReport: () => void;
  onDownloadWeek: () => void;
}

export default function TopBar({ onHamburger, onWeekReport, onDownloadWeek }: TopBarProps) {
  return (
    <>
      <style>{`
        .topbar-title { font-size: 18px; margin: 0; line-height: 1.1; white-space: nowrap; }
        .topbar-weekly-label { display: inline; }
        .topbar-pdf-label { display: inline; }
        .topbar-pdf-icon { display: none; }

        @media (max-width: 480px) {
          .topbar-title { display: none; }
          .topbar-weekly-label { display: none; }
          .topbar-pdf-label { display: none; }
          .topbar-pdf-icon { display: inline; }
        }

        @media (max-width: 600px) and (min-width: 481px) {
          .topbar-title { font-size: 15px; }
        }
      `}</style>
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'var(--paper)',
        borderBottom: '1px solid var(--line)',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        minWidth: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
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
          <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" width="28" height="28" style={{ color: 'var(--accent)', flexShrink: 0 }}>
            <path d="M12 20L32 8l20 12v24L32 56 12 44V20Z" stroke="currentColor" strokeWidth="4" />
            <path d="M24 30h16M32 22v16" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <h1 className="topbar-title">Quest Dashboard</h1>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}>
          <button className="btn soft" onClick={onWeekReport} style={{ padding: '0 14px' }}>
            <span className="topbar-weekly-label">Weekly</span>
            <span className="topbar-pdf-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="9" y1="21" x2="9" y2="9"/>
              </svg>
            </span>
          </button>
          <button className="btn primary" onClick={onDownloadWeek} style={{ padding: '0 14px' }}>
            <span className="topbar-pdf-label">⎙ This week PDF</span>
            <span className="topbar-pdf-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v13M8 11l4 4 4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>
              </svg>
              PDF
            </span>
          </button>
        </div>
      </header>
    </>
  );
}
