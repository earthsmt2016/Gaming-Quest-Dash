import React, { useState } from 'react';
import { NeedsWorkItem, badgeFor } from '../lib/logParser';

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

interface NeedsWorkProps {
  items: NeedsWorkItem[];
  manualCompletions: Set<string>;
  paused: Set<string>;
  guides: Record<string, string>;
  onToggleCompletion: (game: string) => void;
  onTogglePaused: (game: string) => void;
  onSetGuide: (game: string, url: string) => Promise<void>;
  onDeleteGuide: (game: string) => Promise<void>;
  onOpenLibrary: () => void;
}

export default function NeedsWork({
  items, manualCompletions, paused, guides,
  onToggleCompletion, onTogglePaused, onSetGuide, onDeleteGuide, onOpenLibrary,
}: NeedsWorkProps) {
  const [playerOpen, setPlayerOpen] = useState<string | null>(null);
  const [inputGame, setInputGame] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSaveGuide = async (game: string) => {
    const id = extractYouTubeId(urlDraft.trim());
    if (!id) { alert('Paste a valid YouTube URL (e.g. https://youtube.com/watch?v=...)'); return; }
    setSaving(true);
    try {
      await onSetGuide(game, urlDraft.trim());
      setInputGame(null);
      setUrlDraft('');
      setPlayerOpen(game);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveGuide = async (game: string) => {
    await onDeleteGuide(game);
    setPlayerOpen(null);
  };

  return (
    <article style={{
      background: 'var(--paper)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow)',
      padding: '16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', marginBottom: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '17px' }}>What needs work next</h3>
          <div className="mini">Based on last 28 days of activity</div>
        </div>
        <button
          className="btn soft"
          onClick={onOpenLibrary}
          style={{ fontSize: '12px', padding: '4px 12px', flexShrink: 0, whiteSpace: 'nowrap' }}
          title="View all games and manage completion status"
        >
          All games ↗
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {items.length === 0 ? (
          <div style={{
            border: '1px solid var(--soft-line)',
            borderRadius: '12px',
            background: '#fffdfa',
            padding: '12px',
          }}>Add more logs to generate suggestions.</div>
        ) : items.map(item => {
          const isManual = manualCompletions.has(item.game);
          const isOnHold = paused.has(item.game);
          const isCompleted = item.status === 'Completed or parked';
          const isActive = !isCompleted && !isOnHold;
          const guideUrl = guides[item.game];
          const videoId = guideUrl ? extractYouTubeId(guideUrl) : null;
          const isPlayerOpen = playerOpen === item.game;
          const isInputOpen = inputGame === item.game;

          return (
            <div key={item.game} style={{
              border: '1px solid var(--soft-line)',
              borderRadius: '12px',
              background: isOnHold ? '#faf8ff' : '#fffdfa',
              padding: '12px',
              opacity: isOnHold ? 0.85 : 1,
            }}>
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <strong>{item.game}</strong>
                <span className={`badge ${badgeFor(item.status)}`}>{item.status}</span>
              </div>

              {/* Note + action buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', gap: '8px', flexWrap: 'wrap' }}>
                <div className="mini">{item.note}</div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
                  {isOnHold && (
                    <button className="btn soft" onClick={() => onTogglePaused(item.game)}
                      style={{ fontSize: '12px', padding: '3px 10px' }} title="Resume this game">
                      Resume ▶
                    </button>
                  )}
                  {isManual && (
                    <button className="btn soft" onClick={() => onToggleCompletion(item.game)}
                      style={{ fontSize: '12px', padding: '3px 10px', color: 'var(--muted)' }} title="Remove manual completion mark">
                      Unmark
                    </button>
                  )}
                  {isActive && (
                    <>
                      <button className="btn soft" onClick={() => onTogglePaused(item.game)}
                        style={{ fontSize: '12px', padding: '3px 10px', color: 'var(--muted)' }} title="Put this game on hold">
                        Put down
                      </button>
                      <button className="btn soft" onClick={() => onToggleCompletion(item.game)}
                        style={{ fontSize: '12px', padding: '3px 10px' }} title="Mark this game as completed">
                        Mark done ✓
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* YouTube guide section */}
              <div style={{ marginTop: '10px', borderTop: '1px solid var(--soft-line)', paddingTop: '10px' }}>
                {!isInputOpen && (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {videoId ? (
                      <>
                        <button
                          className="btn soft"
                          onClick={() => setPlayerOpen(isPlayerOpen ? null : item.game)}
                          style={{ fontSize: '12px', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
                        >
                          <span style={{ fontSize: '14px' }}>▶</span>
                          {isPlayerOpen ? 'Hide guide' : 'Watch guide'}
                        </button>
                        <button
                          className="btn soft"
                          onClick={() => { setInputGame(item.game); setUrlDraft(guideUrl); }}
                          style={{ fontSize: '12px', padding: '3px 10px', color: 'var(--muted)' }}
                          title="Change the guide URL"
                        >
                          Change
                        </button>
                        <button
                          className="btn soft"
                          onClick={() => handleRemoveGuide(item.game)}
                          style={{ fontSize: '12px', padding: '3px 10px', color: 'var(--muted)' }}
                          title="Remove guide"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn soft"
                        onClick={() => { setInputGame(item.game); setUrlDraft(''); }}
                        style={{ fontSize: '12px', padding: '3px 10px', color: 'var(--muted)' }}
                        title="Attach a YouTube guide for this game"
                      >
                        + Add YouTube guide
                      </button>
                    )}
                  </div>
                )}

                {/* URL input */}
                {isInputOpen && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      type="url"
                      placeholder="https://youtube.com/watch?v=..."
                      value={urlDraft}
                      onChange={e => setUrlDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveGuide(item.game); if (e.key === 'Escape') setInputGame(null); }}
                      autoFocus
                      style={{
                        flex: 1, minWidth: '180px', fontSize: '13px',
                        border: '1px solid var(--line)', borderRadius: '8px',
                        padding: '5px 10px', background: 'var(--paper)', fontFamily: 'inherit',
                      }}
                    />
                    <button className="btn primary" onClick={() => handleSaveGuide(item.game)}
                      disabled={saving} style={{ fontSize: '12px', padding: '5px 12px' }}>
                      {saving ? '…' : 'Save'}
                    </button>
                    <button className="btn soft" onClick={() => { setInputGame(null); setUrlDraft(''); }}
                      style={{ fontSize: '12px', padding: '5px 10px' }}>
                      Cancel
                    </button>
                  </div>
                )}

                {/* Embedded player */}
                {isPlayerOpen && videoId && (
                  <div style={{ marginTop: '10px', borderRadius: '10px', overflow: 'hidden', aspectRatio: '16/9' }}>
                    <iframe
                      src={`https://www.youtube.com/embed/${videoId}`}
                      title={`Guide for ${item.game}`}
                      width="100%"
                      height="100%"
                      style={{ display: 'block', border: 'none' }}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
