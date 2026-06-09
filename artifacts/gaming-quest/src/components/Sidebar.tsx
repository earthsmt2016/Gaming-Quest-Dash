import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ActionType } from '../lib/logParser';
import { analyzeScreenshot, ScreenshotAnalysis } from '../lib/api';
import { trackAction } from '../lib/tracker';

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
function nowDateTimeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res((reader.result as string).split(',')[1]);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

// ─── Screenshot Drop Zone ─────────────────────────────────────────────────────

function ScreenshotDropZone({
  games,
  onFill,
}: {
  games: string[];
  onFill: (result: ScreenshotAnalysis) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const analyze = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please drop an image file.'); return; }
    setError('');
    setAnalyzing(true);
    setPreview(URL.createObjectURL(file));
    try {
      const b64 = await fileToBase64(file);
      const result = await analyzeScreenshot(b64, file.type, games);
      setConfidence(result.confidence);
      onFill(result);
    } catch (e) {
      setError('Could not read screenshot — try again.');
      setPreview(null);
    } finally {
      setAnalyzing(false);
    }
  }, [games, onFill]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) analyze(file);
  };

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find(i => i.type.startsWith('image/'));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) analyze(file);
    }
  }, [analyze]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  return (
    <>
      <style>{`
        .sdz-zone {
          border: 2px dashed var(--line);
          border-radius: 8px;
          padding: 12px;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          position: relative;
          min-height: 70px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
        .sdz-zone:hover, .sdz-zone.drag { border-color: var(--accent); background: rgba(26,107,74,0.05); }
        .sdz-zone.analyzing { opacity: 0.7; pointer-events: none; }
        .sdz-preview { width: 100%; max-height: 80px; object-fit: cover; border-radius: 5px; margin-bottom: 4px; }
        .sdz-badge {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px;
          text-transform: uppercase; letter-spacing: 0.05em;
        }
        .sdz-badge.high { background: #e6f4ef; color: #1a6b4a; }
        .sdz-badge.med  { background: #fef8e6; color: #7a5c00; }
        .sdz-badge.low  { background: #f5f5f5; color: #555; }
      `}</style>

      <div
        className={`sdz-zone${dragging ? ' drag' : ''}${analyzing ? ' analyzing' : ''}`}
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onClick={() => !analyzing && fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) analyze(f); e.target.value = ''; }} />

        {preview ? (
          <>
            <img src={preview} className="sdz-preview" alt="Screenshot preview" />
            {analyzing && (
              <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>
                Analysing with AI…
              </div>
            )}
            {!analyzing && confidence !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted)' }}>
                <span className={`sdz-badge ${confidence >= 0.75 ? 'high' : confidence >= 0.5 ? 'med' : 'low'}`}>
                  {confidence >= 0.75 ? '✓ High' : confidence >= 0.5 ? '~ Medium' : '? Low'} confidence
                </span>
                <button onClick={e => { e.stopPropagation(); setPreview(null); setConfidence(null); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--muted)', padding: '0 2px' }}>
                  Clear
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: '22px', lineHeight: 1 }}>📸</div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
              {analyzing ? 'Analysing…' : 'Drop or paste screenshot'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
              AI will auto-fill the fields below
            </div>
          </>
        )}
      </div>

      {error && (
        <div style={{ fontSize: '12px', color: '#c0392b', background: '#fff0f0', padding: '6px 10px', borderRadius: '6px' }}>
          {error}
        </div>
      )}
    </>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

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
  const [qaDateTime, setQaDateTime] = useState(nowDateTimeLocal);
  const [qaAdjustTime, setQaAdjustTime] = useState(false);
  const [qaGame, setQaGame] = useState('');
  const [qaAction, setQaAction] = useState('');
  const [qaMinutes, setQaMinutes] = useState(30);
  const [qaType, setQaType] = useState<ActionType>('progress');
  const [qaAdding, setQaAdding] = useState(false);
  const [qaError, setQaError] = useState('');

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const handleAiFill = useCallback((result: ScreenshotAnalysis) => {
    if (result.game) setQaGame(result.game);
    if (result.action) setQaAction(result.action);
    if (result.type && ACTION_TYPES.some(t => t.value === result.type)) setQaType(result.type as ActionType);
    if (result.minutes > 0) setQaMinutes(result.minutes);
    setQaDateTime(nowDateTimeLocal());
  }, []);

  const handleQuickAdd = async () => {
    if (!qaGame.trim() || !qaAction.trim()) { setQaError('Game and action are required.'); return; }
    const ts = (qaAdjustTime ? qaDateTime : nowDateTimeLocal()).replace('T', ' ');
    const rawLine = `${ts} | ${qaGame.trim()} | ${qaAction.trim()} | ${qaMinutes} | ${qaType}`;
    setQaAdding(true); setQaError('');
    try {
      await onQuickAdd(rawLine);
      setQaAction(''); setQaDateTime(nowDateTimeLocal());
      setQaGame(''); setQaMinutes(30); setQaType('progress'); setQaError(''); setQaAdjustTime(false);
    } catch (e: any) {
      setQaError(e.message ?? 'Failed to save entry.');
    } finally {
      setQaAdding(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', minHeight: '44px', border: '1px solid var(--line)',
    background: 'var(--paper)', borderRadius: 'var(--radius-sm)',
    padding: '10px 12px', fontSize: '15px', boxSizing: 'border-box', fontFamily: 'inherit',
  };
  const labelWrapStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px' };
  const qaInputStyle: React.CSSProperties = {
    width: '100%', border: '1px solid var(--line)', background: 'var(--paper)',
    borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: '14px',
    boxSizing: 'border-box', fontFamily: 'inherit',
  };

  return (
    <>
      {open && (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(28,24,20,.38)', zIndex: 9 }} />
      )}

      <aside ref={sidebarRef} style={{
        width: '320px', flexShrink: 0, overflowY: 'auto',
        borderRight: '1px solid var(--line)', background: 'var(--paper-2)',
        padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px',
        position: window.innerWidth < 1100 ? 'fixed' : 'static',
        top: window.innerWidth < 1100 ? 0 : undefined,
        left: window.innerWidth < 1100 ? 0 : undefined,
        height: window.innerWidth < 1100 ? '100dvh' : undefined,
        zIndex: window.innerWidth < 1100 ? 10 : undefined,
        transform: window.innerWidth < 1100 && !open ? 'translateX(-100%)' : 'none',
        transition: 'transform 0.25s ease',
        boxShadow: open && window.innerWidth < 1100 ? '4px 0 24px rgba(0,0,0,0.15)' : 'none',
      }}>

        {/* Quick Add */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button onClick={() => setQaOpen(v => !v)} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%',
          }}>
            <div className="eyebrow" style={{ margin: 0 }}>Quick add</div>
            <span style={{ fontSize: '18px', color: 'var(--muted)', lineHeight: 1 }}>{qaOpen ? '−' : '+'}</span>
          </button>

          {qaOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Screenshot drop zone */}
              <ScreenshotDropZone games={games} onFill={handleAiFill} />

              {qaError && (
                <div style={{ fontSize: '13px', color: '#c0392b', background: '#fff0f0', padding: '7px 10px', borderRadius: '6px' }}>
                  {qaError}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Logged at: now</span>
                <button
                  type="button"
                  onClick={() => { setQaAdjustTime(v => !v); setQaDateTime(nowDateTimeLocal()); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--accent)', fontWeight: 600, padding: 0 }}
                >
                  {qaAdjustTime ? 'Use now' : 'Adjust time'}
                </button>
              </div>
              {qaAdjustTime && (
                <input
                  type="datetime-local"
                  value={qaDateTime}
                  onChange={e => setQaDateTime(e.target.value)}
                  style={qaInputStyle}
                />
              )}

              <label style={{ ...labelWrapStyle, fontSize: '13px' }}>
                <span>Game</span>
                <input type="text" placeholder="Game title" value={qaGame}
                  onChange={e => setQaGame(e.target.value)}
                  list="qa-game-list" style={qaInputStyle} />
                <datalist id="qa-game-list">
                  {games.map(g => <option key={g} value={g} />)}
                </datalist>
              </label>

              <label style={{ ...labelWrapStyle, fontSize: '13px' }}>
                <span>Action / Notes</span>
                <textarea placeholder="What happened?" value={qaAction}
                  onChange={e => setQaAction(e.target.value)}
                  rows={2} style={{ ...qaInputStyle, resize: 'vertical' }} />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 160px) minmax(0, 160px)', columnGap: '24px', rowGap: '12px' }}>
                <label style={{ ...labelWrapStyle, fontSize: '13px' }}>
                  <span>Minutes (0 = achievement)</span>
                  <input type="number" min={0} max={999} value={qaMinutes}
                    onChange={e => setQaMinutes(Number(e.target.value))} style={qaInputStyle} />
                </label>
                <label style={{ ...labelWrapStyle, fontSize: '13px' }}>
                  <span>Type</span>
                  <select value={qaType} onChange={e => setQaType(e.target.value as ActionType)} style={qaInputStyle}>
                    {ACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </label>
              </div>

              <button className="btn primary" onClick={() => { trackAction('dashboard', 'Sidebar', 'click', 'Quick add entry'); handleQuickAdd(); }} disabled={qaAdding} style={{ width: '100%' }}>
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
              <textarea value={rawLogs} onChange={e => onRawLogsChange(e.target.value)}
                placeholder="2026-05-13 22:26 | Mario Kart Tour | 1st place | 60 | rank-up"
                style={{ width: '100%', minHeight: '140px', border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: '14px', resize: 'vertical' }} />
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
