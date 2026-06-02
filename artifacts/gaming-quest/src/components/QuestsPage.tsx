import React, { useState, useEffect, useCallback } from 'react';
import {
  Quest, QuestLog, QuestGuide, QuestVideoLink, QuestMiniLog, YouTubeVideo, UserProfile,
  fetchSuggestedQuests, fetchActiveQuests, fetchQuestLogs,
  generateQuests, fetchGames, acceptQuest, rejectQuest,
  updateQuestProgress, completeQuest, fetchQuestGuide,
  searchYouTubeGuides, addVideoToGuide, removeVideoFromGuide,
  submitQuestFeedback, fetchUserProfile, fetchMiniLogs, addMiniLog, deleteMiniLog,
} from '../lib/api';

// ─── Constants ───────────────────────────────────────────────────────────────

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  easy:      { bg: '#e8f5e9', text: '#2e7d32' },
  medium:    { bg: '#fff3e0', text: '#e65100' },
  hard:      { bg: '#fce4ec', text: '#c62828' },
  legendary: { bg: '#f3e5f5', text: '#6a1b9a' },
};

const TYPE_ICONS: Record<string, string> = {
  challenge:   '⚔️',
  exploration: '🗺️',
  grind:       '⚙️',
  skill:       '🎯',
};

function fmtMins(m: number): string {
  if (!m) return '—';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

// ─── Badges ──────────────────────────────────────────────────────────────────

function DifficultyBadge({ d }: { d: string }) {
  const c = DIFFICULTY_COLORS[d] ?? { bg: '#f5f5f5', text: '#555' };
  return (
    <span style={{
      background: c.bg, color: c.text, fontSize: '11px', fontWeight: 700,
      padding: '2px 8px', borderRadius: '20px', textTransform: 'capitalize', flexShrink: 0,
    }}>{d}</span>
  );
}

function XPBadge({ xp }: { xp: number }) {
  return (
    <span style={{
      background: 'var(--accent)', color: '#fff', fontSize: '11px', fontWeight: 700,
      padding: '2px 8px', borderRadius: '20px', flexShrink: 0,
    }}>+{xp} XP</span>
  );
}

// ─── YouTube Video Thumbnail Card ─────────────────────────────────────────────

function VideoThumb({
  video, playing, onPlay, onRemove,
}: {
  video: QuestVideoLink;
  playing: boolean;
  onPlay: () => void;
  onRemove: () => void;
}) {
  const hasId = !!video.id;
  const thumb = video.thumbnail || (hasId ? `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg` : '');

  if (!hasId) {
    return (
      <a
        href={video.url || '#'}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '9px 12px', borderRadius: '6px',
          background: '#ff0000', color: '#fff', fontWeight: 600, fontSize: '13px',
          textDecoration: 'none',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
          <path d="M21.8 8s-.2-1.4-.8-2c-.7-.8-1.6-.8-1.9-.8C16.6 5 12 5 12 5s-4.6 0-7.1.2c-.4 0-1.2 0-1.9.8-.6.6-.8 2-.8 2S2 9.6 2 11.2v1.5c0 1.6.2 3.2.2 3.2s.2 1.4.8 2c.7.8 1.7.7 2.1.8C6.4 19 12 19 12 19s4.6 0 7.1-.2c.4 0 1.2 0 1.9-.8.6-.6.8-2 .8-2s.2-1.6.2-3.2v-1.5C22 9.6 21.8 8 21.8 8z" opacity=".85"/>
          <polygon points="10 15 15 12 10 9 10 15" fill="white"/>
        </svg>
        {video.title}
      </a>
    );
  }

  if (playing) {
    return (
      <div style={{ borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ width: '100%', height: '200px', border: 'none', display: 'block' }}
          title={video.title}
        />
      </div>
    );
  }

  return (
    <div style={{ borderRadius: '8px', overflow: 'hidden', position: 'relative', cursor: 'pointer', background: '#000' }}>
      {thumb && (
        <img
          src={thumb}
          alt={video.title}
          onClick={onPlay}
          style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block', opacity: 0.9 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      {/* Play overlay */}
      <button
        onClick={onPlay}
        aria-label={`Play ${video.title}`}
        style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)',
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div style={{
          width: 44, height: 44, background: 'rgba(255,0,0,0.9)', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="8 5 19 12 8 19 8 5"/></svg>
        </div>
      </button>
      {/* Remove button */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        aria-label="Remove video"
        style={{
          position: 'absolute', top: 6, right: 6, width: 22, height: 22,
          background: 'rgba(0,0,0,0.65)', color: '#fff', border: 'none',
          borderRadius: '50%', cursor: 'pointer', fontSize: '14px', lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >×</button>
      {/* Title bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
        color: '#fff', fontSize: '11px', padding: '12px 6px 5px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 4,
        pointerEvents: 'none',
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{video.title}</span>
        {video.duration && <span style={{ flexShrink: 0, opacity: 0.8, fontSize: '10px' }}>{video.duration}</span>}
      </div>
    </div>
  );
}

// ─── Mini Log Panel ───────────────────────────────────────────────────────────

function MiniLogPanel({
  miniLogs, onAdd, onDelete,
}: {
  miniLogs: QuestMiniLog[];
  onAdd?: (note: string) => Promise<void>;
  onDelete?: (logId: number) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleAdd = async () => {
    if (!note.trim() || !onAdd || adding) return;
    setAdding(true);
    try { await onAdd(note.trim()); setNote(''); }
    finally { setAdding(false); }
  };

  const handleDelete = async (id: number) => {
    if (!onDelete || deletingId) return;
    setDeletingId(id);
    try { await onDelete(id); }
    finally { setDeletingId(null); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>
        📝 Progress Notes {miniLogs.length > 0 && `(${miniLogs.length})`}
      </div>
      {miniLogs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {miniLogs.map(log => (
            <div key={log.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: '8px',
              background: 'var(--paper-2)', borderRadius: '6px', padding: '6px 10px',
              opacity: deletingId === log.id ? 0.4 : 1, transition: 'opacity 0.15s',
            }}>
              <span style={{ fontSize: '13px', flex: 1, lineHeight: 1.4 }}>• {log.note}</span>
              <span style={{ fontSize: '10px', color: 'var(--muted)', flexShrink: 0, marginTop: '2px' }}>
                {new Date(log.created_at).toLocaleDateString()}
              </span>
              {onDelete && (
                <button
                  onClick={() => handleDelete(log.id)}
                  disabled={deletingId !== null}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '14px', lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                >×</button>
              )}
            </div>
          ))}
        </div>
      )}
      {onAdd && (
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Add a progress note…"
            style={{
              flex: 1, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
              padding: '6px 10px', fontSize: '13px', fontFamily: 'inherit',
              background: 'var(--paper)',
            }}
          />
          <button
            className="btn"
            onClick={handleAdd}
            disabled={adding || !note.trim()}
            style={{ fontSize: '12px', padding: '6px 12px', flexShrink: 0 }}
          >{adding ? '…' : '+ Note'}</button>
        </div>
      )}
      {miniLogs.length === 0 && !onAdd && (
        <div style={{ fontSize: '13px', color: 'var(--muted)' }}>No progress notes yet.</div>
      )}
    </div>
  );
}

// ─── Guide Modal ─────────────────────────────────────────────────────────────

function GuideModal({ quest, onClose }: { quest: Quest; onClose: () => void }) {
  const [guide, setGuide] = useState<QuestGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<YouTubeVideo[] | null>(null);
  const [searchError, setSearchError] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchQuestGuide(quest.id)
      .then(setGuide)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [quest.id]);

  const handleSearch = async () => {
    setSearching(true);
    setSearchError('');
    setSearchResults(null);
    try {
      const results = await searchYouTubeGuides(quest.game, quest.title);
      if (!results || results.length === 0) { setSearchError('No results found — try a different quest guide.'); }
      else setSearchResults(results);
    } catch { setSearchError('YouTube search unavailable right now.'); }
    finally { setSearching(false); }
  };

  const handleAddVideo = async (video: YouTubeVideo) => {
    if (!guide || addingId) return;
    setAddingId(video.id);
    try {
      const updated = await addVideoToGuide(quest.id, { id: video.id, title: video.title, thumbnail: video.thumbnail, duration: video.duration });
      setGuide(updated);
      setSearchResults(null);
    } catch { /* ignore */ }
    finally { setAddingId(null); }
  };

  const handleRemoveVideo = async (videoId: string) => {
    if (!guide || removingId) return;
    setRemovingId(videoId);
    if (playingId === videoId) setPlayingId(null);
    try {
      const updated = await removeVideoFromGuide(quest.id, videoId);
      setGuide(updated);
    } catch { /* ignore */ }
    finally { setRemovingId(null); }
  };

  const embedVideos = guide?.youtube_links ?? [];
  const alreadyAddedIds = new Set(embedVideos.map(v => v.id).filter(Boolean));

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(28,24,20,.55)',
        zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--paper)', borderRadius: 'var(--radius)', boxShadow: '0 8px 40px rgba(0,0,0,0.22)',
          padding: '24px', maxWidth: '560px', width: '100%', maxHeight: '88vh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
              {TYPE_ICONS[quest.type]} Quest Guide
            </div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>{quest.title}</h3>
            <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>{quest.game}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: 'var(--muted)', lineHeight: 1, padding: '2px', flexShrink: 0 }}
            aria-label="Close"
          >×</button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: '14px' }}>
            ✨ Generating your guide…
          </div>
        )}
        {error && (
          <div style={{ background: '#fff0f0', border: '1px solid #f5c6cb', borderRadius: '6px', padding: '12px', fontSize: '14px', color: '#842029' }}>
            {error}
          </div>
        )}

        {guide && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Steps */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '10px' }}>Steps</div>
              <ol style={{ margin: 0, padding: '0 0 0 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {guide.steps.map((step, i) => (
                  <li key={i} style={{ fontSize: '14px', lineHeight: 1.55 }}>{step}</li>
                ))}
              </ol>
            </div>

            {/* Tips */}
            {guide.tips && (
              <div style={{ background: 'var(--paper-2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '6px' }}>💡 Tips</div>
                <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.55 }}>{guide.tips}</p>
              </div>
            )}

            {/* Video section */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>🎬 Video Guides</div>
                {!searchResults && !searching && (
                  <button
                    onClick={handleSearch}
                    style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '20px', border: '1px solid var(--line)', background: 'var(--paper-2)', cursor: 'pointer', color: 'var(--muted)', fontWeight: 600 }}
                  >🔍 Find more</button>
                )}
              </div>

              {/* Video grid */}
              {embedVideos.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: searchResults || searching ? '14px' : 0 }}>
                  {embedVideos.map((v, i) => (
                    <div key={v.id || i} style={{ opacity: removingId === v.id ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                      <VideoThumb
                        video={v}
                        playing={!!v.id && playingId === v.id}
                        onPlay={() => v.id && setPlayingId(playingId === v.id ? null : v.id)}
                        onRemove={() => v.id && handleRemoveVideo(v.id)}
                      />
                    </div>
                  ))}
                </div>
              )}

              {embedVideos.length === 0 && !searching && !searchResults && (
                <div style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)', fontSize: '13px', background: 'var(--paper-2)', borderRadius: '8px' }}>
                  No videos yet — click "Find more" to search YouTube for guides.
                </div>
              )}

              {/* Search state */}
              {searching && (
                <div style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)', fontSize: '13px' }}>
                  🔍 Searching YouTube…
                </div>
              )}

              {/* Search error */}
              {searchError && (
                <div style={{ fontSize: '13px', color: 'var(--muted)', padding: '8px 0' }}>
                  {searchError} <button onClick={() => setSearchError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '12px' }}>dismiss</button>
                </div>
              )}

              {/* Search results picker */}
              {searchResults && searchResults.length > 0 && (
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '8px' }}>
                    Pick a video to add:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {searchResults.map(v => {
                      const alreadyAdded = alreadyAddedIds.has(v.id);
                      return (
                        <div
                          key={v.id}
                          style={{ borderRadius: '8px', overflow: 'hidden', position: 'relative', background: '#000', opacity: alreadyAdded ? 0.5 : 1 }}
                        >
                          <img
                            src={v.thumbnail}
                            alt={v.title}
                            style={{ width: '100%', height: '100px', objectFit: 'cover', display: 'block' }}
                          />
                          <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
                            color: '#fff', fontSize: '10px', padding: '10px 6px 4px',
                          }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</div>
                            {v.duration && <div style={{ opacity: 0.7 }}>{v.duration}</div>}
                          </div>
                          {!alreadyAdded && (
                            <button
                              onClick={() => handleAddVideo(v)}
                              disabled={addingId === v.id}
                              aria-label={`Add ${v.title}`}
                              style={{
                                position: 'absolute', top: 5, right: 5, width: 24, height: 24,
                                background: 'var(--accent)', color: '#fff', border: 'none',
                                borderRadius: '50%', cursor: 'pointer', fontSize: '16px', lineHeight: 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >{addingId === v.id ? '…' : '+'}</button>
                          )}
                          {alreadyAdded && (
                            <div style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.6)', color: '#aaa', borderRadius: '50%', width: 24, height: 24, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setSearchResults(null)}
                    style={{ marginTop: '10px', fontSize: '12px', padding: '5px 12px', borderRadius: '20px', border: '1px solid var(--line)', background: 'var(--paper-2)', cursor: 'pointer', color: 'var(--muted)' }}
                  >Done</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Complete Modal ───────────────────────────────────────────────────────────

function CompleteModal({ quest, onClose, onCompleted }: {
  quest: Quest;
  onClose: () => void;
  onCompleted: (log: QuestLog) => void;
}) {
  const [timeMins, setTimeMins] = useState(quest.estimated_minutes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleComplete = async () => {
    setSaving(true); setError('');
    try {
      const { log } = await completeQuest(quest.id, timeMins);
      onCompleted(log);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(28,24,20,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--paper)', borderRadius: 'var(--radius)', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', padding: '24px', maxWidth: '400px', width: '100%' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>🏆 Complete Quest</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: 'var(--muted)', padding: '2px' }}>×</button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--muted)' }}>
          "{quest.title}" — you'll earn <strong style={{ color: 'var(--accent)' }}>+{quest.xp_reward} XP</strong>
        </p>
        {error && (
          <div style={{ background: '#fff0f0', border: '1px solid #f5c6cb', borderRadius: '6px', padding: '10px', fontSize: '13px', color: '#842029', marginBottom: '12px' }}>{error}</div>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>
          Time taken (minutes)
          <input
            type="number" min={0} max={9999}
            value={timeMins}
            onChange={e => setTimeMins(Number(e.target.value))}
            style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: '14px', fontFamily: 'inherit' }}
          />
        </label>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn primary" onClick={handleComplete} disabled={saving}>
            {saving ? 'Saving…' : '✅ Mark Complete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Quest Card ──────────────────────────────────────────────────────────────

function QuestCard({
  quest, onAccept, onReject, onProgress, onComplete, onGuide, onFeedback,
  miniLogs, onAddMiniLog, onDeleteMiniLog,
}: {
  quest: Quest;
  onAccept?: () => void;
  onReject?: () => void;
  onProgress?: (v: number) => void;
  onComplete?: () => void;
  onGuide?: () => void;
  onFeedback?: (rating: 1 | -1) => void;
  miniLogs?: QuestMiniLog[];
  onAddMiniLog?: (note: string) => Promise<void>;
  onDeleteMiniLog?: (logId: number) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [localProgress, setLocalProgress] = useState(quest.progress);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<1 | -1 | null>(null);
  const [feedbackSent, setFeedbackSent] = useState(false);

  const handleFeedback = async (rating: 1 | -1) => {
    if (feedbackSent) return;
    setFeedback(rating);
    setFeedbackSent(true);
    try {
      await submitQuestFeedback(quest.id, rating);
      onFeedback?.(rating);
    } catch { setFeedbackSent(false); }
  };

  const pct = Math.round((localProgress / (quest.target || 100)) * 100);

  const handleProgressChange = async (v: number) => {
    setLocalProgress(v);
    if (onProgress) {
      setSaving(true);
      try { await onProgress(v); } finally { setSaving(false); }
    }
  };

  return (
    <div style={{
      background: 'var(--paper)', border: '1px solid var(--line)',
      borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={() => setExpanded(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '13px' }}>{TYPE_ICONS[quest.type]}</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {quest.game}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>· {fmtMins(quest.estimated_minutes)}</span>
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, lineHeight: 1.3, marginBottom: '3px' }}>{quest.title}</div>
            <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.4 }}>{quest.description}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end', flexShrink: 0 }}>
            <DifficultyBadge d={quest.difficulty} />
            <XPBadge xp={quest.xp_reward} />
          </div>
        </div>

        {quest.status === 'active' && (
          <div style={{ marginTop: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
              <span>Progress</span>
              <span>{localProgress}/{quest.target} ({pct}%)</span>
            </div>
            <div style={{ height: '6px', background: 'var(--line)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: pct >= 100 ? '#2e7d32' : 'var(--accent)', width: `${Math.min(100, pct)}%`, borderRadius: '3px', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{expanded ? '▲ hide' : '▼ details'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '14px 16px', background: 'var(--paper-2)', display: 'flex', flexDirection: 'column', gap: '14px' }} onClick={e => e.stopPropagation()}>
          {quest.status === 'active' && onProgress && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                Update Progress {saving && <span style={{ fontWeight: 400 }}>saving…</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="range" min={0} max={quest.target}
                  value={localProgress}
                  onChange={e => setLocalProgress(Number(e.target.value))}
                  onMouseUp={() => handleProgressChange(localProgress)}
                  onTouchEnd={() => handleProgressChange(localProgress)}
                  style={{ flex: 1, accentColor: 'var(--accent)' }}
                />
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    className="btn"
                    onClick={() => handleProgressChange(Math.max(0, localProgress - Math.ceil(quest.target / 10)))}
                    style={{ fontSize: '12px', padding: '5px 10px' }}
                  >−</button>
                  <button
                    className="btn"
                    onClick={() => handleProgressChange(Math.min(quest.target, localProgress + Math.ceil(quest.target / 10)))}
                    style={{ fontSize: '12px', padding: '5px 10px' }}
                  >+</button>
                </div>
              </div>
            </div>
          )}

          {/* Mini Log Panel — only for active quests */}
          {miniLogs !== undefined && (
            <MiniLogPanel
              miniLogs={miniLogs}
              onAdd={onAddMiniLog}
              onDelete={onDeleteMiniLog}
            />
          )}

          {/* AI Reasoning */}
          {quest.reasoning && (
            <details style={{ fontSize: '13px' }}>
              <summary style={{
                cursor: 'pointer', color: 'var(--muted)', fontWeight: 600,
                fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em',
                userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                <span>💭</span> Why this quest?
              </summary>
              <p style={{
                margin: '8px 0 0', lineHeight: 1.55, color: 'var(--muted)',
                background: 'var(--paper)', borderRadius: '6px',
                padding: '10px 12px', border: '1px solid var(--line)',
                fontSize: '13px',
              }}>
                {quest.reasoning}
              </p>
            </details>
          )}

          {/* Feedback */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Rate this quest:
            </span>
            <button
              onClick={() => handleFeedback(1)}
              disabled={feedbackSent}
              style={{
                background: feedback === 1 ? '#e8f5e9' : 'var(--paper)',
                border: `1px solid ${feedback === 1 ? '#2e7d32' : 'var(--line)'}`,
                color: feedback === 1 ? '#2e7d32' : 'var(--muted)',
                borderRadius: '6px', padding: '4px 12px', cursor: feedbackSent ? 'default' : 'pointer',
                fontSize: '14px', fontWeight: 600, transition: 'all 0.15s',
              }}
              title="This quest is great"
            >👍</button>
            <button
              onClick={() => handleFeedback(-1)}
              disabled={feedbackSent}
              style={{
                background: feedback === -1 ? '#fce4ec' : 'var(--paper)',
                border: `1px solid ${feedback === -1 ? '#c62828' : 'var(--line)'}`,
                color: feedback === -1 ? '#c62828' : 'var(--muted)',
                borderRadius: '6px', padding: '4px 12px', cursor: feedbackSent ? 'default' : 'pointer',
                fontSize: '14px', fontWeight: 600, transition: 'all 0.15s',
              }}
              title="Not for me"
            >👎</button>
            {feedbackSent && (
              <span style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>
                {feedback === 1 ? 'Got it — noted for next time ✓' : 'Got it — we\'ll avoid this style ✓'}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {onGuide && (
              <button className="btn soft" onClick={onGuide} style={{ fontSize: '12px', padding: '7px 12px' }}>
                ✨ Show Guide
              </button>
            )}
            {onComplete && (
              <button className="btn primary" onClick={onComplete} style={{ fontSize: '12px', padding: '7px 12px' }}>
                ✅ Complete Quest
              </button>
            )}
            {onAccept && (
              <button className="btn primary" onClick={onAccept} style={{ fontSize: '12px', padding: '7px 12px' }}>
                ⚔️ Accept Quest
              </button>
            )}
            {onReject && (
              <button className="btn" onClick={onReject} style={{ fontSize: '12px', padding: '7px 12px', color: 'var(--muted)' }}>
                ✕ Dismiss
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Game Group (collapsible) ─────────────────────────────────────────────────

function GameGroup({ game, count, children }: { game: string; count: number; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div>
      <button
        onClick={() => setCollapsed(v => !v)}
        style={{
          width: '100%', textAlign: 'left', background: 'var(--paper-2)',
          border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
          padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center',
          gap: '8px', marginBottom: collapsed ? 0 : '8px', fontFamily: 'inherit',
        }}
      >
        <span style={{ flex: 1, fontSize: '13px', fontWeight: 700 }}>🎮 {game}</span>
        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
          {count} quest{count !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '4px' }}>
          {collapsed ? '▶' : '▼'}
        </span>
      </button>
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Logs Dashboard ───────────────────────────────────────────────────────────

function LogsDashboard({ logs }: { logs: QuestLog[] }) {
  const totalXp = logs.reduce((s, l) => s + l.xp_earned, 0);
  const avgMins = logs.length
    ? Math.round(logs.reduce((s, l) => s + l.time_taken_minutes, 0) / logs.length)
    : 0;

  const gameCounts: Record<string, number> = {};
  for (const l of logs) gameCounts[l.game] = (gameCounts[l.game] ?? 0) + 1;
  const topGames = Object.entries(gameCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const stats = [
    { label: 'Completed', value: logs.length, color: '#2e7d32' },
    { label: 'Total XP', value: totalXp.toLocaleString(), color: '#6a1b9a' },
    { label: 'Avg Time', value: fmtMins(avgMins), color: '#e65100' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: 'var(--paper-2)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
            <strong style={{ display: 'block', fontSize: '20px', marginTop: '2px', color: s.color }}>{s.value}</strong>
          </div>
        ))}
      </div>

      {topGames.length > 0 && (
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '8px' }}>Top Games</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {topGames.map(([game, count]) => (
              <span key={game} style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '4px 10px', fontSize: '12px', fontWeight: 600 }}>
                {game} <span style={{ color: 'var(--accent)' }}>×{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {logs.length > 0 && (
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '8px' }}>Completion History</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {logs.map(log => (
              <div key={log.id} style={{
                display: 'flex', gap: '10px', alignItems: 'center',
                padding: '10px 12px',
                background: 'var(--paper)', border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)', flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>✅ {log.title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '1px' }}>{log.game}</div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                  <DifficultyBadge d={log.difficulty} />
                  <XPBadge xp={log.xp_earned} />
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{fmtMins(log.time_taken_minutes)}</span>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{new Date(log.completed_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {logs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted)' }}>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>🏆</div>
          <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>No completed quests yet</div>
          <div style={{ fontSize: '13px' }}>Complete active quests to earn XP and build your log.</div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const DIFFICULTY_OPTIONS: { label: string; value: string }[] = [
  { label: 'Easy', value: 'easy' },
  { label: 'Normal', value: 'medium' },
  { label: 'Hard', value: 'hard' },
  { label: 'Super Hard', value: 'legendary' },
];

export default function QuestsPage() {
  const [suggested, setSuggested] = useState<Quest[]>([]);
  const [active, setActive] = useState<Quest[]>([]);
  const [logs, setLogs] = useState<QuestLog[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [guideQuest, setGuideQuest] = useState<Quest | null>(null);
  const [completeQuest_, setCompleteQuest_] = useState<Quest | null>(null);
  const [tab, setTab] = useState<'inbox' | 'active' | 'logs'>('inbox');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('');
  const [miniLogs, setMiniLogs] = useState<Record<number, QuestMiniLog[]>>({});
  const [availableGames, setAvailableGames] = useState<string[]>([]);
  const [selectedGames, setSelectedGames] = useState<Set<string>>(new Set());
  const [gamePickerOpen, setGamePickerOpen] = useState(false);

  const reload = useCallback(async () => {
    const [s, a, l, p] = await Promise.all([
      fetchSuggestedQuests(),
      fetchActiveQuests(),
      fetchQuestLogs(),
      fetchUserProfile(),
    ]);
    setSuggested(s);
    setActive(a);
    setLogs(l);
    setProfile(p);
    if (a.length) {
      const mlEntries = await Promise.all(
        a.map(q => fetchMiniLogs(q.id).then(ml => [q.id, ml] as const))
      );
      setMiniLogs(Object.fromEntries(mlEntries));
    } else {
      setMiniLogs({});
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
    fetchGames().then(setAvailableGames);
  }, [reload]);

  const toggleGame = (game: string) => {
    setSelectedGames(prev => {
      const next = new Set(prev);
      if (next.has(game)) next.delete(game);
      else next.add(game);
      return next;
    });
  };

  const handleGenerate = async () => {
    setGenerating(true); setGenError('');
    setGamePickerOpen(false);
    try {
      const gamesArr = selectedGames.size > 0 ? Array.from(selectedGames) : undefined;
      await generateQuests(undefined, undefined, selectedDifficulty || undefined, gamesArr);
      await reload();
      setTab('inbox');
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleAddMiniLog = useCallback(async (questId: number, note: string) => {
    const log = await addMiniLog(questId, note);
    setMiniLogs(prev => ({ ...prev, [questId]: [...(prev[questId] ?? []), log] }));
  }, []);

  const handleDeleteMiniLog = useCallback(async (questId: number, logId: number) => {
    await deleteMiniLog(questId, logId);
    setMiniLogs(prev => ({ ...prev, [questId]: (prev[questId] ?? []).filter(l => l.id !== logId) }));
  }, []);

  const handleAccept = async (quest: Quest) => {
    await acceptQuest(quest.id);
    setSuggested(prev => prev.filter(q => q.id !== quest.id));
    setActive(prev => [{ ...quest, status: 'active', accepted_at: new Date().toISOString() }, ...prev]);
    setTab('active');
  };

  const handleReject = async (quest: Quest) => {
    // Optimistic: remove dismissed quest immediately so UX is instant
    setSuggested(prev => prev.filter(q => q.id !== quest.id));
    try {
      const { replacement } = await rejectQuest(quest.id);
      // Append replacement once AI generation completes
      if (replacement) {
        setSuggested(prev => [...prev, replacement]);
      }
    } catch (err) {
      console.error("Failed to reject quest:", err);
    }
  };

  const handleProgress = async (quest: Quest, value: number) => {
    const updated = await updateQuestProgress(quest.id, value);
    setActive(prev => prev.map(q => q.id === quest.id ? updated : q));
  };

  const handleCompleted = useCallback((log: QuestLog) => {
    setActive(prev => prev.filter(q => q.id !== log.quest_id));
    setLogs(prev => [log, ...prev]);
    setTab('logs');
  }, []);

  const totalXp = logs.reduce((s, l) => s + l.xp_earned, 0);

  const tabItems: { id: typeof tab; label: string; count?: number }[] = [
    { id: 'inbox', label: 'Inbox', count: suggested.length },
    { id: 'active', label: 'Active', count: active.length },
    { id: 'logs', label: 'Logs' },
  ];

  return (
    <>
      <style>{`
        .quest-tab-btn {
          background: none; border: none; cursor: pointer;
          font: inherit; font-size: 14px; font-weight: 600;
          color: var(--muted); padding: 9px 16px;
          border-bottom: 2px solid transparent;
          transition: color 0.12s;
          display: flex; align-items: center; gap: 6px;
        }
        .quest-tab-btn:hover { color: var(--text); }
        .quest-tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
        .quest-count-pill {
          background: var(--line); color: var(--muted);
          border-radius: 20px; font-size: 11px; font-weight: 700;
          padding: 1px 7px;
        }
        .quest-tab-btn.active .quest-count-pill {
          background: var(--accent); color: #fff;
        }
      `}</style>

      {guideQuest && <GuideModal quest={guideQuest} onClose={() => setGuideQuest(null)} />}
      {completeQuest_ && (
        <CompleteModal
          quest={completeQuest_}
          onClose={() => setCompleteQuest_(null)}
          onCompleted={handleCompleted}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Header */}
        <div style={{
          background: 'var(--paper)', border: '1px solid var(--line)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
          padding: '16px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>⚔️ AI Quest System</h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
              Personalized quests generated from your gaming history
              {totalXp > 0 && <> · <strong style={{ color: '#6a1b9a' }}>{totalXp.toLocaleString()} XP earned</strong></>}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
            {/* Difficulty filter pills */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {DIFFICULTY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedDifficulty(d => d === opt.value ? '' : opt.value)}
                  style={{
                    fontSize: '11px', padding: '4px 9px', borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${selectedDifficulty === opt.value ? 'var(--accent)' : 'var(--line)'}`,
                    background: selectedDifficulty === opt.value ? 'var(--accent)' : 'var(--paper-2)',
                    color: selectedDifficulty === opt.value ? '#fff' : 'var(--muted)',
                    cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                    transition: 'all 0.12s',
                  }}
                >{opt.label}</button>
              ))}
            </div>

            {/* Game filter toggle + generate */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {availableGames.length > 0 && (
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setGamePickerOpen(o => !o)}
                    style={{
                      fontSize: '12px', padding: '6px 11px', borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${selectedGames.size > 0 ? 'var(--accent)' : 'var(--line)'}`,
                      background: selectedGames.size > 0 ? '#f3e5f5' : 'var(--paper-2)',
                      color: selectedGames.size > 0 ? '#6a1b9a' : 'var(--muted)',
                      cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: '5px',
                    }}
                  >
                    🎮 {selectedGames.size > 0 ? `${selectedGames.size} game${selectedGames.size > 1 ? 's' : ''}` : 'All games'}
                    <span style={{ fontSize: '10px', opacity: 0.7 }}>{gamePickerOpen ? '▲' : '▼'}</span>
                  </button>
                  {gamePickerOpen && (
                    <div style={{
                      position: 'absolute', right: 0, bottom: 'calc(100% + 4px)', zIndex: 50,
                      background: 'var(--paper)', border: '1px solid var(--line)',
                      borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                      minWidth: '180px', maxWidth: '260px', padding: '8px 0',
                    }}>
                      <div style={{ padding: '4px 12px 8px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Filter by game</span>
                        {selectedGames.size > 0 && (
                          <button
                            onClick={() => setSelectedGames(new Set())}
                            style={{ fontSize: '11px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, padding: 0 }}
                          >Clear</button>
                        )}
                      </div>
                      <div style={{ maxHeight: '220px', overflowY: 'auto', padding: '4px 0' }}>
                        {availableGames.map(g => (
                          <label
                            key={g}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '8px',
                              padding: '6px 12px', cursor: 'pointer', fontSize: '13px',
                              background: selectedGames.has(g) ? 'var(--paper-2)' : 'transparent',
                              transition: 'background 0.1s',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedGames.has(g)}
                              onChange={() => toggleGame(g)}
                              style={{ accentColor: 'var(--accent)', width: '14px', height: '14px', flexShrink: 0 }}
                            />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g}</span>
                          </label>
                        ))}
                      </div>
                      {selectedGames.size === 0 && (
                        <div style={{ padding: '4px 12px 2px', fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
                          None selected = generate for all games
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <button
                className="btn primary"
                onClick={handleGenerate}
                disabled={generating}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {generating ? '⏳ Generating…' : '✨ Generate New Quests'}
              </button>
            </div>

            {selectedDifficulty && (
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                Forcing <strong>{DIFFICULTY_OPTIONS.find(o => o.value === selectedDifficulty)?.label}</strong> difficulty
              </div>
            )}
            {selectedGames.size > 0 && (
              <div style={{ fontSize: '11px', color: '#6a1b9a' }}>
                Targeting: <strong>{Array.from(selectedGames).join(', ')}</strong>
              </div>
            )}
            {genError && <div style={{ fontSize: '12px', color: '#c62828' }}>{genError}</div>}
          </div>
        </div>

        {/* AI Knows You — personality banner */}
        {profile?.personality_summary && (
          <div style={{
            background: 'linear-gradient(135deg, #f3e5f5 0%, #e8eaf6 100%)',
            border: '1px solid #ce93d8',
            borderRadius: 'var(--radius)',
            padding: '12px 16px',
            display: 'flex', alignItems: 'flex-start', gap: '12px',
          }}>
            <span style={{ fontSize: '22px', flexShrink: 0, lineHeight: 1 }}>🧠</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6a1b9a', marginBottom: '4px' }}>
                AI knows your playstyle
              </div>
              <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.55, color: '#4a148c' }}>
                {profile.personality_summary}
              </p>
              {(profile.preferred_types.length > 0 || profile.avoided_types.length > 0) && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                  {profile.preferred_types.map(t => (
                    <span key={t} style={{ background: '#e8f5e9', color: '#2e7d32', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px' }}>
                      ✓ {t}
                    </span>
                  ))}
                  {profile.avoided_types.map(t => (
                    <span key={t} style={{ background: '#fce4ec', color: '#c62828', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px' }}>
                      ✕ {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tabs + Content */}
        <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', padding: '0 8px', overflowX: 'auto' }}>
            {tabItems.map(t => (
              <button
                key={t.id}
                className={`quest-tab-btn${tab === t.id ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label === 'Inbox' ? 'Quest Inbox' : t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className="quest-count-pill">{t.count}</span>
                )}
              </button>
            ))}
          </div>

          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {loading && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: '14px' }}>
                Loading quests…
              </div>
            )}

            {/* ── Inbox ── */}
            {!loading && tab === 'inbox' && (
              <>
                {suggested.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted)' }}>
                    <div style={{ fontSize: '32px', marginBottom: '10px' }}>🗺️</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>Quest Inbox is empty</div>
                    <div style={{ fontSize: '13px', marginBottom: '16px' }}>
                      Click "Generate New Quests" to get AI-crafted quests based on your gaming history.
                    </div>
                    <button className="btn primary" onClick={handleGenerate} disabled={generating}>
                      {generating ? '⏳ Generating…' : '✨ Generate Quests'}
                    </button>
                  </div>
                ) : (() => {
                  const byGame = suggested.reduce<Record<string, Quest[]>>((acc, q) => {
                    (acc[q.game] ??= []).push(q); return acc;
                  }, {});
                  const games = Object.keys(byGame).sort();
                  const renderCard = (q: Quest) => (
                    <QuestCard
                      key={`inbox-${q.id}`} quest={q}
                      onAccept={() => handleAccept(q)}
                      onReject={() => handleReject(q)}
                      onGuide={() => setGuideQuest(q)}
                      onFeedback={() => fetchUserProfile().then(p => p && setProfile(p))}
                    />
                  );
                  return games.length <= 1
                    ? suggested.map(renderCard)
                    : games.map(game => (
                        <GameGroup key={game} game={game} count={byGame[game].length}>
                          {byGame[game].map(renderCard)}
                        </GameGroup>
                      ));
                })()}
              </>
            )}

            {/* ── Active ── */}
            {!loading && tab === 'active' && (
              <>
                {active.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted)' }}>
                    <div style={{ fontSize: '32px', marginBottom: '10px' }}>⚔️</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>No active quests</div>
                    <div style={{ fontSize: '13px' }}>Accept quests from your inbox to start tracking progress.</div>
                  </div>
                ) : (() => {
                  const byGame = active.reduce<Record<string, Quest[]>>((acc, q) => {
                    (acc[q.game] ??= []).push(q); return acc;
                  }, {});
                  const games = Object.keys(byGame).sort();
                  const renderCard = (q: Quest) => (
                    <QuestCard
                      key={`active-${q.id}`} quest={q}
                      onProgress={v => handleProgress(q, v)}
                      onComplete={() => setCompleteQuest_(q)}
                      onGuide={() => setGuideQuest(q)}
                      onFeedback={() => fetchUserProfile().then(p => p && setProfile(p))}
                      miniLogs={miniLogs[q.id] ?? []}
                      onAddMiniLog={note => handleAddMiniLog(q.id, note)}
                      onDeleteMiniLog={logId => handleDeleteMiniLog(q.id, logId)}
                    />
                  );
                  return games.length <= 1
                    ? active.map(renderCard)
                    : games.map(game => (
                        <GameGroup key={game} game={game} count={byGame[game].length}>
                          {byGame[game].map(renderCard)}
                        </GameGroup>
                      ));
                })()}
              </>
            )}

            {/* ── Logs ── */}
            {!loading && tab === 'logs' && <LogsDashboard logs={logs} />}
          </div>
        </div>
      </div>
    </>
  );
}
