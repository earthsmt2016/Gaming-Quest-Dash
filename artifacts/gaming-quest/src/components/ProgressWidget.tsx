import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchAllProgress, updateGameProgress, fetchGameProgress,
  addMilestone, deleteMilestone,
  GameProgressRow, ProgressMilestone,
} from '../lib/api';

const STATUS_OPTIONS = [
  { value: 'not_started',    label: 'Not Started' },
  { value: 'active',         label: 'Active' },
  { value: 'near_completion',label: 'Near Completion' },
  { value: 'paused',         label: 'Paused' },
  { value: 'retired',        label: 'Retired' },
  { value: 'abandoned',      label: 'Abandoned' },
];

const MILESTONE_CATEGORIES = [
  { value: 'story',       label: '📖 Story' },
  { value: 'boss',        label: '⚔️ Boss' },
  { value: 'collection',  label: '💎 Collection' },
  { value: 'achievement', label: '🏆 Achievement' },
  { value: 'other',       label: '📌 Other' },
];

function pctColor(pct: number): string {
  if (pct >= 80) return 'var(--success)';
  if (pct >= 50) return 'var(--accent)';
  if (pct >= 25) return 'var(--warning)';
  return 'var(--danger)';
}

function statusLabel(s: string): string {
  return STATUS_OPTIONS.find(o => o.value === s)?.label ?? s;
}

function fmtHours(h: number | null): string {
  if (!h) return '';
  if (h < 1) return `${Math.round(h * 60)}m left`;
  return `~${Math.round(h)}h left`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

interface UpdateForm {
  percentage: number;
  status: string;
  estimated_hours_remaining: string;
  notes: string;
}

interface MilestoneForm {
  title: string;
  category: string;
  progress_value: string;
}

export default function ProgressWidget() {
  const [open, setOpen]           = useState(false);
  const [games, setGames]         = useState<GameProgressRow[]>([]);
  const [loading, setLoading]     = useState(false);
  const [updating, setUpdating]   = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [updateForm, setUpdateForm] = useState<UpdateForm>({ percentage: 0, status: 'active', estimated_hours_remaining: '', notes: '' });
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [milestones, setMilestones] = useState<Record<string, ProgressMilestone[]>>({});
  const [mlForm, setMlForm]       = useState<Record<string, MilestoneForm>>({});
  const [mlAdding, setMlAdding]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchAllProgress();
    setGames(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (open && games.length === 0) load(); }, [open]); // eslint-disable-line

  const openUpdate = (g: GameProgressRow) => {
    setUpdating(g.game);
    setUpdateForm({
      percentage: g.current_percentage,
      status: g.status,
      estimated_hours_remaining: g.estimated_hours_remaining ? String(g.estimated_hours_remaining) : '',
      notes: g.notes ?? '',
    });
  };

  const handleSave = async (game: string) => {
    setSaving(true);
    try {
      const pct = Math.max(0, Math.min(100, Number(updateForm.percentage)));
      const updated = await updateGameProgress(game, {
        percentage: pct,
        status: updateForm.status,
        estimated_hours_remaining: updateForm.estimated_hours_remaining
          ? parseFloat(updateForm.estimated_hours_remaining) : null,
        notes: updateForm.notes || undefined,
      });
      setGames(prev => prev.map(g => g.game === game ? { ...g, ...updated } : g));
      setUpdating(null);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const handleExpandMilestones = async (game: string) => {
    if (expanded === game) { setExpanded(null); return; }
    setExpanded(game);
    if (!milestones[game]) {
      const detail = await fetchGameProgress(game);
      if (detail) {
        setMilestones(prev => ({ ...prev, [game]: detail.milestones }));
      }
    }
  };

  const handleAddMilestone = async (game: string) => {
    const f = mlForm[game];
    if (!f?.title?.trim()) return;
    const ml = await addMilestone(game, {
      title: f.title.trim(),
      category: f.category ?? 'story',
      progress_value: f.progress_value ? parseInt(f.progress_value) : undefined,
    });
    setMilestones(prev => ({ ...prev, [game]: [ml, ...(prev[game] ?? [])] }));
    setMlAdding(null);
    setMlForm(prev => ({ ...prev, [game]: { title: '', category: 'story', progress_value: '' } }));
    setGames(prev => prev.map(g => g.game === game
      ? { ...g, milestone_count: g.milestone_count + 1, milestones_completed: g.milestones_completed + 1 }
      : g
    ));
  };

  const handleDeleteMilestone = async (game: string, id: number) => {
    await deleteMilestone(game, id);
    setMilestones(prev => ({ ...prev, [game]: (prev[game] ?? []).filter(m => m.id !== id) }));
    setGames(prev => prev.map(g => g.game === game
      ? { ...g, milestone_count: Math.max(0, g.milestone_count - 1), milestones_completed: Math.max(0, g.milestones_completed - 1) }
      : g
    ));
  };

  const tracked  = games.filter(g => g.current_percentage > 0).length;
  const nearComp = games.filter(g => g.current_percentage >= 80 && g.status !== 'completed');
  const active   = games.filter(g => g.current_percentage > 0 && g.current_percentage < 80 && !['completed','paused','retired','abandoned'].includes(g.status));
  const others   = games.filter(g => g.current_percentage === 0);

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', background: 'var(--paper)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>

      {/* Header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', cursor: 'pointer', userSelect: 'none', transition: 'background 0.12s' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-2)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'var(--accent)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
            📈
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', lineHeight: 1.2 }}>
              Game Progress
              {nearComp.length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: 'var(--success)', background: 'var(--accent-soft)', border: '1px solid var(--line)', borderRadius: 4, padding: '2px 7px', marginLeft: 8, verticalAlign: 'middle' }}>
                  🏁 {nearComp.length} near completion
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {tracked} of {games.length} games tracked
            </div>
          </div>
        </div>
        <span style={{ color: 'var(--muted)', fontSize: 20, lineHeight: 1 }}>{open ? '−' : '+'}</span>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid var(--soft-line)', padding: '14px 16px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
          )}

          {!loading && games.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Import some logs first to track game progress.</div>
          )}

          {!loading && games.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

              {/* Near Completion */}
              {nearComp.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div className="eyebrow" style={{ color: 'var(--success)', marginBottom: 8 }}>🏁 Near Completion</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {nearComp.map(g => (
                      <GameRow key={g.game} g={g} updating={updating} updateForm={updateForm} saving={saving}
                        expanded={expanded} milestones={milestones[g.game]} mlAdding={mlAdding} mlForm={mlForm[g.game]}
                        onOpenUpdate={openUpdate} onUpdateForm={setUpdateForm} onSave={handleSave} onCancel={() => setUpdating(null)}
                        onExpandMilestones={handleExpandMilestones} onAddMilestone={handleAddMilestone}
                        onDeleteMilestone={handleDeleteMilestone} onMlAdding={setMlAdding} onMlForm={setMlForm}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Active with progress */}
              {active.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>In Progress</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {active.map(g => (
                      <GameRow key={g.game} g={g} updating={updating} updateForm={updateForm} saving={saving}
                        expanded={expanded} milestones={milestones[g.game]} mlAdding={mlAdding} mlForm={mlForm[g.game]}
                        onOpenUpdate={openUpdate} onUpdateForm={setUpdateForm} onSave={handleSave} onCancel={() => setUpdating(null)}
                        onExpandMilestones={handleExpandMilestones} onAddMilestone={handleAddMilestone}
                        onDeleteMilestone={handleDeleteMilestone} onMlAdding={setMlAdding} onMlForm={setMlForm}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Not yet tracked */}
              {others.length > 0 && (
                <div>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>Not Yet Tracked ({others.length})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {others.slice(0, 8).map(g => (
                      <div key={g.game} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--soft-line)' }}>
                        <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{g.game}</span>
                        <button
                          onClick={() => openUpdate(g)}
                          style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 999, fontSize: 11, padding: '3px 10px', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontFamily: 'inherit' }}
                        >
                          + Set progress
                        </button>
                      </div>
                    ))}
                    {others.length > 8 && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', paddingTop: 4 }}>+{others.length - 8} more games without progress</div>
                    )}
                  </div>
                  {/* Inline update form for not-yet-tracked games (rendered outside the row) */}
                  {updating && others.some(g => g.game === updating) && (
                    <InlineUpdateForm
                      game={updating} form={updateForm} saving={saving}
                      onChange={setUpdateForm} onSave={handleSave} onCancel={() => setUpdating(null)}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline update form ────────────────────────────────────────────────────────
function InlineUpdateForm({ game, form, saving, onChange, onSave, onCancel }: {
  game: string;
  form: UpdateForm;
  saving: boolean;
  onChange: React.Dispatch<React.SetStateAction<UpdateForm>>;
  onSave: (game: string) => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ marginTop: 10, padding: '12px 14px', background: 'var(--paper-2)', border: '1px solid var(--soft-line)', borderRadius: 'var(--radius-sm)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Update — {game}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 100px', minWidth: 80 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3, fontWeight: 600 }}>Progress %</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="range" min={0} max={100} value={form.percentage}
              onChange={e => onChange(f => ({ ...f, percentage: Number(e.target.value) }))}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
            <span style={{ fontSize: 13, fontWeight: 800, color: pctColor(form.percentage), minWidth: 36, textAlign: 'right' }}>
              {form.percentage}%
            </span>
          </div>
        </div>
        <div style={{ flex: '0 0 auto' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3, fontWeight: 600 }}>Status</div>
          <select value={form.status} onChange={e => onChange(f => ({ ...f, status: e.target.value }))}
            style={{ border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div style={{ flex: '0 0 80px' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3, fontWeight: 600 }}>Hours left</div>
          <input type="number" min={0} step={0.5} placeholder="e.g. 8" value={form.estimated_hours_remaining}
            onChange={e => onChange(f => ({ ...f, estimated_hours_remaining: e.target.value }))}
            style={{ width: '100%', border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit' }}
          />
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3, fontWeight: 600 }}>Notes (optional)</div>
        <input type="text" placeholder="e.g. Just cleared act 2" value={form.notes}
          onChange={e => onChange(f => ({ ...f, notes: e.target.value }))}
          style={{ width: '100%', border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button className="btn primary" onClick={() => onSave(game)} disabled={saving} style={{ fontSize: 12, minHeight: 32, padding: '0 14px' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 999, fontSize: 12, padding: '0 12px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--muted)' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Individual game row ───────────────────────────────────────────────────────
function GameRow({ g, updating, updateForm, saving, expanded, milestones, mlAdding, mlForm,
  onOpenUpdate, onUpdateForm, onSave, onCancel, onExpandMilestones,
  onAddMilestone, onDeleteMilestone, onMlAdding, onMlForm }: {
  g: GameProgressRow;
  updating: string | null;
  updateForm: UpdateForm;
  saving: boolean;
  expanded: string | null;
  milestones: ProgressMilestone[] | undefined;
  mlAdding: string | null;
  mlForm: MilestoneForm | undefined;
  onOpenUpdate: (g: GameProgressRow) => void;
  onUpdateForm: React.Dispatch<React.SetStateAction<UpdateForm>>;
  onSave: (game: string) => void;
  onCancel: () => void;
  onExpandMilestones: (game: string) => void;
  onAddMilestone: (game: string) => void;
  onDeleteMilestone: (game: string, id: number) => void;
  onMlAdding: (game: string | null) => void;
  onMlForm: React.Dispatch<React.SetStateAction<Record<string, MilestoneForm>>>;
}) {
  const pct = g.current_percentage;
  const color = pctColor(pct);
  const isUpdating = updating === g.game;
  const isExpanded = expanded === g.game;

  return (
    <div style={{ border: '1px solid var(--soft-line)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: 'var(--paper)' }}>
      {/* Game header row */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {g.game}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {statusLabel(g.status)}
              </span>
              {g.estimated_hours_remaining && (
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>· {fmtHours(g.estimated_hours_remaining)}</span>
              )}
              {g.milestone_count > 0 && (
                <span style={{ fontSize: 10, color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }} onClick={() => onExpandMilestones(g.game)}>
                  · {g.milestones_completed}/{g.milestone_count} milestones
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, marginLeft: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color, minWidth: 36, textAlign: 'right' }}>{pct}%</span>
            <button
              onClick={() => isUpdating ? onCancel() : onOpenUpdate(g)}
              style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 999, fontSize: 11, padding: '3px 8px', cursor: 'pointer', color: isUpdating ? 'var(--muted)' : 'var(--accent)', fontWeight: 600, fontFamily: 'inherit' }}
            >
              {isUpdating ? 'Cancel' : 'Update'}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 7, background: 'var(--soft-line)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {/* Inline update form */}
      {isUpdating && (
        <div style={{ borderTop: '1px solid var(--soft-line)', padding: '10px 12px', background: 'var(--paper-2)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 120px' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3, fontWeight: 600 }}>Progress %</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="range" min={0} max={100} value={updateForm.percentage}
                  onChange={e => onUpdateForm(f => ({ ...f, percentage: Number(e.target.value) }))}
                  style={{ flex: 1, accentColor: 'var(--accent)' }}
                />
                <span style={{ fontSize: 13, fontWeight: 800, color: pctColor(updateForm.percentage), minWidth: 36, textAlign: 'right' }}>
                  {updateForm.percentage}%
                </span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3, fontWeight: 600 }}>Status</div>
              <select value={updateForm.status} onChange={e => onUpdateForm(f => ({ ...f, status: e.target.value }))}
                style={{ border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ width: 80 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3, fontWeight: 600 }}>Hours left</div>
              <input type="number" min={0} step={0.5} placeholder="e.g. 8" value={updateForm.estimated_hours_remaining}
                onChange={e => onUpdateForm(f => ({ ...f, estimated_hours_remaining: e.target.value }))}
                style={{ width: '100%', border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit' }}
              />
            </div>
          </div>
          <input type="text" placeholder="Notes (optional)" value={updateForm.notes}
            onChange={e => onUpdateForm(f => ({ ...f, notes: e.target.value }))}
            style={{ marginTop: 8, width: '100%', border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="btn primary" onClick={() => onSave(g.game)} disabled={saving} style={{ fontSize: 12, minHeight: 32, padding: '0 14px' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { onMlAdding(mlAdding === g.game ? null : g.game); }}
              style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 999, fontSize: 12, padding: '0 12px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}
            >
              + Milestone
            </button>
          </div>

          {/* Add milestone form */}
          {mlAdding === g.game && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Add Milestone</div>
              <input type="text" placeholder="Milestone title (e.g. Chapter 3 Complete)" value={mlForm?.title ?? ''}
                onChange={e => onMlForm(prev => ({ ...prev, [g.game]: { ...prev[g.game] ?? { title: '', category: 'story', progress_value: '' }, title: e.target.value } }))}
                style={{ width: '100%', border: '1px solid var(--line)', background: 'var(--paper-2)', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 6 }}
              />
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select value={mlForm?.category ?? 'story'}
                  onChange={e => onMlForm(prev => ({ ...prev, [g.game]: { ...prev[g.game] ?? { title: '', category: 'story', progress_value: '' }, category: e.target.value } }))}
                  style={{ flex: 1, border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>
                  {MILESTONE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <input type="number" placeholder="% at milestone" min={0} max={100} value={mlForm?.progress_value ?? ''}
                  onChange={e => onMlForm(prev => ({ ...prev, [g.game]: { ...prev[g.game] ?? { title: '', category: 'story', progress_value: '' }, progress_value: e.target.value } }))}
                  style={{ width: 80, border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit' }}
                />
                <button className="btn primary" onClick={() => onAddMilestone(g.game)} style={{ fontSize: 11, minHeight: 30, padding: '0 12px' }}>Add</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Milestone list */}
      {isExpanded && (
        <div style={{ borderTop: '1px solid var(--soft-line)', padding: '10px 12px', background: 'var(--paper-2)' }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Milestones</div>
          {!milestones && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</div>}
          {milestones && milestones.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>No milestones yet. Use Update → + Milestone to add one.</div>
          )}
          {milestones?.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--soft-line)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--accent)' }}>✓</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{m.title}</span>
                  {m.progress_value !== null && (
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>@ {m.progress_value}%</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                  {MILESTONE_CATEGORIES.find(c => c.value === m.category)?.label ?? m.category}
                  {m.completed_at ? ` · ${fmtDate(m.completed_at)}` : ''}
                </div>
              </div>
              <button
                onClick={() => onDeleteMilestone(g.game, m.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                title="Remove milestone"
              >×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
