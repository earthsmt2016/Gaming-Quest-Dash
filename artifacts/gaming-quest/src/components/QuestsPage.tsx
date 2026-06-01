import React, { useState, useEffect, useCallback } from 'react';
import {
  Quest, QuestGuide,
  fetchSuggestedQuests, fetchActiveQuests, fetchCompletedQuests,
  fetchQuestStats, generateQuests,
  acceptQuest, rejectQuest, logQuestProgress, completeQuest, fetchQuestGuide,
  QuestStats,
} from '../lib/api';

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  easy:      { bg: '#e8f5e9', text: '#2e7d32' },
  medium:    { bg: '#fff3e0', text: '#e65100' },
  hard:      { bg: '#fce4ec', text: '#c62828' },
  legendary: { bg: '#f3e5f5', text: '#6a1b9a' },
};

const CATEGORY_ICONS: Record<string, string> = {
  challenge:   '⚔️',
  exploration: '🗺️',
  grind:       '⚙️',
  skill:       '🎯',
};

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const c = DIFFICULTY_COLORS[difficulty] ?? { bg: '#f5f5f5', text: '#333' };
  return (
    <span style={{
      background: c.bg, color: c.text, fontSize: '11px', fontWeight: 700,
      padding: '2px 8px', borderRadius: '20px', textTransform: 'capitalize', flexShrink: 0,
    }}>
      {difficulty}
    </span>
  );
}

function XPBadge({ xp }: { xp: number }) {
  return (
    <span style={{
      background: 'var(--accent)', color: '#fff', fontSize: '11px', fontWeight: 700,
      padding: '2px 8px', borderRadius: '20px', flexShrink: 0,
    }}>
      +{xp} XP
    </span>
  );
}

function StatsBar({ stats }: { stats: QuestStats | null }) {
  if (!stats) return null;
  const items = [
    { label: 'Active', value: stats.active_count, color: 'var(--accent)' },
    { label: 'Completed', value: stats.completed_count, color: '#2e7d32' },
    { label: 'Inbox', value: stats.pending_count, color: '#e65100' },
    { label: 'Total XP', value: stats.total_xp.toLocaleString(), color: '#6a1b9a' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
      {items.map(item => (
        <div key={item.label} style={{
          background: 'var(--paper)', border: '1px solid var(--line)',
          borderRadius: 'var(--radius)', padding: '12px 14px',
          boxShadow: 'var(--shadow)',
        }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</div>
          <strong style={{ display: 'block', fontSize: '22px', marginTop: '2px', color: item.color }}>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function GuideModal({ quest, onClose }: { quest: Quest; onClose: () => void }) {
  const [guide, setGuide] = useState<QuestGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchQuestGuide(quest.id)
      .then(setGuide)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [quest.id]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(28,24,20,.5)',
        zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--paper)', borderRadius: 'var(--radius)', boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          padding: '24px', maxWidth: '520px', width: '100%', maxHeight: '80vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
              {CATEGORY_ICONS[quest.category]} {quest.category} guide
            </div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>{quest.title}</h3>
            <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>{quest.game}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--muted)', lineHeight: 1, padding: '2px', flexShrink: 0 }}
            aria-label="Close guide"
          >×</button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: '14px' }}>
            ✨ Generating your guide…
          </div>
        )}
        {error && (
          <div style={{ background: '#fff0f0', border: '1px solid #f5c6cb', borderRadius: '6px', padding: '12px', fontSize: '14px', color: '#842029' }}>
            {error}
          </div>
        )}
        {guide && (
          <>
            <h4 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 700 }}>{guide.title}</h4>
            <ol style={{ margin: 0, padding: '0 0 0 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {guide.steps.map((step, i) => (
                <li key={i} style={{ fontSize: '14px', lineHeight: 1.55 }}>{step}</li>
              ))}
            </ol>
            {guide.youtube_url && (
              <a
                href={guide.youtube_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  marginTop: '18px', padding: '9px 14px', borderRadius: 'var(--radius-sm)',
                  background: '#ff0000', color: '#fff', fontWeight: 700, fontSize: '13px',
                  textDecoration: 'none',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-2.75 12.36 12.36 0 0 0-8.33 0A4.83 4.83 0 0 1 4.41 6.69a46.1 46.1 0 0 0 0 10.62 4.83 4.83 0 0 1 3.08 2.37 12.36 12.36 0 0 0 8.33 0 4.83 4.83 0 0 1 3.08-2.37 46.1 46.1 0 0 0 .69-10.62z" opacity=".8"/>
                  <polygon points="10 15 15 12 10 9 10 15" fill="white"/>
                </svg>
                Find YouTube Guide
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ProgressModal({ quest, onClose, onLogged }: {
  quest: Quest;
  onClose: () => void;
  onLogged: (log: import('../lib/api').QuestLog) => void;
}) {
  const [note, setNote] = useState('');
  const [pct, setPct] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const lastPct = quest.logs?.length ? quest.logs[0].progress_pct : 0;

  const handleSubmit = async () => {
    if (!note.trim()) { setError('Please enter a progress note.'); return; }
    setSaving(true); setError('');
    try {
      const log = await logQuestProgress(quest.id, note, pct);
      onLogged(log);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(28,24,20,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--paper)', borderRadius: 'var(--radius)', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', padding: '24px', maxWidth: '440px', width: '100%' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Log Progress</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--muted)', padding: '2px' }}>×</button>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
          {quest.title} — {quest.game}
        </div>
        {error && (
          <div style={{ background: '#fff0f0', border: '1px solid #f5c6cb', borderRadius: '6px', padding: '10px', fontSize: '13px', color: '#842029', marginBottom: '12px' }}>{error}</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
            Progress note
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="What did you accomplish? Any obstacles?"
              rows={3}
              style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '9px 11px', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
            <span style={{ display: 'flex', justifyContent: 'space-between' }}>
              Completion <span style={{ color: 'var(--accent)' }}>{pct}%</span>
            </span>
            <input
              type="range" min={lastPct} max={100} value={pct}
              onChange={e => setPct(Number(e.target.value))}
              style={{ accentColor: 'var(--accent)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)' }}>
              <span>{lastPct}% (last)</span><span>100%</span>
            </div>
          </label>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn primary" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Saving…' : 'Save Progress'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestCard({
  quest,
  onAccept, onReject, onProgress, onComplete, onGuide,
}: {
  quest: Quest;
  onAccept?: () => void;
  onReject?: () => void;
  onProgress?: () => void;
  onComplete?: () => void;
  onGuide?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const lastProgress = quest.logs?.length ? quest.logs[0].progress_pct : 0;

  return (
    <div style={{
      background: 'var(--paper)', border: '1px solid var(--line)',
      borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
      overflow: 'hidden',
    }}>
      <div
        style={{ padding: '14px 16px', cursor: 'pointer' }}
        onClick={() => setExpanded(v => !v)}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '5px' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)', flexShrink: 0 }}>
                {CATEGORY_ICONS[quest.category]}
              </span>
              <span style={{
                fontSize: '12px', fontWeight: 600, color: 'var(--muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0,
              }}>{quest.game}</span>
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, lineHeight: 1.3, marginBottom: '3px' }}>{quest.title}</div>
            <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.4 }}>{quest.description}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end', flexShrink: 0 }}>
            <DifficultyBadge difficulty={quest.difficulty} />
            <XPBadge xp={quest.xp_reward} />
          </div>
        </div>

        {quest.status === 'active' && (
          <div style={{ marginTop: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
              <span>Progress</span><span>{lastProgress}%</span>
            </div>
            <div style={{ height: '6px', background: 'var(--line)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--accent)', width: `${lastProgress}%`, borderRadius: '3px', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{expanded ? '▲ hide' : '▼ details'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '14px 16px', background: 'var(--paper-2)' }}>
          {quest.objectives.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '8px' }}>Objectives</div>
              <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {quest.objectives.map((obj, i) => (
                  <li key={i} style={{ fontSize: '13px', lineHeight: 1.45 }}>{obj}</li>
                ))}
              </ul>
            </div>
          )}

          {quest.logs && quest.logs.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '8px' }}>Progress Log</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {quest.logs.slice(0, 3).map(log => (
                  <div key={log.id} style={{ fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                    <span style={{ color: 'var(--muted)', fontSize: '11px', flexShrink: 0 }}>
                      {new Date(log.logged_at).toLocaleDateString()}
                    </span>
                    <span style={{ flex: 1 }}>{log.note}</span>
                    <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>{log.progress_pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {onGuide && (
              <button className="btn soft" onClick={onGuide} style={{ fontSize: '12px', padding: '7px 12px' }}>
                ✨ AI Guide
              </button>
            )}
            {onProgress && (
              <button className="btn soft" onClick={onProgress} style={{ fontSize: '12px', padding: '7px 12px' }}>
                📝 Log Progress
              </button>
            )}
            {onComplete && (
              <button className="btn primary" onClick={onComplete} style={{ fontSize: '12px', padding: '7px 12px' }}>
                ✅ Complete Quest
              </button>
            )}
            {onAccept && (
              <button className="btn primary" onClick={onAccept} style={{ fontSize: '12px', padding: '7px 12px' }}>
                ⚔️ Accept Quest
              </button>
            )}
            {onReject && (
              <button className="btn" onClick={onReject} style={{ fontSize: '12px', padding: '7px 12px', color: 'var(--muted)' }}>
                ✕ Dismiss
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function QuestsPage() {
  const [suggested, setSuggested] = useState<Quest[]>([]);
  const [active, setActive] = useState<Quest[]>([]);
  const [completed, setCompleted] = useState<Quest[]>([]);
  const [stats, setStats] = useState<QuestStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [guideQuest, setGuideQuest] = useState<Quest | null>(null);
  const [progressQuest, setProgressQuest] = useState<Quest | null>(null);
  const [tab, setTab] = useState<'inbox' | 'active' | 'completed'>('inbox');

  const reload = useCallback(async () => {
    const [s, a, c, st] = await Promise.all([
      fetchSuggestedQuests(),
      fetchActiveQuests(),
      fetchCompletedQuests(),
      fetchQuestStats(),
    ]);
    setSuggested(s);
    setActive(a);
    setCompleted(c);
    setStats(st);
  }, []);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  const handleGenerate = async () => {
    setGenerating(true); setGenError('');
    try {
      await generateQuests();
      await reload();
      setTab('inbox');
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleAccept = async (quest: Quest) => {
    await acceptQuest(quest.id);
    await reload();
    setTab('active');
  };

  const handleReject = async (quest: Quest) => {
    await rejectQuest(quest.id);
    await reload();
  };

  const handleComplete = async (quest: Quest) => {
    if (!confirm(`Mark "${quest.title}" as complete? You'll earn ${quest.xp_reward} XP!`)) return;
    await completeQuest(quest.id);
    await reload();
    setTab('completed');
  };

  const handleProgressLogged = useCallback(async (log: import('../lib/api').QuestLog) => {
    setActive(prev => prev.map(q =>
      q.id === log.quest_id
        ? { ...q, logs: [log, ...(q.logs ?? [])] }
        : q
    ));
    const st = await fetchQuestStats();
    setStats(st);
  }, []);

  const tabItems: { id: typeof tab; label: string; count: number }[] = [
    { id: 'inbox', label: 'Quest Inbox', count: suggested.length },
    { id: 'active', label: 'Active', count: active.length },
    { id: 'completed', label: 'Completed', count: completed.length },
  ];

  return (
    <>
      <style>{`
        .quest-tab-btn {
          background: none; border: none; cursor: pointer;
          font: inherit; font-size: 14px; font-weight: 600;
          color: var(--muted); padding: 8px 14px;
          border-bottom: 2px solid transparent;
          transition: color 0.12s;
        }
        .quest-tab-btn:hover { color: var(--text); }
        .quest-tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
      `}</style>

      {guideQuest && <GuideModal quest={guideQuest} onClose={() => setGuideQuest(null)} />}
      {progressQuest && (
        <ProgressModal
          quest={progressQuest}
          onClose={() => setProgressQuest(null)}
          onLogged={handleProgressLogged}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Header */}
        <div style={{
          background: 'var(--paper)', border: '1px solid var(--line)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
          padding: '16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>⚔️ AI Quest System</h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
              AI-generated quests tailored to your gaming history
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
            <button
              className="btn primary"
              onClick={handleGenerate}
              disabled={generating}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {generating ? (
                <>⏳ Generating…</>
              ) : (
                <>✨ Generate New Quests</>
              )}
            </button>
            {genError && (
              <div style={{ fontSize: '12px', color: '#c62828' }}>{genError}</div>
            )}
          </div>
        </div>

        {/* Stats */}
        <StatsBar stats={stats} />

        {/* Tabs */}
        <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', padding: '0 8px' }}>
            {tabItems.map(t => (
              <button
                key={t.id}
                className={`quest-tab-btn${tab === t.id ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.count > 0 && (
                  <span style={{
                    marginLeft: '6px', background: tab === t.id ? 'var(--accent)' : 'var(--line)',
                    color: tab === t.id ? '#fff' : 'var(--muted)',
                    borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                    padding: '1px 7px',
                  }}>{t.count}</span>
                )}
              </button>
            ))}
          </div>

          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {loading && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: '14px' }}>
                Loading quests…
              </div>
            )}

            {!loading && tab === 'inbox' && (
              <>
                {suggested.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted)' }}>
                    <div style={{ fontSize: '32px', marginBottom: '10px' }}>🗺️</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>No quests in your inbox</div>
                    <div style={{ fontSize: '13px' }}>Click "Generate New Quests" to get AI-crafted quests based on your gaming history.</div>
                  </div>
                ) : (
                  suggested.map(q => (
                    <QuestCard
                      key={q.id}
                      quest={q}
                      onAccept={() => handleAccept(q)}
                      onReject={() => handleReject(q)}
                      onGuide={() => setGuideQuest(q)}
                    />
                  ))
                )}
              </>
            )}

            {!loading && tab === 'active' && (
              <>
                {active.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted)' }}>
                    <div style={{ fontSize: '32px', marginBottom: '10px' }}>⚔️</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>No active quests</div>
                    <div style={{ fontSize: '13px' }}>Accept quests from your inbox to start tracking them.</div>
                  </div>
                ) : (
                  active.map(q => (
                    <QuestCard
                      key={q.id}
                      quest={q}
                      onProgress={() => setProgressQuest(q)}
                      onComplete={() => handleComplete(q)}
                      onGuide={() => setGuideQuest(q)}
                    />
                  ))
                )}
              </>
            )}

            {!loading && tab === 'completed' && (
              <>
                {completed.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted)' }}>
                    <div style={{ fontSize: '32px', marginBottom: '10px' }}>🏆</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>No completed quests yet</div>
                    <div style={{ fontSize: '13px' }}>Complete active quests to see them here.</div>
                  </div>
                ) : (
                  completed.map(q => (
                    <div key={q.id} style={{
                      background: 'var(--paper)', border: '1px solid var(--line)',
                      borderRadius: 'var(--radius)', padding: '14px 16px', opacity: 0.85,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', justifyContent: 'space-between' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '3px' }}>
                            {CATEGORY_ICONS[q.category]} {q.game}
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 700 }}>✅ {q.title}</div>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                            Completed {q.completed_at ? new Date(q.completed_at).toLocaleDateString() : ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end', flexShrink: 0 }}>
                          <DifficultyBadge difficulty={q.difficulty} />
                          <XPBadge xp={q.xp_reward} />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
