import React, { useEffect, useState, useCallback } from 'react';
import { fetchAiUsageGbp, AiUsageSummary } from '../lib/api';

export default function AiUsagePage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [data, setData] = useState<AiUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError('');
    fetchAiUsageGbp()
      .then(d => { setData(d); setLastUpdate(new Date()); })
      .catch(() => setError('Failed to load AI usage'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => {
      refresh();
    }, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Loading AI usage…</div>;
  }

  const today = data?.today ?? { cost: '0', calls: '0', tokens: '0' };
  const week = data?.week ?? { cost: '0', calls: '0', tokens: '0' };
  const month = data?.month ?? { cost: '0', calls: '0', tokens: '0' };
  const byRoute = data?.byRoute ?? [];
  const daily = data?.daily ?? [];
  const monthDaily = data?.monthDaily ?? [];

  const monthCost = Number(month.cost);
  const daysIntoMonth = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const projectedMonth = daysIntoMonth > 0 ? (monthCost / daysIntoMonth) * daysInMonth : 0;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>
          AI Usage
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>OpenAI Cost Monitor</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn"
              onClick={refresh}
              style={{ fontSize: 12, padding: '6px 12px' }}
              title="Refresh usage data"
            >
              &#x21bb; Refresh
            </button>
            <button
              className="btn primary"
              onClick={() => onNavigate('ai-cost')}
              style={{ fontSize: 12, padding: '6px 12px' }}
            >
              Configure
            </button>
          </div>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          Track what AI features cost you money. Costs are estimates based on token usage.
          {lastUpdate && (
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)' }}>
              Updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div style={{
          background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '16px',
        }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>Today</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>£{Number(today.cost).toFixed(4)}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{Number(today.calls).toLocaleString()} calls · {Number(today.tokens).toLocaleString()} tokens</div>
        </div>
        <div style={{
          background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '16px',
        }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>This week</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>£{Number(week.cost).toFixed(4)}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{Number(week.calls).toLocaleString()} calls · {Number(week.tokens).toLocaleString()} tokens</div>
        </div>
        <div style={{
          background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '16px',
        }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>Month (projected)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>£{projectedMonth.toFixed(4)}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Actual: £{monthCost.toFixed(4)} ({daysIntoMonth}/{daysInMonth} days)
          </div>
        </div>
      </div>

      {/* Daily breakdown (14 days) */}
      {daily.length > 0 && (
        <div style={{
          background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '16px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Daily spend (14 days)</div>
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
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700 }}>£{Number(d.cost).toFixed(3)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Monthly projection graph */}
      {monthDaily.length > 0 && (
        <div style={{
          background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '16px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Month projection</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 110, paddingBottom: 24, position: 'relative' }}>
            {monthDaily.map((d, i) => {
              const maxCost = Math.max(...monthDaily.map(x => Number(x.cost)), 0.001);
              const h = maxCost ? Math.max(4, (Number(d.cost) / maxCost) * 90) : 4;
              const isToday = i === monthDaily.length - 1;
              return (
                <div key={d.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: '100%', maxWidth: 18, height: h,
                    background: isToday ? 'var(--accent)' : '#cbd5e1',
                    borderRadius: '2px 2px 0 0', opacity: 0.85,
                    transition: 'height 0.3s',
                  }} />
                  <div style={{
                    fontSize: 9, color: 'var(--muted)', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 30,
                  }}>
                    {d.day.slice(8)}
                  </div>
                </div>
              );
            })}
            {/* Projection line */}
            {(() => {
              const maxCost = Math.max(...monthDaily.map(x => Number(x.cost)), 0.001);
              const avgDaily = daysInMonth > 0 ? projectedMonth / daysInMonth : 0;
              const lineHeight = maxCost ? (avgDaily / maxCost) * 90 : 0;
              return projectedMonth > 0 && lineHeight > 0 ? (
                <div style={{
                  position: 'absolute', bottom: 24 + lineHeight, left: 0, right: 0,
                  borderTop: '2px dashed var(--warning)', opacity: 0.5,
                  height: 0,
                }} />
              ) : null;
            })()}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span>Dashed line = projected daily average</span>
            <span>At current rate: ~£{projectedMonth.toFixed(2)}/month</span>
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
                  <span>£{Number(r.cost).toFixed(4)}</span>
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
