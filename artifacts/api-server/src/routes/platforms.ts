import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_platforms (
      game     TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      set_at   TIMESTAMPTZ DEFAULT now()
    )
  `);
}

// GET /api/platforms — { game, platform }[]
router.get("/platforms", async (_req, res) => {
  try {
    await ensureTable();
    const result = await pool.query("SELECT game, platform FROM game_platforms ORDER BY game");
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch platforms" });
  }
});

// PUT /api/platforms/:game — set or clear platform (body: { platform })
router.put("/platforms/:game", async (req, res) => {
  const game = req.params.game;
  const { platform } = req.body as { platform: string };
  try {
    await ensureTable();
    if (!platform) {
      await pool.query("DELETE FROM game_platforms WHERE game = $1", [game]);
      res.json({ platform: null });
    } else {
      await pool.query(
        `INSERT INTO game_platforms (game, platform) VALUES ($1, $2)
         ON CONFLICT (game) DO UPDATE SET platform = EXCLUDED.platform, set_at = now()`,
        [game, platform],
      );
      res.json({ platform });
    }
  } catch {
    res.status(500).json({ error: "Failed to set platform" });
  }
});

// GET /api/platforms/active-untagged — active games (not completed/paused) with no platform tag
router.get("/platforms/active-untagged", async (_req, res) => {
  try {
    await ensureTable();
    const result = await pool.query(`
      SELECT le.game
      FROM log_entries le
      LEFT JOIN game_platforms gp  ON gp.game  = le.game
      LEFT JOIN game_completions gc ON gc.game = le.game
      LEFT JOIN game_pauses gpa     ON gpa.game = le.game
      WHERE gp.game IS NULL
        AND gc.game IS NULL
        AND gpa.game IS NULL
      GROUP BY le.game
      ORDER BY MAX(le.timestamp::timestamptz) DESC
    `);
    res.json(result.rows.map((r: any) => r.game));
  } catch {
    res.status(500).json({ error: "Failed to fetch untagged games" });
  }
});

export default router;
