import React, { useState, useCallback } from 'react';
import { LogEntry, computeRecommendations, badgeFor } from '../lib/logParser';
import { fetchDailyPlan, fetchQuestRecommendations, fetchActiveQuests, fetchSubQuest, completeQuest, addMiniLog, triggerQuestRefresh, Quest, DailyPlanGame, DailyPlanPick } from '../lib/api';
import { useQuestsContext } from '../context/QuestsContext';
import { trackAction } from '../lib/tracker';

type PlatformMode = 'any' | 'mobile' | 'xbox';

function sessionTimeLabel(): string {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return 'This morning';
  if (h >= 12 && h < 17) return 'This afternoon';
  return 'Tonight';
}

const PLATFORM_MODES: { id: PlatformMode; icon: string; label: string; sub: string }[] = [
  { id: 'any',    icon: '🎲', label: 'Any',    sub: 'Surprise me' },
  { id: 'mobile', icon: '📱', label: 'Mobile', sub: 'Paid & Arcade' },
  { id: 'xbox',   icon: '🎮', label: 'Xbox',   sub: 'Paid & Game Pass' },
];

const QUICK_TIMES = [
  { label: '10m', value: 10 },
  { label: '20m', value: 20 },
  { label: '30m', value: 30 },
  { label: '1h', value: 60 },
  { label: '2h', value: 120 },
  { label: '3h', value: 180 },
  { label: '4h', value: 240 },
];

const SESSION_MODES = [
  { id: 'quick_win',   emoji: '⚡', label: 'Quick Win',   desc: 'Short, completable tasks' },
  { id: 'story_push',  emoji: '📖', label: 'Story Push',  desc: 'Advance the narrative' },
  { id: 'grind',       emoji: '⚙️', label: 'Grind',       desc: 'Farm resources or rank' },
  { id: 'chill',       emoji: '😌', label: 'Chill',       desc: 'Relaxed, low-pressure' },
  { id: 'competitive', emoji: '🏆', label: 'Competitive', desc: 'Rated matches & ranks' },
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const PICK_NUMERALS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
function pickLabel(i: number, total: number): string {
  const num = PICK_NUMERALS[i] ?? `${i + 1}.`;
  if (total === 1) return `${num} Play`;
  if (i === 0) return `${num} Start with`;
  if (i === total - 1) return `${num} Finish with`;
  return `${num} Then`;
}

function fmtMins(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function buildActiveGames(
  logs: LogEntry[],
  manualCompletions: Set<string>,
  paused: Set<string>,
): DailyPlanGame[] {
  const CREDITS_RE = /saw the credits|finished the game|completed the main.?run|rolled credits/i;
  const now = new Date();
  const cut = new Date(now); cut.setDate(cut.getDate() - 60);

  const dayNum = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (dayNum === 0 ? 6 : dayNum - 1));
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const recentLogs = logs.filter(l => l.date >= cut);
  const map: Record<string, { lastDate: Date; weekMin: number; totalMin: number; sessions: LogEntry[] }> = {};

  recentLogs.forEach(l => {
    if (!map[l.game]) map[l.game] = { lastDate: l.date, weekMin: 0, totalMin: 0, sessions: [] };
    if (l.date > map[l.game].lastDate) map[l.game].lastDate = l.date;
    map[l.game].totalMin += l.minutes;
    map[l.game].sessions.push(l);
  });
  logs.filter(l => l.date >= weekStart && l.date <= weekEnd).forEach(l => {
    if (map[l.game]) map[l.game].weekMin += l.minutes;
  });

  return Object.entries(map)
    .filter(([game]) => {
      if (paused.has(game) || manualCompletions.has(game)) return false;
      return !logs.filter(l => l.game === game).some(l => CREDITS_RE.test(l.action));
    })
    .map(([title, stats]) => {
      const allLogs = logs.filter(l => l.game === title);
      const types = new Set(allLogs.map(l => l.type));
      const latest = [...allLogs].sort((a, b) => b.date.getTime() - a.date.getTime())[0];

      let priorityLabel = 'Active';
      if (latest?.type === 'boss') priorityLabel = 'Boss fight reached';
      else if (types.has('purchase') && !types.has('progress')) priorityLabel = 'Just started';
      else if (types.has('progress') && !types.has('rank-up')) priorityLabel = 'Active story run';
      else if (types.has('rank-up') && types.has('progress')) priorityLabel = 'Story unfinished';
      else if (types.has('rank-up') && !types.has('progress')) priorityLabel = 'Competitive';

      const avgSessionMinutes = stats.sessions.length > 0
        ? Math.round(stats.totalMin / stats.sessions.length)
        : 30;
      const daysSince = Math.floor((now.getTime() - stats.lastDate.getTime()) / 86400000);
      const recentSessions = [...stats.sessions]
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 5)
        .map(l => ({ date: l.timestamp.slice(0, 10), action: l.action, minutes: l.minutes }));

      return { title, daysSinceLastPlayed: daysSince, minutesThisWeek: stats.weekMin, avgSessionMinutes, totalMinutesLogged: stats.totalMin, priorityLabel, recentSessions };
    });
}

interface DailyCheckinProps {
  logs: LogEntry[];
  manualCompletions: Set<string>;
  paused: Set<string>;
}

type PlanState =
  | { status: 'idle' }
  | { status: 'loading'; mins: number }
  | { status: 'ai'; mins: number; picks: DailyPlanPick[] }
  | { status: 'fallback'; mins: number; picks: ReturnType<typeof computeRecommendations> };

export default function DailyCheckin({ logs, manualCompletions, paused }: DailyCheckinProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [customStr, setCustomStr] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [plan, setPlan] = useState<PlanState>({ status: 'idle' });
  const [platformMode, setPlatformMode] = useState<PlatformMode>('any');
  const [sessionMode, setSessionMode] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [questRecs, setQuestRecs] = useState<{ fitting: Quest[]; partial: Quest[] } | null>(null);
  const [subQuests, setSubQuests] = useState<Record<number, { loading: boolean; title?: string; goal?: string }>>({});
  const [logNotes, setLogNotes] = useState<Record<number, string>>({});
  const [logNoteOpen, setLogNoteOpen] = useState<Set<number>>(new Set());
  const [completedInSession, setCompletedInSession] = useState<Set<number>>(new Set());
  const [subQuestDone, setSubQuestDone] = useState<Set<number>>(new Set());
  const { refresh: refreshQuests } = useQuestsContext();

  const handleSubQuest = useCallback(async (questId: number, mins: number) => {
    setSubQuests(prev => ({ ...prev, [questId]: { loading: true } }));
    try {
      const result = await fetchSubQuest(questId, mins);
      setSubQuests(prev => ({ ...prev, [questId]: { loading: false, title: result.title, goal: result.goal } }));
      addMiniLog(questId, `🎯 Sub-quest (${mins}m): ${result.title} — ${result.goal}`).catch(() => {});
    } catch {
      setSubQuests(prev => ({ ...prev, [questId]: { loading: false } }));
    }
  }, []);

  const toggleLogNote = useCallback((questId: number) => {
    setLogNoteOpen(prev => {
      const next = new Set(prev);
      next.has(questId) ? next.delete(questId) : next.add(questId);
      return next;
    });
  }, []);

  const handleAddNote = useCallback(async (questId: number) => {
    const note = (logNotes[questId] ?? '').trim();
    if (!note) return;
    await addMiniLog(questId, note).catch(() => {});
    setLogNotes(prev => ({ ...prev, [questId]: '' }));
    setLogNoteOpen(prev => { const next = new Set(prev); next.delete(questId); return next; });
  }, [logNotes]);

  const handleCompleteQuest = useCallback(async (questId: number, game: string, mins: number) => {
    await completeQuest(questId, mins).catch(() => {});
    setCompletedInSession(prev => new Set([...prev, questId]));

    // Refresh quest pool for this game, then reload recs + context after server finishes
    triggerQuestRefresh([game]);
    setTimeout(() => {
      refreshQuests();
      setPlan(prev => {
        if (prev.status === 'ai' || prev.status === 'fallback') {
          const planGames = (prev.picks as any[]).map((p: any) => p.game);
          fetchQuestRecommendations((prev as any).mins, planGames).then(setQuestRecs).catch(() => {});
        }
        return prev;
      });
    }, 5000);
  }, [refreshQuests]);

  const handleSubQuestDone = useCallback(async (questId: number, game: string, title: string) => {
    await addMiniLog(questId, `✅ Sub-quest completed: ${title}`).catch(() => {});
    setSubQuestDone(prev => new Set([...prev, questId]));

    // Refresh quest pool for this game, then reload recs + context after server finishes
    triggerQuestRefresh([game]);
    setTimeout(() => {
      refreshQuests();
      setPlan(prev => {
        if (prev.status === 'ai' || prev.status === 'fallback') {
          const planGames = (prev.picks as any[]).map((p: any) => p.game);
          fetchQuestRecommendations((prev as any).mins, planGames).then(setQuestRecs).catch(() => {});
        }
        return prev;
      });
    }, 5000);
  }, [refreshQuests]);

  const handleSubmit = async () => {
    trackAction('dashboard', 'DailyCheckin', 'click', 'Plan my session');
    let mins: number;
    if (useCustom) {
      mins = parseInt(customStr, 10);
      if (!mins || mins < 5 || mins > 600) return;
    } else {
      if (!selected) return;
      mins = selected;
    }

    setPlan({ status: 'loading', mins });
    setQuestRecs(null);

    const activeGames = buildActiveGames(logs, manualCompletions, paused);
    const dayOfWeek = DAYS[new Date().getDay()];

    // Fetch active quests to give the AI quest context (non-blocking parallel)
    const activeQuestsPromise = fetchActiveQuests().catch(() => [] as Quest[]);

    let planGameNames: string[] = [];
    try {
      const rawActiveQuests = await activeQuestsPromise;
      const activeQuestData = rawActiveQuests.map(q => ({
        game: q.game, title: q.title,
        estimated_minutes: q.estimated_minutes, difficulty: q.difficulty,
      }));
      const picks = await fetchDailyPlan(mins, dayOfWeek, activeGames, activeQuestData, sessionMode ?? undefined, platformMode === 'any' ? undefined : platformMode);
      if (picks.length > 0) {
        setPlan({ status: 'ai', mins, picks });
        planGameNames = picks.map(p => p.game);
      } else {
        throw new Error('empty');
      }
    } catch {
      const fallback = computeRecommendations(mins, logs, manualCompletions, paused);
      setPlan({ status: 'fallback', mins, picks: fallback });
      planGameNames = (fallback as any[]).map((p: any) => p.game);
    }

    // Fetch quest recommendations filtered to the plan's games
    fetchQuestRecommendations(mins, planGameNames).then(r => setQuestRecs(r)).catch(() => {});
  };

  const handleReset = () => {
    setPlan({ status: 'idle' });
    setSelected(null);
    setCustomStr('');
    setUseCustom(false);
    setQuestRecs(null);
  };

  const copyGame = (game: string, mins: number) => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5);
    navigator.clipboard?.writeText(`${dateStr} ${timeStr} | ${game} | | ${mins} | progress`).catch(() => {});
    setCopied(game);
    setTimeout(() => setCopied(null), 2000);
  };

  const isSubmitted = plan.status !== 'idle';
  const submittedMins = isSubmitted ? plan.mins : null;
  const totalPicks = plan.status === 'ai' ? plan.picks.length
    : plan.status === 'fallback' ? plan.picks.length : 0;

  return (
    <>
      <style>{`
        .dc-wrap {
          border: 1px solid var(--line);
          border-radius: var(--radius);
          background: var(--paper);
          box-shadow: var(--shadow);
          overflow: hidden;
        }
        .dc-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          cursor: pointer;
          user-select: none;
          gap: 12px;
        }
        .dc-header:hover { background: var(--paper-2); }
        .dc-header-left { display: flex; align-items: center; gap: 10px; }
        .dc-icon {
          width: 32px; height: 32px;
          background: var(--accent);
          border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; flex-shrink: 0;
        }
        .dc-body { border-top: 1px solid var(--soft-line, var(--line)); padding: 16px; }
        .dc-time-grid { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
        .dc-time-btn {
          padding: 8px 16px;
          border: 1.5px solid var(--line);
          border-radius: 8px;
          background: var(--paper);
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
          transition: all 0.12s;
          color: var(--text);
        }
        .dc-time-btn:hover { border-color: var(--accent); color: var(--accent); }
        .dc-time-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }
        .dc-custom-row { display: flex; align-items: center; gap: 8px; margin: 8px 0 12px; flex-wrap: wrap; }
        .dc-custom-input {
          width: 90px; padding: 7px 10px;
          border: 1.5px solid var(--accent);
          border-radius: 8px; font-size: 14px;
          font-family: inherit; background: var(--paper);
        }
        .dc-loading {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; padding: 32px 16px; gap: 14px;
        }
        .dc-loading-dots {
          display: flex; gap: 6px; align-items: center;
        }
        @keyframes dc-bounce {
          0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        .dc-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--accent);
          animation: dc-bounce 1.4s ease-in-out infinite;
        }
        .dc-dot:nth-child(2) { animation-delay: 0.16s; }
        .dc-dot:nth-child(3) { animation-delay: 0.32s; }
        .dc-recs { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
        .dc-rec-card {
          border: 1px solid var(--soft-line, var(--line));
          border-radius: 10px;
          padding: 12px 14px;
          background: #fffef9;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .dc-rec-card.ai-card { background: #f6fbf7; border-color: #c3dfc8; }
        .dc-rec-time {
          font-size: 22px; font-weight: 800;
          color: var(--accent); white-space: nowrap;
          line-height: 1; flex-shrink: 0; margin-top: 2px;
        }
        .dc-rec-game { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
        .dc-rec-order { font-size: 12px; color: var(--muted); font-weight: 600; margin-bottom: 2px; }
        .dc-rec-why {
          font-size: 13px; color: var(--text); line-height: 1.5;
        }
        .dc-rec-reason { font-size: 13px; color: var(--text); line-height: 1.45; }
        .dc-why-label {
          font-size: 10px; color: var(--accent); font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.07em;
          margin-top: 6px; margin-bottom: 2px;
        }
        .dc-priority-label { font-size: 11px; color: var(--accent); font-weight: 600; margin-bottom: 3px; }
        .dc-copy-btn {
          flex-shrink: 0; background: none;
          border: 1px solid var(--line);
          border-radius: 6px; font-size: 11px;
          padding: 4px 8px; cursor: pointer;
          color: var(--muted); font-family: inherit;
          transition: all 0.12s; white-space: nowrap;
          align-self: flex-end;
        }
        .dc-copy-btn:hover { border-color: var(--accent); color: var(--accent); }
        .dc-copy-btn.done { background: #e8f8f0; border-color: #52b788; color: #2d6a4f; }
        .dc-total {
          margin-top: 10px; padding: 8px 12px;
          background: var(--paper-2); border-radius: 8px;
          font-size: 13px; color: var(--muted);
          display: flex; align-items: center; justify-content: space-between;
        }
        .dc-no-games { font-size: 13px; color: var(--muted); padding: 8px 0; }
        .dc-fallback-note {
          font-size: 11px; color: var(--muted);
          text-align: center; margin-top: 8px;
          font-style: italic;
        }
        .dc-ai-badge {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 10px; font-weight: 700;
          color: #2d6a4f; background: #e8f8f0;
          border: 1px solid #b7e4c7;
          border-radius: 4px; padding: 2px 6px;
          letter-spacing: 0.03em; margin-left: 6px;
          vertical-align: middle;
        }
      `}</style>

      <div className="dc-wrap">
        <div className="dc-header" onClick={() => setOpen(o => !o)}>
          <div className="dc-header-left">
            <div className="dc-icon">🎮</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px', lineHeight: 1.2 }}>
                Daily check-in
                {plan.status === 'ai' && <span className="dc-ai-badge">✦ AI</span>}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                {plan.status === 'idle'
                  ? 'How long do you have to play today?'
                  : plan.status === 'loading'
                  ? 'Planning your session…'
                  : `${fmtMins(plan.mins)} session — ${totalPicks} game${totalPicks === 1 ? '' : 's'} planned`}
              </div>
            </div>
          </div>
          <span style={{ color: 'var(--muted)', fontSize: '20px', lineHeight: 1, flexShrink: 0 }}>
            {open ? '−' : '+'}
          </span>
        </div>

        {open && (
          <div className="dc-body">
            {/* ── Time picker ── */}
            {plan.status === 'idle' && (
              <>
                {/* Platform toggle */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>
                    {sessionTimeLabel()} I feel like…
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {PLATFORM_MODES.map(m => {
                      const active = platformMode === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setPlatformMode(m.id)}
                          style={{
                            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                            padding: '8px 6px', borderRadius: '10px', cursor: 'pointer',
                            border: active ? '2px solid var(--accent)' : '1.5px solid var(--line)',
                            background: active ? 'var(--accent)' : 'var(--paper)',
                            color: active ? '#fff' : 'var(--text)',
                            fontFamily: 'inherit', transition: 'all 0.12s',
                          }}
                        >
                          <span style={{ fontSize: '20px', lineHeight: 1 }}>{m.icon}</span>
                          <span style={{ fontSize: '12px', fontWeight: 700, marginTop: '4px' }}>{m.label}</span>
                          <span style={{ fontSize: '10px', opacity: 0.75, marginTop: '1px' }}>{m.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '4px' }}>
                  Pick your available time and get an AI-planned session
                  {platformMode !== 'any' && (
                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      {' '}({platformMode === 'mobile' ? '📱 Mobile' : '🎮 Xbox'} only)
                    </span>
                  )}.
                </div>
                <div className="dc-time-grid">
                  {QUICK_TIMES.map(t => (
                    <button
                      key={t.value}
                      className={`dc-time-btn${selected === t.value && !useCustom ? ' active' : ''}`}
                      onClick={() => { setSelected(t.value); setUseCustom(false); }}
                    >
                      {t.label}
                    </button>
                  ))}
                  <button
                    className={`dc-time-btn${useCustom ? ' active' : ''}`}
                    onClick={() => { setUseCustom(true); setSelected(null); }}
                  >
                    Custom
                  </button>
                </div>
                {useCustom && (
                  <div className="dc-custom-row">
                    <input
                      className="dc-custom-input"
                      type="number" min={5} max={600}
                      placeholder="e.g. 75"
                      value={customStr}
                      onChange={e => setCustomStr(String(parseInt(e.target.value, 10) || ''))}
                      onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                      autoFocus
                    />
                    <span style={{ fontSize: '13px', color: 'var(--muted)' }}>minutes</span>
                  </div>
                )}
                {/* Session mode chips */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>
                    Session mood (optional)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {SESSION_MODES.map(m => (
                      <button
                        key={m.id}
                        onClick={() => setSessionMode(prev => prev === m.id ? null : m.id)}
                        title={m.desc}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          padding: '5px 10px', borderRadius: '20px', cursor: 'pointer',
                          fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
                          border: sessionMode === m.id ? '1.5px solid var(--accent)' : '1.5px solid var(--line)',
                          background: sessionMode === m.id ? 'var(--accent)' : 'var(--paper)',
                          color: sessionMode === m.id ? '#fff' : 'var(--text)',
                          transition: 'all 0.12s',
                        }}
                      >
                        <span>{m.emoji}</span> {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  className="btn primary"
                  onClick={handleSubmit}
                  disabled={useCustom ? !customStr || parseInt(customStr) < 5 : !selected}
                  style={{ marginTop: '4px' }}
                >
                  Plan my session →
                </button>
              </>
            )}

            {/* ── AI loading ── */}
            {plan.status === 'loading' && (
              <div className="dc-loading">
                <div className="dc-loading-dots">
                  <div className="dc-dot" />
                  <div className="dc-dot" />
                  <div className="dc-dot" />
                </div>
                <div style={{ fontSize: '13px', color: 'var(--muted)', textAlign: 'center' }}>
                  AI is analysing your games and planning a{' '}
                  <strong>{fmtMins(plan.mins)}</strong> session…
                </div>
              </div>
            )}

            {/* ── AI plan ── */}
            {plan.status === 'ai' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>
                      Your {fmtMins(plan.mins)} plan
                      <span className="dc-ai-badge">✦ AI</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                      Tailored to your session history and today's priorities
                    </div>
                  </div>
                  <button
                    onClick={handleReset}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--muted)', textDecoration: 'underline', padding: 0, flexShrink: 0 }}
                  >
                    Change time
                  </button>
                </div>

                <div className="dc-recs">
                  {plan.picks.map((pick, i) => (
                    <div key={pick.game} className="dc-rec-card ai-card">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="dc-rec-order">
                          {pickLabel(i, plan.picks.length)}
                        </div>
                        <div className="dc-rec-game">{pick.game}</div>
                        <div className="dc-why-label">Why this session</div>
                        <div className="dc-rec-why">{pick.why}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                        <div className="dc-rec-time">{fmtMins(pick.minutes)}</div>
                        <button
                          className={`dc-copy-btn${copied === pick.game ? ' done' : ''}`}
                          onClick={() => copyGame(pick.game, pick.minutes)}
                          title="Copy log entry"
                        >
                          {copied === pick.game ? '✓ Copied' : 'Copy log'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="dc-total">
                  <span>Total planned</span>
                  <strong>{fmtMins(plan.picks.reduce((s, p) => s + p.minutes, 0))} of {fmtMins(plan.mins)}</strong>
                </div>
              </>
            )}

            {/* ── Fallback (algorithm) ── */}
            {plan.status === 'fallback' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>Your {fmtMins(plan.mins)} plan</div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                      Ranked by strategic priority + recent neglect
                    </div>
                  </div>
                  <button
                    onClick={handleReset}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--muted)', textDecoration: 'underline', padding: 0, flexShrink: 0 }}
                  >
                    Change time
                  </button>
                </div>

                {plan.picks.length === 0 ? (
                  <div className="dc-no-games">
                    No active games to recommend — add more logs or resume a game that's on hold.
                  </div>
                ) : (
                  <>
                    <div className="dc-recs">
                      {plan.picks.map((rec, i) => (
                        <div key={rec.game} className="dc-rec-card">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="dc-rec-order">
                              {pickLabel(i, plan.picks.length)}
                            </div>
                            {rec.priorityLabel && (
                              <div className="dc-priority-label">{rec.priorityLabel}</div>
                            )}
                            <div className="dc-rec-game">
                              {rec.game}
                              <span className={`badge ${badgeFor(rec.status)} dc-rec-badge`} style={{ marginLeft: '6px', fontSize: '11px' }}>
                                {rec.status}
                              </span>
                            </div>
                            <div className="dc-why-label">Why this session</div>
                            <div className="dc-rec-reason">{rec.reason}</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                            <div className="dc-rec-time">{fmtMins(rec.suggestedMinutes)}</div>
                            <button
                              className={`dc-copy-btn${copied === rec.game ? ' done' : ''}`}
                              onClick={() => copyGame(rec.game, rec.suggestedMinutes)}
                              title="Copy log entry"
                            >
                              {copied === rec.game ? '✓ Copied' : 'Copy log'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="dc-total">
                      <span>Total planned</span>
                      <strong>{fmtMins(plan.picks.reduce((s, r) => s + r.suggestedMinutes, 0))} of {fmtMins(plan.mins)}</strong>
                    </div>
                    <div className="dc-fallback-note">AI unavailable — using local plan</div>
                  </>
                )}
              </>
            )}

            {/* ── Quest Opportunities (after plan) ── */}
            {(plan.status === 'ai' || plan.status === 'fallback') && questRecs && (() => {
              const sessionMins = (plan as any).mins as number;
              const planGames = new Set((plan.picks as any[]).map(p => p.game));
              const fitting = questRecs.fitting.filter(q => planGames.has(q.game));
              const partial = questRecs.partial.filter(q => planGames.has(q.game));
              if (fitting.length === 0 && partial.length === 0) return null;
              return (
                <div style={{ marginTop: '4px', padding: '12px 14px', background: '#f3e5f5', border: '1px solid #ce93d8', borderRadius: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6a1b9a', marginBottom: '10px' }}>
                    ⚔️ Quest Opportunities This Session
                  </div>

                  {/* Fitting quests */}
                  {fitting.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: partial.length > 0 ? '12px' : 0 }}>
                      <div style={{ fontSize: '11px', color: '#7b1fa2', fontWeight: 600, marginBottom: '2px' }}>Fits in your session:</div>
                      {fitting.map(q => (
                        <div key={q.id} style={{ background: '#fff', borderRadius: '8px', border: '1px solid #ce93d8', overflow: 'hidden' }}>
                          {/* Header */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, marginBottom: '2px' }}>{q.game}</div>
                              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: q.description ? '4px' : 0 }}>{q.title}</div>
                              {q.description && (
                                <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.4 }}>
                                  {q.description}
                                </div>
                              )}
                            </div>
                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                              <div style={{ fontSize: '15px', fontWeight: 700, color: '#2e7d32' }}>{fmtMins(q.estimated_minutes)}</div>
                              <div style={{ fontSize: '10px', fontWeight: 700, color: '#2e7d32' }}>fits ✓</div>
                            </div>
                          </div>
                          {/* Actions */}
                          {completedInSession.has(q.id) ? (
                            <div style={{ borderTop: '1px solid #c8e6c9', padding: '8px 12px', background: '#e8f5e9', fontSize: '12px', fontWeight: 700, color: '#2e7d32' }}>
                              ✅ Completed this session!
                            </div>
                          ) : (
                            <div style={{ borderTop: '1px dashed #ce93d8', padding: '7px 12px', display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
                              <button
                                onClick={() => handleCompleteQuest(q.id, q.game, sessionMins)}
                                style={{ background: '#2e7d32', color: '#fff', border: 'none', borderRadius: '20px', padding: '4px 12px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, fontFamily: 'inherit' }}
                              >✓ Complete quest</button>
                              <button
                                onClick={() => toggleLogNote(q.id)}
                                style={{ background: 'none', border: '1px solid #ab47bc', borderRadius: '20px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#7b1fa2', fontFamily: 'inherit' }}
                              >📝 Add note</button>
                            </div>
                          )}
                          {/* Inline note input */}
                          {logNoteOpen.has(q.id) && !completedInSession.has(q.id) && (
                            <div style={{ borderTop: '1px dashed #ce93d8', padding: '8px 12px', display: 'flex', gap: '6px' }}>
                              <textarea
                                value={logNotes[q.id] ?? ''}
                                onChange={e => setLogNotes(prev => ({ ...prev, [q.id]: e.target.value }))}
                                placeholder="Quick session note…"
                                rows={2}
                                style={{ flex: 1, fontSize: '12px', border: '1px solid #ce93d8', borderRadius: '6px', padding: '5px 8px', fontFamily: 'inherit', resize: 'none', background: 'var(--paper-2)' }}
                              />
                              <button
                                onClick={() => handleAddNote(q.id)}
                                style={{ background: '#6a1b9a', color: '#fff', border: 'none', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, fontFamily: 'inherit', alignSelf: 'flex-end' }}
                              >Save</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Partial quests */}
                  {partial.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#7b1fa2', fontWeight: 600, marginBottom: '2px' }}>Needs more time — make partial progress:</div>
                      {partial.map(q => {
                        const sq = subQuests[q.id];
                        const isDone = subQuestDone.has(q.id);
                        return (
                          <div key={q.id} style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e1bee7', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, marginBottom: '2px' }}>{q.game}</div>
                                <div style={{ fontSize: '13px', fontWeight: 700 }}>{q.title}</div>
                              </div>
                              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                                <div style={{ fontSize: '15px', fontWeight: 700, color: '#e65100' }}>{fmtMins(q.estimated_minutes)}</div>
                                <div style={{ fontSize: '10px', fontWeight: 700, color: '#e65100' }}>needed</div>
                              </div>
                            </div>
                            {!sq && (
                              <div style={{ borderTop: '1px dashed #e1bee7', padding: '8px 12px' }}>
                                <button
                                  onClick={() => handleSubQuest(q.id, sessionMins)}
                                  style={{ background: 'none', border: '1px solid #ab47bc', borderRadius: '20px', padding: '4px 12px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#7b1fa2', fontFamily: 'inherit' }}
                                >✨ Make it fit in {fmtMins(sessionMins)}</button>
                              </div>
                            )}
                            {sq?.loading && (
                              <div style={{ borderTop: '1px dashed #e1bee7', padding: '8px 12px', fontSize: '11px', color: '#ab47bc' }}>
                                Generating mini-goal…
                              </div>
                            )}
                            {sq && !sq.loading && sq.title && (
                              <div style={{ borderTop: '1px solid #ce93d8', background: '#f3e5f5' }}>
                                <div style={{ padding: '10px 12px 6px' }}>
                                  <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#7b1fa2', marginBottom: '4px' }}>
                                    ⚡ {fmtMins(sessionMins)} sub-quest · saved to mini-log
                                  </div>
                                  <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '3px' }}>{sq.title}</div>
                                  <div style={{ fontSize: '12px', color: '#4a148c', lineHeight: 1.4 }}>{sq.goal}</div>
                                </div>
                                {isDone ? (
                                  <div style={{ borderTop: '1px solid #c8e6c9', padding: '7px 12px', background: '#e8f5e9', fontSize: '12px', fontWeight: 700, color: '#2e7d32' }}>
                                    ✅ Marked done — logged to mini-notes
                                  </div>
                                ) : (
                                  <div style={{ borderTop: '1px dashed #ce93d8', padding: '7px 12px' }}>
                                    <button
                                      onClick={() => handleSubQuestDone(q.id, q.game, sq.title!)}
                                      style={{ background: '#2e7d32', color: '#fff', border: 'none', borderRadius: '20px', padding: '4px 12px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, fontFamily: 'inherit' }}
                                    >✓ Mark sub-quest done</button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </>
  );
}
