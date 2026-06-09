import { pool } from "@workspace/db";

export interface FeatureConfig {
  model: string;
  max_tokens: number;
  enabled: boolean;
}

export type AiCostPreset = 'low' | 'recommended' | 'max';

export interface AiCostSettings {
  preset: AiCostPreset;
  overrides: Record<string, FeatureConfig>;
}

const PRESETS: Record<AiCostPreset, Record<string, FeatureConfig>> = {
  low: {
    companion:       { model: 'gpt-4o-mini', max_tokens: 800,  enabled: true },
    coach:             { model: 'gpt-4o-mini', max_tokens: 300,  enabled: true },
    quests:            { model: 'gpt-4o-mini', max_tokens: 800,  enabled: true },
    'daily-plan':      { model: 'gpt-4o-mini', max_tokens: 400,  enabled: true },
    'focus-insights':  { model: 'gpt-4o-mini', max_tokens: 200,  enabled: true },
    screenshot:        { model: 'gpt-4o-mini', max_tokens: 300,  enabled: true },
    radar:             { model: 'gpt-4o-mini', max_tokens: 200,  enabled: true },
    'game-knowledge':  { model: 'gpt-4o-mini', max_tokens: 600,  enabled: true },
    goals:             { model: 'gpt-4o-mini', max_tokens: 400,  enabled: true },
    'issue-triage':    { model: 'gpt-4o-mini', max_tokens: 500,  enabled: true },
    'issue-diagnosis': { model: 'gpt-4o-mini', max_tokens: 1200, enabled: true },
  },
  recommended: {
    companion:       { model: 'gpt-4o',    max_tokens: 1200, enabled: true },
    coach:             { model: 'gpt-4o',    max_tokens: 400,  enabled: true },
    quests:            { model: 'gpt-4o',    max_tokens: 1200, enabled: true },
    'daily-plan':      { model: 'gpt-4o',    max_tokens: 700,  enabled: true },
    'focus-insights':  { model: 'gpt-4o',    max_tokens: 200,  enabled: true },
    screenshot:        { model: 'gpt-4o',    max_tokens: 400,  enabled: true },
    radar:             { model: 'gpt-4.1',   max_tokens: 200,  enabled: true },
    'game-knowledge':  { model: 'gpt-4.1',   max_tokens: 800,  enabled: true },
    goals:             { model: 'gpt-4.1',   max_tokens: 400,  enabled: true },
    'issue-triage':    { model: 'gpt-4o',    max_tokens: 600,  enabled: true },
    'issue-diagnosis': { model: 'gpt-4o',    max_tokens: 1500, enabled: true },
  },
  max: {
    companion:       { model: 'gpt-5.4',   max_tokens: 1800, enabled: true },
    coach:             { model: 'gpt-5.4',   max_tokens: 400,  enabled: true },
    quests:            { model: 'gpt-5.4',   max_tokens: 1500, enabled: true },
    'daily-plan':      { model: 'gpt-5.4',   max_tokens: 700,  enabled: true },
    'focus-insights':  { model: 'gpt-5.4',   max_tokens: 200,  enabled: true },
    screenshot:        { model: 'gpt-5.4',   max_tokens: 400,  enabled: true },
    radar:             { model: 'gpt-4.1',   max_tokens: 200,  enabled: true },
    'game-knowledge':  { model: 'gpt-4.1',   max_tokens: 800,  enabled: true },
    goals:             { model: 'gpt-4.1',   max_tokens: 400,  enabled: true },
    'issue-triage':    { model: 'gpt-4.1',   max_tokens: 700,  enabled: true },
    'issue-diagnosis': { model: 'gpt-4.1',   max_tokens: 2000, enabled: true },
  },
};

export const GBP_PER_USD = 0.77;

export const MODEL_COSTS: Record<string, { in: number; out: number }> = {
  'gpt-5.4':     { in: 0.000015,  out: 0.000060 },
  'gpt-4.1':     { in: 0.00000154, out: 0.00000616 },
  'gpt-4o':      { in: 0.00000193, out: 0.00000770 },
  'gpt-4o-mini': { in: 0.00000012, out: 0.00000046 },
};

export function estimateGbpCost(model: string, promptTokens: number, completionTokens: number): number {
  const p = MODEL_COSTS[model] ?? { in: 0.00000193, out: 0.00000770 };
  return (promptTokens * p.in + completionTokens * p.out);
}

export function getFeatureConfig(settings: AiCostSettings, feature: string): FeatureConfig {
  const override = settings.overrides?.[feature];
  if (override) return override;
  const preset = PRESETS[settings.preset] ?? PRESETS.recommended;
  return preset[feature] ?? { model: 'gpt-4o', max_tokens: 400, enabled: true };
}

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_cost_settings (
      id          INTEGER PRIMARY KEY DEFAULT 1,
      preset      TEXT NOT NULL DEFAULT 'recommended',
      overrides   JSONB NOT NULL DEFAULT '{}',
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT single_row_ai_cost CHECK (id = 1)
    )
  `);
  await pool.query(`
    INSERT INTO ai_cost_settings (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `);
}

export async function loadAiCostSettings(): Promise<AiCostSettings> {
  await ensureTable();
  try {
    const { rows } = await pool.query(`SELECT * FROM ai_cost_settings WHERE id = 1`);
    if (!rows.length) return { preset: 'recommended', overrides: {} };
    return {
      preset: rows[0].preset as AiCostPreset,
      overrides: rows[0].overrides ?? {},
    };
  } catch {
    return { preset: 'recommended', overrides: {} };
  }
}

export async function saveAiCostSettings(s: AiCostSettings): Promise<AiCostSettings> {
  await ensureTable();
  await pool.query(`
    INSERT INTO ai_cost_settings (id, preset, overrides, updated_at)
    VALUES (1, $1, $2, NOW())
    ON CONFLICT (id) DO UPDATE SET
      preset = EXCLUDED.preset,
      overrides = EXCLUDED.overrides,
      updated_at = EXCLUDED.updated_at
  `, [s.preset, JSON.stringify(s.overrides)]);
  return s;
}

export const FEATURE_LABELS: Record<string, string> = {
  companion: 'Companion Chat',
  coach: 'AI Coach',
  quests: 'Quest Generator',
  'daily-plan': 'Daily Plan',
  'focus-insights': 'Focus Insights',
  screenshot: 'Screenshot Analysis',
  radar: 'Game Radar',
  'game-knowledge': 'Game Knowledge',
  goals: 'Goal Suggestions',
  'issue-triage': 'Smart Issue Triage',
  'issue-diagnosis': 'Code Diagnosis',
};

export const FEATURE_ORDER = [
  'companion', 'coach', 'quests', 'daily-plan',
  'focus-insights', 'screenshot', 'radar', 'game-knowledge', 'goals', 'issue-triage', 'issue-diagnosis',
];
