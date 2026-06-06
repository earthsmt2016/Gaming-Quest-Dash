import React, { useState, useMemo } from 'react';
import { LogEntry } from '../lib/logParser';

const CREDITS_RE = /saw the credits|finished the game|completed the main.?run|rolled credits/i;

type GameStatus = 'Needs attention' | 'Light progress' | 'On track' | 'Stalled' | 'On hold' | 'Completed';
type FilterTab = 'active' | 'hold' | 'done' | 'all';

export const PLATFORMS: { id: string; label: string; icon: string; mode?: 'mobile' | 'xbox' }[] = [
  { id: 'mobile_paid',   label: 'Mobile (Paid)',   icon: '📱', mode: 'mobile' },
  { id: 'apple_arcade',  label: 'Apple Arcade',    icon: '🍏', mode: 'mobile' },
  { id: 'xbox_paid',     label: 'Xbox (Paid)',      icon: '🎮', mode: 'xbox'   },
  { id: 'xbox_gamepass', label: 'Xbox Game Pass',   icon: '☁️', mode: 'xbox'   },
  { id: 'playstation',   label: 'PlayStation',      icon: '🕹️' },
  { id: 'switch',        label: 'Switch',           icon: '🕹️' },
  { id: 'pc',            label: 'PC / Steam',       icon: '💻' },
];

interface GameData {
  game: string;
  status: GameStatus;
  priorityLabel: string;
  daysSince: number;
  timeThisWeek: number;
  totalMinutes: number;
  sessions: number;
  isManual: boolean;
}

const STATUS_ORDER: Record<GameStatus, number> = {
  'Needs attention': 0, 'Light progress': 1, 'On track': 2,
  'Stalled': 3, 'On hold': 4, 'Completed': 5,
};

const STATUS_STYLE: Record<GameStatus, { color: string; bg: string }> = {
  'Needs attention': { color: '#b71c1c', bg: '#ffebee' },
  'Light progress':  { color: '#bf360c', bg: '#fbe9e7' },
  'On track':        { color: '#1b5e20', bg: '#e8f5e9' },
  'Stalled':         { color: '#424242', bg: '#f5f5f5' },
  'On hold':         { color: '#311b92', bg: '#ede7f6' },
  'Completed':       { color: '#33691e', bg: '#f1f8e9' },
};

function fmtMins(m: number): string {
  if (m === 0) return '—';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function computeGames(
  logs: LogEntry[],
  completions: Set<string>,
  paused: Set<string>,
): GameData[] {
  const now = new Date();
  const dayNum = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (dayNum === 0 ? 6 : dayNum - 1));
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const allGames = [...new Set(logs.map(l => l.game))];

  return allGames.map(game => {
    const gameLogs = logs.filter(l => l.game === game);
    const weekLogs = gameLogs.filter(l => l.date >= weekStart && l.date <= weekEnd);
    const timeThisWeek = weekLogs.reduce((s, l) => s + l.minutes, 0);
    const totalMinutes = gameLogs.reduce((s, l) => s + l.minutes, 0);
    const sorted = [...gameLogs].sort((a, b) => b.date.getTime() - a.date.getTime());
    const lastLog = sorted[0];
    const daysSince = lastLog
      ? Math.floor((now.getTime() - lastLog.date.getTime()) / 86400000)
      : 999;
    const isManual = completions.has(game);
    const types = new Set(gameLogs.map(l => l.type));
    const isAutoCompleted = gameLogs.some(l => CREDITS_RE.test(l.action));
    const isCompleted = isAutoCompleted || isManual;
    const isOnHold = paused.has(game);

    let priorityLabel = '';
    if (!isCompleted && !isOnHold) {
      if (lastLog?.type === 'boss') priorityLabel = '🔥 Boss fight reached';
      else if (types.has('purchase') && !types.has('progress') && !types.has('rank-up'))
        priorityLabel = '✨ Just started';
      else if (types.has('rank-up') && !types.has('progress'))
        priorityLabel = '🏆 Competitive ranked';
      else if (types.has('progress'))
        priorityLabel = '📖 Active story run';
    }

    let status: GameStatus;
    if (isCompleted) status = 'Completed';
    else if (isOnHold) status = 'On hold';
    else if (daysSince > 28) status = 'Stalled';
    else if (timeThisWeek === 0) status = 'Needs attention';
    else if (timeThisWeek < 30) status = 'Light progress';
    else status = 'On track';

    return {
      game, status, priorityLabel, daysSince, timeThisWeek,
      totalMinutes, sessions: gameLogs.length, isManual,
    };
  }).sort((a, b) => {
    const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    return so !== 0 ? so : a.daysSince - b.daysSince;
  });
}

const TABS: { id: FilterTab; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'hold',   label: 'On Hold' },
  { id: 'done',   label: 'Completed' },
  { id: 'all',    label: 'All' },
];

interface GamesPageProps {
  logs: LogEntry[];
  completions: Set<string>;
  paused: Set<string>;
  platforms: Record<string, string>;
  onToggleCompletion: (game: string) => void;
  onTogglePaused: (game: string) => void;
  onSetPlatform: (game: string, platform: string) => void;
  onOpenLibrary: () => void;
}

export default function GamesPage({
  logs, completions, paused, platforms,
  onToggleCompletion, onTogglePaused, onSetPlatform, onOpenLibrary,
}: GamesPageProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('active');

  const allGames = useMemo(
    () => computeGames(logs, completions, paused),
    [logs, completions, paused],
  );

  const visible = useMemo(() => {
    switch (activeTab) {
      case 'active': return allGames.filter(g => g.status !== 'On hold' && g.status !== 'Completed');
      case 'hold':   return allGames.filter(g => g.status === 'On hold');
      case 'done':   return allGames.filter(g => g.status === 'Completed');
      default:       return allGames;
    }
  }, [allGames, activeTab]);

  const counts = useMemo(() => ({
    active: allGames.filter(g => g.status !== 'On hold' && g.status !== 'Completed').length,
    hold:   allGames.filter(g => g.status === 'On hold').length,
    done:   allGames.filter(g => g.status === 'Completed').length,
    all:    allGames.length,
  }), [allGames]);

  return (
    <>
      <style>{`
        .gp-tab-bar {
          display: flex;
          gap: 0;
          border-bottom: 1px solid var(--line);
          margin-bottom: 2px;
        }
        .gp-tab {
          background: none; border: none; cursor: pointer;
          padding: 9px 16px; font: inherit; font-size: 14px;
          color: var(--muted);
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          transition: color 0.12s;
          white-space: nowrap;
        }
        .gp-tab:hover { color: var(--text); }
        .gp-tab.active {
          color: var(--accent);
          font-weight: 700;
          border-bottom-color: var(--accent);
        }
        .gp-count {
          font-size: 11px;
          color: var(--muted);
          margin-left: 4px;
          font-weight: 400;
        }
        .gp-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 12px;
          margin-top: 14px;
        }
        .gp-card {
          border: 1px solid var(--soft-line);
          border-radius: 12px;
          background: #fffef9;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .gp-card-hold { opacity: 0.8; background: #faf8ff; }
        .gp-card-done { opacity: 0.75; background: #f7fbf4; }
        .gp-card-head {
          display: flex; justify-content: space-between;
          align-items: flex-start; gap: 8px; margin-bottom: 6px;
        }
        .gp-game-name {
          font-weight: 700; font-size: 15px; line-height: 1.3;
        }
        .gp-status-badge {
          font-size: 11px; font-weight: 700;
          border-radius: 4px; padding: 2px 7px;
          white-space: nowrap; flex-shrink: 0;
        }
        .gp-priority {
          font-size: 12px; color: var(--accent);
          font-weight: 600; margin-bottom: 8px;
        }
        .gp-meta {
          display: flex; gap: 12px; flex-wrap: wrap;
          font-size: 12px; color: var(--muted);
          margin-bottom: 10px;
        }
        .gp-meta-val { font-weight: 600; color: var(--text); }
        .gp-actions {
          display: flex; gap: 6px; flex-wrap: wrap;
          margin-top: 2px;
        }
        .gp-empty {
          padding: 32px 0; text-align: center;
          color: var(--muted); font-size: 14px;
        }
        .gp-platform-badge {
          display: inline-flex; align-items: center; gap: 3px;
          font-size: 11px; font-weight: 600;
          background: var(--paper-2); border: 1px solid var(--line);
          border-radius: 20px; padding: 2px 8px;
          color: var(--text); white-space: nowrap;
        }
        .gp-platform-select {
          font: inherit; font-size: 11px;
          background: var(--paper-2); border: 1px solid var(--line);
          border-radius: 20px; padding: 2px 6px;
          color: var(--muted); cursor: pointer;
          outline: none;
        }
        .gp-platform-select:hover { border-color: var(--accent); color: var(--text); }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', marginBottom: '12px' }}>
        <div>
          <h2 style={{ margin: '0 0 2px', fontSize: '20px' }}>Games</h2>
          <div className="mini">All games tracked across your quest log</div>
        </div>
        <button
          className="btn soft"
          onClick={onOpenLibrary}
          style={{ fontSize: '12px', padding: '4px 12px', flexShrink: 0 }}
        >
          Manage library ↗
        </button>
      </div>

      {/* Filter tabs */}
      <div className="gp-tab-bar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`gp-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            <span className="gp-count">({counts[tab.id]})</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="gp-empty">No games in this category.</div>
      ) : (
        <div className="gp-grid">
          {visible.map(g => {
            const st = STATUS_STYLE[g.status];
            const isActive = g.status !== 'On hold' && g.status !== 'Completed';
            const isOnHold = g.status === 'On hold';
            return (
              <div
                key={g.game}
                className={`gp-card${isOnHold ? ' gp-card-hold' : g.status === 'Completed' ? ' gp-card-done' : ''}`}
              >
                <div className="gp-card-head">
                  <span className="gp-game-name">{g.game}</span>
                  <span
                    className="gp-status-badge"
                    style={{ color: st.color, background: st.bg }}
                  >
                    {g.status}
                  </span>
                </div>

                {/* Platform row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  {platforms[g.game] ? (
                    <>
                      <span className="gp-platform-badge">
                        {PLATFORMS.find(p => p.id === platforms[g.game])?.icon}{' '}
                        {PLATFORMS.find(p => p.id === platforms[g.game])?.label ?? platforms[g.game]}
                      </span>
                      <button
                        onClick={() => onSetPlatform(g.game, '')}
                        title="Clear platform"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--muted)', padding: '0 2px', lineHeight: 1 }}
                      >✕</button>
                    </>
                  ) : (
                    <select
                      className="gp-platform-select"
                      value=""
                      onChange={e => { if (e.target.value) onSetPlatform(g.game, e.target.value); }}
                    >
                      <option value="">+ Platform</option>
                      {PLATFORMS.map(p => (
                        <option key={p.id} value={p.id}>{p.icon} {p.label}</option>
                      ))}
                    </select>
                  )}
                </div>

                {g.priorityLabel && (
                  <div className="gp-priority">{g.priorityLabel}</div>
                )}

                <div className="gp-meta">
                  <span>
                    Last played:{' '}
                    <span className="gp-meta-val">
                      {g.daysSince === 0 ? 'today' : g.daysSince === 1 ? 'yesterday' : `${g.daysSince}d ago`}
                    </span>
                  </span>
                  <span>
                    This week:{' '}
                    <span className="gp-meta-val">{fmtMins(g.timeThisWeek)}</span>
                  </span>
                  <span>
                    Total:{' '}
                    <span className="gp-meta-val">{fmtMins(g.totalMinutes)}</span>
                  </span>
                </div>

                <div className="gp-actions">
                  {isOnHold && (
                    <button
                      className="btn soft"
                      onClick={() => onTogglePaused(g.game)}
                      style={{ fontSize: '12px', padding: '3px 10px' }}
                    >
                      Resume ▶
                    </button>
                  )}
                  {g.isManual && g.status === 'Completed' && (
                    <button
                      className="btn soft"
                      onClick={() => onToggleCompletion(g.game)}
                      style={{ fontSize: '12px', padding: '3px 10px', color: 'var(--muted)' }}
                    >
                      Unmark
                    </button>
                  )}
                  {isActive && (
                    <>
                      <button
                        className="btn soft"
                        onClick={() => onTogglePaused(g.game)}
                        style={{ fontSize: '12px', padding: '3px 10px', color: 'var(--muted)' }}
                      >
                        Put down
                      </button>
                      <button
                        className="btn soft"
                        onClick={() => onToggleCompletion(g.game)}
                        style={{ fontSize: '12px', padding: '3px 10px' }}
                      >
                        Mark done ✓
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
