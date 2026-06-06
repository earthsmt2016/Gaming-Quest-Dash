import React, { useEffect, useState, useCallback } from 'react';
import { fetchSettings, saveSettings, type HealthSettings, fetchUntaggedActiveGames, setGamePlatform } from '../lib/api';

const DEFAULTS: HealthSettings = {
  console_neglect_days:   14,
  console_rotation_limit:  3,
  console_backlog_limit:   6,
  mobile_neglect_days:    28,
  mobile_rotation_limit:   5,
  mobile_backlog_limit:    8,
};

const PLATFORM_OPTIONS = [
  { value: '',              label: 'Console (no tag)' },
  { value: 'mobile_paid',   label: '📱 Mobile (Paid)' },
  { value: 'apple_arcade',  label: '📱 Apple Arcade' },
  { value: 'xbox_paid',     label: '🎮 Xbox (Paid)' },
  { value: 'xbox_gamepass', label: '🎮 Xbox Game Pass' },
];

function suggestPlatform(game: string): string {
  const lower = game.toLowerCase();
  if (/\bxbox\b/.test(lower))         return 'xbox_paid';
  if (/\bmobile\b/.test(lower))        return 'mobile_paid';
  if (/apple arcade/i.test(lower))     return 'apple_arcade';
  return 'mobile_paid';
}

interface SliderRowProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (v: number) => void;
}

function SliderRow({ label, hint, value, min, max, step = 1, unit, onChange }: SliderRowProps) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{label}</span>
          <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>{hint}</span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)', minWidth: 52, textAlign: 'right' }}>
          {value} {unit}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function SettingsPage() {
  const [cfg, setCfg] = useState<HealthSettings>(DEFAULTS);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [loading, setLoading] = useState(true);

  // Quick platform setup
  const [untagged, setUntagged] = useState<string[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [tagStates, setTagStates] = useState<Record<string, 'idle' | 'saving' | 'done' | 'skipped' | 'error'>>({});
  const [applyingAll, setApplyingAll] = useState(false);

  useEffect(() => {
    Promise.all([fetchSettings(), fetchUntaggedActiveGames()]).then(([s, games]) => {
      setCfg(s);
      setUntagged(games);
      const sel: Record<string, string> = {};
      for (const g of games) sel[g] = suggestPlatform(g);
      setSelections(sel);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSkip = useCallback((game: string) => {
    setTagStates(prev => ({ ...prev, [game]: 'skipped' }));
  }, []);

  const handleTagOne = useCallback(async (game: string) => {
    const platform = selections[game];
    setTagStates(prev => ({ ...prev, [game]: 'saving' }));
    try {
      await setGamePlatform(game, platform);
      setTagStates(prev => ({ ...prev, [game]: 'done' }));
    } catch {
      setTagStates(prev => ({ ...prev, [game]: 'error' }));
    }
  }, [selections]);

  const handleApplyAll = useCallback(async () => {
    setApplyingAll(true);
    const pending = untagged.filter(g => tagStates[g] !== 'done' && tagStates[g] !== 'skipped');
    for (const game of pending) {
      const platform = selections[game];
      if (!platform) { setTagStates(prev => ({ ...prev, [game]: 'skipped' })); continue; }
      setTagStates(prev => ({ ...prev, [game]: 'saving' }));
      try {
        await setGamePlatform(game, platform);
        setTagStates(prev => ({ ...prev, [game]: 'done' }));
      } catch {
        setTagStates(prev => ({ ...prev, [game]: 'error' }));
      }
    }
    setApplyingAll(false);
  }, [untagged, selections, tagStates]);

  const set = useCallback((key: keyof HealthSettings) => (v: number) => {
    setCfg(prev => ({ ...prev, [key]: v }));
    setSaveState('idle');
  }, []);

  const handleSave = useCallback(async () => {
    setSaveState('saving');
    try {
      const saved = await saveSettings(cfg);
      setCfg(saved);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch { setSaveState('error'); }
  }, [cfg]);

  const handleReset = useCallback(() => {
    setCfg(DEFAULTS);
    setSaveState('idle');
  }, []);

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Loading settings…</div>;
  }

  const sectionStyle: React.CSSProperties = {
    background: 'var(--paper)', border: '1px solid var(--line)',
    borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '18px 20px',
  };
  const dividerStyle: React.CSSProperties = {
    border: 'none', borderTop: '1px solid var(--soft-line)', margin: '18px 0',
  };

  const pendingUntagged = untagged.filter(g => tagStates[g] !== 'done' && tagStates[g] !== 'skipped');
  const allDone = untagged.length > 0 && pendingUntagged.length === 0;

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>
          Settings
        </div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>Health Score Limits</h2>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          Tune the thresholds that drive both the Console and Mobile backlog scores.
        </p>
      </div>

      {/* ── Quick Platform Setup — only shown when untagged games exist ── */}
      {untagged.length > 0 && (
        <div style={{
          background: allDone ? '#f0fdf4' : '#fffbeb',
          border: `1px solid ${allDone ? '#bbf7d0' : '#fde68a'}`,
          borderLeft: `4px solid ${allDone ? 'var(--success)' : 'var(--warning)'}`,
          borderRadius: 'var(--radius)', padding: '16px 18px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: allDone ? 0 : 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>
                {allDone ? '✓ All games tagged' : `⚠️ ${pendingUntagged.length} game${pendingUntagged.length > 1 ? 's' : ''} need a platform`}
              </div>
              {!allDone && (
                <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>
                  Untagged games are counted as console. Set mobile/Xbox to split them correctly.
                </div>
              )}
            </div>
            {!allDone && (
              <button
                onClick={handleApplyAll}
                disabled={applyingAll}
                style={{
                  background: 'var(--accent)', color: '#fff', border: 'none',
                  borderRadius: 6, padding: '6px 12px', fontSize: 12,
                  fontWeight: 700, fontFamily: 'inherit', cursor: applyingAll ? 'default' : 'pointer',
                  opacity: applyingAll ? 0.7 : 1, whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 10,
                }}
              >
                {applyingAll ? 'Applying…' : 'Apply all'}
              </button>
            )}
          </div>

          {!allDone && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {untagged.map(game => {
                const ts = tagStates[game] ?? 'idle';
                if (ts === 'done') return (
                  <div key={game} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.5 }}>
                    <span style={{ fontSize: 12, color: 'var(--success)', flexShrink: 0 }}>✓</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'line-through' }}>{game}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{PLATFORM_OPTIONS.find(p => p.value === selections[game])?.label ?? 'Tagged'}</span>
                  </div>
                );
                if (ts === 'skipped') return null;
                return (
                  <div key={game} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'var(--paper)', border: '1px solid var(--line)',
                    borderRadius: 6, padding: '6px 8px',
                    opacity: ts === 'saving' ? 0.65 : 1,
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {game}
                    </span>
                    <select
                      value={selections[game] ?? ''}
                      onChange={e => setSelections(prev => ({ ...prev, [game]: e.target.value }))}
                      disabled={ts === 'saving'}
                      style={{
                        fontSize: 11, fontFamily: 'inherit', borderRadius: 4,
                        border: '1px solid var(--line)', background: 'var(--paper)',
                        padding: '3px 6px', flexShrink: 0, maxWidth: 160,
                      }}
                    >
                      {PLATFORM_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleTagOne(game)}
                      disabled={ts === 'saving'}
                      style={{
                        background: ts === 'error' ? 'var(--danger)' : 'var(--accent)',
                        color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px',
                        fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                        cursor: ts === 'saving' ? 'default' : 'pointer', flexShrink: 0,
                      }}
                    >
                      {ts === 'saving' ? '…' : ts === 'error' ? 'Retry' : 'Set'}
                    </button>
                    <button
                      onClick={() => handleSkip(game)}
                      disabled={ts === 'saving'}
                      style={{
                        background: 'none', border: '1px solid var(--line)', borderRadius: 4,
                        padding: '3px 6px', fontSize: 11, color: 'var(--muted)',
                        cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit',
                      }}
                    >
                      Skip
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Console section */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 18 }}>🎮</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Console</span>
          <span style={{
            fontSize: 10, fontWeight: 700, background: 'var(--paper-2)',
            border: '1px solid var(--line)', borderRadius: 4,
            padding: '2px 6px', color: 'var(--muted)', marginLeft: 4,
          }}>drives health score</span>
        </div>
        <SliderRow
          label="Neglect threshold" hint="games idle longer than this get penalised"
          value={cfg.console_neglect_days} min={3} max={60} unit="days"
          onChange={set('console_neglect_days')}
        />
        <hr style={dividerStyle} />
        <SliderRow
          label="Rotation limit" hint="max games to play in a week without penalty"
          value={cfg.console_rotation_limit} min={1} max={15} unit="games / week"
          onChange={set('console_rotation_limit')}
        />
        <hr style={dividerStyle} />
        <SliderRow
          label="Backlog limit" hint="max active games before score starts dropping"
          value={cfg.console_backlog_limit} min={1} max={25} unit="active games"
          onChange={set('console_backlog_limit')}
        />
      </div>

      {/* Mobile section */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 18 }}>📱</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Mobile</span>
          <span style={{
            fontSize: 10, fontWeight: 700, background: '#eff6ff',
            border: '1px solid #bfdbfe', borderRadius: 4,
            padding: '2px 6px', color: '#1e40af', marginLeft: 4,
          }}>own independent score</span>
        </div>
        <SliderRow
          label="Neglect threshold" hint="mobile games are naturally played less often"
          value={cfg.mobile_neglect_days} min={7} max={120} unit="days"
          onChange={set('mobile_neglect_days')}
        />
        <hr style={dividerStyle} />
        <SliderRow
          label="Rotation limit" hint="max mobile games active in a week without penalty"
          value={cfg.mobile_rotation_limit} min={1} max={20} unit="games / week"
          onChange={set('mobile_rotation_limit')}
        />
        <hr style={dividerStyle} />
        <SliderRow
          label="Backlog limit" hint="mobile libraries tend to be larger"
          value={cfg.mobile_backlog_limit} min={1} max={40} unit="active games"
          onChange={set('mobile_backlog_limit')}
        />
      </div>

      {/* Save / reset */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center',
        background: 'var(--paper)', border: '1px solid var(--line)',
        borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '14px 20px',
      }}>
        <button
          onClick={handleSave}
          disabled={saveState === 'saving'}
          style={{
            flex: 1, padding: '10px 0', borderRadius: 'var(--radius-sm)',
            border: 'none', cursor: saveState === 'saving' ? 'default' : 'pointer',
            fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
            background: saveState === 'saved' ? 'var(--success)' : saveState === 'error' ? 'var(--danger)' : 'var(--accent)',
            color: '#fff', opacity: saveState === 'saving' ? 0.7 : 1, transition: 'background 0.15s',
          }}
        >
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : saveState === 'error' ? '✗ Failed — retry' : 'Save changes'}
        </button>
        <button
          onClick={handleReset}
          style={{
            padding: '10px 16px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--line)', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
            background: 'var(--paper-2)', color: 'var(--muted)',
          }}
        >
          Reset defaults
        </button>
      </div>

      {/* Reference */}
      <div style={{
        background: 'var(--paper-2)', border: '1px solid var(--soft-line)',
        borderRadius: 'var(--radius)', padding: '14px 18px',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          How scoring works
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>⏱ <strong>Neglect</strong> — each idle game over the threshold costs <strong>−5 pts</strong>, capped at −35</span>
          <span>🔄 <strong>Rotation</strong> — each game over the limit this week costs <strong>−5 pts</strong>, capped at −15</span>
          <span>📦 <strong>Backlog</strong> — each game over the active limit costs <strong>−4 pts</strong>, capped at −30</span>
          <span style={{ color: 'var(--muted)', marginTop: 4 }}>Scores: ≥80 Healthy · ≥60 Fair · ≥40 At Risk · &lt;40 Critical</span>
        </div>
      </div>

    </div>
  );
}
