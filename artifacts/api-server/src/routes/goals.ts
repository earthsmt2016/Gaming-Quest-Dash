import { Router } from "express";
import { pool } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS goals (
      id            SERIAL PRIMARY KEY,
      game          TEXT NOT NULL,
      title         TEXT NOT NULL,
      description   TEXT,
      goal_type     TEXT NOT NULL DEFAULT 'custom',
      status        TEXT NOT NULL DEFAULT 'not_started',
      priority      TEXT NOT NULL DEFAULT 'medium',
      progress_type TEXT NOT NULL DEFAULT 'percentage',
      current_value NUMERIC(10,2) NOT NULL DEFAULT 0,
      target_value  NUMERIC(10,2) NOT NULL DEFAULT 100,
      notes         TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      completed_at  TIMESTAMPTZ,
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS goal_progress_history (
      id         SERIAL PRIMARY KEY,
      goal_id    INTEGER NOT NULL,
      prev_value NUMERIC(10,2),
      new_value  NUMERIC(10,2) NOT NULL,
      note       TEXT,
      recorded_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS goal_completions (
      id           SERIAL PRIMARY KEY,
      goal_id      INTEGER NOT NULL,
      game         TEXT NOT NULL,
      title        TEXT NOT NULL,
      goal_type    TEXT NOT NULL,
      hours_played NUMERIC(8,1),
      completed_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_goals_game   ON goals(game);
    CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
    CREATE INDEX IF NOT EXISTS idx_goal_history_goal ON goal_progress_history(goal_id);
  `);
}
ensureTables().catch(console.error);

// ─── helpers ─────────────────────────────────────────────────────────────────

function pct(current: number, target: number): number {
  if (target === 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

// ─── GET /api/goals ──────────────────────────────────────────────────────────
router.get("/goals", async (req, res) => {
  try {
    await ensureTables();
    const game = req.query.game as string | undefined;
    const status = req.query.status as string | undefined;

    let q = `
      SELECT g.*,
             COALESCE(h.update_count, 0)::int AS update_count,
             h.last_updated
        FROM goals g
        LEFT JOIN (
          SELECT goal_id,
                 COUNT(*) AS update_count,
                 MAX(recorded_at) AS last_updated
            FROM goal_progress_history
           GROUP BY goal_id
        ) h ON h.goal_id = g.id
       WHERE 1=1
    `;
    const params: string[] = [];
    if (game) { params.push(game); q += ` AND g.game = $${params.length}`; }
    if (status) { params.push(status); q += ` AND g.status = $${params.length}`; }
    q += ` ORDER BY
      CASE g.priority
        WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4
      END,
      CASE g.status
        WHEN 'in_progress' THEN 1 WHEN 'not_started' THEN 2 ELSE 3
      END,
      g.updated_at DESC`;

    const { rows } = await pool.query(q, params);
    res.json(rows.map(r => ({
      ...r,
      percentage: pct(Number(r.current_value), Number(r.target_value)),
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/goals/:id ──────────────────────────────────────────────────────
router.get("/goals/:id", async (req, res) => {
  try {
    await ensureTables();
    const { rows } = await pool.query(`SELECT * FROM goals WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Goal not found" });
    const goal = rows[0];

    const hist = await pool.query(
      `SELECT * FROM goal_progress_history WHERE goal_id = $1 ORDER BY recorded_at DESC LIMIT 20`,
      [goal.id]
    );
    res.json({
      ...goal,
      percentage: pct(Number(goal.current_value), Number(goal.target_value)),
      history: hist.rows,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/goals ─────────────────────────────────────────────────────────
router.post("/goals", async (req, res) => {
  try {
    await ensureTables();
    const {
      game, title, description = null, goal_type = 'custom',
      status = 'not_started', priority = 'medium',
      progress_type = 'percentage',
      current_value = 0, target_value = 100, notes = null,
    } = req.body;
    if (!game || !title) return res.status(400).json({ error: "game and title required" });

    // auto-derive status from current_value
    const cv = Number(current_value);
    const tv = Number(target_value);
    let derivedStatus = status;
    if (cv > 0 && cv < tv && derivedStatus === 'not_started') derivedStatus = 'in_progress';
    if (cv >= tv && tv > 0) derivedStatus = 'completed';

    const { rows } = await pool.query(`
      INSERT INTO goals (game, title, description, goal_type, status, priority,
                         progress_type, current_value, target_value, notes,
                         completed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, $11)
      RETURNING *
    `, [game, title, description, goal_type, derivedStatus, priority,
        progress_type, cv, tv, notes,
        derivedStatus === 'completed' ? new Date().toISOString() : null]);

    const goal = rows[0];
    res.json({ ...goal, percentage: pct(Number(goal.current_value), Number(goal.target_value)) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PUT /api/goals/:id ──────────────────────────────────────────────────────
router.put("/goals/:id", async (req, res) => {
  try {
    await ensureTables();
    const {
      title, description, goal_type, status, priority,
      progress_type, current_value, target_value, notes,
    } = req.body;

    const { rows: existing } = await pool.query(`SELECT * FROM goals WHERE id = $1`, [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: "Goal not found" });
    const old = existing[0];

    const newCurrent = current_value !== undefined ? Number(current_value) : Number(old.current_value);
    const newTarget  = target_value  !== undefined ? Number(target_value)  : Number(old.target_value);
    const newPct     = pct(newCurrent, newTarget);

    let newStatus = status ?? old.status;
    if (newPct >= 100 && newStatus === 'in_progress') newStatus = 'completed';
    if (newPct > 0 && newStatus === 'not_started')    newStatus = 'in_progress';

    const completedAt = newStatus === 'completed' && old.status !== 'completed'
      ? new Date().toISOString() : old.completed_at;

    const { rows } = await pool.query(`
      UPDATE goals SET
        title         = COALESCE($1, title),
        description   = COALESCE($2, description),
        goal_type     = COALESCE($3, goal_type),
        status        = $4,
        priority      = COALESCE($5, priority),
        progress_type = COALESCE($6, progress_type),
        current_value = $7,
        target_value  = $8,
        notes         = COALESCE($9, notes),
        completed_at  = $10,
        updated_at    = NOW()
      WHERE id = $11
      RETURNING *
    `, [title, description, goal_type, newStatus, priority, progress_type,
        newCurrent, newTarget, notes, completedAt, req.params.id]);

    const goal = rows[0];

    // log history if value changed
    if (newCurrent !== Number(old.current_value)) {
      await pool.query(
        `INSERT INTO goal_progress_history (goal_id, prev_value, new_value) VALUES ($1,$2,$3)`,
        [goal.id, old.current_value, newCurrent]
      );
    }

    // log completion event
    if (newStatus === 'completed' && old.status !== 'completed') {
      const hrs = await pool.query(
        `SELECT COALESCE(SUM(minutes)/60.0, 0)::numeric(8,1) AS hrs
           FROM log_entries WHERE game = $1`, [goal.game]
      );
      await pool.query(`
        INSERT INTO goal_completions (goal_id, game, title, goal_type, hours_played)
        VALUES ($1,$2,$3,$4,$5)
      `, [goal.id, goal.game, goal.title, goal.goal_type, hrs.rows[0]?.hrs ?? 0]);
    }

    res.json({ ...goal, percentage: pct(Number(goal.current_value), Number(goal.target_value)) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── DELETE /api/goals/:id ───────────────────────────────────────────────────
router.delete("/goals/:id", async (req, res) => {
  try {
    await ensureTables();
    await pool.query(`DELETE FROM goal_progress_history WHERE goal_id = $1`, [req.params.id]);
    const { rowCount } = await pool.query(`DELETE FROM goals WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Goal not found" });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/goals/:id/progress ────────────────────────────────────────────
router.post("/goals/:id/progress", async (req, res) => {
  try {
    await ensureTables();
    const { value, note } = req.body;
    if (value === undefined) return res.status(400).json({ error: "value required" });

    const { rows: existing } = await pool.query(`SELECT * FROM goals WHERE id = $1`, [req.params.id]);
    if (!existing.length) return res.status(404).json({ error: "Goal not found" });
    const old = existing[0];

    const newVal = Number(value);
    const newPct = pct(newVal, Number(old.target_value));
    const newStatus = newPct >= 100 ? 'completed'
                    : newVal > 0    ? 'in_progress'
                    : old.status;
    const completedAt = newStatus === 'completed' && old.status !== 'completed'
      ? new Date().toISOString() : old.completed_at;

    await pool.query(`
      UPDATE goals SET current_value=$1, status=$2, completed_at=$3, updated_at=NOW()
      WHERE id=$4
    `, [newVal, newStatus, completedAt, req.params.id]);

    await pool.query(
      `INSERT INTO goal_progress_history (goal_id, prev_value, new_value, note) VALUES ($1,$2,$3,$4)`,
      [req.params.id, old.current_value, newVal, note ?? null]
    );

    if (newStatus === 'completed' && old.status !== 'completed') {
      const hrs = await pool.query(
        `SELECT COALESCE(SUM(minutes)/60.0, 0)::numeric(8,1) AS hrs FROM log_entries WHERE game = $1`,
        [old.game]
      );
      await pool.query(`
        INSERT INTO goal_completions (goal_id, game, title, goal_type, hours_played)
        VALUES ($1,$2,$3,$4,$5)
      `, [req.params.id, old.game, old.title, old.goal_type, hrs.rows[0]?.hrs ?? 0]);
    }

    const { rows } = await pool.query(`SELECT * FROM goals WHERE id = $1`, [req.params.id]);
    res.json({ ...rows[0], percentage: pct(Number(rows[0].current_value), Number(rows[0].target_value)) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/goals/analytics ────────────────────────────────────────────────
router.get("/goals/analytics", async (_req, res) => {
  try {
    await ensureTables();
    const [counts, completions, byType, abandoned, longest] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status NOT IN ('archived','abandoned'))::int AS total,
          COUNT(*) FILTER (WHERE status = 'completed')::int   AS completed,
          COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
          COUNT(*) FILTER (WHERE status = 'not_started')::int AS not_started,
          COUNT(*) FILTER (WHERE status = 'abandoned')::int   AS abandoned,
          ROUND(
            COUNT(*) FILTER (WHERE status = 'completed') * 100.0 /
            NULLIF(COUNT(*) FILTER (WHERE status NOT IN ('archived')), 0), 1
          ) AS completion_rate
        FROM goals
      `),
      pool.query(`
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600), 1) AS avg_hours
          FROM goals WHERE status = 'completed' AND completed_at IS NOT NULL
      `),
      pool.query(`
        SELECT goal_type, COUNT(*)::int AS count,
               COUNT(*) FILTER (WHERE status='completed')::int AS completed
          FROM goals GROUP BY goal_type ORDER BY count DESC
      `),
      pool.query(`
        SELECT title, game, created_at FROM goals
         WHERE status = 'abandoned' ORDER BY created_at DESC LIMIT 5
      `),
      pool.query(`
        SELECT title, game, goal_type, created_at,
               EXTRACT(EPOCH FROM (NOW() - created_at))/86400 AS days_running
          FROM goals
         WHERE status IN ('in_progress','not_started')
         ORDER BY created_at ASC LIMIT 1
      `),
    ]);

    res.json({
      ...counts.rows[0],
      avg_completion_hours: completions.rows[0]?.avg_hours ?? null,
      by_type: byType.rows,
      recently_abandoned: abandoned.rows,
      longest_running: longest.rows[0] ?? null,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/goals/completions ──────────────────────────────────────────────
router.get("/goals/completions", async (_req, res) => {
  try {
    await ensureTables();
    const { rows } = await pool.query(
      `SELECT * FROM goal_completions ORDER BY completed_at DESC LIMIT 50`
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/ai/goal-suggestions ──────────────────────────────────────────
router.post("/ai/goal-suggestions", async (req, res) => {
  try {
    await ensureTables();
    const { game } = req.body;
    if (!game) return res.status(400).json({ error: "game required" });

    const [sessions, existingGoals, progress] = await Promise.all([
      pool.query(`
        SELECT action, SUM(minutes)::int AS total_min, COUNT(*)::int AS count,
               MAX(timestamp::timestamptz) AS last_at
          FROM log_entries WHERE game = $1
         GROUP BY action ORDER BY total_min DESC LIMIT 15
      `, [game]),
      pool.query(`
        SELECT title, status, goal_type FROM goals WHERE game = $1 AND status != 'abandoned'
      `, [game]),
      pool.query(`
        SELECT current_percentage, status, estimated_hours_remaining
          FROM game_progress WHERE game = $1
      `, [game]).catch(() => ({ rows: [] })),
    ]);

    const totalHours = sessions.rows.reduce((a: number, r: any) => a + r.total_min, 0) / 60;
    const topActions = sessions.rows.slice(0, 5).map((r: any) => `${r.action} (${r.total_min}m)`).join(', ');
    const existing   = existingGoals.rows.map((r: any) => `${r.title} [${r.status}]`).join(', ') || 'none';
    const prog       = progress.rows[0];

    const prompt = `You are a gaming goals advisor for the game "${game}".

PLAYER CONTEXT:
- Total playtime: ${totalHours.toFixed(1)} hours
- Top activities: ${topActions}
- Existing goals: ${existing}
${prog ? `- Overall progress: ${prog.current_percentage}% (${prog.status})${prog.estimated_hours_remaining ? `, ~${prog.estimated_hours_remaining}h remaining` : ''}` : ''}

Suggest exactly 4 meaningful personal goals for this game. Mix goal types across: story, collection, achievement, challenge, time, custom.

Respond ONLY with a JSON array of objects, no markdown, no explanation:
[
  {
    "title": "string (concise, action-oriented, max 50 chars)",
    "description": "string (1 sentence explaining the goal)",
    "goal_type": "story|collection|achievement|challenge|time|custom",
    "priority": "low|medium|high|critical",
    "progress_type": "percentage|numeric|binary",
    "target_value": number,
    "reason": "string (1 sentence why this goal suits this player now)"
  }
]

Rules:
- Make goals specific and achievable, not vague like "play more"
- For numeric goals: target_value is the number to reach (e.g. 100 stars → 100)
- For percentage goals: target_value is always 100
- For binary goals: target_value is always 1 (0=not done, 1=done)
- Do NOT suggest goals that already exist
- Vary difficulty: 1 easy, 2 medium, 1 ambitious`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    let suggestions: any[] = [];
    try {
      const text = completion.choices[0].message.content?.trim() ?? "[]";
      suggestions = JSON.parse(text);
    } catch {
      suggestions = [];
    }

    res.json({ game, suggestions });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
