import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, ComposedChart, Line, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine,
} from 'recharts';
import { fetchAiUsageGbp, AiUsageSummary } from '../lib/api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

// 'YYYY-MM-DD' -> 'Jun 9'
function fmtDayLabel(iso: string): string {
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  return `${MONTHS[m - 1] ?? '?'} ${d}`;
}

// Money axis ticks — compact
function fmtAxisMoney(v: number): string {
  if (v === 0) return '£0';
  if (v < 1) return `£${v.toFixed(3)}`;
  return `£${v.toFixed(2)}`;
}

function fmtFullMoney(v: number): string {
  return `£${v.toFixed(4)}`;
}

const ACCENT = '#0c6d73';
const WARNING = '#ad7400';

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

  if (loading && !data) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Loading AI usage…</div>;
  }

  const today = data?.today ?? { cost: '0', calls: '0', tokens: '0' };
  const week = data?.week ?? { cost: '0', calls: '0', tokens: '0' };
  const month = data?.month ?? { cost: '0', calls: '0', tokens: '0' };
  const byRoute = data?.byRoute ?? [];
  const daily = data?.daily ?? [];
  const monthDaily = data?.monthDaily ?? [];

  // ── Projection maths ─────────────────────────────────────────────
  const now = new Date();
  const daysIntoMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthName = MONTHS[now.getMonth()];
  const monthCost = Number(month.cost);
  const dailyAvg = daysIntoMonth > 0 ? monthCost / daysIntoMonth : 0;
  const projectedMonth = dailyAvg * daysInMonth;

  // ── 14-day daily series (fill gaps with zero, oldest → newest) ───
  const dailyMap = new Map<string, { cost: number; calls: number }>();
  daily.forEach(d => dailyMap.set(d.day, { cost: Number(d.cost), calls: Number(d.calls) }));
  const dailySeries: { label: string; cost: number; calls: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const iso = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const e = dailyMap.get(iso);
    dailySeries.push({ label: fmtDayLabel(iso), cost: e?.cost ?? 0, calls: e?.calls ?? 0 });
  }

  // ── Month projection series: cumulative actual vs projected line ─
  const costByDay = new Map<number, number>();
  monthDaily.forEach(d => {
    const dayNum = Number(d.day.split('-')[2]);
    if (!Number.isNaN(dayNum)) costByDay.set(dayNum, Number(d.cost));
  });
  let cum = 0;
  const monthSeries: { day: number; actual: number | null; projected: number }[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    if (day <= daysIntoMonth) cum += costByDay.get(day) ?? 0;
    monthSeries.push({
      day,
      actual: day <= daysIntoMonth ? Number(cum.toFixed(6)) : null,
      projected: Number((dailyAvg * day).toFixed(6)),
    });
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--paper)', border: '1px solid var(--line)',
    borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '16px',
  };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
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

      {error && (
        <div style={{ padding: '12px 16px', background: '#fff0f0', borderRadius: 'var(--radius)', color: 'var(--danger)', fontSize: 13 }}>{error}</div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>Today</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{fmtFullMoney(Number(today.cost))}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{Number(today.calls).toLocaleString()} calls · {Number(today.tokens).toLocaleString()} tokens</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>This week</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{fmtFullMoney(Number(week.cost))}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{Number(week.calls).toLocaleString()} calls · {Number(week.tokens).toLocaleString()} tokens</div>
        </div>
        <div style={{ ...cardStyle, borderColor: WARNING, background: '#fffaf0' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: WARNING, fontWeight: 700, marginBottom: 6 }}>Projected this month</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{fmtFullMoney(projectedMonth)}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            {fmtFullMoney(monthCost)} spent · day {daysIntoMonth} of {daysInMonth}
          </div>
        </div>
      </div>

      {/* Month projection — cumulative actual vs projected */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{monthName} projection</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Heading toward <strong style={{ color: WARNING }}>{fmtFullMoney(projectedMonth)}</strong> by month end
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          Cumulative spend so far vs. the trend if usage continues at {fmtFullMoney(dailyAvg)}/day.
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={monthSeries} margin={{ top: 8, right: 16, left: 4, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              interval={daysInMonth > 16 ? 2 : 0}
              tickLine={false}
              label={{ value: `Day of ${monthName}`, position: 'insideBottom', offset: -14, fontSize: 11, fill: 'var(--muted)' }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              tickFormatter={fmtAxisMoney}
              width={56}
              label={{ value: 'Cumulative £', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'var(--muted)', style: { textAnchor: 'middle' } }}
            />
            <Tooltip
              formatter={(v: any, name: string) => [v == null ? '—' : fmtFullMoney(Number(v)), name === 'actual' ? 'Actual' : 'Projected']}
              labelFormatter={(d) => `Day ${d}`}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--line)' }}
            />
            <Legend
              verticalAlign="top"
              height={28}
              iconType="plainline"
              formatter={(value) => value === 'actual' ? 'Actual spend' : 'Projected trend'}
              wrapperStyle={{ fontSize: 12 }}
            />
            <ReferenceLine x={daysIntoMonth} stroke="var(--muted)" strokeDasharray="2 4" />
            <Area
              type="monotone"
              dataKey="actual"
              stroke={ACCENT}
              strokeWidth={2.5}
              fill={ACCENT}
              fillOpacity={0.12}
              connectNulls={false}
              dot={false}
              name="actual"
            />
            <Line
              type="monotone"
              dataKey="projected"
              stroke={WARNING}
              strokeWidth={2}
              strokeDasharray="6 5"
              dot={false}
              name="projected"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Daily spend — last 14 days */}
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>Daily spend</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>What you spent each of the last 14 days.</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={dailySeries} margin={{ top: 8, right: 12, left: 4, bottom: 28 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'var(--muted)' }}
              interval={0}
              angle={-40}
              textAnchor="end"
              height={48}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              tickFormatter={fmtAxisMoney}
              width={56}
              label={{ value: 'Spend £', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'var(--muted)', style: { textAnchor: 'middle' } }}
            />
            <Tooltip
              formatter={(v: any) => [fmtFullMoney(Number(v)), 'Spent']}
              labelFormatter={(l) => `${l}`}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--line)' }}
              cursor={{ fill: 'var(--accent-soft)', opacity: 0.4 }}
            />
            <Bar dataKey="cost" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={42} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* By feature */}
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>By feature</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Cost per AI feature over the last 7 days.</div>
        {byRoute.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>No AI requests tracked yet. They will appear as you use the app.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {byRoute.map(r => (
              <div key={r.route + r.model} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.route}</span>
                  <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 12 }}>({r.model})</span>
                </div>
                <div style={{ display: 'flex', gap: 14, color: 'var(--muted)', fontSize: 12, alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{fmtFullMoney(Number(r.cost))}</span>
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
