import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchGoals, createGoal, updateGoal, updateGoalProgress, deleteGoal,
  fetchAIGoalSuggestions,
  Goal, GoalSuggestion,
} from '../lib/api';

// ─── constants ────────────────────────────────────────────────────────────────

const GOAL_TYPES = [
  { value: 'story',       label: '📖 Story' },
  { value: 'collection',  label: '💎 Collection' },
  { value: 'achievement', label: '🏆 Achievement' },
  { value: 'challenge',   label: '⚔️ Challenge' },
  { value: 'time',        label: '⏱ Time' },
  { value: 'custom',      label: '📌 Custom' },
];

const PRIORITIES = [
  { value: 'low',      label: 'Low',      color: 'var(--muted)' },
  { value: 'medium',   label: 'Medium',   color: 'var(--accent)' },
  { value: 'high',     label: 'High',     color: 'var(--warning)' },
  { value: 'critical', label: 'Critical', color: 'var(--danger)' },
];

const STATUSES = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed',   label: 'Completed' },
  { value: 'archived',    label: 'Archived' },
  { value: 'abandoned',   label: 'Abandoned' },
];

const PROGRESS_TYPES = [
  { value: 'percentage', label: 'Percentage (0–100%)' },
  { value: 'numeric',    label: 'Numeric (e.g. 67 / 100)' },
  { value: 'binary',     label: 'Binary (done / not done)' },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function pctColor(pct: number): string {
  if (pct >= 80) return 'var(--success)';
  if (pct >= 50) return 'var(--accent)';
  if (pct >= 25) return 'var(--warning)';
  return 'var(--danger)';
}

function priorityColor(p: string): string {
  return PRIORITIES.find(x => x.value === p)?.color ?? 'var(--muted)';
}

function typeLabel(t: string): string {
  return GOAL_TYPES.find(x => x.value === t)?.label ?? t;
}

function statusLabel(s: string): string {
  return STATUSES.find(x => x.value === s)?.label ?? s;
}

function progressLabel(g: Goal): string {
  if (g.progress_type === 'binary') return g.current_value >= 1 ? 'Done' : 'Not done';
  if (g.progress_type === 'numeric') return `${g.current_value} / ${g.target_value}`;
  return `${g.percentage}%`;
}

const BLANK_FORM = {
  title: '', description: '', goal_type: 'custom', priority: 'medium',
  progress_type: 'percentage', target_value: '100', notes: '',
};

// ─── sub-components ──────────────────────────────────────────────────────────

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: 'var(--soft-line)', overflow: 'hidden', marginTop: 4 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width .3s' }} />
    </div>
  );
}

function GoalRow({
  goal, onUpdate, onDelete, showGame = false,
}: {
  goal: Goal;
  onUpdate: (id: number, data: Partial<Goal>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  showGame?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [progInput, setProgInput] = useState(String(goal.current_value));
  const [saving, setSaving] = useState(false);
  const color = pctColor(goal.percentage);

  async function handleProgressSave() {
    setSaving(true);
    await onUpdate(goal.id, {
      current_value: Number(progInput),
      target_value: goal.target_value,
    });
    setSaving(false);
    setExpanded(false);
  }

  async function handleComplete() {
    setSaving(true);
    await onUpdate(goal.id, { current_value: goal.target_value, target_value: goal.target_value });
    setSaving(false);
  }

  const isBinary   = goal.progress_type === 'binary';
  const isDone     = goal.status === 'completed';
  const isAbandoned = goal.status === 'abandoned' || goal.status === 'archived';

  return (
    <div style={{
      padding: '10px 0',
      borderBottom: '1px solid var(--soft-line)',
      opacity: isAbandoned ? 0.5 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {/* binary checkbox */}
        {isBinary && (
          <input
            type="checkbox"
            checked={isDone}
            disabled={saving}
            onChange={() => onUpdate(goal.id, {
              current_value: isDone ? 0 : 1,
              target_value: 1,
            })}
            style={{ marginTop: 3, accentColor: 'var(--accent)', flexShrink: 0 }}
          />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 13, fontWeight: 700,
              textDecoration: isDone ? 'line-through' : 'none',
              color: isDone ? 'var(--muted)' : 'var(--ink)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{goal.title}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, color: priorityColor(goal.priority),
              textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0,
            }}>{goal.priority}</span>
            <span style={{
              fontSize: 10, color: 'var(--muted)', flexShrink: 0,
            }}>{typeLabel(goal.goal_type)}</span>
          </div>

          {showGame && (
            <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginTop: 2 }}>
              {goal.game}
            </div>
          )}

          {goal.description && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{goal.description}</div>
          )}

          {!isBinary && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{progressLabel(goal)}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: color }}>{goal.percentage}%</span>
              </div>
              <ProgressBar pct={goal.percentage} color={color} />
            </>
          )}

          {/* inline progress update */}
          {expanded && !isDone && (
            <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {goal.progress_type === 'percentage' ? (
                <input
                  type="range" min={0} max={100} value={progInput}
                  onChange={e => setProgInput(e.target.value)}
                  style={{ flex: 1, accentColor: 'var(--accent)', minWidth: 80 }}
                />
              ) : (
                <input
                  type="number" min={0} max={Number(goal.target_value)} value={progInput}
                  onChange={e => setProgInput(e.target.value)}
                  style={{
                    width: 80, padding: '4px 6px', border: '1px solid var(--line)',
                    borderRadius: 'var(--radius-sm)', fontSize: 12,
                    background: 'var(--paper)', color: 'var(--ink)',
                  }}
                />
              )}
              <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 30 }}>
                {goal.progress_type === 'percentage' ? `${progInput}%` : `/ ${goal.target_value}`}
              </span>
              <button
                onClick={handleProgressSave}
                disabled={saving}
                style={{
                  padding: '4px 10px', background: 'var(--accent)', color: '#fff',
                  border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 12,
                  cursor: 'pointer', fontWeight: 600,
                }}
              >{saving ? '…' : 'Save'}</button>
              <button
                onClick={() => setExpanded(false)}
                style={{
                  padding: '4px 8px', background: 'none', color: 'var(--muted)',
                  border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
                  fontSize: 12, cursor: 'pointer',
                }}
              >Cancel</button>
            </div>
          )}
        </div>

        {/* action buttons */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginTop: 1 }}>
          {!isDone && !isBinary && !isAbandoned && (
            <>
              <button
                onClick={() => { setProgInput(String(goal.current_value)); setExpanded(e => !e); }}
                title="Update progress"
                style={{
                  padding: '3px 7px', fontSize: 11, border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)', background: 'none',
                  color: 'var(--accent)', cursor: 'pointer', fontWeight: 600,
                }}
              >+</button>
              <button
                onClick={handleComplete}
                disabled={saving}
                title="Mark complete"
                style={{
                  padding: '3px 7px', fontSize: 11, border: '1px solid var(--success)',
                  borderRadius: 'var(--radius-sm)', background: 'none',
                  color: 'var(--success)', cursor: 'pointer', fontWeight: 600,
                }}
              >✓</button>
            </>
          )}
          <button
            onClick={() => onDelete(goal.id)}
            title="Delete"
            style={{
              padding: '3px 7px', fontSize: 11, border: '1px solid var(--soft-line)',
              borderRadius: 'var(--radius-sm)', background: 'none',
              color: 'var(--muted)', cursor: 'pointer',
            }}
          >×</button>
        </div>
      </div>
    </div>
  );
}

// ─── AI Suggestions panel ────────────────────────────────────────────────────

function SuggestionsPanel({
  game, games, onAccept, onClose,
}: {
  game: string;
  games: string[];
  onAccept: (s: GoalSuggestion) => void;
  onClose: () => void;
}) {
  const [selectedGame, setSelectedGame] = useState(game || (games[0] ?? ''));
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<GoalSuggestion[]>([]);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');

  async function load() {
    if (!selectedGame) return;
    setLoading(true);
    setError('');
    setSuggestions([]);
    setAccepted(new Set());
    try {
      const s = await fetchAIGoalSuggestions(selectedGame);
      setSuggestions(s);
    } catch {
      setError('Failed to generate suggestions. Try again.');
    }
    setLoading(false);
  }

  function accept(i: number) {
    setAccepted(a => new Set([...a, i]));
    onAccept({ ...suggestions[i], } as GoalSuggestion);
  }

  return (
    <div style={{
      background: 'var(--paper-2)', border: '1px solid var(--line)',
      borderRadius: 'var(--radius)', padding: 16, marginTop: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>🤖 AI Goal Suggestions</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>×</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <select
          value={selectedGame}
          onChange={e => setSelectedGame(e.target.value)}
          style={{
            flex: 1, padding: '6px 8px', border: '1px solid var(--line)',
            borderRadius: 'var(--radius-sm)', fontSize: 13,
            background: 'var(--paper)', color: 'var(--ink)',
          }}
        >
          {games.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <button
          onClick={load}
          disabled={loading || !selectedGame}
          style={{
            padding: '6px 14px', background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13,
            cursor: 'pointer', fontWeight: 600, flexShrink: 0,
          }}
        >{loading ? 'Thinking…' : 'Suggest'}</button>
      </div>

      {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{error}</div>}

      {loading && (
        <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
          Analysing your play history…
        </div>
      )}

      {suggestions.map((s, i) => (
        <div key={i} style={{
          padding: '10px 12px', marginBottom: 8,
          background: accepted.has(i) ? 'var(--paper)' : 'var(--paper)',
          border: `1px solid ${accepted.has(i) ? 'var(--success)' : 'var(--soft-line)'}`,
          borderRadius: 'var(--radius-sm)', opacity: accepted.has(i) ? 0.6 : 1,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{s.title}</div>
              {s.description && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{s.description}</div>}
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                {typeLabel(s.goal_type)} · {s.priority} priority · {s.reason}
              </div>
            </div>
            <button
              onClick={() => accept(i)}
              disabled={accepted.has(i)}
              style={{
                padding: '4px 12px', fontSize: 12, fontWeight: 600,
                background: accepted.has(i) ? 'var(--soft-line)' : 'var(--success)',
                color: accepted.has(i) ? 'var(--muted)' : '#fff',
                border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                flexShrink: 0,
              }}
            >{accepted.has(i) ? '✓ Added' : 'Accept'}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── AddGoalForm ─────────────────────────────────────────────────────────────

function AddGoalForm({
  games, defaultGame = '', onSave, onCancel,
}: {
  games: string[];
  defaultGame?: string;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ ...BLANK_FORM, game: defaultGame });
  const [saving, setSaving] = useState(false);

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.game || !form.title.trim()) return;
    setSaving(true);
    await onSave({
      ...form,
      target_value: Number(form.target_value) || 100,
      current_value: 0,
    });
    setSaving(false);
    setForm({ ...BLANK_FORM, game: defaultGame });
    onCancel();
  }

  const isBinary = form.progress_type === 'binary';

  return (
    <div style={{
      background: 'var(--paper-2)', border: '1px solid var(--line)',
      borderRadius: 'var(--radius)', padding: 14, marginTop: 12,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>New Goal</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* game */}
        <select value={form.game} onChange={e => set('game', e.target.value)}
          style={{ padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)' }}>
          <option value="">— select game —</option>
          {games.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        {/* title */}
        <input
          placeholder="Goal title (e.g. Reach Chapter 8)"
          value={form.title}
          onChange={e => set('title', e.target.value)}
          style={{ padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)' }}
        />

        {/* description */}
        <input
          placeholder="Description (optional)"
          value={form.description}
          onChange={e => set('description', e.target.value)}
          style={{ padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)' }}
        />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* type */}
          <select value={form.goal_type} onChange={e => set('goal_type', e.target.value)}
            style={{ flex: 1, minWidth: 120, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)' }}>
            {GOAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          {/* priority */}
          <select value={form.priority} onChange={e => set('priority', e.target.value)}
            style={{ flex: 1, minWidth: 100, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)' }}>
            {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* progress type */}
          <select value={form.progress_type} onChange={e => set('progress_type', e.target.value)}
            style={{ flex: 2, minWidth: 150, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)' }}>
            {PROGRESS_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>

          {/* target value */}
          {!isBinary && (
            <input
              type="number" min={1}
              placeholder={form.progress_type === 'percentage' ? '100' : 'Target'}
              value={form.target_value}
              onChange={e => set('target_value', e.target.value)}
              style={{ flex: 1, minWidth: 70, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)' }}
            />
          )}
        </div>

        {/* notes */}
        <input
          placeholder="Notes (optional)"
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          style={{ padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)' }}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onCancel}
            style={{ padding: '6px 14px', background: 'none', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, cursor: 'pointer', color: 'var(--muted)' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !form.game || !form.title.trim()}
            style={{ padding: '6px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Add Goal'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main widget ─────────────────────────────────────────────────────────────

export default function GoalsWidget() {
  const [open, setOpen] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [games, setGames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestGame, setSuggestGame] = useState('');
  const [filter, setFilter] = useState<'active' | 'completed' | 'all'>('active');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await fetchGoals();
      setGoals(all);
      const gSet = new Set(all.map(g => g.game));
      // also get games from logs via API
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}api/logs`);
        if (r.ok) {
          const logs: any[] = await r.json();
          logs.forEach((l: any) => gSet.add(l.game));
        }
      } catch { /* ignore */ }
      setGames([...gSet].sort());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleUpdate(id: number, data: Partial<Goal>) {
    const updated = await updateGoal(id, data);
    setGoals(gs => gs.map(g => g.id === id ? updated : g));
  }

  async function handleDelete(id: number) {
    await deleteGoal(id);
    setGoals(gs => gs.filter(g => g.id !== id));
  }

  async function handleCreate(data: any) {
    const created = await createGoal(data);
    setGoals(gs => [created, ...gs]);
  }

  async function handleAcceptSuggestion(s: GoalSuggestion) {
    const created = await createGoal({
      game: suggestGame || games[0] || '',
      title: s.title,
      description: s.description,
      goal_type: s.goal_type,
      priority: s.priority,
      progress_type: s.progress_type,
      target_value: s.target_value,
      current_value: 0,
    });
    setGoals(gs => [created, ...gs]);
  }

  const active    = goals.filter(g => ['not_started','in_progress'].includes(g.status));
  const near      = active.filter(g => g.percentage >= 80);
  const inProg    = active.filter(g => g.percentage > 0 && g.percentage < 80);
  const notStarted = active.filter(g => g.percentage === 0);
  const completed = goals.filter(g => g.status === 'completed');

  const displayed = filter === 'active'    ? active
                  : filter === 'completed' ? completed
                  : goals.filter(g => !['archived','abandoned'].includes(g.status));

  // group by game for active view
  const byGame = filter === 'active'
    ? [...new Set(displayed.map(g => g.game))].map(game => ({
        game,
        goals: displayed.filter(g => g.game === game),
      }))
    : null;

  // header stats
  const nearCount = near.length;

  return (
    <div className="dash-card" style={{ marginBottom: 16 }}>
      {/* header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--success) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0,
          }}>🎯</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Personal Goals</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {active.length} active · {completed.length} completed
              </span>
              {nearCount > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--success)',
                  background: 'rgba(var(--success-rgb, 34,139,34), 0.1)',
                  padding: '1px 6px', borderRadius: 10,
                }}>🏁 {nearCount} near done</span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={e => { e.stopPropagation(); setShowAdd(a => !a); if (!open) setOpen(true); }}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--paper-2)', border: '1px solid var(--line)',
              cursor: 'pointer', fontSize: 18, color: 'var(--muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
            }}
            title="Add goal"
          >+</button>
        </div>
      </div>

      {/* body */}
      {open && (
        <div style={{ marginTop: 14 }}>
          {/* filter tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {(['active','completed','all'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '4px 12px', fontSize: 12, fontWeight: 600,
                  border: '1px solid var(--line)', borderRadius: 20,
                  cursor: 'pointer',
                  background: filter === f ? 'var(--accent)' : 'none',
                  color: filter === f ? '#fff' : 'var(--muted)',
                }}
              >{f.charAt(0).toUpperCase() + f.slice(1)}</button>
            ))}
            <button
              onClick={() => { setSuggestGame(games[0] ?? ''); setShowSuggest(s => !s); }}
              style={{
                padding: '4px 12px', fontSize: 12, fontWeight: 600,
                border: '1px solid var(--line)', borderRadius: 20,
                cursor: 'pointer', marginLeft: 'auto',
                background: showSuggest ? 'var(--paper-2)' : 'none',
                color: 'var(--accent)',
              }}
            >🤖 Suggest</button>
          </div>

          {/* AI suggestions panel */}
          {showSuggest && (
            <SuggestionsPanel
              game={suggestGame}
              games={games}
              onAccept={s => { handleAcceptSuggestion(s); }}
              onClose={() => setShowSuggest(false)}
            />
          )}

          {/* add form */}
          {showAdd && (
            <AddGoalForm
              games={games}
              onSave={handleCreate}
              onCancel={() => setShowAdd(false)}
            />
          )}

          {/* near completion highlight */}
          {filter === 'active' && near.length > 0 && (
            <div style={{
              background: 'rgba(34,139,34,0.06)', border: '1px solid var(--success)',
              borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: 12,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Almost Done
              </div>
              {near.map(g => (
                <div key={g.id} style={{ fontSize: 12, color: 'var(--ink)', padding: '2px 0' }}>
                  ✓ {g.title} <span style={{ color: 'var(--muted)' }}>({g.game})</span>
                </div>
              ))}
            </div>
          )}

          {/* goal list */}
          {loading && <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0' }}>Loading…</div>}

          {!loading && displayed.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0', textAlign: 'center' }}>
              {filter === 'completed' ? 'No completed goals yet.' : 'No goals yet — add one or try AI suggestions.'}
            </div>
          )}

          {byGame
            ? byGame.map(({ game, goals: gameGoals }) => (
                <div key={game} style={{ marginBottom: 8 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    padding: '6px 0 2px',
                    borderBottom: '1px solid var(--soft-line)',
                  }}>{game}</div>
                  {gameGoals.map(g => (
                    <GoalRow key={g.id} goal={g} onUpdate={handleUpdate} onDelete={handleDelete} />
                  ))}
                </div>
              ))
            : displayed.map(g => (
                <GoalRow key={g.id} goal={g} onUpdate={handleUpdate} onDelete={handleDelete} showGame />
              ))
          }

          {/* completed goals summary */}
          {filter === 'active' && completed.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => setFilter('completed')}
                style={{
                  fontSize: 12, color: 'var(--accent)', background: 'none',
                  border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0,
                }}
              >View {completed.length} completed goal{completed.length !== 1 ? 's' : ''} →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
