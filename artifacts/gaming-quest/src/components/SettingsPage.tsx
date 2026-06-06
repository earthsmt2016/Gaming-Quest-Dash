import React, { useEffect, useState, useCallback } from 'react';
import { fetchSettings, saveSettings, type HealthSettings } from '../lib/api';

const DEFAULTS: HealthSettings = {
  console_neglect_days:   14,
  console_rotation_limit:  3,
  console_backlog_limit:   6,
  mobile_neglect_days:    28,
  mobile_rotation_limit:   5,
  mobile_backlog_limit:    8,
};

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
        <span style={{
          fontSize: 14, fontWeight: 800, color: 'var(--accent)',
          minWidth: 52, textAlign: 'right',
        }}>
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function SettingsPage() {
  const [cfg, setCfg] = useState<HealthSettings>(DEFAULTS);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings()
      .then(s => { setCfg(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

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
    } catch {
      setSaveState('error');
    }
  }, [cfg]);

  const handleReset = useCallback(() => {
    setCfg(DEFAULTS);
    setSaveState('idle');
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
        Loading settings…
      </div>
    );
  }

  const sectionStyle: React.CSSProperties = {
    background: 'var(--paper)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)',
    padding: '18px 20px',
  };

  const dividerStyle: React.CSSProperties = {
    border: 'none',
    borderTop: '1px solid var(--soft-line)',
    margin: '18px 0',
  };

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
          Changes take effect immediately on the next score refresh.
        </p>
      </div>

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
          label="Neglect threshold"
          hint="games idle longer than this get penalised"
          value={cfg.console_neglect_days}
          min={3} max={60} unit="days"
          onChange={set('console_neglect_days')}
        />
        <hr style={dividerStyle} />
        <SliderRow
          label="Rotation limit"
          hint="max games to play in a week without penalty"
          value={cfg.console_rotation_limit}
          min={1} max={15} unit="games / week"
          onChange={set('console_rotation_limit')}
        />
        <hr style={dividerStyle} />
        <SliderRow
          label="Backlog limit"
          hint="max active games before score starts dropping"
          value={cfg.console_backlog_limit}
          min={1} max={25} unit="active games"
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
          label="Neglect threshold"
          hint="mobile games are naturally played less often"
          value={cfg.mobile_neglect_days}
          min={7} max={120} unit="days"
          onChange={set('mobile_neglect_days')}
        />
        <hr style={dividerStyle} />
        <SliderRow
          label="Rotation limit"
          hint="max mobile games active in a week without penalty"
          value={cfg.mobile_rotation_limit}
          min={1} max={20} unit="games / week"
          onChange={set('mobile_rotation_limit')}
        />
        <hr style={dividerStyle} />
        <SliderRow
          label="Backlog limit"
          hint="mobile libraries tend to be larger"
          value={cfg.mobile_backlog_limit}
          min={1} max={40} unit="active games"
          onChange={set('mobile_backlog_limit')}
        />
      </div>

      {/* Save / reset bar */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center',
        background: 'var(--paper)', border: '1px solid var(--line)',
        borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
        padding: '14px 20px',
      }}>
        <button
          onClick={handleSave}
          disabled={saveState === 'saving'}
          style={{
            flex: 1, padding: '10px 0', borderRadius: 'var(--radius-sm)',
            border: 'none', cursor: saveState === 'saving' ? 'default' : 'pointer',
            fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
            background: saveState === 'saved' ? 'var(--success)' : saveState === 'error' ? 'var(--danger)' : 'var(--accent)',
            color: '#fff',
            opacity: saveState === 'saving' ? 0.7 : 1,
            transition: 'background 0.15s',
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

      {/* Reference card */}
      <div style={{
        background: 'var(--paper-2)', border: '1px solid var(--soft-line)',
        borderRadius: 'var(--radius)', padding: '14px 18px',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          How scoring works
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>⏱ <strong>Neglect</strong> — each idle game over the threshold costs <strong>−5 pts</strong>, capped at −35</span>
          <span>🔄 <strong>Rotation</strong> — each game over the limit in the current week costs <strong>−5 pts</strong>, capped at −15</span>
          <span>📦 <strong>Backlog</strong> — each game over the active limit costs <strong>−4 pts</strong>, capped at −30</span>
          <span style={{ color: 'var(--muted)', marginTop: 4 }}>Scores: ≥80 Healthy · ≥60 Fair · ≥40 At Risk · &lt;40 Critical</span>
        </div>
      </div>

    </div>
  );
}
