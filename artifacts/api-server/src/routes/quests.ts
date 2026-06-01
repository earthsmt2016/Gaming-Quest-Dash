import { Router } from "express";
import { pool } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quests (
      id           SERIAL PRIMARY KEY,
      title        TEXT NOT NULL,
      description  TEXT NOT NULL,
      game         TEXT NOT NULL,
      category     TEXT NOT NULL DEFAULT 'challenge',
      difficulty   TEXT NOT NULL DEFAULT 'medium',
      xp_reward    INTEGER NOT NULL DEFAULT 100,
      status       TEXT NOT NULL DEFAULT 'pending',
      objectives   JSONB NOT NULL DEFAULT '[]',
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      accepted_at  TIMESTAMPTZ,
      completed_at TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quest_guides (
      id           SERIAL PRIMARY KEY,
      quest_id     INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      steps        JSONB NOT NULL DEFAULT '[]',
      youtube_url  TEXT,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quest_logs (
      id          SERIAL PRIMARY KEY,
      quest_id    INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      note        TEXT NOT NULL,
      progress_pct INTEGER NOT NULL DEFAULT 0,
      logged_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

ensureTables().catch(err => console.error("quests ensureTables:", err));

// ─── GET /api/quests/suggested ─────────────────────────────────────────────
router.get("/quests/suggested", async (_req, res) => {
  try {
    await ensureTables();
    const result = await pool.query(
      `SELECT * FROM quests WHERE status = 'pending' ORDER BY generated_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch suggested quests", detail: String(err) });
  }
});

// ─── GET /api/quests/active ────────────────────────────────────────────────
router.get("/quests/active", async (_req, res) => {
  try {
    await ensureTables();
    const result = await pool.query(
      `SELECT q.*,
        COALESCE(
          (SELECT json_agg(ql ORDER BY ql.logged_at DESC)
           FROM quest_logs ql WHERE ql.quest_id = q.id),
          '[]'::json
        ) AS logs
       FROM quests q
       WHERE q.status = 'active'
       ORDER BY q.accepted_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch active quests", detail: String(err) });
  }
});

// ─── GET /api/quests/completed ─────────────────────────────────────────────
router.get("/quests/completed", async (_req, res) => {
  try {
    await ensureTables();
    const result = await pool.query(
      `SELECT * FROM quests WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch completed quests", detail: String(err) });
  }
});

// ─── POST /api/quests/generate ─────────────────────────────────────────────
router.post("/quests/generate", async (req, res) => {
  try {
    await ensureTables();

    const { games: requestedGames } = req.body as { games?: string[] };

    // Fetch recent game data from log_entries
    const logResult = await pool.query(`
      SELECT game,
             COUNT(*)::int AS session_count,
             SUM(minutes)::int AS total_minutes,
             MAX(timestamp) AS last_played,
             array_agg(DISTINCT type) AS types,
             array_agg(action ORDER BY timestamp DESC) FILTER (WHERE action IS NOT NULL) AS recent_actions
      FROM log_entries
      ${requestedGames && requestedGames.length > 0 ? `WHERE game = ANY($1)` : ""}
      GROUP BY game
      ORDER BY MAX(timestamp) DESC
      LIMIT 8
    `, requestedGames && requestedGames.length > 0 ? [requestedGames] : []);

    if (!logResult.rows.length) {
      res.status(422).json({ error: "No game log data found. Log some sessions first." });
      return;
    }

    const games = logResult.rows.map(r => ({
      game: r.game,
      sessionCount: r.session_count,
      totalMinutes: r.total_minutes,
      lastPlayed: r.last_played,
      types: r.types,
      recentActions: (r.recent_actions as string[]).slice(0, 5),
    }));

    const gameBlocks = games.map(g =>
      `Game: ${g.game}\nSessions: ${g.sessionCount} | Total time: ${g.totalMinutes}m | Last played: ${g.lastPlayed}\nRecent actions: ${g.recentActions.join("; ")}`
    ).join("\n\n");

    const systemPrompt = `You are an AI quest designer for a gaming tracker. Based on a player's session logs, generate 2 distinct, creative quests per game — each one tailored to what the player is actually doing in that game.

Quest categories: "challenge" (overcome a hard obstacle), "exploration" (discover or try new things), "grind" (accumulate/farm something), "skill" (master a mechanic).
Difficulties: "easy" (30–60 min), "medium" (1–3 sessions), "hard" (several sessions), "legendary" (major milestone).

Rules:
- Reference specific details from their session notes — quest titles and objectives must feel personal to THIS player's journey
- Each quest has 2–3 concrete, checkable objectives
- xp_reward: easy=50, medium=100, hard=200, legendary=500
- Be creative and inspiring — quests should feel like an adventure, not a chore

Respond ONLY with valid JSON (no markdown):
{
  "quests": [
    {
      "game": "<exact game name>",
      "title": "<quest title>",
      "description": "<1-2 sentence flavour text + what to do>",
      "category": "challenge|exploration|grind|skill",
      "difficulty": "easy|medium|hard|legendary",
      "xp_reward": <number>,
      "objectives": ["<step 1>", "<step 2>", "<optional step 3>"]
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 2000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Player's game log:\n\n${gameBlocks}\n\nGenerate 2 quests per game.` },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    let quests: Array<{
      game: string; title: string; description: string;
      category: string; difficulty: string; xp_reward: number; objectives: string[];
    }> = [];

    try {
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      const parsed = JSON.parse(jsonStr);
      quests = Array.isArray(parsed.quests) ? parsed.quests : [];
    } catch {
      console.error("quests generate: failed to parse AI JSON:", raw);
      res.status(500).json({ error: "AI returned malformed response" });
      return;
    }

    // Delete existing pending quests for these games to avoid duplicates
    const gameNames = games.map(g => g.game);
    await pool.query(
      `DELETE FROM quests WHERE status = 'pending' AND game = ANY($1)`,
      [gameNames]
    );

    // Insert new quests
    const inserted = [];
    for (const q of quests) {
      const r = await pool.query(
        `INSERT INTO quests (title, description, game, category, difficulty, xp_reward, objectives)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [q.title, q.description, q.game, q.category, q.difficulty, q.xp_reward, JSON.stringify(q.objectives)]
      );
      inserted.push(r.rows[0]);
    }

    res.json({ quests: inserted, count: inserted.length });
  } catch (err) {
    console.error("quests generate error:", err);
    res.status(500).json({ error: "Quest generation failed", detail: String(err) });
  }
});

// ─── POST /api/quests/:id/accept ───────────────────────────────────────────
router.post("/quests/:id/accept", async (req, res) => {
  try {
    await ensureTables();
    const id = parseInt(req.params.id, 10);
    const r = await pool.query(
      `UPDATE quests SET status='active', accepted_at=NOW() WHERE id=$1 AND status='pending' RETURNING *`,
      [id]
    );
    if (!r.rows.length) { res.status(404).json({ error: "Quest not found or already accepted" }); return; }
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to accept quest", detail: String(err) });
  }
});

// ─── POST /api/quests/:id/reject ───────────────────────────────────────────
router.post("/quests/:id/reject", async (req, res) => {
  try {
    await ensureTables();
    const id = parseInt(req.params.id, 10);
    const r = await pool.query(
      `UPDATE quests SET status='rejected' WHERE id=$1 AND status='pending' RETURNING *`,
      [id]
    );
    if (!r.rows.length) { res.status(404).json({ error: "Quest not found or not pending" }); return; }
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to reject quest", detail: String(err) });
  }
});

// ─── POST /api/quests/:id/progress ─────────────────────────────────────────
router.post("/quests/:id/progress", async (req, res) => {
  try {
    await ensureTables();
    const id = parseInt(req.params.id, 10);
    const { note, progress_pct } = req.body as { note: string; progress_pct: number };
    if (!note?.trim()) { res.status(400).json({ error: "note is required" }); return; }
    const r = await pool.query(
      `INSERT INTO quest_logs (quest_id, note, progress_pct) VALUES ($1, $2, $3) RETURNING *`,
      [id, note.trim(), Math.min(100, Math.max(0, progress_pct ?? 0))]
    );
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to log progress", detail: String(err) });
  }
});

// ─── POST /api/quests/:id/complete ─────────────────────────────────────────
router.post("/quests/:id/complete", async (req, res) => {
  try {
    await ensureTables();
    const id = parseInt(req.params.id, 10);
    const r = await pool.query(
      `UPDATE quests SET status='completed', completed_at=NOW() WHERE id=$1 AND status='active' RETURNING *`,
      [id]
    );
    if (!r.rows.length) { res.status(404).json({ error: "Quest not found or not active" }); return; }
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to complete quest", detail: String(err) });
  }
});

// ─── GET /api/quests/:id/guide ─────────────────────────────────────────────
router.get("/quests/:id/guide", async (req, res) => {
  try {
    await ensureTables();
    const id = parseInt(req.params.id, 10);

    // Check existing guide
    const existing = await pool.query(
      `SELECT * FROM quest_guides WHERE quest_id=$1 ORDER BY generated_at DESC LIMIT 1`,
      [id]
    );
    if (existing.rows.length) { res.json(existing.rows[0]); return; }

    // Fetch quest
    const questResult = await pool.query(`SELECT * FROM quests WHERE id=$1`, [id]);
    if (!questResult.rows.length) { res.status(404).json({ error: "Quest not found" }); return; }
    const quest = questResult.rows[0];

    // Generate guide with AI
    const systemPrompt = `You are an expert gaming guide writer. Given a quest for a video game, write a concise, actionable step-by-step guide to complete it.

Rules:
- 4–7 clear steps, each 1–2 sentences
- Reference the game's actual mechanics where possible
- Include a relevant YouTube search query (as a search URL) for finding a guide video
- Be specific and practical, not generic

Respond ONLY with valid JSON (no markdown):
{
  "title": "<guide title>",
  "steps": ["<step 1>", "<step 2>", ...],
  "youtube_url": "https://www.youtube.com/results?search_query=<encoded+query>"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 800,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Game: ${quest.game}\nQuest: ${quest.title}\nDescription: ${quest.description}\nObjectives: ${(quest.objectives as string[]).join("; ")}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    let guideData: { title: string; steps: string[]; youtube_url: string } = {
      title: `Guide: ${quest.title}`,
      steps: ["Start by reviewing your recent progress in the game.", "Focus on the main objectives one at a time.", "Use online resources if you get stuck."],
      youtube_url: `https://www.youtube.com/results?search_query=${encodeURIComponent(quest.game + " " + quest.title + " guide")}`,
    };

    try {
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      guideData = JSON.parse(jsonStr);
    } catch {
      console.error("quests guide: failed to parse AI JSON:", raw);
    }

    const r = await pool.query(
      `INSERT INTO quest_guides (quest_id, title, steps, youtube_url)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, guideData.title, JSON.stringify(guideData.steps), guideData.youtube_url]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error("quests guide error:", err);
    res.status(500).json({ error: "Failed to generate guide", detail: String(err) });
  }
});

// ─── GET /api/quests/stats ─────────────────────────────────────────────────
router.get("/quests/stats", async (_req, res) => {
  try {
    await ensureTables();
    const r = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='active')::int AS active_count,
        COUNT(*) FILTER (WHERE status='completed')::int AS completed_count,
        COUNT(*) FILTER (WHERE status='pending')::int AS pending_count,
        COALESCE(SUM(xp_reward) FILTER (WHERE status='completed'), 0)::int AS total_xp
      FROM quests
    `);
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch quest stats", detail: String(err) });
  }
});

export default router;
