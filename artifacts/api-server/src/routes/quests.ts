import { Router } from "express";
import { pool } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

async function ensureTables() {
  // Migration: drop old schema if it has legacy columns (category, objectives)
  const legacyCheck = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='quests' AND column_name='category'
  `);
  if (legacyCheck.rows.length > 0) {
    await pool.query(`DROP TABLE IF EXISTS quest_logs CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS quest_guides CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS quests CASCADE`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quests (
      id                SERIAL PRIMARY KEY,
      game              TEXT NOT NULL,
      title             TEXT NOT NULL,
      description       TEXT NOT NULL,
      type              TEXT NOT NULL DEFAULT 'challenge',
      difficulty        TEXT NOT NULL DEFAULT 'medium',
      xp_reward         INTEGER NOT NULL DEFAULT 100,
      estimated_minutes INTEGER NOT NULL DEFAULT 60,
      status            TEXT NOT NULL DEFAULT 'suggested',
      progress          INTEGER NOT NULL DEFAULT 0,
      target            INTEGER NOT NULL DEFAULT 100,
      ai_generated      BOOLEAN NOT NULL DEFAULT true,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      accepted_at       TIMESTAMPTZ,
      completed_at      TIMESTAMPTZ
    )
  `);

  // Add reasoning column if missing (non-destructive migration)
  await pool.query(`
    ALTER TABLE quests ADD COLUMN IF NOT EXISTS reasoning TEXT
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quest_guides (
      id            SERIAL PRIMARY KEY,
      quest_id      INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      steps         JSONB NOT NULL DEFAULT '[]',
      youtube_links JSONB NOT NULL DEFAULT '[]',
      tips          TEXT,
      generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quest_logs (
      id                 SERIAL PRIMARY KEY,
      quest_id           INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      game               TEXT NOT NULL,
      title              TEXT NOT NULL,
      xp_earned          INTEGER NOT NULL DEFAULT 0,
      time_taken_minutes INTEGER NOT NULL DEFAULT 0,
      difficulty         TEXT NOT NULL DEFAULT 'medium',
      completed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // User profile — singleton row (id=1)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id                   INTEGER PRIMARY KEY DEFAULT 1,
      preferred_difficulty TEXT NOT NULL DEFAULT 'medium',
      preferred_types      JSONB NOT NULL DEFAULT '[]',
      avoided_types        JSONB NOT NULL DEFAULT '[]',
      avg_session_minutes  INTEGER NOT NULL DEFAULT 60,
      completion_rates     JSONB NOT NULL DEFAULT '{}',
      personality_summary  TEXT,
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Quest feedback
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quest_feedback (
      id         SERIAL PRIMARY KEY,
      quest_id   INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      rating     INTEGER NOT NULL,
      comment    TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Mini progress logs per quest
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quest_mini_logs (
      id         SERIAL PRIMARY KEY,
      quest_id   INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      note       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Rich description on quest completion log
  await pool.query(`
    ALTER TABLE quest_logs ADD COLUMN IF NOT EXISTS description TEXT
  `);
}

ensureTables().catch(err => console.error("quests ensureTables:", err));

// ─── Profile computation ────────────────────────────────────────────────────

async function buildUserProfile(): Promise<void> {
  const [completionByType, rejectionByType, difficultyStats, sessionStats, feedbackStats] = await Promise.all([
    pool.query(`SELECT type, COUNT(*)::int as cnt FROM quests WHERE status='completed' GROUP BY type`),
    pool.query(`SELECT type, COUNT(*)::int as cnt FROM quests WHERE status='rejected' GROUP BY type`),
    pool.query(`SELECT difficulty, COUNT(*)::int as cnt FROM quests WHERE status='completed' GROUP BY difficulty ORDER BY cnt DESC LIMIT 1`),
    pool.query(`SELECT COALESCE(AVG(minutes)::int, 60) as avg_minutes FROM log_entries`),
    pool.query(`
      SELECT q.type, q.difficulty, AVG(f.rating)::float as avg_rating, COUNT(*)::int as cnt
      FROM quest_feedback f JOIN quests q ON q.id = f.quest_id
      GROUP BY q.type, q.difficulty
    `),
  ]);

  const completionMap: Record<string, number> = {};
  for (const r of completionByType.rows) completionMap[r.type] = r.cnt;

  const rejectionMap: Record<string, number> = {};
  for (const r of rejectionByType.rows) rejectionMap[r.type] = r.cnt;

  // Feedback can nudge type preference (avg_rating > 0.5 = preferred, < -0.5 = avoided)
  const feedbackTypeMap: Record<string, number> = {};
  for (const r of feedbackStats.rows) {
    feedbackTypeMap[r.type] = (feedbackTypeMap[r.type] ?? 0) + r.avg_rating * r.cnt;
  }

  const allTypes = ['challenge', 'exploration', 'grind', 'skill'];
  const preferredTypes: string[] = [];
  const avoidedTypes: string[] = [];

  for (const t of allTypes) {
    const completed = completionMap[t] ?? 0;
    const rejected = rejectionMap[t] ?? 0;
    const total = completed + rejected;
    const feedbackScore = feedbackTypeMap[t] ?? 0;

    if (total >= 2) {
      const rate = completed / total;
      if (rate >= 0.6 || feedbackScore > 1) preferredTypes.push(t);
      else if (rate <= 0.3 || feedbackScore < -1) avoidedTypes.push(t);
    } else if (Math.abs(feedbackScore) > 1) {
      if (feedbackScore > 0) preferredTypes.push(t);
      else avoidedTypes.push(t);
    }
  }

  const preferredDifficulty = difficultyStats.rows[0]?.difficulty ?? 'medium';
  const avgSessionMinutes = sessionStats.rows[0]?.avg_minutes ?? 60;

  const completionRates: Record<string, { completed: number; rejected: number }> = {};
  for (const t of allTypes) {
    completionRates[t] = { completed: completionMap[t] ?? 0, rejected: rejectionMap[t] ?? 0 };
  }

  const totalCompleted = Object.values(completionMap).reduce((s, v) => s + v, 0);

  // Generate personality summary using AI when there's meaningful history
  let personalitySummary: string | null = null;
  if (totalCompleted >= 2) {
    const lines = [
      `Quest completions by type: ${JSON.stringify(completionRates)}`,
      `Preferred difficulty: ${preferredDifficulty}`,
      `Preferred types: ${preferredTypes.join(', ') || 'none established yet'}`,
      `Avoided types: ${avoidedTypes.join(', ') || 'none identified yet'}`,
      `Average session length: ~${avgSessionMinutes} minutes`,
    ];
    try {
      const resp = await openai.chat.completions.create({
        model: 'gpt-5.4',
        max_completion_tokens: 120,
        messages: [
          {
            role: 'system',
            content: 'Analyze this gamer\'s quest history and write a 2-sentence personality profile capturing their playstyle. Use second person ("You are..."). Be specific and insightful.',
          },
          { role: 'user', content: lines.join('\n') },
        ],
      });
      personalitySummary = resp.choices[0]?.message?.content?.trim() ?? null;
    } catch {
      // silently skip personality generation
    }
  }

  await pool.query(`
    INSERT INTO user_profile (id, preferred_difficulty, preferred_types, avoided_types, avg_session_minutes, completion_rates, personality_summary, updated_at)
    VALUES (1, $1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (id) DO UPDATE SET
      preferred_difficulty = EXCLUDED.preferred_difficulty,
      preferred_types      = EXCLUDED.preferred_types,
      avoided_types        = EXCLUDED.avoided_types,
      avg_session_minutes  = EXCLUDED.avg_session_minutes,
      completion_rates     = EXCLUDED.completion_rates,
      personality_summary  = COALESCE(EXCLUDED.personality_summary, user_profile.personality_summary),
      updated_at           = NOW()
  `, [
    preferredDifficulty,
    JSON.stringify(preferredTypes),
    JSON.stringify(avoidedTypes),
    avgSessionMinutes,
    JSON.stringify(completionRates),
    personalitySummary,
  ]);
}

// ─── Internal: generate quests for a single game ───────────────────────────
async function generateForGame(game: string, count: number = 2, forceDifficulty?: string): Promise<any[]> {
  // Fetch player profile for personalization context
  const profileRes = await pool.query(`SELECT * FROM user_profile WHERE id=1`);
  const profile = profileRes.rows[0] ?? {
    preferred_difficulty: 'medium',
    preferred_types: [],
    avoided_types: [],
    avg_session_minutes: 60,
    personality_summary: null,
  };

  const preferredTypes = (Array.isArray(profile.preferred_types) ? profile.preferred_types : []).join(', ') || 'not yet established';
  const avoidedTypes = (Array.isArray(profile.avoided_types) ? profile.avoided_types : []).join(', ') || 'none';

  // Recent feedback examples (last 5 thumbs-up and thumbs-down)
  const [likedRes, dislikedRes] = await Promise.all([
    pool.query(`
      SELECT q.title, q.type, q.difficulty, f.comment
      FROM quest_feedback f JOIN quests q ON q.id = f.quest_id
      WHERE f.rating = 1 ORDER BY f.created_at DESC LIMIT 4
    `),
    pool.query(`
      SELECT q.title, q.type, q.difficulty, f.comment
      FROM quest_feedback f JOIN quests q ON q.id = f.quest_id
      WHERE f.rating = -1 ORDER BY f.created_at DESC LIMIT 4
    `),
  ]);

  const likedLines = likedRes.rows.map((r: any) =>
    `  👍 "${r.title}" [${r.type}, ${r.difficulty}]${r.comment ? ` — "${r.comment}"` : ''}`
  ).join('\n');
  const dislikedLines = dislikedRes.rows.map((r: any) =>
    `  👎 "${r.title}" [${r.type}, ${r.difficulty}]${r.comment ? ` — "${r.comment}"` : ''}`
  ).join('\n');

  const feedbackSection = (likedLines || dislikedLines)
    ? `PLAYER FEEDBACK:\n${likedLines || '  (none)'}\n${dislikedLines || '  (none)'}`
    : `PLAYER FEEDBACK:\n  (no feedback yet — treat as a new player)`;

  // Recent session data for this game
  const logResult = await pool.query(`
    SELECT timestamp, action, minutes, type
    FROM log_entries WHERE game = $1
    ORDER BY timestamp DESC LIMIT 10
  `, [game]);

  // Past quest history for this game
  const histResult = await pool.query(`
    SELECT title, type, difficulty, status FROM quests
    WHERE game = $1 ORDER BY created_at DESC LIMIT 5
  `, [game]);

  const sessionLines = logResult.rows
    .map((r: any) => `  ${r.timestamp} (${r.minutes}m): ${r.action} [${r.type}]`)
    .join('\n');

  const pastQuestLines = histResult.rows
    .map((r: any) => `  ${r.title} [${r.type}, ${r.difficulty}, ${r.status}]`)
    .join('\n');

  const systemPrompt = `You are a world-class AI quest designer who deeply understands this specific player. Use Chain-of-Thought reasoning to generate highly personalized, thoughtful quests.

PLAYER PROFILE:
- Preferred difficulty: ${profile.preferred_difficulty}
- Preferred quest types: ${preferredTypes}
- Quest types to avoid: ${avoidedTypes}
- Avg session length: ~${profile.avg_session_minutes} minutes
- Personality: ${profile.personality_summary || 'New player — no profile established yet. Be welcoming and varied.'}

${feedbackSection}

Quest types: "challenge" (overcome a hard obstacle), "exploration" (discover new things), "grind" (accumulate/farm), "skill" (master a mechanic).
Difficulties: "easy" (30 min), "medium" (1–2 hours), "hard" (multiple sessions), "legendary" (major milestone).
xp_reward: easy=50, medium=100, hard=200, legendary=500.
target: total progress units needed (e.g. 100 for percentage-based, 5 for "defeat 5 bosses").

Think step-by-step before generating:
1. What has this player been doing in ${game} lately?
2. What quest types match their preferences and should be avoided?
3. What difficulty fits their session length (${profile.avg_session_minutes}m avg) and recent performance?
4. What would genuinely excite THIS player right now — not a generic quest, but one tailored to their history?

Then generate exactly ${count} quest(s). Each must include a "reasoning" field.
${forceDifficulty ? `\nCRITICAL: You MUST generate ALL quests at "${forceDifficulty}" difficulty. Do not deviate from this regardless of player profile.\n` : ''}
Rules:
- Reference specific details from their session notes
- Avoid repeating past quests listed in history
- Lean toward preferred types; avoid avoided types unless there's a strong reason
- Be creative and inspiring — make the player feel understood

Respond ONLY with valid JSON (no markdown):
{
  "quests": [
    {
      "title": "<quest title>",
      "description": "<1-2 sentences: flavour text + what to do>",
      "type": "challenge|exploration|grind|skill",
      "difficulty": "easy|medium|hard|legendary",
      "xp_reward": <number>,
      "estimated_minutes": <number>,
      "target": <number>,
      "reasoning": "<2-3 sentences explaining exactly why this quest was chosen for this specific player>"
    }
  ]
}`;

  const userContent = `Game: ${game}\n\nRecent sessions:\n${sessionLines || '  (no sessions recorded)'}\n\nPast quests:\n${pastQuestLines || '  (none)'}`;

  async function callAI(extraInstruction?: string): Promise<string> {
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];
    if (extraInstruction) {
      messages.push({ role: 'user', content: extraInstruction });
    }
    const response = await openai.chat.completions.create({
      model: 'gpt-5.4',
      max_completion_tokens: 1500,
      messages,
    });
    return response.choices[0]?.message?.content?.trim() ?? '';
  }

  function parseQuests(raw: string): any[] {
    try {
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(jsonStr);
      return Array.isArray(parsed.quests) ? parsed.quests.slice(0, count) : [];
    } catch {
      return [];
    }
  }

  // First attempt
  let raw = await callAI();
  let quests = parseQuests(raw);

  // Auto-retry once on failure with stricter instruction
  if (!quests.length) {
    console.warn(`quests generate (${game}): first attempt failed to parse, retrying…`);
    raw = await callAI('IMPORTANT: Your previous response could not be parsed. Respond ONLY with raw JSON — no markdown fences, no explanation, just the JSON object starting with {');
    quests = parseQuests(raw);
  }

  if (!quests.length) {
    console.error(`quests generate (${game}): both attempts failed to parse AI JSON`);
    return [];
  }

  const inserted = [];
  for (const q of quests) {
    const r = await pool.query(
      `INSERT INTO quests (game, title, description, type, difficulty, xp_reward, estimated_minutes, target, status, ai_generated, reasoning)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'suggested', true, $9) RETURNING *`,
      [game, q.title, q.description, q.type, q.difficulty, q.xp_reward, q.estimated_minutes, q.target ?? 100, q.reasoning ?? null]
    );
    inserted.push(r.rows[0]);
  }
  return inserted;
}

// ─── POST /api/quests/generate ─────────────────────────────────────────────
// ─── GET /api/quests/recommendations ───────────────────────────────────────
router.get("/quests/recommendations", async (req, res) => {
  try {
    await ensureTables();
    const minutes = parseInt(req.query.minutes as string, 10) || 60;

    const [fittingRes, partialRes] = await Promise.all([
      pool.query(
        `SELECT * FROM quests WHERE status='active' AND estimated_minutes <= $1 ORDER BY estimated_minutes DESC LIMIT 5`,
        [minutes]
      ),
      pool.query(
        `SELECT * FROM quests WHERE status='active' AND estimated_minutes > $1 ORDER BY accepted_at DESC LIMIT 3`,
        [minutes]
      ),
    ]);

    res.json({ fitting: fittingRes.rows, partial: partialRes.rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch recommendations", detail: String(err) });
  }
});

// ─── POST /api/quests/generate ─────────────────────────────────────────────
router.post("/quests/generate", async (req, res) => {
  try {
    await ensureTables();
    const { game, count = 2, difficulty } = req.body as { game?: string; count?: number; difficulty?: string };

    if (game) {
      await generateForGame(game, count, difficulty);
      const result = await pool.query(
        `SELECT * FROM quests WHERE game=$1 AND status='suggested' ORDER BY created_at DESC`,
        [game]
      );
      res.json({ quests: result.rows, count: result.rows.length });
    } else {
      const gamesResult = await pool.query(`SELECT DISTINCT game FROM log_entries ORDER BY game`);
      const games = gamesResult.rows.map((r: any) => r.game);

      for (const g of games) {
        const existing = await pool.query(
          `SELECT id FROM quests WHERE game=$1 AND status='suggested'`,
          [g]
        );
        const oldIds: number[] = existing.rows.map((r: any) => r.id);
        if (oldIds.length < 1) {
          await generateForGame(g, 1, difficulty);
        } else {
          // Generate new quests first, then remove the old ones by ID so there's
          // never a moment where the user sees an empty list or gets a 404 on accept.
          await generateForGame(g, 2, difficulty);
          await pool.query(`DELETE FROM quests WHERE id = ANY($1)`, [oldIds]);
        }
      }

      const result = await pool.query(
        `SELECT * FROM quests WHERE status='suggested' ORDER BY created_at DESC`
      );
      res.json({ quests: result.rows, count: result.rows.length });
    }
  } catch (err) {
    console.error("quests generate error:", err);
    res.status(500).json({ error: "Quest generation failed", detail: String(err) });
  }
});

// ─── GET /api/quests/suggested ─────────────────────────────────────────────
router.get("/quests/suggested", async (_req, res) => {
  try {
    await ensureTables();

    const [gamesWithSuggestedRes, allGamesRes] = await Promise.all([
      pool.query(`SELECT DISTINCT game FROM quests WHERE status='suggested'`),
      pool.query(`SELECT DISTINCT game FROM log_entries ORDER BY game`),
    ]);
    const coveredGames = new Set(gamesWithSuggestedRes.rows.map((r: any) => r.game));
    const uncoveredGames = allGamesRes.rows
      .map((r: any) => r.game)
      .filter((g: string) => !coveredGames.has(g));

    if (uncoveredGames.length > 0) {
      await Promise.all(uncoveredGames.map((g: string) => generateForGame(g, 1)));
    }

    const countRes = await pool.query(`SELECT COUNT(*)::int AS cnt FROM quests WHERE status='suggested'`);
    if ((countRes.rows[0].cnt as number) < 3 && allGamesRes.rows.length > 0) {
      const coveredNow = new Set(
        (await pool.query(`SELECT DISTINCT game FROM quests WHERE status='suggested'`)).rows.map((r: any) => r.game)
      );
      const toBoost = allGamesRes.rows
        .map((r: any) => r.game)
        .filter((g: string) => coveredNow.has(g))
        .slice(0, 3 - (countRes.rows[0].cnt as number));
      if (toBoost.length > 0) {
        await Promise.all(toBoost.map((g: string) => generateForGame(g, 1)));
      }
    }

    const result = await pool.query(
      `SELECT * FROM quests WHERE status='suggested' ORDER BY estimated_minutes ASC`
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
      `SELECT * FROM quests WHERE status='active' ORDER BY accepted_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch active quests", detail: String(err) });
  }
});

// ─── GET /api/quests/logs ──────────────────────────────────────────────────
router.get("/quests/logs", async (_req, res) => {
  try {
    await ensureTables();
    const result = await pool.query(`SELECT * FROM quest_logs ORDER BY completed_at DESC`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch quest logs", detail: String(err) });
  }
});

// ─── GET /api/quests/profile ───────────────────────────────────────────────
router.get("/quests/profile", async (_req, res) => {
  try {
    await ensureTables();
    const r = await pool.query(`SELECT * FROM user_profile WHERE id=1`);
    if (!r.rows.length) { res.json(null); return; }
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch profile", detail: String(err) });
  }
});

// ─── POST /api/quests/profile/rebuild ─────────────────────────────────────
router.post("/quests/profile/rebuild", async (_req, res) => {
  try {
    await ensureTables();
    await buildUserProfile();
    const r = await pool.query(`SELECT * FROM user_profile WHERE id=1`);
    res.json(r.rows[0] ?? null);
  } catch (err) {
    console.error("profile rebuild error:", err);
    res.status(500).json({ error: "Failed to rebuild profile", detail: String(err) });
  }
});

// ─── POST /api/quests/:id/feedback ────────────────────────────────────────
router.post("/quests/:id/feedback", async (req, res) => {
  try {
    await ensureTables();
    const id = parseInt(req.params.id, 10);
    const { rating, comment } = req.body as { rating: number; comment?: string };

    if (rating !== 1 && rating !== -1) {
      res.status(400).json({ error: "rating must be 1 (thumbs up) or -1 (thumbs down)" }); return;
    }

    const questCheck = await pool.query(`SELECT id FROM quests WHERE id=$1`, [id]);
    if (!questCheck.rows.length) { res.status(404).json({ error: "Quest not found" }); return; }

    // Upsert: one feedback per quest
    await pool.query(`
      INSERT INTO quest_feedback (quest_id, rating, comment, created_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT DO NOTHING
    `, [id, rating, comment ?? null]);

    // Rebuild profile in background (non-blocking)
    buildUserProfile().catch(err => console.error("profile rebuild after feedback:", err));

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save feedback", detail: String(err) });
  }
});

// ─── POST /api/quests/:id/accept ───────────────────────────────────────────
router.post("/quests/:id/accept", async (req, res) => {
  try {
    await ensureTables();
    const id = parseInt(req.params.id, 10);
    const r = await pool.query(
      `UPDATE quests SET status='active', accepted_at=NOW() WHERE id=$1 AND status='suggested' RETURNING *`,
      [id]
    );
    if (!r.rows.length) { res.status(404).json({ error: "Quest not found or not suggested" }); return; }
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
    const questResult = await pool.query(`SELECT * FROM quests WHERE id=$1`, [id]);
    if (!questResult.rows.length) { res.status(404).json({ error: "Quest not found" }); return; }
    const quest = questResult.rows[0];
    if (quest.status !== 'suggested') { res.status(400).json({ error: "Quest is not suggested" }); return; }

    await pool.query(`UPDATE quests SET status='rejected' WHERE id=$1`, [id]);

    let replacement: any = null;
    try {
      const newQuests = await generateForGame(quest.game, 1);
      replacement = newQuests[0] ?? null;
    } catch (err) {
      console.error(`quests reject replacement (${quest.game}):`, err);
    }

    res.json({ rejected: true, game: quest.game, replacement });
  } catch (err) {
    res.status(500).json({ error: "Failed to reject quest", detail: String(err) });
  }
});

// ─── PATCH /api/quests/:id/progress ───────────────────────────────────────
router.patch("/quests/:id/progress", async (req, res) => {
  try {
    await ensureTables();
    const id = parseInt(req.params.id, 10);
    const { progress } = req.body as { progress: number };
    if (progress === undefined || progress === null) {
      res.status(400).json({ error: "progress is required" }); return;
    }
    const questRow = await pool.query(`SELECT target FROM quests WHERE id=$1 AND status='active'`, [id]);
    if (!questRow.rows.length) { res.status(404).json({ error: "Quest not found or not active" }); return; }
    const target = questRow.rows[0].target ?? 100;
    const clamped = Math.min(target, Math.max(0, Math.round(progress)));
    const r = await pool.query(
      `UPDATE quests SET progress=$1 WHERE id=$2 AND status='active' RETURNING *`,
      [clamped, id]
    );
    if (!r.rows.length) { res.status(404).json({ error: "Quest not found or not active" }); return; }
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update progress", detail: String(err) });
  }
});

// ─── Mini Log routes ────────────────────────────────────────────────────────
router.get("/quests/:id/mini-logs", async (req, res) => {
  try {
    await ensureTables();
    const id = parseInt(req.params.id, 10);
    const r = await pool.query(`SELECT * FROM quest_mini_logs WHERE quest_id=$1 ORDER BY created_at ASC`, [id]);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch mini logs", detail: String(err) });
  }
});

router.post("/quests/:id/mini-logs", async (req, res) => {
  try {
    await ensureTables();
    const id = parseInt(req.params.id, 10);
    const { note } = req.body as { note: string };
    if (!note?.trim()) { res.status(400).json({ error: "note is required" }); return; }
    const r = await pool.query(
      `INSERT INTO quest_mini_logs (quest_id, note) VALUES ($1, $2) RETURNING *`,
      [id, note.trim()]
    );
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to add mini log", detail: String(err) });
  }
});

router.delete("/quests/:id/mini-logs/:logId", async (req, res) => {
  try {
    await ensureTables();
    const logId = parseInt(req.params.logId, 10);
    await pool.query(`DELETE FROM quest_mini_logs WHERE id=$1`, [logId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete mini log", detail: String(err) });
  }
});

// ─── POST /api/quests/:id/complete ─────────────────────────────────────────
router.post("/quests/:id/complete", async (req, res) => {
  try {
    await ensureTables();
    const id = parseInt(req.params.id, 10);
    const { time_taken_minutes = 0 } = req.body as { time_taken_minutes?: number };

    const questResult = await pool.query(`SELECT * FROM quests WHERE id=$1 AND status='active'`, [id]);
    if (!questResult.rows.length) { res.status(404).json({ error: "Quest not found or not active" }); return; }
    const quest = questResult.rows[0];

    // Collect mini logs for rich completion record
    const miniLogsRes = await pool.query(
      `SELECT note, created_at FROM quest_mini_logs WHERE quest_id=$1 ORDER BY created_at ASC`,
      [id]
    );
    const miniLogs = miniLogsRes.rows;
    const description = miniLogs.length > 0
      ? `${quest.description}\n\nProgress notes:\n${miniLogs.map((l: any) => `• ${l.note}`).join('\n')}`
      : quest.description;

    const actionText = miniLogs.length > 0
      ? `[Quest] ${quest.title} — ${miniLogs.map((l: any) => l.note).join('; ')}`
      : `[Quest] ${quest.title}`;

    await pool.query(
      `UPDATE quests SET status='completed', completed_at=NOW(), progress=target WHERE id=$1`,
      [id]
    );

    const logResult = await pool.query(
      `INSERT INTO quest_logs (quest_id, game, title, xp_earned, time_taken_minutes, difficulty, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, quest.game, quest.title, quest.xp_reward, time_taken_minutes, quest.difficulty, description]
    );

    await pool.query(
      `INSERT INTO log_entries (timestamp, game, action, minutes, type)
       VALUES ($1, $2, $3, $4, $5)`,
      [new Date().toISOString(), quest.game, actionText, time_taken_minutes, quest.type]
    );

    // Rebuild profile in background after completion
    buildUserProfile().catch(err => console.error("profile rebuild after complete:", err));

    res.json({ quest: { ...quest, status: 'completed' }, log: logResult.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to complete quest", detail: String(err) });
  }
});

// ─── Internal: YouTube search ──────────────────────────────────────────────
const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false';
const INNERTUBE_CTX = { context: { client: { clientName: 'WEB', clientVersion: '2.20240101', hl: 'en', gl: 'US' } } };

interface VideoResult { id: string; title: string; thumbnail: string; duration: string; }

async function searchYouTubeVideo(query: string): Promise<VideoResult | null> {
  try {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 7000);
    let resp: Response;
    try {
      resp = await fetch(INNERTUBE_URL, {
        method: 'POST', signal: abort.signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'X-Youtube-Client-Name': '1', 'X-Youtube-Client-Version': '2.20240101',
        },
        body: JSON.stringify({ ...INNERTUBE_CTX, query }),
      });
    } finally { clearTimeout(timer); }

    if (!resp.ok) return null;
    const data = await resp.json() as Record<string, unknown>;

    function findFirst(obj: unknown): Record<string, unknown> | null {
      if (!obj || typeof obj !== 'object') return null;
      if (Array.isArray(obj)) { for (const item of obj) { const r = findFirst(item); if (r) return r; } return null; }
      const o = obj as Record<string, unknown>;
      if ('videoRenderer' in o) return o['videoRenderer'] as Record<string, unknown>;
      for (const v of Object.values(o)) { const r = findFirst(v); if (r) return r; }
      return null;
    }
    function getText(runs: unknown): string {
      if (!Array.isArray(runs)) return '';
      return (runs as { text?: string }[]).map(r => r.text ?? '').join('');
    }
    function findKey(obj: unknown, key: string): unknown {
      if (!obj || typeof obj !== 'object') return undefined;
      if (key in (obj as Record<string, unknown>)) return (obj as Record<string, unknown>)[key];
      for (const v of Object.values(obj as Record<string, unknown>)) { const r = findKey(v, key); if (r !== undefined) return r; }
      return undefined;
    }

    const v = findFirst(data);
    if (!v) return null;
    const videoId = v['videoId'] as string;
    if (!videoId) return null;
    const title = getText((findKey(v['title'], 'runs') ?? []) as { text?: string }[])
      || (findKey(v['title'], 'simpleText') as string) || query;
    const thumbs = (findKey(v['thumbnail'], 'thumbnails') ?? []) as { url: string }[];
    const thumbnail = thumbs.find(t => t.url.includes('mqdefault'))?.url
      || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    const duration = (findKey(v['lengthText'], 'simpleText') as string)
      || getText((findKey(v['lengthText'], 'runs') ?? []) as { text?: string }[]) || '';
    return { id: videoId, title, thumbnail, duration };
  } catch { return null; }
}

// ─── GET /api/quests/:id/guide ─────────────────────────────────────────────
router.get("/quests/:id/guide", async (req, res) => {
  try {
    await ensureTables();
    const id = parseInt(req.params.id, 10);

    const existing = await pool.query(
      `SELECT * FROM quest_guides WHERE quest_id=$1 ORDER BY generated_at DESC LIMIT 1`,
      [id]
    );
    if (existing.rows.length) { res.json(existing.rows[0]); return; }

    const questResult = await pool.query(`SELECT * FROM quests WHERE id=$1`, [id]);
    if (!questResult.rows.length) { res.status(404).json({ error: "Quest not found" }); return; }
    const quest = questResult.rows[0];

    const systemPrompt = `You are an expert gaming guide writer. Given a quest for a video game, write a clear step-by-step guide.

Rules:
- 4–6 numbered steps, each 1–2 sentences
- Include 2–3 practical tips
- Suggest 2–3 YouTube search queries to find relevant video guides (be specific to the game + quest)
- Be specific to the game's actual mechanics

Respond ONLY with valid JSON (no markdown):
{
  "steps": ["<step 1>", "<step 2>", ...],
  "video_queries": [
    { "title": "<descriptive title>", "query": "<youtube search query>" },
    { "title": "<descriptive title>", "query": "<youtube search query>" }
  ],
  "tips": "<2-3 practical tips as a short paragraph>"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 900,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Game: ${quest.game}\nQuest: ${quest.title}\nDescription: ${quest.description}\nType: ${quest.type} | Difficulty: ${quest.difficulty}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    let parsed: { steps: string[]; video_queries: Array<{ title: string; query: string }>; tips: string } = {
      steps: ["Review your recent progress.", "Focus on the main objective step by step.", "Use in-game hints if stuck."],
      video_queries: [
        { title: `${quest.game} ${quest.title} guide`, query: `${quest.game} ${quest.title} walkthrough` },
        { title: `${quest.game} tips and tricks`, query: `${quest.game} tips tricks guide` },
      ],
      tips: "Take your time and enjoy the journey.",
    };

    try {
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("quests guide: failed to parse AI JSON");
    }

    const videoResults = await Promise.all(
      (parsed.video_queries ?? []).map(async (vq) => {
        const result = await searchYouTubeVideo(vq.query);
        if (result) return result;
        return {
          id: '', title: vq.title,
          thumbnail: '',
          duration: '',
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(vq.query)}`,
        };
      })
    );

    const youtube_links = videoResults.filter(v => v.id || (v as any).url);

    const r = await pool.query(
      `INSERT INTO quest_guides (quest_id, steps, youtube_links, tips)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, JSON.stringify(parsed.steps), JSON.stringify(youtube_links), parsed.tips]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error("quests guide error:", err);
    res.status(500).json({ error: "Failed to generate guide", detail: String(err) });
  }
});

// ─── POST /api/quests/:id/guide/videos ─────────────────────────────────────
router.post("/quests/:id/guide/videos", async (req, res) => {
  try {
    await ensureTables();
    const id = parseInt(req.params.id, 10);
    const video = req.body as { id: string; title: string; thumbnail?: string; duration?: string };
    if (!video.id || !video.title) { res.status(400).json({ error: "id and title are required" }); return; }

    const guideRes = await pool.query(
      `SELECT * FROM quest_guides WHERE quest_id=$1 ORDER BY generated_at DESC LIMIT 1`, [id]
    );
    if (!guideRes.rows.length) { res.status(404).json({ error: "Guide not found — open the guide first to generate it" }); return; }

    const guide = guideRes.rows[0];
    const links: any[] = Array.isArray(guide.youtube_links) ? guide.youtube_links : [];
    const filtered = links.filter((l: any) => l.id !== video.id);
    filtered.push({ id: video.id, title: video.title, thumbnail: video.thumbnail || `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`, duration: video.duration || '' });

    const r = await pool.query(
      `UPDATE quest_guides SET youtube_links=$1 WHERE id=$2 RETURNING *`,
      [JSON.stringify(filtered), guide.id]
    );
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to add video", detail: String(err) });
  }
});

// ─── DELETE /api/quests/:id/guide/videos/:videoId ──────────────────────────
router.delete("/quests/:id/guide/videos/:videoId", async (req, res) => {
  try {
    await ensureTables();
    const id = parseInt(req.params.id, 10);
    const videoId = req.params.videoId;

    const guideRes = await pool.query(
      `SELECT * FROM quest_guides WHERE quest_id=$1 ORDER BY generated_at DESC LIMIT 1`, [id]
    );
    if (!guideRes.rows.length) { res.status(404).json({ error: "Guide not found" }); return; }

    const guide = guideRes.rows[0];
    const links = (Array.isArray(guide.youtube_links) ? guide.youtube_links : []).filter((l: any) => l.id !== videoId);
    const r = await pool.query(
      `UPDATE quest_guides SET youtube_links=$1 WHERE id=$2 RETURNING *`,
      [JSON.stringify(links), guide.id]
    );
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to remove video", detail: String(err) });
  }
});

export default router;
