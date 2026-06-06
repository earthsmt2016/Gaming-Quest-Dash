import React, { useState, useEffect, useCallback } from 'react';

const BASE = `${import.meta.env.BASE_URL}api`;

interface RadarGame {
  id: number;
  name: string;
  slug: string | null;
  description: string | null;
  release_date: string | null;
  cover_url: string | null;
  genres: string[];
  platforms: string[];
  metacritic: number | null;
  ai_match_score: 'strong' | 'good' | 'maybe' | 'unlikely' | null;
  ai_match_reason: string | null;
  added_at: string;
}

const MATCH_CONFIG = {
  strong:   { label: '🔥 Strong match',  color: '#16a34a', bg: 'rgba(22,163,74,0.1)',  border: 'rgba(22,163,74,0.25)' },
  good:     { label: '👍 Good match',    color: '#0891b2', bg: 'rgba(8,145,178,0.1)',  border: 'rgba(8,145,178,0.25)' },
  maybe:    { label: '🤔 Might work',    color: '#d97706', bg: 'rgba(217,119,6,0.1)',  border: 'rgba(217,119,6,0.25)' },
  unlikely: { label: '😐 Not for you',  color: '#6b7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.2)' },
};

function ytSearchUrl(name: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(name + ' official trailer gameplay')}`;
}
function newsUrl(name: string) {
  return `https://news.google.com/search?q=${encodeURIComponent(name + ' game release')}`;
}
function fmtDate(d: string | null) {
  if (!d) return 'TBA';
  try {
    return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return d; }
}

// Platform abbreviations for badges
function platBadge(p: string) {
  if (/xbox/i.test(p))        return { label: 'Xbox',  color: '#107c10' };
  if (/playstation|ps[45]/i.test(p)) return { label: 'PS',   color: '#003087' };
  if (/switch/i.test(p))      return { label: 'Switch',color: '#e60012' };
  if (/pc|windows/i.test(p))  return { label: 'PC',    color: '#555' };
  if (/ios|iphone|ipad/i.test(p)) return { label: 'iOS',  color: '#555' };
  if (/android/i.test(p))     return { label: 'Android',color: '#3ddc84' };
  if (/mac/i.test(p))         return { label: 'Mac',   color: '#555' };
  return { label: p.slice(0, 8), color: '#555' };
}

// Deduplicate platforms into a short list
function dedupPlatforms(platforms: string[]) {
  const seen = new Set<string>();
  const out: { label: string; color: string }[] = [];
  for (const p of platforms) {
    const b = platBadge(p);
    if (!seen.has(b.label)) { seen.add(b.label); out.push(b); }
    if (out.length >= 5) break;
  }
  return out;
}

function MatchBadge({ score }: { score: RadarGame['ai_match_score'] }) {
  const cfg = score ? MATCH_CONFIG[score] : MATCH_CONFIG.maybe;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700,
      color: cfg.color,
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      borderRadius: 20, padding: '3px 10px',
      display: 'inline-block',
    }}>
      {cfg.label}
    </span>
  );
}

function GameCard({
  game, onRemove, onRefresh, onDateChange,
}: {
  game: RadarGame;
  onRemove: () => void;
  onRefresh: () => void;
  onDateChange: (id: number, date: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [dateInput, setDateInput] = useState(game.release_date ?? '');
  const [savingDate, setSavingDate] = useState(false);
  const platforms = dedupPlatforms(game.platforms);

  const handleSaveDate = async () => {
    setSavingDate(true);
    try {
      const r = await fetch(`${BASE}/radar/${game.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ release_date: dateInput || null }),
      });
      if (r.ok) {
        onDateChange(game.id, dateInput || null);
        setEditingDate(false);
      }
    } finally { setSavingDate(false); }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };
  const handleRemove = async () => {
    setRemoving(true);
    await onRemove();
  };

  return (
    <div style={{
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius)',
      background: 'var(--paper)',
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      opacity: removing ? 0.4 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Cover */}
      {game.cover_url ? (
        <div style={{
          width: '100%', paddingBottom: '45%',
          position: 'relative', overflow: 'hidden',
          background: 'var(--paper-2)',
        }}>
          <img
            src={game.cover_url}
            alt={game.name}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'cover',
            }}
          />
        </div>
      ) : (
        <div style={{
          width: '100%', paddingBottom: '30%',
          background: 'linear-gradient(135deg, var(--paper-2) 0%, var(--soft-line) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32,
          position: 'relative',
        }}>
          <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>🎮</span>
        </div>
      )}

      {/* Body */}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>

        {/* Name + match */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', flex: 1, minWidth: 0, lineHeight: 1.25 }}>
            {game.name}
          </div>
          <MatchBadge score={game.ai_match_score} />
        </div>

        {/* Release date + metacritic */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {editingDate ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <input
                type="date"
                value={dateInput}
                onChange={e => setDateInput(e.target.value)}
                autoFocus
                style={{
                  fontSize: 12, fontFamily: 'inherit', padding: '2px 6px',
                  border: '1px solid var(--accent)', borderRadius: 4,
                  background: 'var(--paper)', color: 'var(--ink)',
                }}
              />
              <button
                onClick={handleSaveDate}
                disabled={savingDate}
                style={{
                  fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                  background: 'var(--accent)', color: '#fff', border: 'none',
                  borderRadius: 4, padding: '3px 8px', cursor: 'pointer',
                }}
              >{savingDate ? '…' : '✓'}</button>
              <button
                onClick={() => { setEditingDate(false); setDateInput(game.release_date ?? ''); }}
                style={{
                  fontSize: 11, fontFamily: 'inherit', background: 'none',
                  border: '1px solid var(--line)', borderRadius: 4,
                  padding: '3px 6px', cursor: 'pointer', color: 'var(--muted)',
                }}
              >✕</button>
            </div>
          ) : (
            <span
              onClick={() => setEditingDate(true)}
              title="Click to edit release date"
              style={{
                fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center',
                gap: 4, cursor: 'pointer',
              }}
            >
              📅 {fmtDate(game.release_date)}
              <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 1 }}>✏️</span>
            </span>
          )}
          {game.metacritic && (
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: game.metacritic >= 75 ? '#16a34a' : game.metacritic >= 50 ? '#d97706' : '#dc2626',
              background: game.metacritic >= 75 ? 'rgba(22,163,74,0.1)' : game.metacritic >= 50 ? 'rgba(217,119,6,0.1)' : 'rgba(220,38,38,0.1)',
              borderRadius: 6, padding: '2px 7px',
            }}>
              MC {game.metacritic}
            </span>
          )}
        </div>

        {/* Genre tags */}
        {game.genres.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {game.genres.slice(0, 5).map(g => (
              <span key={g} style={{
                fontSize: 10, color: 'var(--muted)',
                background: 'var(--paper-2)',
                border: '1px solid var(--soft-line)',
                borderRadius: 4, padding: '2px 7px',
              }}>{g}</span>
            ))}
          </div>
        )}

        {/* Platform badges */}
        {platforms.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {platforms.map(p => (
              <span key={p.label} style={{
                fontSize: 10, fontWeight: 700,
                color: '#fff',
                background: p.color,
                borderRadius: 4, padding: '2px 7px',
              }}>{p.label}</span>
            ))}
          </div>
        )}

        {/* AI match reason */}
        {game.ai_match_reason && (
          <div style={{
            fontSize: 12, color: 'var(--ink)', lineHeight: 1.5,
            background: 'var(--paper-2)',
            border: '1px solid var(--soft-line)',
            borderLeft: `3px solid ${game.ai_match_score ? MATCH_CONFIG[game.ai_match_score]?.color : 'var(--accent)'}`,
            borderRadius: 'var(--radius-sm)',
            padding: '8px 10px',
          }}>
            {game.ai_match_reason}
          </div>
        )}

        {/* Description (collapsible) */}
        {game.description && (
          <div>
            <p style={{
              fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, margin: 0,
              display: '-webkit-box', WebkitBoxOrient: 'vertical',
              WebkitLineClamp: expanded ? 999 : 3,
              overflow: 'hidden',
            }}>
              {game.description}
            </p>
            {game.description.length > 200 && (
              <button
                onClick={() => setExpanded(e => !e)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--accent)', fontWeight: 600, padding: '3px 0 0', fontFamily: 'inherit' }}
              >
                {expanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'auto', paddingTop: 4 }}>
          <a
            href={ytSearchUrl(game.name)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 700,
              color: '#fff', background: '#ff0000',
              borderRadius: 6, padding: '5px 10px',
              textDecoration: 'none',
            }}
          >
            ▶ Trailer
          </a>
          <a
            href={newsUrl(game.name)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 700,
              color: 'var(--ink)', background: 'var(--paper-2)',
              border: '1px solid var(--line)',
              borderRadius: 6, padding: '5px 10px',
              textDecoration: 'none',
            }}
          >
            📰 News
          </a>
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(game.name + ' game review')}#ip=1`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 700,
              color: 'var(--ink)', background: 'var(--paper-2)',
              border: '1px solid var(--line)',
              borderRadius: 6, padding: '5px 10px',
              textDecoration: 'none',
            }}
          >
            🔍 Reviews
          </a>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Re-run AI match analysis"
            style={{
              fontSize: 11, fontWeight: 700,
              color: 'var(--accent)', background: 'none',
              border: '1px solid var(--line)',
              borderRadius: 6, padding: '5px 9px',
              cursor: refreshing ? 'default' : 'pointer',
              fontFamily: 'inherit',
              opacity: refreshing ? 0.5 : 1,
            }}
          >
            {refreshing ? '…' : '↻'}
          </button>
          <button
            onClick={handleRemove}
            disabled={removing}
            title="Remove from radar"
            style={{
              fontSize: 11, fontWeight: 700,
              color: 'var(--danger)', background: 'none',
              border: '1px solid var(--line)',
              borderRadius: 6, padding: '5px 9px',
              cursor: removing ? 'default' : 'pointer',
              fontFamily: 'inherit',
              opacity: removing ? 0.4 : 1,
            }}
          >
            🗑
          </button>
        </div>
      </div>
    </div>
  );
}

type Filter = 'all' | 'strong' | 'good' | 'maybe' | 'unlikely';

export default function RadarPage() {
  const [games, setGames] = useState<RadarGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/radar`);
      if (r.ok) setGames(await r.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const name = search.trim();
    if (!name) return;
    setAdding(true);
    setAddError('');
    try {
      const r = await fetch(`${BASE}/radar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (r.status === 409) { setAddError(`"${name}" is already on your radar`); setAdding(false); return; }
      if (!r.ok) throw new Error(`Failed (${r.status})`);
      const game = await r.json();
      setGames(prev => [game, ...prev]);
      setSearch('');
    } catch (e: any) {
      setAddError(e.message ?? 'Failed to add game');
    } finally { setAdding(false); }
  };

  const handleRemove = async (id: number) => {
    await fetch(`${BASE}/radar/${id}`, { method: 'DELETE' });
    setGames(prev => prev.filter(g => g.id !== id));
  };

  const handleRefresh = async (id: number) => {
    const r = await fetch(`${BASE}/radar/${id}/refresh`, { method: 'POST' });
    if (r.ok) {
      const updated = await r.json();
      setGames(prev => prev.map(g => g.id === id ? updated : g));
    }
  };

  const handleDateChange = (id: number, date: string | null) => {
    setGames(prev => prev.map(g => g.id === id ? { ...g, release_date: date } : g));
  };

  const filtered = filter === 'all' ? games : games.filter(g => g.ai_match_score === filter);

  const counts: Record<string, number> = {};
  for (const g of games) counts[g.ai_match_score ?? 'maybe'] = (counts[g.ai_match_score ?? 'maybe'] ?? 0) + 1;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 0 40px' }}>
      <style>{`
        .radar-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }
        @media (max-width: 480px) {
          .radar-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Header */}
      <div style={{
        background: 'var(--paper)',
        borderBottom: '1px solid var(--line)',
        padding: '20px 20px 16px',
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', marginBottom: 3 }}>🎯 Game Radar</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Track upcoming & new releases — AI checks if they fit your taste
            </div>
          </div>
          {games.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>
              {games.length} game{games.length !== 1 ? 's' : ''} tracked
            </div>
          )}
        </div>

        {/* Search / add bar */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="Search a game to add… e.g. GTA VI, Hollow Knight 2"
            style={{
              flex: 1,
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-sm)',
              padding: '9px 12px',
              fontSize: 13,
              background: 'var(--paper-2)',
              color: 'var(--ink)',
              fontFamily: 'inherit',
            }}
            disabled={adding}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !search.trim()}
            className="btn primary"
            style={{ minWidth: 100, fontSize: 13, opacity: adding || !search.trim() ? 0.65 : 1 }}
          >
            {adding ? '⚙️ Adding…' : '+ Add'}
          </button>
        </div>

        {adding && (
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⚙️</span>
            Fetching game info + running AI match analysis… this takes a few seconds
          </div>
        )}
        {addError && (
          <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>{addError}</div>
        )}
      </div>

      <div style={{ padding: '0 20px' }}>
        {/* Filter tabs */}
        {games.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {(['all', 'strong', 'good', 'maybe', 'unlikely'] as Filter[]).map(f => {
              const active = filter === f;
              const count = f === 'all' ? games.length : counts[f] ?? 0;
              if (f !== 'all' && count === 0) return null;
              const cfg = f !== 'all' ? MATCH_CONFIG[f] : null;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    fontSize: 11, fontWeight: 700,
                    padding: '5px 12px',
                    borderRadius: 20,
                    border: `1px solid ${active && cfg ? cfg.border : 'var(--line)'}`,
                    background: active && cfg ? cfg.bg : active ? 'var(--accent-soft)' : 'var(--paper)',
                    color: active && cfg ? cfg.color : active ? 'var(--accent)' : 'var(--muted)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.12s',
                  }}
                >
                  {f === 'all' ? `All (${count})` : `${MATCH_CONFIG[f].label} (${count})`}
                </button>
              );
            })}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)', fontSize: 14 }}>
            Loading radar…
          </div>
        )}

        {/* Empty state */}
        {!loading && games.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Nothing on the radar yet</div>
            <div style={{ fontSize: 13 }}>
              Search for an upcoming or recently released game above.<br />
              The AI will fetch its details and tell you if it's a match.
            </div>
          </div>
        )}

        {/* No results for filter */}
        {!loading && games.length > 0 && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 13 }}>
            No {filter} match games tracked.
          </div>
        )}

        {/* Game grid */}
        {filtered.length > 0 && (
          <div className="radar-grid">
            {filtered.map(game => (
              <GameCard
                key={game.id}
                game={game}
                onRemove={() => handleRemove(game.id)}
                onRefresh={() => handleRefresh(game.id)}
                onDateChange={handleDateChange}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
