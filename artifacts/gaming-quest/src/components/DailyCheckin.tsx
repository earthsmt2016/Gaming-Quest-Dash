import React, { useState } from 'react';
import { LogEntry, computeRecommendations, badgeFor } from '../lib/logParser';
import { fetchDailyPlan, DailyPlanGame, DailyPlanPick } from '../lib/api';

const QUICK_TIMES = [
  { label: '20m', value: 20 },
  { label: '30m', value: 30 },
  { label: '45m', value: 45 },
  { label: '1h', value: 60 },
  { label: '90m', value: 90 },
  { label: '2h', value: 120 },
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
  const [copied, setCopied] = useState<string | null>(null);

  const handleSubmit = async () => {
    let mins: number;
    if (useCustom) {
      mins = parseInt(customStr, 10);
      if (!mins || mins < 5 || mins > 600) return;
    } else {
      if (!selected) return;
      mins = selected;
    }

    setPlan({ status: 'loading', mins });

    const activeGames = buildActiveGames(logs, manualCompletions, paused);
    const dayOfWeek = DAYS[new Date().getDay()];

    try {
      const picks = await fetchDailyPlan(mins, dayOfWeek, activeGames);
      if (picks.length > 0) {
        setPlan({ status: 'ai', mins, picks });
      } else {
        throw new Error('empty');
      }
    } catch {
      const fallback = computeRecommendations(mins, logs, manualCompletions, paused);
      setPlan({ status: 'fallback', mins, picks: fallback });
    }
  };

  const handleReset = () => {
    setPlan({ status: 'idle' });
    setSelected(null);
    setCustomStr('');
    setUseCustom(false);
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
                <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                  Pick your available time and get an AI-planned session.
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
                      onChange={e => setCustomStr(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                      autoFocus
                    />
                    <span style={{ fontSize: '13px', color: 'var(--muted)' }}>minutes</span>
                  </div>
                )}
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
                          {i === 0 ? '① Start with' : i === 1 ? '② Then' : '③ Finish with'}
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
                              {i === 0 ? '① Start with' : i === 1 ? '② Then' : '③ Finish with'}
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
          </div>
        )}
      </div>
    </>
  );
}
