import React, { useState, useMemo } from 'react';
import { LogEntry, Recommendation, computeRecommendations, badgeFor } from '../lib/logParser';
import { fetchFocusInsights } from '../lib/api';

const QUICK_TIMES = [
  { label: '20m', value: 20 },
  { label: '30m', value: 30 },
  { label: '45m', value: 45 },
  { label: '1h', value: 60 },
  { label: '90m', value: 90 },
  { label: '2h', value: 120 },
];

function fmtMins(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

interface DailyCheckinProps {
  logs: LogEntry[];
  manualCompletions: Set<string>;
  paused: Set<string>;
}

export default function DailyCheckin({ logs, manualCompletions, paused }: DailyCheckinProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [customStr, setCustomStr] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [submitted, setSubmitted] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [aiSteps, setAiSteps] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState(false);

  const availableMinutes = submitted;

  const recommendations = useMemo<Recommendation[]>(() => {
    if (!availableMinutes) return [];
    return computeRecommendations(availableMinutes, logs, manualCompletions, paused);
  }, [availableMinutes, logs, manualCompletions, paused]);

  const handleSubmit = async () => {
    let mins: number;
    if (useCustom) {
      mins = parseInt(customStr, 10);
      if (!mins || mins < 5 || mins > 600) return;
    } else {
      if (!selected) return;
      mins = selected;
    }
    setSubmitted(mins);
    setAiSteps({});

    const recs = computeRecommendations(mins, logs, manualCompletions, paused);
    if (recs.length > 0) {
      setAiLoading(true);
      try {
        const insights = await fetchFocusInsights(
          recs.map(r => ({
            title: r.game,
            label: r.priorityLabel || 'Active',
            sessions: r.sessions,
          }))
        );
        const steps: Record<string, string> = {};
        insights.forEach(i => { steps[i.title] = i.nextStep; });
        setAiSteps(steps);
      } catch {
        // AI unavailable — silent fallback
      } finally {
        setAiLoading(false);
      }
    }
  };

  const handleReset = () => {
    setSubmitted(null);
    setSelected(null);
    setCustomStr('');
    setUseCustom(false);
    setAiSteps({});
    setAiLoading(false);
  };

  const copyGame = (game: string, mins: number) => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5);
    const text = `${dateStr} ${timeStr} | ${game} | | ${mins} | progress`;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(game);
    setTimeout(() => setCopied(null), 2000);
  };

  const total = recommendations.reduce((s, r) => s + r.suggestedMinutes, 0);

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
        .dc-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .dc-icon {
          width: 32px; height: 32px;
          background: var(--accent);
          border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; flex-shrink: 0;
        }
        .dc-body {
          border-top: 1px solid var(--soft-line, var(--line));
          padding: 16px;
        }
        .dc-time-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 12px 0;
        }
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
        .dc-time-btn.active {
          background: var(--accent);
          border-color: var(--accent);
          color: #fff;
        }
        .dc-custom-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 8px 0 12px;
          flex-wrap: wrap;
        }
        .dc-custom-input {
          width: 90px;
          padding: 7px 10px;
          border: 1.5px solid var(--accent);
          border-radius: 8px;
          font-size: 14px;
          font-family: inherit;
          background: var(--paper);
        }
        .dc-recs {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 4px;
        }
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
        .dc-rec-time {
          font-size: 22px;
          font-weight: 800;
          color: var(--accent);
          white-space: nowrap;
          line-height: 1;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .dc-rec-game {
          font-weight: 700;
          font-size: 15px;
          margin-bottom: 3px;
        }
        .dc-priority-label {
          font-size: 11px;
          color: var(--accent);
          font-weight: 600;
          margin-bottom: 4px;
          letter-spacing: 0.01em;
        }
        .dc-rec-reason {
          font-size: 12px;
          color: var(--muted);
          line-height: 1.4;
        }
        .dc-ai-step {
          font-size: 12px;
          color: var(--text);
          line-height: 1.45;
          margin-top: 6px;
          padding: 6px 8px;
          background: var(--paper-2);
          border-radius: 6px;
          border-left: 2px solid var(--accent);
        }
        .dc-ai-loading {
          font-size: 11px;
          color: var(--muted);
          margin-top: 6px;
          font-style: italic;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        @keyframes dc-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        .dc-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: var(--accent);
          animation: dc-pulse 1.2s ease-in-out infinite;
        }
        .dc-dot:nth-child(2) { animation-delay: 0.2s; }
        .dc-dot:nth-child(3) { animation-delay: 0.4s; }
        .dc-rec-badge {
          margin-left: 6px;
          vertical-align: middle;
          font-size: 11px;
        }
        .dc-copy-btn {
          flex-shrink: 0;
          background: none;
          border: 1px solid var(--line);
          border-radius: 6px;
          font-size: 11px;
          padding: 4px 8px;
          cursor: pointer;
          color: var(--muted);
          font-family: inherit;
          transition: all 0.12s;
          white-space: nowrap;
          align-self: flex-end;
        }
        .dc-copy-btn:hover { border-color: var(--accent); color: var(--accent); }
        .dc-copy-btn.done { background: #e8f8f0; border-color: #52b788; color: #2d6a4f; }
        .dc-total {
          margin-top: 10px;
          padding: 8px 12px;
          background: var(--paper-2);
          border-radius: 8px;
          font-size: 13px;
          color: var(--muted);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .dc-no-games {
          font-size: 13px;
          color: var(--muted);
          padding: 8px 0;
        }
      `}</style>

      <div className="dc-wrap">
        <div className="dc-header" onClick={() => setOpen(o => !o)}>
          <div className="dc-header-left">
            <div className="dc-icon">🎮</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px', lineHeight: 1.2 }}>Daily check-in</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                {submitted
                  ? `${fmtMins(submitted)} session — ${recommendations.length} game${recommendations.length === 1 ? '' : 's'} recommended`
                  : 'How long do you have to play today?'}
              </div>
            </div>
          </div>
          <span style={{ color: 'var(--muted)', fontSize: '20px', lineHeight: 1, flexShrink: 0 }}>
            {open ? '−' : '+'}
          </span>
        </div>

        {open && (
          <div className="dc-body">
            {!submitted && (
              <>
                <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                  Pick your available time and get a smart session plan.
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
                      type="number"
                      min={5}
                      max={600}
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

            {submitted && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>Your {fmtMins(submitted)} plan</div>
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

                {recommendations.length === 0 ? (
                  <div className="dc-no-games">
                    No active games to recommend — add more logs or resume a game that's on hold.
                  </div>
                ) : (
                  <>
                    <div className="dc-recs">
                      {recommendations.map((rec, i) => (
                        <div key={rec.game} className="dc-rec-card">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>
                                {i === 0 ? '① Start with' : i === 1 ? '② Then' : '③ Finish with'}
                              </span>
                            </div>
                            {rec.priorityLabel && (
                              <div className="dc-priority-label">{rec.priorityLabel}</div>
                            )}
                            <div className="dc-rec-game" style={{ marginTop: rec.priorityLabel ? '1px' : '3px' }}>
                              {rec.game}
                              <span className={`badge ${badgeFor(rec.status)} dc-rec-badge`}>
                                {rec.status}
                              </span>
                            </div>
                            <div className="dc-rec-reason">{rec.reason}</div>
                            {aiLoading && !aiSteps[rec.game] && (
                              <div className="dc-ai-loading">
                                <div className="dc-dot" />
                                <div className="dc-dot" />
                                <div className="dc-dot" />
                                <span>Getting AI suggestion…</span>
                              </div>
                            )}
                            {aiSteps[rec.game] && (
                              <div className="dc-ai-step">
                                ✦ {aiSteps[rec.game]}
                              </div>
                            )}
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
                      <strong>{fmtMins(total)} of {fmtMins(submitted)}</strong>
                    </div>
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
