import { Router } from "express";
import { db, pool } from "@workspace/db";
import { gameCompletionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_completions (
      game TEXT PRIMARY KEY,
      completed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `);
}

ensureTable().catch(() => {});

// GET /api/completions — return list of manually completed game names
router.get("/completions", async (_req, res) => {
  try {
    const rows = await db.select().from(gameCompletionsTable);
    res.json(rows.map(r => r.game));
  } catch {
    res.status(500).json({ error: "Failed to fetch completions" });
  }
});

// POST /api/completions/:game — toggle (mark if not present, unmark if present)
router.post("/completions/:game", async (req, res) => {
  const game = decodeURIComponent(req.params.game);
  try {
    const existing = await db
      .select()
      .from(gameCompletionsTable)
      .where(eq(gameCompletionsTable.game, game));

    if (existing.length > 0) {
      await db.delete(gameCompletionsTable).where(eq(gameCompletionsTable.game, game));
      res.json({ game, completed: false });
    } else {
      await db.insert(gameCompletionsTable).values({ game });
      res.json({ game, completed: true });
    }
  } catch {
    res.status(500).json({ error: "Failed to toggle completion" });
  }
});

export default router;
