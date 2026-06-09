import React from 'react';
import { Page } from '../App';

const NAV: { id: Page; label: string; short: string }[] = [
  { id: 'dashboard', label: 'Dashboard', short: 'Home' },
  { id: 'log',       label: 'Quest Log',  short: 'Log' },
  { id: 'games',     label: 'Games',      short: 'Games' },
  { id: 'quests',    label: 'Quests',     short: 'Quests' },
  { id: 'reports',   label: 'Reports',    short: 'Reports' },
  { id: 'radar',     label: 'Radar',      short: 'Radar' },
];

interface TopBarProps {
  activePage: Page;
  onPageChange: (page: Page) => void;
  onHamburger: () => void;
}

export default function TopBar({
  activePage, onPageChange, onHamburger,
}: TopBarProps) {
  return (
    <>
      <style>{`
        .topbar-root {
          position: sticky; top: 0; z-index: 10;
          background: var(--paper);
          border-bottom: 1px solid var(--line);
          display: flex; align-items: center;
          padding: 0 12px; gap: 6px; min-width: 0;
          height: 52px;
        }
        .topbar-brand {
          display: flex; align-items: center; gap: 7px;
          flex-shrink: 0; min-width: 0;
        }
        .topbar-title {
          font-size: 16px; font-weight: 700;
          margin: 0; white-space: nowrap;
          line-height: 1.1;
        }
        .topbar-nav {
          display: flex; align-items: center;
          gap: 0; flex: 1; justify-content: center;
          min-width: 0;
        }
        .topbar-nav-btn {
          background: none; border: none; cursor: pointer;
          font: inherit; font-size: 14px;
          color: var(--muted);
          padding: 0 12px;
          height: 52px;
          border-bottom: 2px solid transparent;
          white-space: nowrap;
          transition: color 0.12s;
          display: flex; align-items: center;
        }
        .topbar-nav-btn:hover { color: var(--text); }
        .topbar-nav-btn.active {
          color: var(--accent);
          font-weight: 700;
          border-bottom-color: var(--accent);
        }
        .topbar-nav-full { display: inline; }
        .topbar-nav-short { display: none; }
        @media (max-width: 600px) {
          .topbar-title { display: none; }
          .topbar-nav-btn { padding: 0 8px; font-size: 13px; }
          .topbar-nav-full { display: none; }
          .topbar-nav-short { display: inline; }
        }
        @media (max-width: 400px) {
          .topbar-nav-btn { padding: 0 6px; font-size: 12px; }
        }
        @media (min-width: 1100px) {
          .hamburger-btn { display: none !important; }
        }
      `}</style>

      <header className="topbar-root">
        {/* Left: hamburger + brand */}
        <div className="topbar-brand">
          <button
            className="btn icon hamburger-btn"
            onClick={onHamburger}
            aria-label="Open import panel"
            style={{ flexShrink: 0 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" width="26" height="26" style={{ color: 'var(--accent)', flexShrink: 0 }}>
            <path d="M12 20L32 8l20 12v24L32 56 12 44V20Z" stroke="currentColor" strokeWidth="4" />
            <path d="M24 30h16M32 22v16" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <h1 className="topbar-title">Quest Dashboard</h1>
        </div>

        {/* Center: page nav */}
        <nav className="topbar-nav" aria-label="Main navigation">
          {NAV.map(item => (
            <button
              key={item.id}
              className={`topbar-nav-btn${activePage === item.id ? ' active' : ''}`}
              onClick={() => onPageChange(item.id)}
            >
              <span className="topbar-nav-full">{item.label}</span>
              <span className="topbar-nav-short">{item.short}</span>
            </button>
          ))}
        </nav>

        {/* Right: cost icon */}
        <button
          onClick={() => onPageChange('ai-usage')}
          title="AI usage"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: activePage === 'ai-usage' ? 'var(--accent)' : 'var(--muted)',
            padding: '6px', borderRadius: 6, flexShrink: 0,
            display: 'flex', alignItems: 'center',
            transition: 'color 0.12s',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </button>

        {/* Issues icon */}
        <button
          onClick={() => onPageChange('issues')}
          title="Issues"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: activePage === 'issues' ? 'var(--accent)' : 'var(--muted)',
            padding: '6px', borderRadius: 6, flexShrink: 0,
            display: 'flex', alignItems: 'center',
            transition: 'color 0.12s',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </button>

        {/* Settings icon */}
        <button
          onClick={() => onPageChange('settings')}
          aria-label="Settings"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: activePage === 'settings' ? 'var(--accent)' : 'var(--muted)',
            padding: '6px', borderRadius: 6, flexShrink: 0,
            display: 'flex', alignItems: 'center',
            transition: 'color 0.12s',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

      </header>
    </>
  );
}
