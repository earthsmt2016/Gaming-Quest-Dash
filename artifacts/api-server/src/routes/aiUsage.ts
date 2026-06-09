import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

const MODEL_PRICES: Record<string, { in: number; out: number }> = {
  "gpt-5.4": { in: 0.000000, out: 0.000000 },
  "gpt-4.1": { in: 0.000002, out: 0.000008 },
  "gpt-4o": { in: 0.0000025, out: 0.000010 },
  "gpt-4o-mini": { in: 0.00000015, out: 0.0000006 },
};

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_requests (
      id                 SERIAL PRIMARY KEY,
      route              TEXT NOT NULL,
      model              TEXT NOT NULL,
      prompt_tokens      INTEGER,
      completion_tokens  INTEGER,
      total_tokens       INTEGER,
      cost_estimate      NUMERIC(8,6) DEFAULT 0,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ai_requests_created_at_idx ON ai_requests(created_at)
  `);
}
ensureTables().catch(err => console.error("aiUsage ensureTables:", err));

export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const p = MODEL_PRICES[model] ?? { in: 0.000002, out: 0.000008 };
  return (promptTokens * p.in + completionTokens * p.out);
}

export async function logAiRequest(opts: {
  route: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}): Promise<void> {
  const cost = estimateCost(opts.model, opts.promptTokens, opts.completionTokens);
  await pool.query(`
    INSERT INTO ai_requests (route, model, prompt_tokens, completion_tokens, total_tokens, cost_estimate)
    VALUES ($1,$2,$3,$4,$5,$6)
  `, [opts.route, opts.model, opts.promptTokens, opts.completionTokens, opts.promptTokens + opts.completionTokens, cost]);
}

router.get("/ai-usage", async (_req, res) => {
  try {
    const today = await pool.query(`
      SELECT COALESCE(SUM(cost_estimate), 0) as cost, COUNT(*) as calls,
             COALESCE(SUM(total_tokens), 0) as tokens
      FROM ai_requests WHERE created_at >= NOW() - INTERVAL '24 hours'
    `);
    const week = await pool.query(`
      SELECT COALESCE(SUM(cost_estimate), 0) as cost, COUNT(*) as calls,
             COALESCE(SUM(total_tokens), 0) as tokens
      FROM ai_requests WHERE created_at >= NOW() - INTERVAL '7 days'
    `);
    const byRoute = await pool.query(`
      SELECT route, model, COUNT(*) as calls,
             COALESCE(SUM(cost_estimate), 0) as cost,
             COALESCE(SUM(total_tokens), 0) as tokens
      FROM ai_requests
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY route, model
      ORDER BY cost DESC
      LIMIT 20
    `);
    const daily = await pool.query(`
      SELECT DATE(created_at) as day,
             COALESCE(SUM(cost_estimate), 0) as cost,
             COUNT(*) as calls
      FROM ai_requests
      WHERE created_at >= NOW() - INTERVAL '14 days'
      GROUP BY DATE(created_at)
      ORDER BY day DESC
    `);
    res.json({
      today: today.rows[0],
      week: week.rows[0],
      byRoute: byRoute.rows,
      daily: daily.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
