import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LogEntry, formatDateTime, labelType } from '../lib/logParser';
import { LogPatch, screenshotUrl, uploadFile } from '../lib/api';

interface QuestTableProps {
  entries: LogEntry[];
  onEdit: (entry: LogEntry) => void;
  onSave: (id: string, patch: LogPatch) => Promise<void>;
}

type EditState = { id: string; field: 'game' | 'action'; value: string } | null;

function InlineCell({ id, field, value, multiline, editing, onStartEdit, onCommit, onCancel, saving }: {
  id: string; field: 'game' | 'action'; value: string; multiline?: boolean;
  editing: boolean; onStartEdit: () => void; onCommit: (val: string) => void;
  onCancel: () => void; saving: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
    }
  }, [editing, value]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onCommit(trimmed);
    else onCancel();
  }, [draft, value, onCommit, onCancel]);

  const sharedStyle: React.CSSProperties = {
    width: '100%', padding: '4px 6px', border: '1.5px solid var(--accent)',
    borderRadius: '6px', fontFamily: 'inherit', fontSize: '13px', background: '#fff',
    outline: 'none', boxSizing: 'border-box', lineHeight: '1.4', opacity: saving ? 0.5 : 1,
  };

  if (editing) {
    if (multiline) {
      return (
        <textarea ref={inputRef as React.Ref<HTMLTextAreaElement>} value={draft}
          rows={Math.max(2, Math.ceil(draft.length / 50))}
          style={{ ...sharedStyle, resize: 'vertical', display: 'block' }}
          onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
          }} disabled={saving} />
      );
    }
    return (
      <input ref={inputRef as React.Ref<HTMLInputElement>} value={draft}
        style={sharedStyle} onChange={e => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
        }} disabled={saving} />
    );
  }

  return (
    <span onDoubleClick={onStartEdit} title="Double-click to edit"
      style={{ cursor: 'text', borderRadius: '4px', padding: '1px 2px', margin: '-1px -2px', display: 'block', whiteSpace: multiline ? 'pre-wrap' : undefined, transition: 'background 0.1s' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}>
      {value}
    </span>
  );
}

// ─── Screenshot cell ──────────────────────────────────────────────────────────

function ScreenshotCell({ entry, onSave }: { entry: LogEntry; onSave: (id: string, patch: LogPatch) => Promise<void> }) {
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const doUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const path = await uploadFile(file);
      await onSave(entry.id, { screenshotPath: path });
    } catch (err) {
      alert('Upload failed: ' + String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) doUpload(file);
  };

  const url = entry.screenshotPath ? screenshotUrl(entry.screenshotPath) : null;

  return (
    <>
      {lightbox && url && (
        <div
          onClick={() => setLightbox(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          <img src={url} alt="Screenshot" style={{ maxWidth: '90vw', maxHeight: '88vh', borderRadius: '8px', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightbox(false)}
            style={{ position: 'absolute', top: '18px', right: '22px', background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', fontSize: '22px', cursor: 'pointer', borderRadius: '50%', width: '36px', height: '36px', lineHeight: '36px', textAlign: 'center', backdropFilter: 'blur(4px)' }}>
            ×
          </button>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) doUpload(f); e.target.value = ''; }} />

      {url ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <img src={url} alt="Screenshot" onClick={() => setLightbox(true)}
            style={{ width: '36px', height: '28px', objectFit: 'cover', borderRadius: '4px', cursor: 'zoom-in', border: '1px solid var(--line)' }} />
          <button onClick={() => onSave(entry.id, { screenshotPath: null })} title="Remove screenshot"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '13px', padding: '2px', lineHeight: 1 }}>×</button>
        </div>
      ) : (
        <div
          onDrop={handleDrop} onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          title="Attach screenshot"
          style={{ width: '36px', height: '28px', border: '1.5px dashed var(--line)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '14px', transition: 'border-color 0.12s', flexShrink: 0 }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--line)')}
        >
          {uploading ? <span style={{ fontSize: '10px' }}>…</span> : <span>📷</span>}
        </div>
      )}
    </>
  );
}

// ─── Main table ───────────────────────────────────────────────────────────────

export default function QuestTable({ entries, onEdit, onSave }: QuestTableProps) {
  const [editing, setEditing] = useState<EditState>(null);
  const [saving, setSaving] = useState<{ id: string; field: string } | null>(null);

  const startEdit = (id: string, field: 'game' | 'action', value: string) => setEditing({ id, field, value });
  const cancelEdit = () => setEditing(null);

  const commitEdit = async (id: string, field: 'game' | 'action', newVal: string) => {
    setSaving({ id, field });
    setEditing(null);
    try { await onSave(id, { [field]: newVal }); }
    finally { setSaving(null); }
  };

  return (
    <>
      <style>{`.qt-hint { font-size: 11px; color: var(--muted); margin-top: 1px; }`}</style>
      <article style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', marginBottom: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '17px' }}>Quest log</h3>
            <div className="mini">Sorted newest first · swipe to scroll on mobile · double-click title or action to edit · 📷 attach a screenshot</div>
          </div>
        </div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any, border: '1px solid var(--soft-line)', borderRadius: '14px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead>
              <tr>
                <th style={thStyle('155px')}>Timestamp</th>
                <th style={thStyle('160px')}>Game</th>
                <th style={thStyle()}>Action</th>
                <th style={thStyle('110px')}>Type</th>
                <th style={thStyle('90px')}>Playtime</th>
                <th style={thStyle('52px')} title="Screenshot">📷</th>
                <th style={thStyle('44px')}></th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
                    No entries match the current filters.
                  </td>
                </tr>
              ) : entries.map((l, i) => (
                <tr key={l.id} style={{ background: i % 2 === 0 ? '#fffdfa' : undefined }}>
                  <td style={tdStyle}>{formatDateTime(l.date)}</td>

                  <td style={tdStyle}>
                    <InlineCell id={l.id} field="game" value={l.game}
                      editing={editing?.id === l.id && editing?.field === 'game'}
                      saving={saving?.id === l.id && saving?.field === 'game'}
                      onStartEdit={() => startEdit(l.id, 'game', l.game)}
                      onCommit={val => commitEdit(l.id, 'game', val)}
                      onCancel={cancelEdit} />
                  </td>

                  <td style={tdStyle}>
                    <InlineCell id={l.id} field="action" value={l.action} multiline
                      editing={editing?.id === l.id && editing?.field === 'action'}
                      saving={saving?.id === l.id && saving?.field === 'action'}
                      onStartEdit={() => startEdit(l.id, 'action', l.action)}
                      onCommit={val => commitEdit(l.id, 'action', val)}
                      onCancel={cancelEdit} />
                    {editing?.id === l.id && editing?.field === 'action' && (
                      <div className="qt-hint">Ctrl+Enter to save · Esc to cancel</div>
                    )}
                  </td>

                  <td style={tdStyle}>
                    <span className={`badge ${l.type}`}>{labelType(l.type)}</span>
                  </td>
                  <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{l.minutes} min</td>

                  <td style={{ ...tdStyle, padding: '8px 8px', verticalAlign: 'middle' }}>
                    <ScreenshotCell entry={l} onSave={onSave} />
                  </td>

                  <td style={{ ...tdStyle, padding: '6px 8px' }}>
                    <button onClick={() => onEdit(l)} title="Edit this entry"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '5px', borderRadius: '6px', lineHeight: 0, display: 'flex', alignItems: 'center' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--soft-line)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </>
  );
}

function thStyle(width?: string): React.CSSProperties {
  return {
    background: '#f8f3eb', textAlign: 'left', fontSize: '11px',
    textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)',
    borderBottom: '1px solid var(--line)', padding: '11px 10px',
    width, minWidth: width, verticalAlign: 'top',
  };
}

const tdStyle: React.CSSProperties = {
  padding: '11px 10px', verticalAlign: 'top',
  borderBottom: '1px solid var(--soft-line)', fontSize: '13px',
};
