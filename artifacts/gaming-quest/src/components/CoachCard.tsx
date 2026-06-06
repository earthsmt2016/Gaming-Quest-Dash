import React, { useState, useEffect, useCallback } from 'react';

const BASE = `${import.meta.env.BASE_URL}api`;

interface CoachRec {
  id: number;
  game: string;
  headline: string;
  suggested_minutes: number;
  why: string[];
  alternative_game: string | null;
  alternative_why: string | null;
  alternative_minutes: number | null;
  alternative_quest: string | null;
  confidence_score: number;
  created_at: string;
  fulfilled: boolean;
}

interface HealthPenalty {
  label: string;
  deduction: number;
  tip: string;
}

interface BacklogHealth {
  health_score: number;
  label: string;
  active_games: number;
  neglected_count: number;
  risks: string[];
  penalties: HealthPenalty[];
}

function fmtMins(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function healthCssVar(score: number): string {
  if (score >= 80) return 'var(--success)';
  if (score >= 60) return 'var(--warning)';
  if (score >= 40) return 'var(--warning)';
  return 'var(--danger)';
}

function confidenceCssVar(score: number): string {
  if (score >= 0.7) return 'var(--success)';
  if (score >= 0.4) return 'var(--warning)';
  return 'var(--danger)';
}

function confidenceLabel(score: number): string {
  if (score >= 0.8) return 'High confidence';
  if (score >= 0.5) return 'Moderate confidence';
  return 'Limited data';
}

const CACHE_TTL_MS = 30 * 60 * 1000;

export default function CoachCard() {
  const [rec, setRec]           = useState<CoachRec | null>(null);
  const [health, setHealth]     = useState<BacklogHealth | null>(null);
  const [loading, setLoading]   = useState(false);
  const [loadingH, setLoadingH] = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/backlog-health`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setHealth(d); })
      .catch(() => {})
      .finally(() => setLoadingH(false));
  }, []);

  useEffect(() => {
    fetch(`${BASE}/ai/coach-card/latest`)
      .then(r => r.ok ? r.json() : null)
      .then((d: CoachRec | null) => {
        if (!d) return;
        const age = Date.now() - new Date(d.created_at).getTime();
        if (age < CACHE_TTL_MS) setRec(d);
      })
      .catch(() => {});
  }, []);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${BASE}/ai/coach-card`, { method: 'POST' });
      if (!r.ok) throw new Error('Failed');
      setRec(await r.json());
    } catch {
      setError('Could not generate recommendation — try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const isStale = rec
    ? (Date.now() - new Date(rec.created_at).getTime()) > CACHE_TTL_MS
    : true;

  return (
    <div style={{
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius)',
      background: 'var(--paper)',
      boxShadow: 'var(--shadow)',
      overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px 12px',
        borderBottom: '1px solid var(--soft-line)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: 32, height: 32, background: 'var(--accent)',
            borderRadius: 8, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 16, flexShrink: 0,
          }}>🏆</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1.2 }}>
              AI Coach
            </div>
            {health && !loadingH && (
              <div style={{ fontSize: 11, fontWeight: 600, color: healthCssVar(health.health_score), marginTop: 1 }}>
                Backlog {health.label} · {health.health_score}/100
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {rec && (
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>
              {isStale ? 'Stale' : 'Fresh'} · {new Date(rec.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={generate}
            disabled={loading}
            className="btn primary"
            style={{ fontSize: 11, minHeight: 30, padding: '0 12px', opacity: loading ? 0.65 : 1 }}
          >
            {loading ? '⚙️ Thinking…' : rec ? '↻ Refresh' : '✨ Get Recommendation'}
          </button>
        </div>
      </div>

      {/* ── Backlog health scorecard ── */}
      {health && !loadingH && (
        <div style={{ borderBottom: '1px solid var(--soft-line)' }}>
          {/* Clickable score bar row */}
          <button
            onClick={() => setHealthOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {/* Score bar */}
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--soft-line)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${health.health_score}%`,
                background: healthCssVar(health.health_score),
                borderRadius: 3,
                transition: 'width 0.4s ease',
              }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, color: healthCssVar(health.health_score), minWidth: 36, textAlign: 'right' }}>
              {health.health_score}/100
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 48 }}>
              {health.label}
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{healthOpen ? '▾' : '▸'}</span>
          </button>

          {/* Expanded penalty breakdown */}
          {healthOpen && (
            <div style={{ padding: '0 16px 12px' }}>
              {(health.penalties ?? []).length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>✓ No issues — backlog is in great shape</div>
              ) : (
                <>
                  {health.penalties.map((p, i) => (
                    <div key={i} style={{
                      background: 'var(--paper-2)',
                      border: '1px solid var(--soft-line)',
                      borderLeft: `3px solid ${p.deduction >= 40 ? 'var(--danger)' : 'var(--warning)'}`,
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 10px',
                      marginBottom: 6,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                        <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>{p.label}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 800,
                          color: p.deduction >= 40 ? 'var(--danger)' : 'var(--warning)',
                          flexShrink: 0, marginLeft: 8,
                        }}>−{p.deduction} pts</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>
                        💡 {p.tip}
                      </div>
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>
                    Fix all issues above to reach {Math.min(100, health.health_score + (health.penalties ?? []).reduce((a, p) => a + p.deduction, 0))}/100
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <div style={{ padding: '14px 16px' }}>
        {error && (
          <div style={{ fontSize: 12, color: 'var(--danger)', padding: '8px 0' }}>{error}</div>
        )}

        {!rec && !loading && !error && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 13 }}>
            Hit <strong style={{ color: 'var(--ink)' }}>Get Recommendation</strong> for tonight's personalised pick
          </div>
        )}

        {loading && !rec && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 13 }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>🤔</div>
            Analysing your play history…
          </div>
        )}

        {rec && (
          <>
            {/* Headline */}
            <div style={{
              fontSize: 13, color: 'var(--accent)', fontWeight: 700,
              fontStyle: 'italic', marginBottom: 10,
            }}>
              "{rec.headline}"
            </div>

            {/* Primary recommendation */}
            <div style={{
              background: 'var(--paper-2)',
              border: '1px solid var(--soft-line)',
              borderLeft: '3px solid var(--accent)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px 14px',
              marginBottom: 10,
            }}>
              <div style={{
                display: 'flex', alignItems: 'flex-start',
                justifyContent: 'space-between', marginBottom: 8, gap: 8,
              }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', flex: 1, minWidth: 0 }}>
                  {rec.game}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: 'var(--accent)',
                    background: 'var(--accent-soft)',
                    borderRadius: 20, padding: '3px 10px',
                  }}>
                    {fmtMins(rec.suggested_minutes)}
                  </div>
                  <div style={{ fontSize: 10, color: confidenceCssVar(rec.confidence_score), fontWeight: 600 }}>
                    {Math.round(rec.confidence_score * 100)}% {confidenceLabel(rec.confidence_score)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(Array.isArray(rec.why) ? rec.why : []).map((reason, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--accent)', fontSize: 11, marginTop: 2, flexShrink: 0 }}>▸</span>
                    <span style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.5 }}>{reason}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Alternative */}
            {rec.alternative_game && (
              <div style={{
                background: 'var(--paper-2)',
                border: '1px solid var(--soft-line)',
                borderLeft: '3px solid var(--muted)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 14px',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  If you want a change of pace
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: rec.alternative_quest || rec.alternative_why ? 6 : 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', flex: 1, minWidth: 0 }}>
                    {rec.alternative_game}
                  </div>
                  {rec.alternative_minutes && (
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: 'var(--muted)',
                      background: 'var(--paper)', border: '1px solid var(--line)',
                      borderRadius: 20, padding: '2px 9px', flexShrink: 0,
                    }}>
                      {fmtMins(rec.alternative_minutes)}
                    </div>
                  )}
                </div>
                {rec.alternative_quest && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: rec.alternative_why ? 4 : 0 }}>
                    <span style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2, flexShrink: 0 }}>▸</span>
                    <span style={{ fontSize: 12, color: 'var(--ink)', fontStyle: 'italic', lineHeight: 1.4 }}>
                      {rec.alternative_quest}
                    </span>
                  </div>
                )}
                {rec.alternative_why && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>
                    {rec.alternative_why}
                  </div>
                )}
              </div>
            )}

            {/* Fulfilled badge */}
            {rec.fulfilled && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>
                ✅ Followed — session logged for this game
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
