import React, { useEffect, useRef } from 'react';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  rawLogs: string;
  onRawLogsChange: (v: string) => void;
  onImport: () => void;
  onSample: () => void;
  onClear: () => void;
  games: string[];
  types: string[];
  gameFilter: string;
  typeFilter: string;
  fromDate: string;
  toDate: string;
  onGameFilter: (v: string) => void;
  onTypeFilter: (v: string) => void;
  onFromDate: (v: string) => void;
  onToDate: (v: string) => void;
  onThisWeek: () => void;
  onReset: () => void;
}

function labelType(t: string): string {
  return t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function Sidebar({
  open, onClose,
  rawLogs, onRawLogsChange,
  onImport, onSample, onClear,
  games, types,
  gameFilter, typeFilter, fromDate, toDate,
  onGameFilter, onTypeFilter, onFromDate, onToDate,
  onThisWeek, onReset,
}: SidebarProps) {

  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    minHeight: '44px',
    border: '1px solid var(--line)',
    background: 'var(--paper)',
    borderRadius: 'var(--radius-sm)',
    padding: '10px 12px',
    fontSize: '15px',
  };

  const labelWrapStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '14px',
  };

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(28,24,20,.38)',
            zIndex: 9,
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        style={{
          width: '320px',
          flexShrink: 0,
          overflowY: 'auto',
          borderRight: '1px solid var(--line)',
          background: 'var(--paper-2)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          position: window.innerWidth < 1100 ? 'fixed' : 'static',
          top: window.innerWidth < 1100 ? 0 : undefined,
          left: window.innerWidth < 1100 ? 0 : undefined,
          height: window.innerWidth < 1100 ? '100dvh' : undefined,
          zIndex: window.innerWidth < 1100 ? 10 : undefined,
          transform: window.innerWidth < 1100 && !open ? 'translateX(-100%)' : 'none',
          transition: 'transform 0.25s ease',
          boxShadow: open && window.innerWidth < 1100 ? '4px 0 24px rgba(0,0,0,0.15)' : 'none',
        }}
      >
        <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="eyebrow">Raw logs</div>
          <p className="muted" style={{ margin: 0, fontSize: '13px' }}>
            Format: <code>timestamp | game | action | minutes | type</code>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={labelWrapStyle}>
              <span>Paste logs here</span>
              <textarea
                value={rawLogs}
                onChange={e => onRawLogsChange(e.target.value)}
                placeholder="2026-05-13 22:26 | Mario Kart Tour | 1st place | 60 | rank-up"
                style={{
                  width: '100%',
                  minHeight: '140px',
                  border: '1px solid var(--line)',
                  background: 'var(--paper)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px',
                  fontSize: '14px',
                  resize: 'vertical',
                }}
              />
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button className="btn primary" onClick={onImport}>Import</button>
              <button className="btn" onClick={onSample}>Sample data</button>
              <button className="btn" onClick={onClear}>Clear all</button>
            </div>
          </div>
        </section>

        <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: 0 }} />

        <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="eyebrow">Filters</div>

          <label style={labelWrapStyle}>
            <span>Game title</span>
            <select value={gameFilter} onChange={e => onGameFilter(e.target.value)} style={inputStyle}>
              <option value="all">All games</option>
              {games.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>

          <label style={labelWrapStyle}>
            <span>Action type</span>
            <select value={typeFilter} onChange={e => onTypeFilter(e.target.value)} style={inputStyle}>
              <option value="all">All types</option>
              {types.map(t => <option key={t} value={t}>{labelType(t)}</option>)}
            </select>
          </label>

          <label style={labelWrapStyle}>
            <span>From date</span>
            <input type="date" value={fromDate} onChange={e => onFromDate(e.target.value)} style={inputStyle} />
          </label>

          <label style={labelWrapStyle}>
            <span>To date</span>
            <input type="date" value={toDate} onChange={e => onToDate(e.target.value)} style={inputStyle} />
          </label>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button className="btn soft" onClick={onThisWeek}>This week</button>
            <button className="btn" onClick={onReset}>Reset</button>
          </div>
        </section>
      </aside>
    </>
  );
}
