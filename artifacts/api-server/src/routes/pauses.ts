import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_pauses (
      game TEXT PRIMARY KEY,
      paused_at TIMESTAMPTZ DEFAULT now()
    )
  `);
}

// GET /api/paused — list paused game names
router.get("/paused", async (_req, res) => {
  try {
    await ensureTable();
    const result = await pool.query("SELECT game FROM game_pauses ORDER BY paused_at");
    res.json(result.rows.map((r: any) => r.game));
  } catch {
    res.status(500).json({ error: "Failed to fetch paused games" });
  }
});

// POST /api/paused/:game — toggle pause (add if absent, remove if present)
router.post("/paused/:game", async (req, res) => {
  const game = req.params.game;
  try {
    await ensureTable();
    const existing = await pool.query("SELECT 1 FROM game_pauses WHERE game = $1", [game]);
    if (existing.rows.length > 0) {
      await pool.query("DELETE FROM game_pauses WHERE game = $1", [game]);
      res.json({ paused: false });
    } else {
      await pool.query("INSERT INTO game_pauses (game) VALUES ($1) ON CONFLICT DO NOTHING", [game]);
      // Archive any suggested quests for this game so they leave the inbox immediately.
      await pool.query(
        `UPDATE quests SET status='archived' WHERE game=$1 AND status='suggested'`,
        [game]
      );
      res.json({ paused: true });
    }
  } catch {
    res.status(500).json({ error: "Failed to toggle pause" });
  }
});

export default router;
