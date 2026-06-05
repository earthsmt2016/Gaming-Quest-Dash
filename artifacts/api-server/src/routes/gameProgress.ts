import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_progress (
      game TEXT PRIMARY KEY,
      current_percentage INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      estimated_hours_remaining NUMERIC(6,1),
      notes TEXT,
      last_updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS progress_milestones (
      id SERIAL PRIMARY KEY,
      game TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'story',
      completed_at TIMESTAMPTZ DEFAULT NOW(),
      progress_value INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS progress_history (
      id SERIAL PRIMARY KEY,
      game TEXT NOT NULL,
      percentage INTEGER NOT NULL,
      delta INTEGER,
      notes TEXT,
      recorded_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_prog_milestones_game ON progress_milestones(game);
    CREATE INDEX IF NOT EXISTS idx_prog_history_game_time ON progress_history(game, recorded_at DESC);
  `);
}
ensureTables().catch(console.error);

// ─── GET /api/progress ───────────────────────────────────────────────────────
// All known games (from log_entries) with their progress data LEFT JOINed.
router.get("/progress", async (_req, res) => {
  try {
    await ensureTables();
    const { rows } = await pool.query(`
      WITH all_games AS (
        SELECT DISTINCT game FROM log_entries
      ),
      game_stats AS (
        SELECT game,
               SUM(minutes)::int   AS total_minutes,
               COUNT(*)::int        AS session_count,
               MAX(timestamp::timestamptz) AS last_played
        FROM log_entries
        GROUP BY game
      )
      SELECT
        g.game,
        COALESCE(gp.current_percentage, 0)                      AS current_percentage,
        COALESCE(gp.status, 'active')                            AS status,
        gp.estimated_hours_remaining,
        gp.notes,
        gp.last_updated_at,
        gs.total_minutes,
        gs.session_count,
        gs.last_played,
        (SELECT COUNT(*)::int FROM progress_milestones pm
         WHERE pm.game = g.game)                                 AS milestone_count,
        (SELECT COUNT(*)::int FROM progress_milestones pm
         WHERE pm.game = g.game AND pm.completed_at IS NOT NULL) AS milestones_completed
      FROM all_games g
      LEFT JOIN game_progress  gp ON gp.game = g.game
      LEFT JOIN game_stats     gs ON gs.game = g.game
      ORDER BY
        COALESCE(gp.current_percentage, 0) DESC,
        gs.last_played DESC NULLS LAST
    `);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch progress", detail: err.message });
  }
});

// ─── GET /api/progress/:game ─────────────────────────────────────────────────
router.get("/progress/:game", async (req, res) => {
  const game = decodeURIComponent(req.params.game);
  try {
    await ensureTables();
    const [progress, history, milestones, sessionStats] = await Promise.all([
      pool.query(`SELECT * FROM game_progress WHERE game = $1`, [game]),
      pool.query(
        `SELECT * FROM progress_history WHERE game = $1 ORDER BY recorded_at ASC`,
        [game]
      ),
      pool.query(
        `SELECT * FROM progress_milestones WHERE game = $1
         ORDER BY completed_at DESC NULLS LAST, created_at DESC`,
        [game]
      ),
      pool.query(
        `SELECT SUM(minutes)::int AS total_minutes, COUNT(*)::int AS sessions
         FROM log_entries
         WHERE game = $1 AND timestamp::timestamptz >= NOW() - INTERVAL '30 days'`,
        [game]
      ),
    ]);

    const prog = progress.rows[0] ?? { current_percentage: 0, status: "active" };
    const hist = history.rows;
    const totalMinutes30d: number = sessionStats.rows[0]?.total_minutes ?? 0;
    const totalHours30d = totalMinutes30d / 60;

    let velocity_per_hour: number | null = null;
    let estimated_completion_hours: number | null = null;
    let estimated_completion_date: string | null = null;

    if (hist.length >= 2 && totalHours30d > 0) {
      const earliest = hist[0];
      const latest   = hist[hist.length - 1];
      const pctGained = latest.percentage - earliest.percentage;
      if (pctGained > 0) {
        velocity_per_hour = pctGained / totalHours30d;
        const remaining = 100 - prog.current_percentage;
        if (remaining > 0 && velocity_per_hour > 0) {
          estimated_completion_hours = remaining / velocity_per_hour;
          const ms = Date.now() + estimated_completion_hours * 3600 * 1000;
          estimated_completion_date = new Date(ms).toISOString().slice(0, 10);
        }
      }
    }

    res.json({
      ...prog,
      history: hist,
      milestones: milestones.rows,
      velocity_per_hour: velocity_per_hour ? Math.round(velocity_per_hour * 10) / 10 : null,
      estimated_completion_hours: estimated_completion_hours
        ? Math.round(estimated_completion_hours * 10) / 10
        : null,
      estimated_completion_date,
      total_minutes_30d: totalMinutes30d,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch game progress", detail: err.message });
  }
});

// ─── PUT /api/progress/:game ─────────────────────────────────────────────────
router.put("/progress/:game", async (req, res) => {
  const game = decodeURIComponent(req.params.game);
  const { percentage, status, estimated_hours_remaining, notes } = req.body;

  if (typeof percentage !== "number" || percentage < 0 || percentage > 100) {
    return res.status(400).json({ error: "percentage must be 0–100" });
  }

  try {
    await ensureTables();
    const prev = await pool.query(
      `SELECT current_percentage FROM game_progress WHERE game = $1`,
      [game]
    );
    const prevPct: number = prev.rows[0]?.current_percentage ?? 0;
    const delta = percentage - prevPct;

    // Auto-derive status when near or at completion
    let resolvedStatus = status ?? "active";
    if (percentage >= 100) resolvedStatus = "completed";
    else if (percentage >= 80 && resolvedStatus === "active") resolvedStatus = "near_completion";

    const { rows } = await pool.query(
      `INSERT INTO game_progress
         (game, current_percentage, status, estimated_hours_remaining, notes, last_updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (game) DO UPDATE SET
         current_percentage      = EXCLUDED.current_percentage,
         status                  = EXCLUDED.status,
         estimated_hours_remaining = EXCLUDED.estimated_hours_remaining,
         notes                   = EXCLUDED.notes,
         last_updated_at         = NOW()
       RETURNING *`,
      [game, percentage, resolvedStatus, estimated_hours_remaining ?? null, notes ?? null]
    );

    await pool.query(
      `INSERT INTO progress_history (game, percentage, delta, notes)
       VALUES ($1, $2, $3, $4)`,
      [game, percentage, delta, notes ?? null]
    );

    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update progress", detail: err.message });
  }
});

// ─── POST /api/progress/:game/milestone ──────────────────────────────────────
router.post("/progress/:game/milestone", async (req, res) => {
  const game = decodeURIComponent(req.params.game);
  const { title, description, category, progress_value } = req.body;

  if (!title?.trim()) return res.status(400).json({ error: "title is required" });

  try {
    await ensureTables();
    const { rows } = await pool.query(
      `INSERT INTO progress_milestones
         (game, title, description, category, progress_value, completed_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [
        game,
        title.trim(),
        description ?? null,
        category ?? "story",
        progress_value ?? null,
      ]
    );
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to add milestone", detail: err.message });
  }
});

// ─── DELETE /api/progress/:game/milestone/:id ─────────────────────────────────
router.delete("/progress/:game/milestone/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await pool.query(`DELETE FROM progress_milestones WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete milestone", detail: err.message });
  }
});

export default router;
