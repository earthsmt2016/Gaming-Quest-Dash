import React, { useState, useEffect } from 'react';
import { LogEntry, ActionType } from '../lib/logParser';

const ACTION_TYPES: { value: ActionType; label: string }[] = [
  { value: 'progress', label: 'Progress' },
  { value: 'boss',     label: 'Boss' },
  { value: 'complete', label: 'Complete' },
  { value: 'rank-up',  label: 'Rank Up' },
  { value: 'purchase', label: 'Purchase' },
];

interface EditLogModalProps {
  entry: LogEntry | null;
  onClose: () => void;
  onSave: (id: string, patch: { game: string; action: string; minutes: number; type: ActionType; timestamp: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function toDatetimeLocal(ts: string): string {
  return ts.replace(' ', 'T');
}

function fromDatetimeLocal(dtl: string): string {
  return dtl.replace('T', ' ');
}

export default function EditLogModal({ entry, onClose, onSave, onDelete }: EditLogModalProps) {
  const [game, setGame] = useState('');
  const [action, setAction] = useState('');
  const [minutes, setMinutes] = useState(0);
  const [type, setType] = useState<ActionType>('progress');
  const [timestamp, setTimestamp] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (entry) {
      setGame(entry.game);
      setAction(entry.action);
      setMinutes(entry.minutes);
      setType(entry.type);
      setTimestamp(toDatetimeLocal(entry.timestamp));
      setError('');
      setConfirmDelete(false);
      setSaving(false);
      setDeleting(false);
    }
  }, [entry]);

  if (!entry) return null;

  const handleSave = async () => {
    if (!game.trim() || !action.trim() || minutes < 0 || !timestamp) {
      setError('Please fill in all fields.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(entry.id, { game: game.trim(), action: action.trim(), minutes, type, timestamp: fromDatetimeLocal(timestamp) });
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    setError('');
    try {
      await onDelete(entry.id);
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <style>{`
        .elm-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.45);
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
        }
        .elm-modal {
          background: var(--paper);
          border-radius: var(--radius);
          box-shadow: 0 8px 40px rgba(0,0,0,0.18);
          width: 100%; max-width: 480px;
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        .elm-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 15px 18px 12px;
          border-bottom: 1px solid var(--line);
        }
        .elm-body {
          padding: 16px 18px;
          display: flex; flex-direction: column; gap: 13px;
          overflow-y: auto; max-height: 70vh;
        }
        .elm-footer {
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px 18px 14px;
          border-top: 1px solid var(--line);
          gap: 10px;
        }
        .elm-field { display: flex; flex-direction: column; gap: 5px; }
        .elm-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); }
        .elm-input {
          width: 100%; padding: 9px 11px; font-size: 14px;
          border: 1px solid var(--line); border-radius: var(--radius-sm);
          background: var(--paper); font-family: inherit;
          box-sizing: border-box;
        }
        .elm-input:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: transparent; }
        .elm-textarea { resize: vertical; min-height: 72px; }
        .elm-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .elm-error { font-size: 13px; color: #c0392b; padding: 7px 10px; background: #fff0f0; border-radius: 6px; }
        .elm-close-btn {
          background: none; border: none; cursor: pointer;
          color: var(--muted); padding: 4px; line-height: 0; border-radius: 6px;
        }
        .elm-close-btn:hover { background: var(--soft-line); }
        .elm-del-btn { color: #c0392b; border-color: #f5c6cb !important; }
        .elm-del-btn:hover { background: #fff0f0 !important; }
        @media (max-width: 440px) { .elm-row2 { grid-template-columns: 1fr; } }
      `}</style>

      <div className="elm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="elm-modal" role="dialog" aria-modal="true">

          <div className="elm-header">
            <div style={{ fontWeight: 700, fontSize: '15px' }}>Edit log entry</div>
            <button className="elm-close-btn" onClick={onClose} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div className="elm-body">
            {error && <div className="elm-error">{error}</div>}

            <div className="elm-field">
              <label className="elm-label">Game</label>
              <input className="elm-input" value={game} onChange={e => setGame(e.target.value)} placeholder="Game title" />
            </div>

            <div className="elm-field">
              <label className="elm-label">Action / Notes</label>
              <textarea className="elm-input elm-textarea" value={action} onChange={e => setAction(e.target.value)} placeholder="What happened this session?" />
            </div>

            <div className="elm-row2">
              <div className="elm-field">
                <label className="elm-label">Minutes</label>
                <input className="elm-input" type="number" min={0} max={999} value={minutes} onChange={e => setMinutes(Number(e.target.value))} />
              </div>
              <div className="elm-field">
                <label className="elm-label">Type</label>
                <select className="elm-input" value={type} onChange={e => setType(e.target.value as ActionType)}>
                  {ACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div className="elm-field">
              <label className="elm-label">Timestamp</label>
              <input className="elm-input" type="datetime-local" value={timestamp} onChange={e => setTimestamp(e.target.value)} />
            </div>
          </div>

          <div className="elm-footer">
            <button
              className="btn soft elm-del-btn"
              onClick={handleDelete}
              disabled={deleting}
              style={{ fontSize: '13px' }}
            >
              {deleting ? 'Deleting…' : confirmDelete ? 'Confirm delete?' : 'Delete'}
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn soft" onClick={onClose} style={{ fontSize: '13px' }}>Cancel</button>
              <button className="btn primary" onClick={handleSave} disabled={saving} style={{ fontSize: '13px' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
