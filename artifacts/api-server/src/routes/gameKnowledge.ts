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
    const [knowledge, pending, playtimeRow] = await Promise.all([
      pool.query(`SELECT * FROM game_knowledge WHERE game = $1`, [game]),
      pool.query(
        `SELECT * FROM game_progress_estimates WHERE game = $1 AND status = 'pending'
         ORDER BY created_at DESC`, [game]
      ),
      pool.query(`SELECT SUM(minutes)::int as total_minutes FROM log_entries WHERE game = $1`, [game]),
    ]);
    if (!knowledge.rows.length) {
      return res.json({ game, hasKnowledge: false, pending: pending.rows });
    }
    const gk = knowledge.rows[0];
    const totalMinutes = playtimeRow.rows[0]?.total_minutes ?? 0;
    const estStoryMins = (gk.estimated_story_hours ?? 0) * 60;
    const estFullMins  = (gk.estimated_full_hours  ?? 0) * 60;
    const time_story_est = estStoryMins > 0 ? Math.min(99, Math.round(totalMinutes / estStoryMins * 100)) : null;
    const time_full_est  = estFullMins  > 0 ? Math.min(99, Math.round(totalMinutes / estFullMins  * 100)) : null;
    res.json({ ...gk, hasKnowledge: true, pending: pending.rows, total_minutes_played: totalMinutes, time_story_est, time_full_est });
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

ACCURACY RULES — follow these strictly:
- Use ONLY stage/level/chapter names you are certain exist in "${game}". Do NOT invent names that sound plausible.
- If you are unsure of the exact name of a stage, use a broad descriptor ("Early story stages", "Mid-game chapter") rather than guessing a specific name.
- story_milestones must reference real, named events or stages from the actual game in correct chronological order.
- remaining_story at ${currentPct}% story progress: list only stages/chapters the player has not yet reached. If unsure of exact names, use broad stage descriptions ("Complete remaining story stages", "Defeat the final boss").
- remaining_full: list real collectible/challenge categories specific to this game (e.g. "Collect all Chaos Emeralds", "Complete all S-Rank missions"). Do NOT invent generic names.
- If you have low confidence in specific names for this game (e.g. it was released after 2023 or you have limited data), set confidence below 0.5 and keep milestone/task names broad and safe rather than specific and wrong.
- Lower confidence score when you are unsure. Never fabricate specific content to appear confident.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
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

// ─── Shared inference logic (also called fire-and-forget after log inserts) ───

export async function triggerProgressInference(game: string): Promise<void> {
  await ensureTables();

  // Skip if no knowledge map exists for this game
  const knowledgeCheck = await pool.query(
    `SELECT story_percentage, full_percentage, story_milestones, remaining_story, remaining_full,
            estimated_story_hours, estimated_full_hours FROM game_knowledge WHERE game = $1`,
    [game]
  );
  if (!knowledgeCheck.rows.length) return;

  // Skip if there's already a pending suggestion (avoid spamming)
  const pendingCheck = await pool.query(
    `SELECT id FROM game_progress_estimates WHERE game = $1 AND status = 'pending' LIMIT 1`,
    [game]
  );
  if (pendingCheck.rows.length) return;

  const [recentLogs, playtimeRow] = await Promise.all([
    pool.query(`
      SELECT timestamp, action, minutes, type
        FROM log_entries WHERE game = $1
       ORDER BY timestamp::timestamptz DESC LIMIT 20
    `, [game]),
    pool.query(`
      SELECT SUM(minutes)::int as total_minutes
        FROM log_entries WHERE game = $1
    `, [game]),
  ]);

  if (!recentLogs.rows.length) return;

  const gk = knowledgeCheck.rows[0];
  const currentStory = gk.story_percentage ?? 0;
  const currentFull  = gk.full_percentage  ?? 0;
  const milestones   = gk.story_milestones ?? [];
  const remainStory  = gk.remaining_story  ?? [];
  const remainFull   = gk.remaining_full   ?? [];
  const totalMinutes = playtimeRow.rows[0]?.total_minutes ?? 0;
  const estStoryMins = (gk.estimated_story_hours ?? 0) * 60;
  const estFullMins  = (gk.estimated_full_hours  ?? 0) * 60;

  // Time-based estimate: clamp to 99 to leave room for AI to confirm completion
  const timeStoryEst = estStoryMins > 0 ? Math.min(99, Math.round(totalMinutes / estStoryMins * 100)) : null;
  const timeFullEst  = estFullMins  > 0 ? Math.min(99, Math.round(totalMinutes / estFullMins  * 100)) : null;

  const logLines = recentLogs.rows
    .map((r: any) => `- ${r.action} (${r.minutes}m, ${r.type})`)
    .join('\n');

  const milestoneList = Array.isArray(milestones) && milestones.length
    ? milestones.map((m: any) => {
        const done = m.story_pct <= currentStory;
        return `  ${done ? '✓' : '•'} ${m.title} → story ${m.story_pct}%, full ${m.full_pct}%${done ? ' (already completed)' : ''}`;
      }).join('\n')
    : '  (no milestone map yet — generate knowledge first for better accuracy)';

  const remainStoryList = Array.isArray(remainStory) && remainStory.length
    ? remainStory.map((r: any) => `  - ${r.title}: ${r.description ?? ''}`).join('\n')
    : '  (none)';

  const remainFullList = Array.isArray(remainFull) && remainFull.length
    ? remainFull.map((r: any) => `  - ${r.title} [${r.category ?? 'other'}]: ${r.description ?? ''}`).join('\n')
    : '  (none)';

  const timeHint = timeStoryEst !== null
    ? `\nTIME-BASED ESTIMATE (${totalMinutes}m played ÷ ${Math.round(estStoryMins)}m estimated): story ~${timeStoryEst}%${timeFullEst !== null ? `, full ~${timeFullEst}%` : ''}`
    : '';

  const prompt = `You are a game progress analyst for "${game}".

CURRENT TRACKED PROGRESS:
- Story completion: ${currentStory}%
- Full completion: ${currentFull}%
${timeHint}

STORY MILESTONE MAP (✓ = already completed, • = still ahead):
${milestoneList}

TASKS STILL REMAINING — STORY:
${remainStoryList}

TASKS STILL REMAINING — FULL COMPLETION:
${remainFullList}

RECENT ACTIVITY (newest first):
${logLines}

Based on the recent activity AND the time-based estimate, suggest updated completion percentages.

Respond ONLY with valid JSON (no markdown):
{
  "story_pct_suggested": number (0-100, new estimate — use time-based as a floor if logs are sparse),
  "full_pct_suggested": number (0-100, new estimate),
  "milestone_reached": "string or null (name of milestone just reached or passed, if any)",
  "confidence": number (0-1),
  "reasoning": "string (1-2 sentences explaining what drove the estimate)",
  "has_update": boolean (true if the suggested values differ from current tracked values)
}

Rules:
- A milestone is "reached" if its story_pct <= story_pct_suggested and it was marked • (not already done)
- If recent logs mention completing something in REMAINING STORY/FULL COMPLETION lists, treat that as strong evidence
- Use the time-based estimate as a minimum baseline when logs are sparse
- Never decrease percentages below current values
- has_update = true if EITHER story OR full would change`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  });

  let data: any = {};
  try {
    data = JSON.parse(completion.choices[0].message.content?.trim() ?? "{}");
  } catch {
    console.error(`[inference] AI returned invalid JSON for ${game}`);
    return;
  }

  if (!data.has_update) return;

  await pool.query(`
    INSERT INTO game_progress_estimates
      (game, trigger_type, trigger_context, story_pct_current, full_pct_current,
       story_pct_suggested, full_pct_suggested, milestone_reached, confidence, reasoning, status)
    VALUES ($1, 'log_inference', $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
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

  console.log(`[inference] Queued progress suggestion for ${game}: story ${currentStory}→${data.story_pct_suggested}%, full ${currentFull}→${data.full_pct_suggested}%`);
}

// ─── POST /api/games/:game/progress/infer ────────────────────────────────────
router.post("/games/:game/progress/infer", async (req, res) => {
  try {
    await ensureTables();
    const game = decodeURIComponent(req.params.game);

    const [knowledge, recentLogs, playtimeRow] = await Promise.all([
      pool.query(`SELECT * FROM game_knowledge WHERE game = $1`, [game]),
      pool.query(`
        SELECT timestamp, action, minutes, type
          FROM log_entries WHERE game = $1
         ORDER BY timestamp::timestamptz DESC LIMIT 20
      `, [game]),
      pool.query(`SELECT SUM(minutes)::int as total_minutes FROM log_entries WHERE game = $1`, [game]),
    ]);

    if (!recentLogs.rows.length) {
      return res.status(400).json({ error: "No logs for this game yet" });
    }

    const gk = knowledge.rows[0];
    const currentStory = gk?.story_percentage ?? 0;
    const currentFull  = gk?.full_percentage  ?? 0;
    const milestones   = gk?.story_milestones ?? [];
    const remainStory  = gk?.remaining_story  ?? [];
    const remainFull   = gk?.remaining_full   ?? [];
    const totalMinutes = playtimeRow.rows[0]?.total_minutes ?? 0;
    const estStoryMins = (gk?.estimated_story_hours ?? 0) * 60;
    const estFullMins  = (gk?.estimated_full_hours  ?? 0) * 60;

    const timeStoryEst = estStoryMins > 0 ? Math.min(99, Math.round(totalMinutes / estStoryMins * 100)) : null;
    const timeFullEst  = estFullMins  > 0 ? Math.min(99, Math.round(totalMinutes / estFullMins  * 100)) : null;

    const logLines = recentLogs.rows
      .map((r: any) => `- ${r.action} (${r.minutes}m, ${r.type})`)
      .join('\n');

    const milestoneList = Array.isArray(milestones) && milestones.length
      ? milestones.map((m: any) => {
          const done = m.story_pct <= currentStory;
          return `  ${done ? '✓' : '•'} ${m.title} → story ${m.story_pct}%, full ${m.full_pct}%${done ? ' (already completed)' : ''}`;
        }).join('\n')
      : '  (no milestone map — generate knowledge first for better accuracy)';

    const remainStoryList = Array.isArray(remainStory) && remainStory.length
      ? remainStory.map((r: any) => `  - ${r.title}: ${r.description ?? ''}`).join('\n')
      : '  (none)';

    const remainFullList = Array.isArray(remainFull) && remainFull.length
      ? remainFull.map((r: any) => `  - ${r.title} [${r.category ?? 'other'}]: ${r.description ?? ''}`).join('\n')
      : '  (none)';

    const timeHint = timeStoryEst !== null
      ? `\nTIME-BASED ESTIMATE (${totalMinutes}m played ÷ ${Math.round(estStoryMins)}m estimated): story ~${timeStoryEst}%${timeFullEst !== null ? `, full ~${timeFullEst}%` : ''}`
      : '';

    const prompt = `You are a game progress analyst for "${game}".

CURRENT TRACKED PROGRESS:
- Story completion: ${currentStory}%
- Full completion: ${currentFull}%
${timeHint}

STORY MILESTONE MAP (✓ = already completed, • = still ahead):
${milestoneList}

TASKS STILL REMAINING — STORY:
${remainStoryList}

TASKS STILL REMAINING — FULL COMPLETION:
${remainFullList}

RECENT ACTIVITY (newest first):
${logLines}

Based on the recent activity AND the time-based estimate, suggest updated completion percentages.

Respond ONLY with valid JSON (no markdown):
{
  "story_pct_suggested": number (0-100, new estimate — use time-based as a floor if logs are sparse),
  "full_pct_suggested": number (0-100, new estimate),
  "milestone_reached": "string or null (name of milestone just reached or passed, if any)",
  "confidence": number (0-1),
  "reasoning": "string (1-2 sentences explaining what drove the estimate)",
  "has_update": boolean (true if suggested values differ from current tracked values)
}

Rules:
- A milestone is "reached" if its story_pct <= story_pct_suggested and it was marked • (not already done)
- If recent logs mention completing something in REMAINING STORY/FULL COMPLETION lists, treat that as strong evidence
- Use the time-based estimate as a minimum baseline when logs are sparse
- Never decrease percentages below current values
- has_update = true if EITHER story OR full would change`;

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

// ─── Helper: trim remaining tasks after progress update ──────────────────────

async function refreshRemainingTasks(game: string, newStoryPct: number, newFullPct: number): Promise<void> {
  const { rows } = await pool.query(
    `SELECT story_milestones, remaining_story, remaining_full FROM game_knowledge WHERE game = $1`, [game]
  );
  if (!rows.length) return;

  const gk = rows[0];
  const milestones: any[]    = gk.story_milestones ?? [];
  const remainStory: any[]   = gk.remaining_story  ?? [];
  const remainFull: any[]    = gk.remaining_full   ?? [];

  if (!remainStory.length && !remainFull.length) return;

  // Mark which milestones are now completed
  const doneMilestones = milestones.filter(m => m.story_pct <= newStoryPct);
  const doneTitles     = doneMilestones.map(m => m.title);

  const milestoneBlock = milestones.map(m => {
    const done = m.story_pct <= newStoryPct;
    return `  ${done ? '✓' : '•'} ${m.title} (story ${m.story_pct}%, full ${m.full_pct}%)`;
  }).join('\n');

  const prompt = `You are tracking progress in "${game}".

CURRENT PROGRESS: story ${newStoryPct}%, full completion ${newFullPct}%

MILESTONE MAP (✓ = done, • = ahead):
${milestoneBlock}

CURRENT REMAINING STORY TASKS:
${remainStory.map(r => `  - ${r.title}: ${r.description ?? ''}`).join('\n') || '  (none)'}

CURRENT REMAINING FULL COMPLETION TASKS:
${remainFull.map(r => `  - [${r.category ?? 'other'}] ${r.title}: ${r.description ?? ''}`).join('\n') || '  (none)'}

Remove any tasks that are clearly completed given the current story/full percentage and the milestone map.
Keep tasks that are still ahead. Preserve the original wording.

Respond ONLY with valid JSON (no markdown):
{
  "remaining_story": [{ "title": "...", "description": "..." }],
  "remaining_full":  [{ "title": "...", "description": "...", "category": "..." }]
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
  });

  let data: any = {};
  try {
    data = JSON.parse(completion.choices[0].message.content?.trim() ?? "{}");
  } catch {
    console.error(`[refreshRemaining] AI returned invalid JSON for ${game}`);
    return;
  }

  if (!Array.isArray(data.remaining_story) && !Array.isArray(data.remaining_full)) return;

  await pool.query(`
    UPDATE game_knowledge SET
      remaining_story = COALESCE($1::jsonb, remaining_story),
      remaining_full  = COALESCE($2::jsonb, remaining_full),
      updated_at      = NOW()
    WHERE game = $3
  `, [
    data.remaining_story ? JSON.stringify(data.remaining_story) : null,
    data.remaining_full  ? JSON.stringify(data.remaining_full)  : null,
    game,
  ]);

  console.log(`[refreshRemaining] ${game}: ${data.remaining_story?.length ?? '?'} story, ${data.remaining_full?.length ?? '?'} full tasks remaining`);
}

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

      // Deterministic clear: at 100% completion there's nothing left
      const clearStory = finalStory >= 100 ? '[]' : null;
      const clearFull  = finalFull  >= 100 ? '[]' : null;
      if (clearStory !== null || clearFull !== null) {
        await pool.query(`
          UPDATE game_knowledge SET
            remaining_story = COALESCE($1::jsonb, remaining_story),
            remaining_full  = COALESCE($2::jsonb, remaining_full),
            updated_at      = NOW()
          WHERE game = $3
        `, [clearStory, clearFull, game]);
      }

      // Fire-and-forget: trim completed tasks from remaining lists (skipped if both cleared)
      if (finalStory < 100 || finalFull < 100) {
        refreshRemainingTasks(game, finalStory, finalFull)
          .catch(err => console.error(`[refreshRemaining] ${game}:`, err));
      }
    }

    res.json({ ok: true, status: newStatus });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
