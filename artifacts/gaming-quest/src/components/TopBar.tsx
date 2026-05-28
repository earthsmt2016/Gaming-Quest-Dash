import React from 'react';
import { Page } from '../App';

const NAV: { id: Page; label: string; short: string }[] = [
  { id: 'dashboard', label: 'Dashboard', short: 'Home' },
  { id: 'log',       label: 'Quest Log',  short: 'Log' },
  { id: 'games',     label: 'Games',      short: 'Games' },
  { id: 'reports',   label: 'Reports',    short: 'Reports' },
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

      </header>
    </>
  );
}
