import React, { useState } from 'react';
import { NeedsWorkItem, badgeFor } from '../lib/logParser';
import { YouTubeVideo, searchYouTubeGuides } from '../lib/api';

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K views`;
  return `${n} views`;
}

function statusHint(item: NeedsWorkItem): string {
  if (item.status === 'Needs attention') return 'beginner guide tips';
  if (item.status === 'Light progress') return 'tips tricks guide';
  if (item.status === 'On track') return 'advanced guide tips';
  return 'guide walkthrough';
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
  const [searchingFor, setSearchingFor] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, YouTubeVideo[]>>({});
  const [searchErr, setSearchErr] = useState<Record<string, boolean>>({});
  const [pasteGame, setPasteGame] = useState<string | null>(null);
  const [pasteUrl, setPasteUrl] = useState('');
  const [pasteSaving, setPasteSaving] = useState(false);

  const handleFindGuides = async (item: NeedsWorkItem) => {
    setSearchingFor(item.game);
    setSearchErr(prev => { const n = { ...prev }; delete n[item.game]; return n; });
    try {
      const videos = await searchYouTubeGuides(item.game, statusHint(item));
      if (videos === null || videos.length === 0) {
        setPasteGame(item.game);
        setPasteUrl('');
        if (videos === null) setSearchErr(prev => ({ ...prev, [item.game]: true }));
      } else {
        setResults(prev => ({ ...prev, [item.game]: videos }));
      }
    } catch {
      setPasteGame(item.game);
      setPasteUrl('');
      setSearchErr(prev => ({ ...prev, [item.game]: true }));
    } finally {
      setSearchingFor(null);
    }
  };

  const handlePickVideo = async (game: string, video: YouTubeVideo) => {
    const url = `https://www.youtube.com/watch?v=${video.id}`;
    await onSetGuide(game, url);
    setResults(prev => { const n = { ...prev }; delete n[game]; return n; });
    setPlayerOpen(game);
  };

  const handlePasteSave = async (game: string) => {
    if (!pasteUrl.trim()) return;
    const m = pasteUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
    if (!m) { alert('Paste a valid YouTube URL'); return; }
    setPasteSaving(true);
    try {
      await onSetGuide(game, pasteUrl.trim());
      setPasteGame(null);
      setPasteUrl('');
      setPlayerOpen(game);
    } finally {
      setPasteSaving(false);
    }
  };

  const handleRemove = async (game: string) => {
    await onDeleteGuide(game);
    setPlayerOpen(null);
    setResults(prev => { const n = { ...prev }; delete n[game]; return n; });
  };

  return (
    <>
      <style>{`
        .nw-card {
          border: 1px solid var(--soft-line);
          border-radius: 12px;
          background: #fffdfa;
          padding: 12px;
        }
        .nw-card-hold { background: #faf8ff; opacity: 0.88; }
        .nw-guide-section {
          margin-top: 10px;
          border-top: 1px solid var(--soft-line);
          padding-top: 10px;
        }
        .nw-video-scroll {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          padding-bottom: 6px;
          scrollbar-width: thin;
          margin-top: 8px;
        }
        .nw-video-card {
          flex: 0 0 160px;
          border: 1px solid var(--soft-line);
          border-radius: 10px;
          background: var(--paper);
          cursor: pointer;
          overflow: hidden;
          transition: box-shadow 0.15s, transform 0.15s;
        }
        .nw-video-card:hover {
          box-shadow: 0 4px 14px rgba(0,0,0,0.12);
          transform: translateY(-1px);
        }
        .nw-video-thumb {
          width: 100%;
          aspect-ratio: 16/9;
          object-fit: cover;
          display: block;
        }
        .nw-video-info {
          padding: 7px 8px 8px;
        }
        .nw-video-title {
          font-size: 12px;
          font-weight: 600;
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin-bottom: 4px;
        }
        .nw-video-meta {
          font-size: 11px;
          color: var(--muted);
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .nw-video-duration {
          background: #111;
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          padding: 1px 5px;
          border-radius: 4px;
        }
        .nw-embed {
          margin-top: 10px;
          border-radius: 10px;
          overflow: hidden;
          aspect-ratio: 16/9;
        }
        .nw-embed iframe {
          display: block;
          width: 100%;
          height: 100%;
          border: none;
        }
        .nw-spinner {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--muted);
          padding: 4px 0;
        }
        .nw-spinner-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--accent);
          animation: nw-pulse 1s ease-in-out infinite;
        }
        .nw-spinner-dot:nth-child(2) { animation-delay: 0.2s; }
        .nw-spinner-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes nw-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
        .nw-paste-row {
          display: flex; gap: 6px; align-items: center;
          margin-top: 8px; flex-wrap: wrap;
        }
        .nw-paste-input {
          flex: 1; min-width: 160px; font-size: 13px;
          border: 1px solid var(--line); border-radius: 8px;
          padding: 5px 10px; background: var(--paper); font-family: inherit;
        }
      `}</style>
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
            <div className="mini">Based on last 28 days — click a thumbnail to add a guide</div>
          </div>
          <button
            className="btn soft"
            onClick={onOpenLibrary}
            style={{ fontSize: '12px', padding: '4px 12px', flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            All games ↗
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.length === 0 ? (
            <div className="nw-card">Add more logs to generate suggestions.</div>
          ) : items.map(item => {
            const isManual = manualCompletions.has(item.game);
            const isOnHold = paused.has(item.game);
            const isCompleted = item.status === 'Completed or parked';
            const isActive = !isCompleted && !isOnHold;
            const guideUrl = guides[item.game];
            const videoId = guideUrl?.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)?.[1];
            const isSearching = searchingFor === item.game;
            const videoResults = results[item.game] || [];
            const hasResults = videoResults.length > 0;
            const isPlayerOpen = playerOpen === item.game;
            const isPasting = pasteGame === item.game;
            const err = searchErr[item.game];

            return (
              <div key={item.game} className={`nw-card${isOnHold ? ' nw-card-hold' : ''}`}>

                {/* Header */}
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
                        style={{ fontSize: '12px', padding: '3px 10px' }}>
                        Resume ▶
                      </button>
                    )}
                    {isManual && (
                      <button className="btn soft" onClick={() => onToggleCompletion(item.game)}
                        style={{ fontSize: '12px', padding: '3px 10px', color: 'var(--muted)' }}>
                        Unmark
                      </button>
                    )}
                    {isActive && (
                      <>
                        <button className="btn soft" onClick={() => onTogglePaused(item.game)}
                          style={{ fontSize: '12px', padding: '3px 10px', color: 'var(--muted)' }}>
                          Put down
                        </button>
                        <button className="btn soft" onClick={() => onToggleCompletion(item.game)}
                          style={{ fontSize: '12px', padding: '3px 10px' }}>
                          Mark done ✓
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Guide section */}
                <div className="nw-guide-section">

                  {/* Saved guide — show controls + player */}
                  {videoId && !hasResults && !isPasting && (
                    <>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button className="btn soft" onClick={() => setPlayerOpen(isPlayerOpen ? null : item.game)}
                          style={{ fontSize: '12px', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ fontSize: '14px' }}>▶</span>
                          {isPlayerOpen ? 'Hide guide' : 'Watch guide'}
                        </button>
                        <button className="btn soft" onClick={() => handleFindGuides(item)}
                          style={{ fontSize: '12px', padding: '3px 10px', color: 'var(--muted)' }}
                          disabled={isSearching}>
                          Change guide
                        </button>
                        <button className="btn soft" onClick={() => handleRemove(item.game)}
                          style={{ fontSize: '12px', padding: '3px 10px', color: 'var(--muted)' }}>
                          ✕
                        </button>
                      </div>
                      {isPlayerOpen && (
                        <div className="nw-embed">
                          <iframe
                            src={`https://www.youtube.com/embed/${videoId}`}
                            title={`Guide for ${item.game}`}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      )}
                    </>
                  )}

                  {/* No guide yet — find or paste */}
                  {!videoId && !hasResults && !isPasting && !isSearching && !err && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button className="btn soft" onClick={() => handleFindGuides(item)}
                        style={{ fontSize: '12px', padding: '3px 12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span>🔍</span> Find YouTube guides
                      </button>
                      <button onClick={() => { setPasteGame(item.game); setPasteUrl(''); }}
                        style={{ fontSize: '12px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                        paste URL
                      </button>
                    </div>
                  )}

                  {/* Loading */}
                  {isSearching && (
                    <div className="nw-spinner">
                      <div className="nw-spinner-dot" />
                      <div className="nw-spinner-dot" />
                      <div className="nw-spinner-dot" />
                      <span>Finding guides for {item.game}…</span>
                    </div>
                  )}


                  {/* Video results grid */}
                  {hasResults && !isPasting && (
                    <>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Pick a guide to embed it</span>
                        <button onClick={() => setResults(prev => { const n = { ...prev }; delete n[item.game]; return n; })}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '12px', padding: 0 }}>
                          dismiss ✕
                        </button>
                      </div>
                      <div className="nw-video-scroll">
                        {videoResults.map(video => (
                          <div
                            key={video.id}
                            className="nw-video-card"
                            onClick={() => handlePickVideo(item.game, video)}
                            title={video.title}
                          >
                            <div style={{ position: 'relative' }}>
                              <img
                                className="nw-video-thumb"
                                src={video.thumbnail}
                                alt={video.title}
                                loading="lazy"
                                onError={e => { (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`; }}
                              />
                              {video.duration && (
                                <span className="nw-video-duration" style={{ position: 'absolute', bottom: '4px', right: '4px' }}>
                                  {video.duration}
                                </span>
                              )}
                            </div>
                            <div className="nw-video-info">
                              <div className="nw-video-title">{video.title}</div>
                              {video.views > 0 && (
                                <div className="nw-video-meta">{fmtViews(video.views)}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => { setPasteGame(item.game); setPasteUrl(''); setResults(prev => { const n = { ...prev }; delete n[item.game]; return n; }); }}
                        style={{ marginTop: '6px', fontSize: '12px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                        paste a URL instead
                      </button>
                    </>
                  )}

                  {/* Paste URL fallback */}
                  {isPasting && (
                    <>
                      {err && (
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>
                          YouTube search isn't available right now — paste a link below instead.
                        </div>
                      )}
                      <div className="nw-paste-row">
                        <input
                          className="nw-paste-input"
                          type="url"
                          placeholder="https://youtube.com/watch?v=..."
                          value={pasteUrl}
                          onChange={e => setPasteUrl(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handlePasteSave(item.game);
                            if (e.key === 'Escape') {
                              setPasteGame(null);
                              setSearchErr(prev => { const n = { ...prev }; delete n[item.game]; return n; });
                            }
                          }}
                          autoFocus
                        />
                        <button className="btn primary" onClick={() => handlePasteSave(item.game)}
                          disabled={pasteSaving} style={{ fontSize: '12px', padding: '5px 12px' }}>
                          {pasteSaving ? '…' : 'Save'}
                        </button>
                        <button className="btn soft" onClick={() => {
                          setPasteGame(null);
                          setSearchErr(prev => { const n = { ...prev }; delete n[item.game]; return n; });
                        }} style={{ fontSize: '12px', padding: '5px 10px' }}>
                          Cancel
                        </button>
                      </div>
                    </>
                  )}

                </div>
              </div>
            );
          })}
        </div>
      </article>
    </>
  );
}
