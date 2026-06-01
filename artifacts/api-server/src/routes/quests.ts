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
}

ensureTables().catch(err => console.error("quests ensureTables:", err));

// ─── Internal: generate quests for a single game ───────────────────────────
async function generateForGame(game: string, count: number = 2): Promise<any[]> {
  // Fetch recent session data for this game
  const logResult = await pool.query(`
    SELECT timestamp, action, minutes, type
    FROM log_entries WHERE game = $1
    ORDER BY timestamp DESC LIMIT 10
  `, [game]);

  // Fetch past quest history for context
  const histResult = await pool.query(`
    SELECT title, type, difficulty, status FROM quests
    WHERE game = $1 ORDER BY created_at DESC LIMIT 5
  `, [game]);

  const sessionLines = logResult.rows
    .map((r: any) => `  ${r.timestamp} (${r.minutes}m): ${r.action} [${r.type}]`)
    .join("\n");

  const pastQuestLines = histResult.rows
    .map((r: any) => `  ${r.title} [${r.type}, ${r.difficulty}, ${r.status}]`)
    .join("\n");

  const systemPrompt = `You are an AI quest designer for a gaming tracker. Given a player's session history for a specific game, generate exactly ${count} personalized quests.

Quest types: "challenge" (overcome a hard obstacle), "exploration" (discover new things), "grind" (accumulate/farm), "skill" (master a mechanic).
Difficulties: "easy" (30 min), "medium" (1–2 hours), "hard" (multiple sessions), "legendary" (major milestone).
xp_reward: easy=50, medium=100, hard=200, legendary=500.
estimated_minutes: realistic time to complete the quest.
target: total progress units needed (e.g. 100 for percentage-based, or a specific count like 5 for "defeat 5 bosses").

Rules:
- Reference specific details from session notes — titles and descriptions must be personal to THIS player's journey
- Avoid repeating past quests listed in history
- Be creative and inspiring

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
      "target": <number>
    }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 1200,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Game: ${game}\n\nRecent sessions:\n${sessionLines || "  (no sessions recorded)"}\n\nPast quests:\n${pastQuestLines || "  (none)"}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  let quests: Array<{
    title: string; description: string; type: string;
    difficulty: string; xp_reward: number; estimated_minutes: number; target: number;
  }> = [];

  try {
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(jsonStr);
    quests = Array.isArray(parsed.quests) ? parsed.quests.slice(0, count) : [];
  } catch {
    console.error(`quests generate (${game}): failed to parse AI JSON`);
    return [];
  }

  const inserted = [];
  for (const q of quests) {
    const r = await pool.query(
      `INSERT INTO quests (game, title, description, type, difficulty, xp_reward, estimated_minutes, target, status, ai_generated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'suggested', true) RETURNING *`,
      [game, q.title, q.description, q.type, q.difficulty, q.xp_reward, q.estimated_minutes, q.target ?? 100]
    );
    inserted.push(r.rows[0]);
  }
  return inserted;
}

// ─── POST /api/quests/generate ─────────────────────────────────────────────
router.post("/quests/generate", async (req, res) => {
  try {
    await ensureTables();
    const { game, count = 2 } = req.body as { game?: string; count?: number };

    if (game) {
      // Generate for a specific game
      await generateForGame(game, count);
      const result = await pool.query(
        `SELECT * FROM quests WHERE game=$1 AND status='suggested' ORDER BY created_at DESC`,
        [game]
      );
      res.json({ quests: result.rows, count: result.rows.length });
    } else {
      // Generate for all known games
      const gamesResult = await pool.query(`
        SELECT DISTINCT game FROM log_entries
        ORDER BY game
      `);
      const games = gamesResult.rows.map((r: any) => r.game);

      for (const g of games) {
        const existing = await pool.query(
          `SELECT COUNT(*)::int AS cnt FROM quests WHERE game=$1 AND status='suggested'`,
          [g]
        );
        const existingCount = existing.rows[0].cnt;
        if (existingCount < 1) {
          await generateForGame(g, 1);
        } else {
          // Delete old suggested and regenerate
          await pool.query(`DELETE FROM quests WHERE game=$1 AND status='suggested'`, [g]);
          await generateForGame(g, 2);
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

    // Enforce ≥1 per known game invariant: ALL distinct games, no cap
    const [gamesWithSuggestedRes, allGamesRes] = await Promise.all([
      pool.query(`SELECT DISTINCT game FROM quests WHERE status='suggested'`),
      pool.query(`SELECT DISTINCT game FROM log_entries ORDER BY game`),
    ]);
    const coveredGames = new Set(gamesWithSuggestedRes.rows.map((r: any) => r.game));
    const uncoveredGames = allGamesRes.rows
      .map((r: any) => r.game)
      .filter((g: string) => !coveredGames.has(g));

    // Await generation for ALL uncovered games before responding
    if (uncoveredGames.length > 0) {
      await Promise.all(uncoveredGames.map((g: string) => generateForGame(g, 1)));
    }

    // Ensure total ≥ 3: top up from known games if needed
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
    const result = await pool.query(
      `SELECT * FROM quest_logs ORDER BY completed_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch quest logs", detail: String(err) });
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

    // Synchronously generate a replacement quest for the same game
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
    // Clamp against the quest's own target (not hardcoded 100)
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

// ─── POST /api/quests/:id/complete ─────────────────────────────────────────
router.post("/quests/:id/complete", async (req, res) => {
  try {
    await ensureTables();
    const id = parseInt(req.params.id, 10);
    const { time_taken_minutes = 0 } = req.body as { time_taken_minutes?: number };

    const questResult = await pool.query(`SELECT * FROM quests WHERE id=$1 AND status='active'`, [id]);
    if (!questResult.rows.length) { res.status(404).json({ error: "Quest not found or not active" }); return; }
    const quest = questResult.rows[0];

    // Mark quest complete
    await pool.query(
      `UPDATE quests SET status='completed', completed_at=NOW(), progress=target WHERE id=$1`,
      [id]
    );

    // Write quest log entry
    const logResult = await pool.query(
      `INSERT INTO quest_logs (quest_id, game, title, xp_earned, time_taken_minutes, difficulty)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, quest.game, quest.title, quest.xp_reward, time_taken_minutes, quest.difficulty]
    );

    // Feed existing reporting system: insert a normalized log_entries row
    await pool.query(
      `INSERT INTO log_entries (timestamp, game, action, minutes, type)
       VALUES ($1, $2, $3, $4, $5)`,
      [new Date().toISOString(), quest.game, `[Quest] ${quest.title}`, time_taken_minutes, quest.type]
    );

    res.json({ quest: { ...quest, status: 'completed' }, log: logResult.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to complete quest", detail: String(err) });
  }
});

// ─── Internal: search YouTube InnerTube for a single video ─────────────────
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

    // Extract first videoRenderer
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

    // Return existing guide if available
    const existing = await pool.query(
      `SELECT * FROM quest_guides WHERE quest_id=$1 ORDER BY generated_at DESC LIMIT 1`,
      [id]
    );
    if (existing.rows.length) { res.json(existing.rows[0]); return; }

    // Fetch quest details
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

    // Resolve each search query to a real YouTube video via InnerTube (best-effort)
    const videoResults = await Promise.all(
      (parsed.video_queries ?? []).map(async (vq) => {
        const result = await searchYouTubeVideo(vq.query);
        if (result) return result;
        // Fallback: return search URL entry
        return {
          id: '', title: vq.title,
          thumbnail: '',
          duration: '',
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(vq.query)}`,
        };
      })
    );

    // Filter out any blanks, keep valid video entries
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
