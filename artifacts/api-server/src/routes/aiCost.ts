import { Router } from "express";
import { pool } from "@workspace/db";
import {
  loadAiCostSettings, saveAiCostSettings, AiCostSettings,
  getFeatureConfig, FEATURE_LABELS, FEATURE_ORDER, GBP_PER_USD, estimateGbpCost,
} from "../lib/aiCostConfig";

const router = Router();

export async function getConfig(feature: string): Promise<{ model: string; max_tokens: number; enabled: boolean }> {
  const settings = await loadAiCostSettings();
  return getFeatureConfig(settings, feature);
}

router.get("/ai-cost/settings", async (_req, res) => {
  try {
    const settings = await loadAiCostSettings();
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/ai-cost/settings", async (req, res) => {
  try {
    const body = req.body as { preset?: string; overrides?: Record<string, any> };
    const preset = body.preset === 'low' || body.preset === 'recommended' || body.preset === 'max'
      ? body.preset
      : 'recommended';
    const settings = await saveAiCostSettings({
      preset,
      overrides: body.overrides ?? {},
    });
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/ai-cost/feature/:name", async (req, res) => {
  try {
    const name = req.params.name;
    const body = req.body as { model?: string; max_tokens?: number; enabled?: boolean };
    const settings = await loadAiCostSettings();
    const existing = getFeatureConfig(settings, name);
    const updated: any = {
      ...existing,
      ...(body.model !== undefined ? { model: body.model } : {}),
      ...(body.max_tokens !== undefined ? { max_tokens: Math.max(50, Math.min(4000, Number(body.max_tokens))) } : {}),
      ...(body.enabled !== undefined ? { enabled: Boolean(body.enabled) } : {}),
    };
    const overrides = { ...settings.overrides, [name]: updated };
    const saved = await saveAiCostSettings({ ...settings, overrides });
    res.json(getFeatureConfig(saved, name));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/ai-usage/gbp", async (_req, res) => {
  try {
    const today = await pool.query(`
      SELECT COALESCE(SUM(cost_estimate * ${GBP_PER_USD}), 0) as cost, COUNT(*) as calls,
             COALESCE(SUM(total_tokens), 0) as tokens
      FROM ai_requests WHERE created_at::timestamptz >= NOW() - INTERVAL '24 hours'
    `);
    const week = await pool.query(`
      SELECT COALESCE(SUM(cost_estimate * ${GBP_PER_USD}), 0) as cost, COUNT(*) as calls,
             COALESCE(SUM(total_tokens), 0) as tokens
      FROM ai_requests WHERE created_at::timestamptz >= NOW() - INTERVAL '7 days'
    `);
    const month = await pool.query(`
      SELECT COALESCE(SUM(cost_estimate * ${GBP_PER_USD}), 0) as cost, COUNT(*) as calls,
             COALESCE(SUM(total_tokens), 0) as tokens
      FROM ai_requests WHERE created_at::timestamptz >= DATE_TRUNC('month', NOW())
    `);
    const byRoute = await pool.query(`
      SELECT route, model, COUNT(*) as calls,
             COALESCE(SUM(cost_estimate * ${GBP_PER_USD}), 0) as cost,
             COALESCE(SUM(total_tokens), 0) as tokens
      FROM ai_requests
      WHERE created_at::timestamptz >= NOW() - INTERVAL '7 days'
      GROUP BY route, model
      ORDER BY cost DESC
      LIMIT 20
    `);
    const daily = await pool.query(`
      SELECT DATE(created_at::timestamptz) as day,
             COALESCE(SUM(cost_estimate * ${GBP_PER_USD}), 0) as cost,
             COUNT(*) as calls
      FROM ai_requests
      WHERE created_at::timestamptz >= NOW() - INTERVAL '14 days'
      GROUP BY DATE(created_at::timestamptz)
      ORDER BY day DESC
    `);
    const monthDaily = await pool.query(`
      SELECT DATE(created_at::timestamptz) as day,
             COALESCE(SUM(cost_estimate * ${GBP_PER_USD}), 0) as cost,
             COUNT(*) as calls
      FROM ai_requests
      WHERE created_at::timestamptz >= DATE_TRUNC('month', NOW())
      GROUP BY DATE(created_at::timestamptz)
      ORDER BY day ASC
    `);
    res.json({
      today: today.rows[0],
      week: week.rows[0],
      month: month.rows[0],
      byRoute: byRoute.rows,
      daily: daily.rows,
      monthDaily: monthDaily.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
