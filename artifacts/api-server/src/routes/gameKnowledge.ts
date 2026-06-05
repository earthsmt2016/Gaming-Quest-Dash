import { Router } from "express";
import { pool } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

// ─── Tables ──────────────────────────────────────────────────────────────────

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_knowledge (
      game                    TEXT PRIMARY KEY,
      genre                   TEXT,
      story_summary           TEXT,
      story_percentage        INTEGER NOT NULL DEFAULT 0,
      full_percentage         INTEGER NOT NULL DEFAULT 0,
      estimated_story_hours   NUMERIC(6,1),
      estimated_full_hours    NUMERIC(6,1),
      story_milestones        JSONB NOT NULL DEFAULT '[]',
      remaining_story         JSONB NOT NULL DEFAULT '[]',
      remaining_full          JSONB NOT NULL DEFAULT '[]',
      knowledge_source        TEXT NOT NULL DEFAULT 'ai',
      confidence              NUMERIC(3,2) NOT NULL DEFAULT 0.5,
      generated_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at              TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS game_progress_estimates (
      id               SERIAL PRIMARY KEY,
      game             TEXT NOT NULL,
      trigger_type     TEXT NOT NULL DEFAULT 'log_inference',
      trigger_context  TEXT,
      story_pct_current   INTEGER,
      full_pct_current    INTEGER,
      story_pct_suggested INTEGER,
      full_pct_suggested  INTEGER,
      milestone_reached   TEXT,
      confidence          NUMERIC(3,2),
      reasoning           TEXT,
      status           TEXT NOT NULL DEFAULT 'pending',
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      resolved_at      TIMESTAMPTZ
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_gpe_game_status ON game_progress_estimates(game, status);
  `);
}
ensureTables().catch(console.error);

// ─── GET /api/games/pending-suggestions ──────────────────────────────────────
// Must be defined BEFORE /:game routes to avoid param capture
router.get("/games/pending-suggestions", async (_req, res) => {
  try {
    await ensureTables();
    const { rows } = await pool.query(
      `SELECT * FROM game_progress_estimates WHERE status = 'pending'
       ORDER BY confidence DESC, created_at DESC`
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/games/:game/knowledge ──────────────────────────────────────────
router.get("/games/:game/knowledge", async (req, res) => {
  try {
    await ensureTables();
    const game = decodeURIComponent(req.params.game);
    const [knowledge, pending] = await Promise.all([
      pool.query(`SELECT * FROM game_knowledge WHERE game = $1`, [game]),
      pool.query(
        `SELECT * FROM game_progress_estimates WHERE game = $1 AND status = 'pending'
         ORDER BY created_at DESC`, [game]
      ),
    ]);
    if (!knowledge.rows.length) {
      return res.json({ game, hasKnowledge: false, pending: pending.rows });
    }
    res.json({ ...knowledge.rows[0], hasKnowledge: true, pending: pending.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/games/:game/knowledge/generate ────────────────────────────────
router.post("/games/:game/knowledge/generate", async (req, res) => {
  try {
    await ensureTables();
    const game = decodeURIComponent(req.params.game);

    // Grab existing progress and play data for context
    const [progRow, logsRow] = await Promise.all([
      pool.query(`SELECT * FROM game_progress WHERE game = $1`, [game]).catch(() => ({ rows: [] })),
      pool.query(`
        SELECT action, SUM(minutes)::int AS total_min, COUNT(*)::int AS count
          FROM log_entries WHERE game = $1
         GROUP BY action ORDER BY total_min DESC LIMIT 10
      `, [game]),
    ]);

    const totalHours = (logsRow.rows.reduce((a: number, r: any) => a + r.total_min, 0) / 60).toFixed(1);
    const topActions = logsRow.rows.slice(0, 5).map((r: any) => r.action).join(', ');
    const currentPct = progRow.rows[0]?.current_percentage ?? 0;

    const prompt = `You are a game knowledge expert. Generate a structured completion map for: "${game}"

Context about this player:
- Total playtime: ${totalHours} hours
- Activities logged: ${topActions || 'none yet'}
- Current tracked progress: ${currentPct}%

Respond ONLY with valid JSON (no markdown):
{
  "genre": "string (e.g. RPG, Action, Platformer, Racing)",
  "story_summary": "string (2 sentences: what is the main goal of the game)",
  "estimated_story_hours": number (main story completion hours, realistic estimate),
  "estimated_full_hours": number (100% completion hours),
  "story_milestones": [
    {
      "title": "string (milestone name, e.g. 'Act 1 Complete', 'Final Boss Defeated')",
      "description": "string (1 sentence)",
      "story_pct": number (0-100, story progress this milestone represents),
      "full_pct": number (0-100, full completion this milestone represents),
      "confidence": number (0-1)
    }
  ],
  "remaining_story": [
    { "title": "string", "description": "string" }
  ],
  "remaining_full": [
    { "title": "string", "category": "achievements|collectibles|side_content|challenge|multiplayer|other", "description": "string" }
  ],
  "confidence": number (0-1, how confident you are in this knowledge)
}

Rules:
- story_milestones: 5-10 entries in chronological order
- remaining_story: list 3-6 major story stages yet to complete (assume player is at ${currentPct}% story progress)
- remaining_full: list 4-8 optional/completionist tasks
- Be specific to the actual game — do not invent fictional content
- If you are not certain about a game, lower the confidence score`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    let data: any = {};
    try {
      data = JSON.parse(completion.choices[0].message.content?.trim() ?? "{}");
    } catch {
      return res.status(500).json({ error: "AI returned invalid JSON" });
    }

    const existing = await pool.query(`SELECT story_percentage, full_percentage FROM game_knowledge WHERE game = $1`, [game]);
    const storyPct = existing.rows[0]?.story_percentage ?? currentPct;
    const fullPct  = existing.rows[0]?.full_percentage  ?? 0;

    const { rows } = await pool.query(`
      INSERT INTO game_knowledge (
        game, genre, story_summary, story_percentage, full_percentage,
        estimated_story_hours, estimated_full_hours,
        story_milestones, remaining_story, remaining_full,
        knowledge_source, confidence, generated_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ai',$11,NOW(),NOW())
      ON CONFLICT (game) DO UPDATE SET
        genre                 = EXCLUDED.genre,
        story_summary         = EXCLUDED.story_summary,
        estimated_story_hours = EXCLUDED.estimated_story_hours,
        estimated_full_hours  = EXCLUDED.estimated_full_hours,
        story_milestones      = EXCLUDED.story_milestones,
        remaining_story       = EXCLUDED.remaining_story,
        remaining_full        = EXCLUDED.remaining_full,
        knowledge_source      = 'ai',
        confidence            = EXCLUDED.confidence,
        generated_at          = NOW(),
        updated_at            = NOW()
      RETURNING *
    `, [
      game,
      data.genre ?? null,
      data.story_summary ?? null,
      storyPct,
      fullPct,
      data.estimated_story_hours ?? null,
      data.estimated_full_hours ?? null,
      JSON.stringify(data.story_milestones ?? []),
      JSON.stringify(data.remaining_story ?? []),
      JSON.stringify(data.remaining_full ?? []),
      data.confidence ?? 0.5,
    ]);

    res.json({ ...rows[0], hasKnowledge: true, pending: [] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PATCH /api/games/:game/knowledge ────────────────────────────────────────
router.patch("/games/:game/knowledge", async (req, res) => {
  try {
    await ensureTables();
    const game = decodeURIComponent(req.params.game);
    const {
      story_percentage, full_percentage,
      story_milestones, remaining_story, remaining_full,
      estimated_story_hours, estimated_full_hours,
    } = req.body;

    const { rows } = await pool.query(`
      UPDATE game_knowledge SET
        story_percentage      = COALESCE($1, story_percentage),
        full_percentage       = COALESCE($2, full_percentage),
        story_milestones      = COALESCE($3::jsonb, story_milestones),
        remaining_story       = COALESCE($4::jsonb, remaining_story),
        remaining_full        = COALESCE($5::jsonb, remaining_full),
        estimated_story_hours = COALESCE($6, estimated_story_hours),
        estimated_full_hours  = COALESCE($7, estimated_full_hours),
        knowledge_source      = 'user',
        updated_at            = NOW()
      WHERE game = $8
      RETURNING *
    `, [
      story_percentage ?? null,
      full_percentage ?? null,
      story_milestones ? JSON.stringify(story_milestones) : null,
      remaining_story  ? JSON.stringify(remaining_story)  : null,
      remaining_full   ? JSON.stringify(remaining_full)   : null,
      estimated_story_hours ?? null,
      estimated_full_hours  ?? null,
      game,
    ]);

    if (!rows.length) return res.status(404).json({ error: "No knowledge record for this game — generate one first" });
    res.json({ ...rows[0], hasKnowledge: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/games/:game/progress/infer ────────────────────────────────────
router.post("/games/:game/progress/infer", async (req, res) => {
  try {
    await ensureTables();
    const game = decodeURIComponent(req.params.game);

    const [knowledge, recentLogs, currentProg] = await Promise.all([
      pool.query(`SELECT * FROM game_knowledge WHERE game = $1`, [game]),
      pool.query(`
        SELECT timestamp, action, minutes, type
          FROM log_entries WHERE game = $1
         ORDER BY timestamp::timestamptz DESC LIMIT 20
      `, [game]),
      pool.query(`SELECT * FROM game_knowledge WHERE game = $1`, [game]),
    ]);

    if (!recentLogs.rows.length) {
      return res.status(400).json({ error: "No logs for this game yet" });
    }

    const gk = knowledge.rows[0];
    const currentStory = gk?.story_percentage ?? 0;
    const currentFull  = gk?.full_percentage  ?? 0;
    const milestones   = gk?.story_milestones ?? [];
    const logLines = recentLogs.rows
      .map((r: any) => `- ${r.action} (${r.minutes}m, ${r.type})`)
      .join('\n');

    const milestoneList = Array.isArray(milestones) && milestones.length
      ? milestones.map((m: any) => `  • ${m.title} → story ${m.story_pct}%, full ${m.full_pct}%`).join('\n')
      : '  (no milestone map yet — generate knowledge first for better accuracy)';

    const prompt = `You are a game progress analyst for "${game}".

CURRENT TRACKED PROGRESS:
- Story completion: ${currentStory}%
- Full completion: ${currentFull}%

STORY MILESTONE MAP:
${milestoneList}

RECENT ACTIVITY (newest first):
${logLines}

Based on the recent activity, estimate whether progress has changed.

Respond ONLY with valid JSON (no markdown):
{
  "story_pct_suggested": number (0-100, new estimate — same as current if no change),
  "full_pct_suggested": number (0-100, new estimate — same as current if no change),
  "milestone_reached": "string or null (name of milestone just reached, if any)",
  "confidence": number (0-1),
  "reasoning": "string (1-2 sentences explaining the suggestion)",
  "has_update": boolean (true only if you believe progress actually changed)
}

Rules:
- Only suggest an update if the activity clearly indicates progress changed
- Never decrease percentages
- If nothing meaningful happened, set has_update: false with current values and confidence 0.3
- Be specific: reference the actual activity that drove the estimate`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    let data: any = {};
    try {
      data = JSON.parse(completion.choices[0].message.content?.trim() ?? "{}");
    } catch {
      return res.status(500).json({ error: "AI returned invalid JSON" });
    }

    if (!data.has_update) {
      return res.json({
        game,
        has_update: false,
        reasoning: data.reasoning ?? "No significant progress change detected.",
        confidence: data.confidence ?? 0.3,
      });
    }

    // Store as pending suggestion
    const { rows } = await pool.query(`
      INSERT INTO game_progress_estimates
        (game, trigger_type, trigger_context, story_pct_current, full_pct_current,
         story_pct_suggested, full_pct_suggested, milestone_reached, confidence, reasoning, status)
      VALUES ($1, 'log_inference', $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
      RETURNING *
    `, [
      game,
      logLines.slice(0, 500),
      currentStory,
      currentFull,
      Math.max(currentStory, data.story_pct_suggested ?? currentStory),
      Math.max(currentFull,  data.full_pct_suggested  ?? currentFull),
      data.milestone_reached ?? null,
      data.confidence ?? 0.5,
      data.reasoning ?? null,
    ]);

    res.json({ game, has_update: true, suggestion: rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/games/:game/progress/suggestions/:id/resolve ──────────────────
router.post("/games/:game/progress/suggestions/:id/resolve", async (req, res) => {
  try {
    await ensureTables();
    const game = decodeURIComponent(req.params.game);
    const { id } = req.params;
    const { action, story_pct, full_pct } = req.body; // action: 'accept' | 'reject' | 'edit'

    if (!['accept', 'reject', 'edit'].includes(action)) {
      return res.status(400).json({ error: "action must be accept, reject, or edit" });
    }

    const { rows: estRows } = await pool.query(
      `SELECT * FROM game_progress_estimates WHERE id = $1 AND game = $2`,
      [id, game]
    );
    if (!estRows.length) return res.status(404).json({ error: "Suggestion not found" });
    const est = estRows[0];

    const newStatus = action === 'reject' ? 'rejected' : action === 'edit' ? 'edited' : 'accepted';

    await pool.query(
      `UPDATE game_progress_estimates SET status = $1, resolved_at = NOW() WHERE id = $2`,
      [newStatus, id]
    );

    // Apply to game_knowledge if accepted or edited
    if (action !== 'reject') {
      const finalStory = action === 'edit' ? (story_pct ?? est.story_pct_suggested) : est.story_pct_suggested;
      const finalFull  = action === 'edit' ? (full_pct  ?? est.full_pct_suggested)  : est.full_pct_suggested;

      await pool.query(`
        INSERT INTO game_knowledge (game, story_percentage, full_percentage, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (game) DO UPDATE SET
          story_percentage = GREATEST(game_knowledge.story_percentage, $2),
          full_percentage  = GREATEST(game_knowledge.full_percentage, $3),
          knowledge_source = CASE WHEN $4 = 'edit' THEN 'user' ELSE game_knowledge.knowledge_source END,
          updated_at       = NOW()
      `, [game, finalStory, finalFull, action]);
    }

    res.json({ ok: true, status: newStatus });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
