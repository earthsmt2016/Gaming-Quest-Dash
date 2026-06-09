import React, { useEffect, useState } from 'react';
import { fetchAiUsage, AiUsageSummary } from '../lib/api';

export default function AiUsagePage() {
  const [data, setData] = useState<AiUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAiUsage().then(d => setData(d)).catch(() => setError('Failed to load AI usage')).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Loading AI usage…</div>;
  }

  const today = data?.today ?? { cost: '0', calls: '0', tokens: '0' };
  const week = data?.week ?? { cost: '0', calls: '0', tokens: '0' };
  const byRoute = data?.byRoute ?? [];
  const daily = data?.daily ?? [];

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>
          AI Usage
        </div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>OpenAI Cost Monitor</h2>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          Track what AI features cost you money. Costs are estimates based on token usage.
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div style={{
          background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '16px',
        }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>Today</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>${Number(today.cost).toFixed(4)}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{Number(today.calls).toLocaleString()} calls · {Number(today.tokens).toLocaleString()} tokens</div>
        </div>
        <div style={{
          background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '16px',
        }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>This week</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>${Number(week.cost).toFixed(4)}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{Number(week.calls).toLocaleString()} calls · {Number(week.tokens).toLocaleString()} tokens</div>
        </div>
      </div>

      {/* Daily breakdown */}
      {daily.length > 0 && (
        <div style={{
          background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '16px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Daily spend</div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {daily.map(d => {
              const maxCost = Math.max(...daily.map(x => Number(x.cost)), 0.001);
              const h = maxCost ? Math.max(4, (Number(d.cost) / maxCost) * 80) : 4;
              return (
                <div key={d.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 36 }}>
                  <div style={{
                    width: 28, height: h, background: 'var(--accent)', borderRadius: '3px 3px 0 0', opacity: 0.7,
                  }} />
                  <div style={{ fontSize: 10, color: 'var(--muted)', transform: 'rotate(-30deg)', transformOrigin: 'top left', whiteSpace: 'nowrap' }}>
                    {d.day.slice(5)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700 }}>${Number(d.cost).toFixed(3)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* By route */}
      <div style={{
        background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '16px',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>By feature (7 days)</div>
        {byRoute.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>No AI requests tracked yet. They will appear as you use the app.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {byRoute.map(r => (
              <div key={r.route + r.model} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.route}</span>
                  <span style={{ color: 'var(--muted)', marginLeft: 6 }}>({r.model})</span>
                </div>
                <div style={{ display: 'flex', gap: 12, color: 'var(--muted)', fontSize: 12 }}>
                  <span>${Number(r.cost).toFixed(4)}</span>
                  <span>{Number(r.calls).toLocaleString()} calls</span>
                  <span>{Number(r.tokens).toLocaleString()} tokens</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
