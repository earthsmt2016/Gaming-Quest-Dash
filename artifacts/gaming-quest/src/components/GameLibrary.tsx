import React, { useMemo } from 'react';
import { LogEntry } from '../lib/logParser';

const CREDITS_RE = /saw the credits|finished the game|completed the main.?run|rolled credits/i;

interface GameRow {
  game: string;
  totalMin: number;
  lastPlayed: Date;
  autoCompleted: boolean;
}

interface GameLibraryProps {
  open: boolean;
  onClose: () => void;
  logs: LogEntry[];
  manualCompletions: Set<string>;
  paused: Set<string>;
  onToggleCompletion: (game: string) => void;
  onTogglePaused: (game: string) => void;
}

function fmtMin(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function GameLibrary({ open, onClose, logs, manualCompletions, paused, onToggleCompletion, onTogglePaused }: GameLibraryProps) {
  const rows = useMemo<GameRow[]>(() => {
    const map = new Map<string, { min: number; last: Date; actions: string[] }>();
    for (const l of logs) {
      const existing = map.get(l.game);
      if (!existing) {
        map.set(l.game, { min: l.minutes, last: l.date, actions: [l.action] });
      } else {
        existing.min += l.minutes;
        if (l.date > existing.last) existing.last = l.date;
        existing.actions.push(l.action);
      }
    }
    return Array.from(map.entries())
      .map(([game, d]) => ({
        game,
        totalMin: d.min,
        lastPlayed: d.last,
        autoCompleted: d.actions.some(a => CREDITS_RE.test(a)),
      }))
      .sort((a, b) => b.lastPlayed.getTime() - a.lastPlayed.getTime());
  }, [logs]);

  const completed = rows.filter(r => r.autoCompleted || manualCompletions.has(r.game));
  const onHold    = rows.filter(r => !r.autoCompleted && !manualCompletions.has(r.game) && paused.has(r.game));
  const active    = rows.filter(r => !r.autoCompleted && !manualCompletions.has(r.game) && !paused.has(r.game));

  if (!open) return null;

  return (
    <>
      <style>{`
        .gl-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.45);
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
        }
        .gl-modal {
          background: var(--paper);
          border-radius: var(--radius);
          box-shadow: 0 8px 40px rgba(0,0,0,0.18);
          width: 100%; max-width: 560px;
          max-height: 88vh;
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        .gl-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 18px 12px;
          border-bottom: 1px solid var(--line);
          flex-shrink: 0;
        }
        .gl-body {
          overflow-y: auto;
          padding: 14px 18px 18px;
          display: flex; flex-direction: column; gap: 20px;
        }
        .gl-section-label {
          font-size: 11px; font-weight: 700; letter-spacing: 0.07em;
          text-transform: uppercase; color: var(--muted);
          margin-bottom: 8px;
        }
        .gl-row {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 12px;
          border: 1px solid var(--soft-line);
          border-radius: 10px;
          background: #fffdfa;
          margin-bottom: 6px;
        }
        .gl-row-hold { background: #faf8ff; }
        .gl-row:last-child { margin-bottom: 0; }
        .gl-info { flex: 1; min-width: 0; }
        .gl-name { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .gl-meta { font-size: 12px; color: var(--muted); margin-top: 2px; }
        .gl-tag {
          font-size: 11px; font-weight: 600; padding: 2px 8px;
          border-radius: 99px; flex-shrink: 0; white-space: nowrap;
        }
        .gl-tag-auto   { background: #d1fae5; color: #065f46; }
        .gl-tag-manual { background: #ede9fe; color: #4c1d95; }
        .gl-tag-hold   { background: #fef3c7; color: #92400e; }
        .gl-btns { display: flex; gap: 6px; flex-shrink: 0; }
        .gl-close-btn {
          background: none; border: none; cursor: pointer;
          color: var(--muted); padding: 4px; line-height: 0;
          border-radius: 6px;
        }
        .gl-close-btn:hover { background: var(--soft-line); }
        .gl-empty { font-size: 14px; color: var(--muted); font-style: italic; }
      `}</style>

      <div className="gl-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="gl-modal" role="dialog" aria-modal="true" aria-label="Game Library">

          <div className="gl-header">
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>Game Library</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                {rows.length} title{rows.length !== 1 ? 's' : ''} — manage status
              </div>
            </div>
            <button className="gl-close-btn" onClick={onClose} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div className="gl-body">

            {/* Active */}
            <div>
              <div className="gl-section-label">Active ({active.length})</div>
              {active.length === 0 ? (
                <div className="gl-empty">No active games.</div>
              ) : active.map(r => (
                <div className="gl-row" key={r.game}>
                  <div className="gl-info">
                    <div className="gl-name" title={r.game}>{r.game}</div>
                    <div className="gl-meta">{fmtMin(r.totalMin)} total · last played {fmtDate(r.lastPlayed)}</div>
                  </div>
                  <div className="gl-btns">
                    <button
                      className="btn soft"
                      onClick={() => onTogglePaused(r.game)}
                      style={{ fontSize: '12px', padding: '4px 10px', color: 'var(--muted)' }}
                      title="Put this game on hold"
                    >
                      Put down
                    </button>
                    <button
                      className="btn soft"
                      onClick={() => onToggleCompletion(r.game)}
                      style={{ fontSize: '12px', padding: '4px 10px' }}
                      title="Mark as completed"
                    >
                      Mark done ✓
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* On Hold */}
            <div>
              <div className="gl-section-label">On Hold ({onHold.length})</div>
              {onHold.length === 0 ? (
                <div className="gl-empty">No games on hold.</div>
              ) : onHold.map(r => (
                <div className="gl-row gl-row-hold" key={r.game}>
                  <div className="gl-info">
                    <div className="gl-name" title={r.game}>{r.game}</div>
                    <div className="gl-meta">{fmtMin(r.totalMin)} total · last played {fmtDate(r.lastPlayed)}</div>
                  </div>
                  <span className="gl-tag gl-tag-hold">On hold</span>
                  <div className="gl-btns">
                    <button
                      className="btn soft"
                      onClick={() => onTogglePaused(r.game)}
                      style={{ fontSize: '12px', padding: '4px 10px' }}
                      title="Resume this game"
                    >
                      Resume ▶
                    </button>
                    <button
                      className="btn soft"
                      onClick={() => onToggleCompletion(r.game)}
                      style={{ fontSize: '12px', padding: '4px 10px' }}
                      title="Mark as completed instead"
                    >
                      Mark done ✓
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Completed */}
            <div>
              <div className="gl-section-label">Completed ({completed.length})</div>
              {completed.length === 0 ? (
                <div className="gl-empty">No completed games yet.</div>
              ) : completed.map(r => {
                const isManual = manualCompletions.has(r.game);
                return (
                  <div className="gl-row" key={r.game}>
                    <div className="gl-info">
                      <div className="gl-name" title={r.game}>{r.game}</div>
                      <div className="gl-meta">{fmtMin(r.totalMin)} total · last played {fmtDate(r.lastPlayed)}</div>
                    </div>
                    <span className={`gl-tag ${isManual && !r.autoCompleted ? 'gl-tag-manual' : 'gl-tag-auto'}`}>
                      {r.autoCompleted ? 'Credits logged' : 'Manually marked'}
                    </span>
                    {isManual && !r.autoCompleted && (
                      <button
                        className="btn soft"
                        onClick={() => onToggleCompletion(r.game)}
                        style={{ fontSize: '12px', padding: '4px 10px', color: 'var(--muted)' }}
                        title="Remove manual completion"
                      >
                        Unmark
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
