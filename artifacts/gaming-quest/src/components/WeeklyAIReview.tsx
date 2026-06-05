import React, { useState } from 'react';
import { fetchWeeklyAIReview, WeeklyAIReview as ReviewData } from '../lib/api';

function fmtMins(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

const MOOD_CONFIG: Record<string, { emoji: string; label: string; cssVar: string }> = {
  great: { emoji: '🔥', label: 'Great week', cssVar: 'var(--success)' },
  good:  { emoji: '✅', label: 'Good week',  cssVar: 'var(--accent)'  },
  quiet: { emoji: '😴', label: 'Quiet week', cssVar: 'var(--muted)'   },
  mixed: { emoji: '🎲', label: 'Mixed week', cssVar: 'var(--warning)' },
};

export default function WeeklyAIReview() {
  const [review, setReview]   = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [open, setOpen]       = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWeeklyAIReview();
      setReview(data);
    } catch {
      setError('Could not generate review — try again.');
    } finally {
      setLoading(false);
    }
  };

  const mood = review ? (MOOD_CONFIG[review.mood] ?? MOOD_CONFIG.good) : null;

  return (
    <div style={{
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius)',
      background: 'var(--paper)',
      boxShadow: 'var(--shadow)',
      overflow: 'hidden',
    }}>
      {/* Header — matches DailyCheckin / CoachCard collapsed style */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', cursor: 'pointer', userSelect: 'none',
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-2)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: 32, height: 32, background: 'var(--accent)',
            borderRadius: 8, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 16, flexShrink: 0,
          }}>📊</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', lineHeight: 1.2 }}>
              AI Weekly Review
              {mood && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: 10, fontWeight: 700,
                  color: mood.cssVar,
                  background: 'var(--accent-soft)',
                  border: '1px solid var(--line)',
                  borderRadius: 4, padding: '2px 7px',
                  marginLeft: 8, verticalAlign: 'middle',
                }}>
                  {mood.emoji} {mood.label}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {review
                ? `${review.session_count} sessions · ${fmtMins(review.total_minutes)} · ${review.games_played} games`
                : 'AI-generated summary of your week'}
            </div>
          </div>
        </div>
        <span style={{ color: 'var(--muted)', fontSize: 20, lineHeight: 1, flexShrink: 0 }}>
          {open ? '−' : '+'}
        </span>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid var(--soft-line)', padding: '14px 16px' }}>

          {/* ── Idle prompt ── */}
          {!review && !loading && (
            <>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 12px' }}>
                Get an AI-written review of your gaming week — what you accomplished, patterns observed, and what to focus on next.
              </p>
              <button className="btn primary" onClick={handleGenerate} style={{ fontSize: 13 }}>
                ✦ Generate this week's review
              </button>
              {error && (
                <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{error}</div>
              )}
            </>
          )}

          {/* ── Loading ── */}
          {loading && (
            <div style={{
              textAlign: 'center', padding: '20px 0',
              color: 'var(--muted)', fontSize: 13,
            }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>🤔</div>
              Analysing your week…
            </div>
          )}

          {/* ── Review content ── */}
          {review && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* Narrative */}
              <div style={{
                fontSize: 14, lineHeight: 1.65, color: 'var(--ink)',
                padding: '12px 14px',
                background: 'var(--paper-2)',
                border: '1px solid var(--soft-line)',
                borderLeft: '3px solid var(--accent)',
                borderRadius: 'var(--radius-sm)',
              }}>
                {review.narrative}
              </div>

              {/* Highlights */}
              {review.highlights?.length > 0 && (
                <div>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>Highlights</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {review.highlights.map((h, i) => (
                      <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                        <span style={{ color: 'var(--accent)', fontSize: 10, marginTop: 3, flexShrink: 0 }}>★</span>
                        <span style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.45 }}>{h}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next week focus */}
              <div style={{
                display: 'flex', gap: 8, alignItems: 'flex-start',
                padding: '10px 12px',
                background: 'var(--accent-soft)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
              }}>
                <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>🎯</span>
                <div>
                  <div className="eyebrow" style={{ color: 'var(--accent)', marginBottom: 3 }}>
                    Next week
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.45 }}>
                    {review.next_week_focus}
                  </span>
                </div>
              </div>

              {/* Regenerate */}
              <div>
                <button
                  onClick={handleGenerate}
                  style={{
                    background: 'none',
                    border: '1px solid var(--line)',
                    borderRadius: 999,
                    fontSize: 12,
                    padding: '4px 12px',
                    cursor: 'pointer',
                    color: 'var(--muted)',
                    fontFamily: 'inherit',
                    fontWeight: 600,
                    transition: 'border-color 0.12s, color 0.12s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--line)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)';
                  }}
                >
                  ↻ Regenerate
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
