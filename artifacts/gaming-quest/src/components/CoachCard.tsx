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
  confidence_score: number;
  created_at: string;
  fulfilled: boolean;
}

interface BacklogHealth {
  health_score: number;
  label: string;
  active_games: number;
  neglected_count: number;
  risks: string[];
}

function fmtMins(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function healthColor(score: number): string {
  if (score >= 80) return '#2e7d32';
  if (score >= 60) return '#f57f17';
  if (score >= 40) return '#e65100';
  return '#b71c1c';
}

function confidenceLabel(score: number): string {
  if (score >= 0.8) return 'High confidence';
  if (score >= 0.5) return 'Moderate confidence';
  return 'Limited data';
}

// Cache coach card for 30 minutes to avoid excess AI calls
const CACHE_TTL_MS = 30 * 60 * 1000;

export default function CoachCard() {
  const [rec, setRec]           = useState<CoachRec | null>(null);
  const [health, setHealth]     = useState<BacklogHealth | null>(null);
  const [loading, setLoading]   = useState(false);
  const [loadingH, setLoadingH] = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Load backlog health (cheap — pure SQL)
  useEffect(() => {
    fetch(`${BASE}/backlog-health`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setHealth(d); })
      .catch(() => {})
      .finally(() => setLoadingH(false));
  }, []);

  // On mount: load latest cached recommendation (no AI call)
  useEffect(() => {
    fetch(`${BASE}/ai/coach-card/latest`)
      .then(r => r.ok ? r.json() : null)
      .then((d: CoachRec | null) => {
        if (!d) return;
        // Use cache if fresh (< 30 min)
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
      const d = await r.json();
      setRec(d);
    } catch {
      setError('Could not generate recommendation — try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const isStale = rec ? (Date.now() - new Date(rec.created_at).getTime()) > CACHE_TTL_MS : true;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)',
      border: '1px solid #e94560',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(233,69,96,0.15)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px 10px',
        borderBottom: '1px solid rgba(233,69,96,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>🏆</span>
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            AI Coach
          </span>
          {health && !loadingH && (
            <span style={{
              fontSize: '10px', fontWeight: 700, color: '#fff',
              background: healthColor(health.health_score),
              borderRadius: '20px', padding: '2px 8px', marginLeft: '4px',
            }}>
              Backlog {health.label} · {health.health_score}/100
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {rec && (
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)' }}>
              {isStale ? 'Stale' : 'Fresh'} · {new Date(rec.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={generate}
            disabled={loading}
            style={{
              background: loading ? 'rgba(233,69,96,0.3)' : '#e94560',
              color: '#fff', border: 'none', borderRadius: '20px',
              padding: '4px 12px', cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '11px', fontWeight: 700, fontFamily: 'inherit',
              transition: 'background 0.2s',
            }}
          >
            {loading ? '⚙️ Thinking…' : rec ? '↻ Refresh' : '✨ Get Recommendation'}
          </button>
        </div>
      </div>

      {/* Backlog risks */}
      {health?.risks && health.risks.length > 0 && (
        <div style={{
          padding: '7px 16px', background: 'rgba(233,69,96,0.1)',
          borderBottom: '1px solid rgba(233,69,96,0.15)',
          display: 'flex', gap: '12px', flexWrap: 'wrap' as const,
        }}>
          {health.risks.map((r, i) => (
            <span key={i} style={{ fontSize: '11px', color: '#ff6b8a', fontWeight: 600 }}>
              ⚠️ {r}
            </span>
          ))}
        </div>
      )}

      {/* Body */}
      <div style={{ padding: '14px 16px' }}>
        {error && (
          <div style={{ fontSize: '12px', color: '#ff6b8a', padding: '8px 0' }}>{error}</div>
        )}

        {!rec && !loading && !error && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>
            Hit <strong style={{ color: 'rgba(255,255,255,0.6)' }}>Get Recommendation</strong> for tonight's personalised pick
          </div>
        )}

        {loading && !rec && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
            Analysing your play history…
          </div>
        )}

        {rec && (
          <>
            {/* Headline */}
            <div style={{ fontSize: '13px', color: '#e94560', fontWeight: 700, marginBottom: '10px', fontStyle: 'italic' }}>
              "{rec.headline}"
            </div>

            {/* Primary recommendation */}
            <div style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '10px', padding: '12px 14px', marginBottom: '10px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff' }}>{rec.game}</div>
                <div style={{
                  fontSize: '13px', fontWeight: 700, color: '#4ade80',
                  background: 'rgba(74,222,128,0.12)', borderRadius: '20px', padding: '3px 10px',
                }}>
                  {fmtMins(rec.suggested_minutes)}
                </div>
              </div>

              {/* Why bullets */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {(Array.isArray(rec.why) ? rec.why : []).map((reason, i) => (
                  <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                    <span style={{ color: '#e94560', fontSize: '11px', marginTop: '2px', flexShrink: 0 }}>▸</span>
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', lineHeight: 1.4 }}>{reason}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Alternative + confidence */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const }}>
              {rec.alternative_game && (
                <div style={{
                  flex: 1, minWidth: 0,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px', padding: '8px 10px',
                }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '2px' }}>
                    Alternative
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: '2px' }}>
                    {rec.alternative_game}
                  </div>
                  {rec.alternative_why && (
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>
                      {rec.alternative_why}
                    </div>
                  )}
                </div>
              )}
              <div style={{
                flexShrink: 0, textAlign: 'center',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px', padding: '8px 12px',
              }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: rec.confidence_score >= 0.7 ? '#4ade80' : rec.confidence_score >= 0.4 ? '#facc15' : '#ff6b8a' }}>
                  {Math.round(rec.confidence_score * 100)}%
                </div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>
                  {confidenceLabel(rec.confidence_score)}
                </div>
              </div>
            </div>

            {/* Fulfilled badge */}
            {rec.fulfilled && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#4ade80', fontWeight: 600 }}>
                ✅ Followed — session logged for this game
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
