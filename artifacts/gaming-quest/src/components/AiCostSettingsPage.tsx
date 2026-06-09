import React, { useEffect, useState, useCallback } from 'react';
import {
  fetchAiCostSettings, saveAiCostSettings, saveAiCostFeature,
  type AiCostSettings,
} from '../lib/api';

const PRESETS = ['low', 'recommended', 'max'] as const;
type Preset = typeof PRESETS[number];

const PRESET_LABELS: Record<Preset, { label: string; desc: string; badge: string; color: string }> = {
  low:         { label: 'Low',         desc: 'GPT-4o-mini — cheapest, slightly less capable',  badge: '££', color: '#22c55e' },
  recommended: { label: 'Recommended', desc: 'GPT-4o — balanced cost and quality',         badge: '£££', color: '#3b82f6' },
  max:         { label: 'Max',         desc: 'GPT-5.4 — most capable, most expensive',        badge: '££££', color: '#f59e0b' },
};

const FEATURES = [
  { key: 'companion',       label: 'Companion Chat',     desc: 'AI companion for gaming advice' },
  { key: 'coach',           label: 'AI Coach',           desc: 'Personalised game recommendations' },
  { key: 'quests',          label: 'Quest Generator',    desc: 'AI-generated quest suggestions' },
  { key: 'daily-plan',      label: 'Daily Plan',         desc: 'Session planning for tonight' },
  { key: 'focus-insights',  label: 'Focus Insights',     desc: 'Next-session advice per game' },
  { key: 'screenshot',      label: 'Screenshot Analysis', desc: 'Auto-extract logs from screenshots' },
  { key: 'radar',           label: 'Game Radar',         desc: 'Discover upcoming game releases' },
  { key: 'game-knowledge',  label: 'Game Knowledge',     desc: 'Progress tracking and story info' },
  { key: 'goals',           label: 'Goal Suggestions',   desc: 'AI-generated personal goals' },
  { key: 'issue-triage',    label: 'Smart Issue Triage', desc: 'Troubleshoot & auto-fix reported issues' },
  { key: 'issue-diagnosis', label: 'Code Diagnosis',     desc: 'Pinpoint the likely code cause & suggest a fix' },
] as const;

const MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-5.4'];

const PRESET_MAP: Record<Preset, Record<string, { model: string; max_tokens: number }>> = {
  low: {
    companion:      { model: 'gpt-4o-mini', max_tokens: 800 },
    coach:            { model: 'gpt-4o-mini', max_tokens: 300 },
    quests:           { model: 'gpt-4o-mini', max_tokens: 800 },
    'daily-plan':     { model: 'gpt-4o-mini', max_tokens: 400 },
    'focus-insights': { model: 'gpt-4o-mini', max_tokens: 200 },
    screenshot:       { model: 'gpt-4o-mini', max_tokens: 300 },
    radar:            { model: 'gpt-4.1',     max_tokens: 200 },
    'game-knowledge': { model: 'gpt-4o-mini', max_tokens: 600 },
    goals:            { model: 'gpt-4o-mini', max_tokens: 400 },
    'issue-triage':   { model: 'gpt-4o-mini', max_tokens: 500 },
    'issue-diagnosis': { model: 'gpt-4o-mini', max_tokens: 1200 },
  },
  recommended: {
    companion:      { model: 'gpt-4o',    max_tokens: 1200 },
    coach:          { model: 'gpt-4o',    max_tokens: 400 },
    quests:         { model: 'gpt-4o',    max_tokens: 1200 },
    'daily-plan':   { model: 'gpt-4o',    max_tokens: 700 },
    'focus-insights': { model: 'gpt-4o',  max_tokens: 200 },
    screenshot:     { model: 'gpt-4o',    max_tokens: 400 },
    radar:          { model: 'gpt-4.1',   max_tokens: 200 },
    'game-knowledge': { model: 'gpt-4.1',  max_tokens: 800 },
    goals:            { model: 'gpt-4.1', max_tokens: 400 },
    'issue-triage':   { model: 'gpt-4o',  max_tokens: 600 },
    'issue-diagnosis': { model: 'gpt-4o', max_tokens: 1500 },
  },
  max: {
    companion:      { model: 'gpt-5.4',   max_tokens: 1800 },
    coach:          { model: 'gpt-5.4',   max_tokens: 400 },
    quests:         { model: 'gpt-5.4',   max_tokens: 1500 },
    'daily-plan':   { model: 'gpt-5.4',   max_tokens: 700 },
    'focus-insights': { model: 'gpt-5.4', max_tokens: 200 },
    screenshot:     { model: 'gpt-5.4',   max_tokens: 400 },
    radar:          { model: 'gpt-4.1',   max_tokens: 200 },
    'game-knowledge': { model: 'gpt-4.1',   max_tokens: 800 },
    goals:            { model: 'gpt-4.1',   max_tokens: 400 },
    'issue-triage':   { model: 'gpt-4.1',   max_tokens: 700 },
    'issue-diagnosis': { model: 'gpt-4.1',  max_tokens: 2000 },
  },
};

export default function AiCostSettingsPage() {
  const [settings, setSettings] = useState<AiCostSettings>({ preset: 'recommended', overrides: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    fetchAiCostSettings()
      .then(s => setSettings(s))
      .catch(() => setFlash('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const applyPreset = useCallback((p: Preset) => {
    const mapped = PRESET_MAP[p];
    const overrides: Record<string, any> = {};
    for (const [k, v] of Object.entries(mapped)) {
      overrides[k] = {
        ...v,
        enabled: settings.overrides[k]?.enabled ?? true,
      };
    }
    const next = { preset: p, overrides };
    setSettings(next);
    setSaving(true);
    saveAiCostSettings(next)
      .then(() => setFlash('Saved'))
      .catch(() => setFlash('Save failed'))
      .finally(() => setSaving(false));
    setTimeout(() => setFlash(''), 1500);
  }, [settings.overrides]);

  const toggleFeature = useCallback((key: string) => {
    const current = settings.overrides[key] ?? {
      model: PRESET_MAP[settings.preset][key]?.model ?? 'gpt-4o',
      max_tokens: PRESET_MAP[settings.preset][key]?.max_tokens ?? 400,
      enabled: true,
    };
    const next = { ...settings };
    next.overrides = {
      ...next.overrides,
      [key]: { ...current, enabled: !current.enabled },
    };
    setSettings(next);
    setSaving(true);
    saveAiCostFeature(key, { enabled: !current.enabled })
      .then(() => setFlash('Saved'))
      .catch(() => setFlash('Save failed'))
      .finally(() => setSaving(false));
    setTimeout(() => setFlash(''), 1500);
  }, [settings]);

  const changeModel = useCallback((key: string, model: string) => {
    const current = settings.overrides[key] ?? {
      model: PRESET_MAP[settings.preset][key]?.model ?? 'gpt-4o',
      max_tokens: PRESET_MAP[settings.preset][key]?.max_tokens ?? 400,
      enabled: true,
    };
    const next = { ...settings, overrides: { ...settings.overrides, [key]: { ...current, model } } };
    setSettings(next);
    setSaving(true);
    saveAiCostFeature(key, { model })
      .then(() => setFlash('Saved'))
      .catch(() => setFlash('Save failed'))
      .finally(() => setSaving(false));
    setTimeout(() => setFlash(''), 1500);
  }, [settings]);

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Loading cost settings…</div>;
  }

  const sectionStyle: React.CSSProperties = {
    background: 'var(--paper)', border: '1px solid var(--line)',
    borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '18px 20px',
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>
          AI Cost Settings
        </div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>Configure AI Costs</h2>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          Choose a preset or toggle each AI feature individually.
        </p>
      </div>

      {/* Preset selector */}
      <div style={sectionStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>Preset</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {PRESETS.map(p => {
            const active = settings.preset === p;
            const meta = PRESET_LABELS[p];
            return (
              <button
                key={p}
                onClick={() => applyPreset(p)}
                disabled={saving}
                style={{
                  flex: 1, minWidth: 140,
                  padding: '12px 14px',
                  borderRadius: 'var(--radius)',
                  border: `2px solid ${active ? meta.color : 'var(--line)'}`,
                  background: active ? `${meta.color}10` : 'var(--paper)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: active ? meta.color : 'var(--ink)' }}>{meta.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{meta.badge}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>{meta.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Per-feature toggles */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Per-feature</span>
          {flash && (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)' }}>{flash}</span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {FEATURES.map(f => {
            const cfg = settings.overrides[f.key] ?? {
              model: PRESET_MAP[settings.preset][f.key]?.model ?? 'gpt-4o',
              max_tokens: PRESET_MAP[settings.preset][f.key]?.max_tokens ?? 400,
              enabled: true,
            };
            const on = cfg.enabled;
            return (
              <div key={f.key} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                background: on ? 'var(--paper-2)' : 'transparent',
                opacity: on ? 1 : 0.6,
                border: `1px solid ${on ? 'var(--soft-line)' : 'var(--line)'}`,
              }}>
                <button
                  onClick={() => toggleFeature(f.key)}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: on ? 'var(--success)' : '#d1d5db', position: 'relative',
                    transition: 'background 0.15s',
                    flexShrink: 0,
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2, left: on ? 22 : 2,
                    width: 20, height: 20, borderRadius: '50%',
                    background: 'white', transition: 'left 0.15s',
                  }} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{f.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{f.desc}</div>
                </div>
                <select
                  value={cfg.model}
                  onChange={e => changeModel(f.key, e.target.value)}
                  style={{
                    fontSize: 12, fontFamily: 'inherit', borderRadius: 4,
                    border: '1px solid var(--line)', background: 'var(--paper)',
                    padding: '3px 6px', flexShrink: 0,
                  }}
                >
                  {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
