import React, { useEffect, useRef, useState } from 'react';
import { ActionType } from '../lib/logParser';

const ACTION_TYPES: { value: ActionType; label: string }[] = [
  { value: 'progress', label: 'Progress' },
  { value: 'boss',     label: 'Boss' },
  { value: 'complete', label: 'Complete' },
  { value: 'rank-up',  label: 'Rank Up' },
  { value: 'purchase', label: 'Purchase' },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  rawLogs: string;
  onRawLogsChange: (v: string) => void;
  onImport: () => void;
  onSample: () => void;
  onClear: () => void;
  onQuickAdd: (rawLine: string) => Promise<void>;
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

function nowDateLocal() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function nowTimeLocal() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}

export default function Sidebar({
  open, onClose,
  rawLogs, onRawLogsChange,
  onImport, onSample, onClear, onQuickAdd,
  games, types,
  gameFilter, typeFilter, fromDate, toDate,
  onGameFilter, onTypeFilter, onFromDate, onToDate,
  onThisWeek, onReset,
}: SidebarProps) {

  const sidebarRef = useRef<HTMLElement>(null);
  const [qaOpen, setQaOpen] = useState(false);
  const [qaDate, setQaDate] = useState(nowDateLocal);
  const [qaTime, setQaTime] = useState(nowTimeLocal);
  const [qaGame, setQaGame] = useState('');
  const [qaAction, setQaAction] = useState('');
  const [qaMinutes, setQaMinutes] = useState(30);
  const [qaType, setQaType] = useState<ActionType>('progress');
  const [qaAdding, setQaAdding] = useState(false);
  const [qaError, setQaError] = useState('');

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const handleQuickAdd = async () => {
    if (!qaGame.trim() || !qaAction.trim()) {
      setQaError('Game and action are required.');
      return;
    }
    const ts = `${qaDate} ${qaTime}`;
    const rawLine = `${ts} | ${qaGame.trim()} | ${qaAction.trim()} | ${qaMinutes} | ${qaType}`;
    setQaAdding(true);
    setQaError('');
    try {
      await onQuickAdd(rawLine);
      setQaAction('');
      setQaDate(nowDateLocal());
      setQaTime(nowTimeLocal());
      setQaGame('');
      setQaMinutes(30);
      setQaType('progress');
      setQaError('');
    } catch (e: any) {
      setQaError(e.message ?? 'Failed to save entry.');
    } finally {
      setQaAdding(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    minHeight: '44px',
    border: '1px solid var(--line)',
    background: 'var(--paper)',
    borderRadius: 'var(--radius-sm)',
    padding: '10px 12px',
    fontSize: '15px',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  const labelWrapStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '14px',
  };

  const qaInputStyle: React.CSSProperties = {
    width: '100%',
    border: '1px solid var(--line)',
    background: 'var(--paper)',
    borderRadius: 'var(--radius-sm)',
    padding: '8px 10px',
    fontSize: '14px',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  return (
    <>
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
        {/* Quick Add */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            onClick={() => setQaOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              width: '100%',
            }}
          >
            <div className="eyebrow" style={{ margin: 0 }}>Quick add</div>
            <span style={{ fontSize: '18px', color: 'var(--muted)', lineHeight: 1 }}>{qaOpen ? '−' : '+'}</span>
          </button>

          {qaOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {qaError && (
                <div style={{ fontSize: '13px', color: '#c0392b', background: '#fff0f0', padding: '7px 10px', borderRadius: '6px' }}>
                  {qaError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <label style={{ ...labelWrapStyle, fontSize: '13px' }}>
                  <span>Date</span>
                  <input type="date" value={qaDate} onChange={e => setQaDate(e.target.value)} style={qaInputStyle} />
                </label>
                <label style={{ ...labelWrapStyle, fontSize: '13px' }}>
                  <span>Time</span>
                  <input type="time" value={qaTime} onChange={e => setQaTime(e.target.value)} style={qaInputStyle} />
                </label>
              </div>

              <label style={{ ...labelWrapStyle, fontSize: '13px' }}>
                <span>Game</span>
                <input
                  type="text"
                  placeholder="Game title"
                  value={qaGame}
                  onChange={e => setQaGame(e.target.value)}
                  list="qa-game-list"
                  style={qaInputStyle}
                />
                <datalist id="qa-game-list">
                  {games.map(g => <option key={g} value={g} />)}
                </datalist>
              </label>

              <label style={{ ...labelWrapStyle, fontSize: '13px' }}>
                <span>Action / Notes</span>
                <textarea
                  placeholder="What happened?"
                  value={qaAction}
                  onChange={e => setQaAction(e.target.value)}
                  rows={2}
                  style={{ ...qaInputStyle, resize: 'vertical' }}
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <label style={{ ...labelWrapStyle, fontSize: '13px' }}>
                  <span>Minutes (0 = achievement)</span>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={qaMinutes}
                    onChange={e => setQaMinutes(Number(e.target.value))}
                    style={qaInputStyle}
                  />
                </label>
                <label style={{ ...labelWrapStyle, fontSize: '13px' }}>
                  <span>Type</span>
                  <select value={qaType} onChange={e => setQaType(e.target.value as ActionType)} style={qaInputStyle}>
                    {ACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </label>
              </div>

              <button className="btn primary" onClick={handleQuickAdd} disabled={qaAdding} style={{ width: '100%' }}>
                {qaAdding ? 'Adding…' : '+ Add entry'}
              </button>
            </div>
          )}
        </section>

        <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: 0 }} />

        {/* Raw Logs */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="eyebrow">Raw logs</div>
          <p className="muted" style={{ margin: 0, fontSize: '13px' }}>
            Format: <code>timestamp | game | action | minutes | type</code><br />
            <span style={{ color: 'var(--muted)', fontSize: '12px' }}>Use <code>0</code> minutes for achievements with no playtime.</span>
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

        {/* Filters */}
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
