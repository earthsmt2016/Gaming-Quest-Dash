import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchGameKnowledge, generateGameKnowledge, updateGameKnowledge,
  inferGameProgress, resolveProgressSuggestion, fetchPendingSuggestions,
  GameKnowledge, ProgressEstimate,
} from '../lib/api';

// ─── helpers ─────────────────────────────────────────────────────────────────

function pctColor(pct: number): string {
  if (pct >= 80) return 'var(--success)';
  if (pct >= 50) return 'var(--accent)';
  if (pct >= 25) return 'var(--warning)';
  return 'var(--danger)';
}

function confidenceBadge(c: number): { label: string; color: string } {
  if (c >= 0.8) return { label: 'High', color: 'var(--success)' };
  if (c >= 0.55) return { label: 'Med', color: 'var(--warning)' };
  return { label: 'Low', color: 'var(--muted)' };
}

function Bar({ pct, color, label }: { pct: number; color: string; label: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--soft-line)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width .4s' }} />
      </div>
    </div>
  );
}

// ─── Suggestion card ─────────────────────────────────────────────────────────

function SuggestionCard({
  s, onResolve,
}: {
  s: ProgressEstimate;
  onResolve: (id: number, action: 'accept' | 'reject' | 'edit', overrides?: { story_pct?: number; full_pct?: number }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [storyVal, setStoryVal] = useState(String(s.story_pct_suggested));
  const [fullVal,  setFullVal]  = useState(String(s.full_pct_suggested));
  const [saving, setSaving] = useState(false);
  const cb = confidenceBadge(Number(s.confidence));

  const resolve = async (action: 'accept' | 'reject' | 'edit') => {
    setSaving(true);
    await onResolve(s.id, action, action === 'edit'
      ? { story_pct: Number(storyVal), full_pct: Number(fullVal) } : undefined);
    setSaving(false);
  };

  const storyChanged = s.story_pct_suggested !== s.story_pct_current;
  const fullChanged  = s.full_pct_suggested  !== s.full_pct_current;

  return (
    <div style={{
      background: 'var(--paper-2)', border: '1px solid var(--line)',
      borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
            {s.game}
            {s.milestone_reached && (
              <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginLeft: 8 }}>
                🏁 {s.milestone_reached}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{s.reasoning}</div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, color: cb.color,
          border: `1px solid ${cb.color}`, borderRadius: 4, padding: '2px 6px', flexShrink: 0,
        }}>{cb.label} confidence</span>
      </div>

      {/* Before → After */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        {storyChanged && (
          <div style={{ fontSize: 12, background: 'var(--paper)', border: '1px solid var(--soft-line)', borderRadius: 6, padding: '6px 10px', flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>STORY</div>
            <div>
              <span style={{ color: 'var(--muted)' }}>{s.story_pct_current}%</span>
              <span style={{ color: 'var(--muted)', margin: '0 4px' }}>→</span>
              <span style={{ fontWeight: 700, color: pctColor(s.story_pct_suggested) }}>{s.story_pct_suggested}%</span>
            </div>
          </div>
        )}
        {fullChanged && (
          <div style={{ fontSize: 12, background: 'var(--paper)', border: '1px solid var(--soft-line)', borderRadius: 6, padding: '6px 10px', flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>FULL COMPLETION</div>
            <div>
              <span style={{ color: 'var(--muted)' }}>{s.full_pct_current}%</span>
              <span style={{ color: 'var(--muted)', margin: '0 4px' }}>→</span>
              <span style={{ fontWeight: 700, color: pctColor(s.full_pct_suggested) }}>{s.full_pct_suggested}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Edit mode */}
      {editing && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Story %</label>
            <input type="number" min={0} max={100} value={storyVal}
              onChange={e => setStoryVal(e.target.value)}
              style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Full %</label>
            <input type="number" min={0} max={100} value={fullVal}
              onChange={e => setFullVal(e.target.value)}
              style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)' }} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => editing ? resolve('edit') : resolve('accept')}
          disabled={saving}
          style={{ flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 700, background: 'var(--success)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
        >{saving ? '…' : editing ? 'Save Edit' : 'Accept'}</button>
        <button
          onClick={() => setEditing(e => !e)}
          style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: 'none', color: 'var(--accent)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
        >{editing ? 'Cancel' : 'Edit'}</button>
        <button
          onClick={() => resolve('reject')}
          disabled={saving}
          style={{ padding: '6px 12px', fontSize: 12, background: 'none', color: 'var(--muted)', border: '1px solid var(--soft-line)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
        >Ignore</button>
      </div>
    </div>
  );
}

// ─── Game knowledge card ──────────────────────────────────────────────────────

function GameKnowledgeCard({
  game, onRefresh,
}: {
  game: string;
  onRefresh: () => void;
}) {
  const [knowledge, setKnowledge] = useState<GameKnowledge | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [inferring, setInferring] = useState(false);
  const [inferResult, setInferResult] = useState<string>('');
  const [editMode, setEditMode] = useState(false);
  const [storyEdit, setStoryEdit] = useState('');
  const [fullEdit, setFullEdit] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    try {
      const k = await fetchGameKnowledge(game);
      setKnowledge(k);
    } catch { /* ignore */ }
  }, [game]);

  useEffect(() => { load(); }, [load]);

  async function handleGenerate() {
    setGenerating(true);
    setInferResult('');
    try {
      const k = await generateGameKnowledge(game);
      setKnowledge(k);
    } catch { /* ignore */ }
    setGenerating(false);
  }

  async function handleInfer() {
    setInferring(true);
    setInferResult('');
    try {
      const result = await inferGameProgress(game);
      if (result.has_update) {
        setInferResult('💡 New suggestion created — see above.');
        await load();
        onRefresh();
      } else {
        setInferResult(`No change detected: ${result.reasoning}`);
      }
    } catch (e: any) {
      setInferResult(`Error: ${e.message}`);
    }
    setInferring(false);
  }

  async function handleSaveEdit() {
    setSavingEdit(true);
    try {
      const k = await updateGameKnowledge(game, {
        story_percentage: Number(storyEdit),
        full_percentage: Number(fullEdit),
      });
      setKnowledge(k);
      setEditMode(false);
    } catch { /* ignore */ }
    setSavingEdit(false);
  }

  const storyPct = knowledge?.story_percentage ?? 0;
  const fullPct  = knowledge?.full_percentage  ?? 0;
  const milestones = knowledge?.story_milestones ?? [];
  const remainStory = knowledge?.remaining_story ?? [];
  const remainFull  = knowledge?.remaining_full  ?? [];

  return (
    <div style={{ borderBottom: '1px solid var(--soft-line)', paddingBottom: 10, marginBottom: 10 }}>
      {/* row header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 0' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {game}
          </div>
          {knowledge?.hasKnowledge ? (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
              {knowledge.genre ?? ''}{knowledge.genre ? ' · ' : ''}
              Story {storyPct}% · Full {fullPct}%
              {knowledge.estimated_story_hours ? ` · ~${knowledge.estimated_story_hours}h story` : ''}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>No knowledge map yet</div>
          )}
        </div>

        {/* mini bars */}
        {knowledge?.hasKnowledge && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
            <div style={{ width: 50 }}>
              <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 1, textAlign: 'right' }}>Story</div>
              <div style={{ height: 4, borderRadius: 2, background: 'var(--soft-line)' }}>
                <div style={{ height: '100%', width: `${storyPct}%`, background: pctColor(storyPct), borderRadius: 2 }} />
              </div>
            </div>
            <div style={{ width: 50 }}>
              <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 1, textAlign: 'right' }}>Full</div>
              <div style={{ height: 4, borderRadius: 2, background: 'var(--soft-line)' }}>
                <div style={{ height: '100%', width: `${fullPct}%`, background: pctColor(fullPct), borderRadius: 2 }} />
              </div>
            </div>
          </div>
        )}

        <span style={{ color: 'var(--muted)', fontSize: 14 }}>{expanded ? '−' : '+'}</span>
      </div>

      {/* expanded content */}
      {expanded && (
        <div style={{ marginTop: 6, paddingLeft: 4 }}>
          {knowledge?.story_summary && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, fontStyle: 'italic' }}>
              {knowledge.story_summary}
            </div>
          )}

          {/* dual progress bars */}
          {knowledge?.hasKnowledge && (
            <>
              <Bar pct={storyPct} color={pctColor(storyPct)} label="Story Completion" />
              <Bar pct={fullPct}  color={pctColor(fullPct)}  label="Full Completion" />
            </>
          )}

          {/* edit progress */}
          {knowledge?.hasKnowledge && (
            <>
              {!editMode ? (
                <button onClick={() => { setStoryEdit(String(storyPct)); setFullEdit(String(fullPct)); setEditMode(true); }}
                  style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 10 }}>
                  ✏️ Edit progress
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>Story %</label>
                    <input type="number" min={0} max={100} value={storyEdit} onChange={e => setStoryEdit(e.target.value)}
                      style={{ width: 70, padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>Full %</label>
                    <input type="number" min={0} max={100} value={fullEdit} onChange={e => setFullEdit(e.target.value)}
                      style={{ width: 70, padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--paper)', color: 'var(--ink)' }} />
                  </div>
                  <button onClick={handleSaveEdit} disabled={savingEdit}
                    style={{ padding: '5px 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                    {savingEdit ? '…' : 'Save'}
                  </button>
                  <button onClick={() => setEditMode(false)}
                    style={{ padding: '5px 10px', background: 'none', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 12, cursor: 'pointer', color: 'var(--muted)' }}>
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}

          {/* milestone map */}
          {milestones.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <button onClick={() => setMilestoneOpen(m => !m)}
                style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {milestoneOpen ? '▾' : '▸'} Story Milestones ({milestones.length})
              </button>
              {milestoneOpen && (
                <div style={{ marginTop: 6 }}>
                  {milestones.map((m, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--soft-line)', alignItems: 'center' }}>
                      <div style={{ width: 32, height: 4, borderRadius: 2, background: 'var(--soft-line)', flexShrink: 0 }}>
                        <div style={{ height: '100%', width: `${m.story_pct}%`, background: pctColor(m.story_pct), borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 12, flex: 1, color: 'var(--ink)' }}>{m.title}</span>
                      <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>{m.story_pct}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* remaining work */}
          {(remainStory.length > 0 || remainFull.length > 0) && (
            <div style={{ marginBottom: 10 }}>
              {remainStory.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    Remaining Story
                  </div>
                  {remainStory.map((r, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--ink)', padding: '2px 0' }}>
                      □ {r.title}
                    </div>
                  ))}
                </div>
              )}
              {remainFull.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    Remaining Full Completion
                  </div>
                  {remainFull.map((r, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--muted)', padding: '2px 0', alignItems: 'baseline' }}>
                      <span>□</span>
                      <span style={{ color: 'var(--ink)' }}>{r.title}</span>
                      {r.category && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{r.category}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* action buttons */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{ padding: '5px 12px', fontSize: 11, fontWeight: 700, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
            >{generating ? 'Generating…' : knowledge?.hasKnowledge ? '🔄 Regenerate' : '✨ Generate Knowledge'}</button>
            {knowledge?.hasKnowledge && (
              <button
                onClick={handleInfer}
                disabled={inferring}
                style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, background: 'none', color: 'var(--accent)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              >{inferring ? 'Analysing…' : '🔍 Analyse Logs'}</button>
            )}
          </div>
          {inferResult && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{inferResult}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main widget ─────────────────────────────────────────────────────────────

export default function GameKnowledgeWidget() {
  const [open, setOpen] = useState(false);
  const [games, setGames] = useState<string[]>([]);
  const [pending, setPending] = useState<ProgressEstimate[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);

  const loadGames = useCallback(async () => {
    try {
      const [logsRes, pendingData] = await Promise.all([
        fetch(`${import.meta.env.BASE_URL}api/logs`),
        fetchPendingSuggestions(),
      ]);
      if (logsRes.ok) {
        const logs: any[] = await logsRes.json();
        const gSet = [...new Set(logs.map((l: any) => l.game))].sort();
        setGames(gSet);
      }
      setPending(pendingData);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadGames(); }, [loadGames, refreshToken]);

  async function handleResolve(id: number, action: 'accept' | 'reject' | 'edit', overrides?: { story_pct?: number; full_pct?: number }) {
    const s = pending.find(p => p.id === id);
    if (!s) return;
    await resolveProgressSuggestion(s.game, id, action, overrides);
    setPending(ps => ps.filter(p => p.id !== id));
    setRefreshToken(t => t + 1);
  }

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
            background: 'linear-gradient(135deg, #6c63ff 0%, var(--accent) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0,
          }}>🧠</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>AI Game Knowledge</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                Story &amp; full completion · {games.length} games
              </span>
              {pending.length > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--warning)',
                  background: 'rgba(255,152,0,0.1)', padding: '1px 6px', borderRadius: 10,
                }}>⚡ {pending.length} pending</span>
              )}
            </div>
          </div>
        </div>
        <span style={{ color: 'var(--muted)', fontSize: 20 }}>{open ? '−' : '+'}</span>
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          {/* pending suggestions — shown first if any */}
          {pending.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: 'var(--warning)', marginBottom: 8,
              }}>
                ⚡ AI Progress Suggestions
              </div>
              {pending.map(s => (
                <SuggestionCard key={s.id} s={s} onResolve={handleResolve} />
              ))}
            </div>
          )}

          {/* per-game knowledge cards */}
          {games.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0' }}>
              Import some logs to see your games here.
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 8 }}>
                Games — expand to view or generate knowledge
              </div>
              {games.map(g => (
                <GameKnowledgeCard
                  key={`${g}-${refreshToken}`}
                  game={g}
                  onRefresh={() => setRefreshToken(t => t + 1)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
