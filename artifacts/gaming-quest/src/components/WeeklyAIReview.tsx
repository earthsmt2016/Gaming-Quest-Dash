import React, { useState } from 'react';
import { fetchWeeklyAIReview, WeeklyAIReview as ReviewData } from '../lib/api';

function fmtMins(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

const MOOD_CONFIG = {
  great: { emoji: '🔥', label: 'Great week', color: '#2e7d32', bg: 'rgba(46,125,50,0.1)' },
  good:  { emoji: '✅', label: 'Good week',  color: '#1565c0', bg: 'rgba(21,101,192,0.1)' },
  quiet: { emoji: '😴', label: 'Quiet week', color: '#6d4c41', bg: 'rgba(109,76,65,0.1)' },
  mixed: { emoji: '🎲', label: 'Mixed week', color: '#e65100', bg: 'rgba(230,81,0,0.1)' },
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
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', cursor: 'pointer', userSelect: 'none',
        }}
        onClick={() => setOpen(o => !o)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: 32, height: 32, background: 'var(--accent)',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0,
          }}>📊</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>
              AI Weekly Review
              {mood && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: 10, fontWeight: 700, color: mood.color,
                  background: mood.bg, border: `1px solid ${mood.color}33`,
                  borderRadius: 4, padding: '2px 6px', marginLeft: 8, verticalAlign: 'middle',
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
        <div style={{ borderTop: '1px solid var(--soft-line, var(--line))', padding: '14px 16px' }}>
          {!review && !loading && (
            <>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
                Get an AI-written review of your gaming week — what you accomplished, patterns observed, and what to focus on next.
              </div>
              <button
                className="btn primary"
                onClick={handleGenerate}
                style={{ fontSize: 13 }}
              >
                ✦ Generate this week's review
              </button>
              {error && <div style={{ fontSize: 12, color: '#c0392b', marginTop: 8 }}>{error}</div>}
            </>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 13 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🤔</div>
              Analysing your week…
            </div>
          )}

          {review && !loading && (
            <>
              {/* Narrative */}
              <div style={{
                fontSize: 14, lineHeight: 1.6, color: 'var(--text)',
                padding: '12px 14px', background: 'var(--paper-2)',
                borderRadius: 8, marginBottom: 12,
                borderLeft: '3px solid var(--accent)',
              }}>
                {review.narrative}
              </div>

              {/* Highlights */}
              {review.highlights?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                    Highlights
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {review.highlights.map((h, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                        <span style={{ color: 'var(--accent)', fontSize: 11, marginTop: 2, flexShrink: 0 }}>★</span>
                        <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>{h}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next week focus */}
              <div style={{
                fontSize: 13, color: 'var(--text)', padding: '10px 12px',
                background: '#f0f9f4', border: '1px solid #b7e4c7',
                borderRadius: 8, display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>🎯</span>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#2d6a4f', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>
                    Next week
                  </div>
                  {review.next_week_focus}
                </div>
              </div>

              <button
                onClick={handleGenerate}
                style={{
                  marginTop: 12, background: 'none', border: '1px solid var(--line)',
                  borderRadius: 6, fontSize: 11, padding: '4px 10px',
                  cursor: 'pointer', color: 'var(--muted)', fontFamily: 'inherit',
                }}
              >
                ↻ Regenerate
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
