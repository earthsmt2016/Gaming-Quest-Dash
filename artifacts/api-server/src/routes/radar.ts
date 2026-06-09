import { Router } from "express";
import { pool } from "@workspace/db";
import { aiForRoute, loggedOpenai } from "../lib/aiLogger";
import { getConfig } from "./aiCost";

const router = Router();
const RAWG = 'https://api.rawg.io/api';

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_radar (
      id           SERIAL PRIMARY KEY,
      name         TEXT NOT NULL,
      slug         TEXT,
      description  TEXT,
      release_date TEXT,
      cover_url    TEXT,
      genres       TEXT[] DEFAULT '{}',
      platforms    TEXT[] DEFAULT '{}',
      metacritic   INTEGER,
      ai_match_score  TEXT,
      ai_match_reason TEXT,
      added_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

async function fetchRawgInfo(name: string) {
  const searchRes = await fetch(`${RAWG}/games?search=${encodeURIComponent(name)}&page_size=5`);
  if (!searchRes.ok) return null;
  const data = await searchRes.json();
  if (!data.results?.length) return null;

  const hit = data.results.find((r: any) =>
    r.name.toLowerCase() === name.toLowerCase()
  ) ?? data.results[0];

  let description = '';
  let release_date = hit.released ?? null;
  try {
    const detailRes = await fetch(`${RAWG}/games/${hit.slug}`);
    if (detailRes.ok) {
      const detail = await detailRes.json();
      description = stripHtml(detail.description_raw || detail.description || '').slice(0, 600);
      release_date = detail.released ?? release_date;
    }
  } catch { /* non-fatal */ }

  return {
    name:         hit.name,
    slug:         hit.slug,
    description,
    release_date,
    cover_url:    hit.background_image ?? null,
    genres:       (hit.genres ?? []).map((g: any) => g.name),
    platforms:    (hit.platforms ?? []).map((p: any) => p.platform.name),
    metacritic:   hit.metacritic ?? null,
  };
}

// Use web search to find the real release date for a game
async function searchForReleaseDate(name: string): Promise<string | null> {
  try {
    const response = await (loggedOpenai as any).responses.create({
      model: 'gpt-4.1',
      tools: [{ type: 'web_search_preview' }],
      input: `Search for the official release date of the video game "${name}". Check store pages (Steam, PlayStation, Nintendo), official websites, and recent news articles. Return ONLY a JSON object with no markdown: {"release_date": "YYYY-MM-DD or null", "confidence": "confirmed|announced|tba"}. Use null if truly unknown.`,
    });
    const text: string = response.output_text ?? '';
    const m = text.match(/\{[\s\S]*?\}/);
    if (m) {
      const d = JSON.parse(m[0]);
      if (d.release_date && d.confidence !== 'tba') return d.release_date;
    }
  } catch (e) { console.error('searchForReleaseDate error:', e); }
  return null;
}

async function runMatchAnalysis(gameInfo: {
  name: string; genres: string[]; platforms: string[];
  description: string; release_date: string | null; metacritic: number | null;
}) {
  const [profileRes, logsRes, platformRes, pausedRes] = await Promise.all([
    pool.query(`SELECT * FROM user_profile WHERE id=1`),
    pool.query(`
      SELECT game, SUM(minutes)::int as total, COUNT(*)::int as sessions
      FROM log_entries GROUP BY game ORDER BY total DESC LIMIT 25
    `),
    pool.query(`SELECT game, platform FROM game_platforms`).catch(() => ({ rows: [] })),
    pool.query(`SELECT game FROM game_pauses`).catch(() => ({ rows: [] })),
  ]);

  const p = profileRes.rows[0] ?? {};
  const topGames = logsRes.rows
    .map((r: any) => `${r.game} (${Math.round(r.total / 60 * 10) / 10}h, ${r.sessions} sessions)`)
    .join('\n');
  const ownedPlatforms = [...new Set((platformRes as any).rows.map((r: any) => r.platform as string))];

  const prompt = `You are a gaming taste analyst. Given a player's history, assess how well a new game would suit them.

GAME:
- Name: ${gameInfo.name}
- Genres: ${gameInfo.genres.join(', ') || 'Unknown'}
- Platforms: ${gameInfo.platforms.join(', ') || 'Unknown'}
- Release: ${gameInfo.release_date ?? 'TBA'}
- Metacritic: ${gameInfo.metacritic ?? 'N/A'}
- Description: ${gameInfo.description || '(none)'}

PLAYER:
- Difficulty preference: ${p.preferred_difficulty ?? 'unknown'}
- Avg session: ~${p.avg_session_minutes ?? 60} min
- Playstyle: ${p.personality_summary ?? 'not established'}
- Coaching notes: ${(p as any).coaching_summary ?? 'n/a'}
- Platforms they own: ${ownedPlatforms.join(', ') || 'unknown'}
- Top played games (most hours first):
${topGames || '(no data yet)'}

Respond ONLY with valid JSON (no markdown):
{
  "score": "strong" | "good" | "maybe" | "unlikely",
  "reason": "<2-3 punchy sentences. Cite specific games from their history, genres they favour, and their platform. Be direct.>"
}

Score key:
- strong: genre + platform + style all match — clear buy/wishlist
- good: solid match with 1-2 minor misalignments
- maybe: hit-and-miss — some appeal but notable gaps
- unlikely: doesn't fit their history or available platforms`;

  const { model, max_tokens } = await getConfig('radar');

  const res = await aiForRoute('radar').chat.completions.create({
    model,
    max_completion_tokens: max_tokens,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = res.choices[0]?.message?.content?.trim() ?? '';
  try { return JSON.parse(raw); } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) try { return JSON.parse(m[0]); } catch { /* */ }
  }
  return { score: 'maybe', reason: 'Could not analyse — try refreshing.' };
}

// ─── GET /api/radar ────────────────────────────────────────────────────────
router.get('/radar', async (_req, res) => {
  try {
    await ensureTable();
    const result = await pool.query(`
      SELECT * FROM game_radar
      ORDER BY
        CASE WHEN release_date IS NULL THEN 1 ELSE 0 END,
        release_date ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── In-memory cache for discover results (30 min TTL) ────────────────────
let discoverCache: { games: any[]; fetchedAt: number } | null = null;
const DISCOVER_TTL_MS = 30 * 60 * 1000;

// ─── GET /api/radar/discover — AI web search for upcoming games ────────────
router.get('/radar/discover', async (req, res) => {
  const force = req.query.force === '1';
  try {
    await ensureTable();

    // Return cache if fresh and not forced
    if (!force && discoverCache && Date.now() - discoverCache.fetchedAt < DISCOVER_TTL_MS) {
      const existing = await pool.query('SELECT LOWER(name) as lname FROM game_radar');
      const existingNames = new Set(existing.rows.map((r: any) => r.lname as string));
      return res.json(discoverCache.games.filter((g: any) =>
        !existingNames.has((g.name as string).toLowerCase())
      ));
    }

    const existing = await pool.query('SELECT LOWER(name) as lname FROM game_radar');
    const existingNames = new Set(existing.rows.map((r: any) => r.lname as string));

    const today = new Date().toISOString().slice(0, 10);
    let response: any;
    try {
      response = await (loggedOpenai as any).responses.create({
        model: 'gpt-4.1',
        tools: [{ type: 'web_search_preview' }],
        input: `Today is ${today}. Search multiple gaming news sites (IGN, Eurogamer, GameSpot, VGC, Nintendo Life, PlayStation Blog, Xbox Wire, Steam store) right now for upcoming video games that have NOT yet released — release dates must be on or after ${today}. Find at least 15 games including: major AAA titles (GTA VI, etc.), mid-size games, and notable indie games (like Rayman Legends Retold, Hollow Knight: Silksong, etc.). Include confirmed release dates AND announced-window games (e.g. "Q3 2026"). For each, find the most accurate release date from official sources. Return ONLY a valid JSON array with no markdown: [{"name": "exact official game title", "release_date": "YYYY-MM-DD or null if only window announced", "platforms": ["PS5","Xbox Series X|S","PC","Switch","iOS","Android"], "description": "one sentence — genre and hook"}]. Only include games not yet released as of ${today}.`,
      });
    } catch (aiErr: any) {
      if (aiErr?.status === 429) {
        // If we have a stale cache, return it rather than nothing
        if (discoverCache) {
          return res.json(discoverCache.games.filter((g: any) =>
            !existingNames.has((g.name as string).toLowerCase())
          ));
        }
        return res.status(429).json({ error: 'rate_limited', message: 'Web search is rate-limited right now — please try again in a minute.' });
      }
      throw aiErr;
    }

    const text: string = response.output_text ?? '';
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) { res.json([]); return; }

    const games: any[] = JSON.parse(m[0]);
    discoverCache = { games, fetchedAt: Date.now() };

    const filtered = games.filter(g =>
      g.name && !existingNames.has((g.name as string).toLowerCase())
    );
    res.json(filtered);
  } catch (err) {
    console.error('discover error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/radar — add a game ─────────────────────────────────────────
router.post('/radar', async (req, res) => {
  const name = (req.body?.name ?? '').trim();
  if (!name) { res.status(400).json({ error: 'name required' }); return; }

  try {
    await ensureTable();

    const dup = await pool.query(`SELECT id FROM game_radar WHERE LOWER(name)=LOWER($1)`, [name]);
    if (dup.rows.length) {
      res.status(409).json({ error: 'Already on radar', id: dup.rows[0].id });
      return;
    }

    const gameInfo = await fetchRawgInfo(name).catch(() => null);

    // If RAWG has no release date, use web search to find it
    let release_date = gameInfo?.release_date ?? null;
    if (!release_date) {
      release_date = await searchForReleaseDate(gameInfo?.name ?? name).catch(() => null);
    }

    const match = await runMatchAnalysis({
      name: gameInfo?.name ?? name,
      genres: gameInfo?.genres ?? [],
      platforms: gameInfo?.platforms ?? [],
      description: gameInfo?.description ?? '',
      release_date,
      metacritic: gameInfo?.metacritic ?? null,
    }).catch(() => ({ score: 'maybe', reason: 'Analysis unavailable.' }));

    const saved = await pool.query(
      `INSERT INTO game_radar
         (name, slug, description, release_date, cover_url, genres, platforms, metacritic, ai_match_score, ai_match_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        gameInfo?.name ?? name,
        gameInfo?.slug ?? null,
        gameInfo?.description ?? null,
        release_date,
        gameInfo?.cover_url ?? null,
        gameInfo?.genres ?? [],
        gameInfo?.platforms ?? [],
        gameInfo?.metacritic ?? null,
        match.score,
        match.reason,
      ]
    );
    res.json(saved.rows[0]);
  } catch (err) {
    console.error('radar add error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── PATCH /api/radar/:id — update release date manually ──────────────────
router.patch('/radar/:id', async (req, res) => {
  try {
    const { release_date } = req.body;
    const { rows } = await pool.query(
      `UPDATE game_radar SET release_date=$1 WHERE id=$2 RETURNING *`,
      [release_date ?? null, req.params.id]
    );
    if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── DELETE /api/radar/:id ─────────────────────────────────────────────────
router.delete('/radar/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM game_radar WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/radar/:id/refresh — re-run AI analysis ────────────────────
router.post('/radar/:id/refresh', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM game_radar WHERE id=$1', [req.params.id]);
    if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
    const g = rows[0];

    const match = await runMatchAnalysis({
      name: g.name, genres: g.genres ?? [], platforms: g.platforms ?? [],
      description: g.description ?? '', release_date: g.release_date,
      metacritic: g.metacritic,
    }).catch(() => ({ score: 'maybe', reason: 'Analysis unavailable.' }));

    const updated = await pool.query(
      `UPDATE game_radar SET ai_match_score=$1, ai_match_reason=$2 WHERE id=$3 RETURNING *`,
      [match.score, match.reason, req.params.id]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
