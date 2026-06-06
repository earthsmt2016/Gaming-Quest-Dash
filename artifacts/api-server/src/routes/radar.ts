import { Router } from "express";
import { pool } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

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

  // Prefer exact or close match; fallback to first result
  const hit = data.results.find((r: any) =>
    r.name.toLowerCase() === name.toLowerCase()
  ) ?? data.results[0];

  // Fetch detail for description + release
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

  const res = await openai.chat.completions.create({
    model: 'gpt-4.1',
    max_completion_tokens: 180,
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
    const result = await pool.query('SELECT * FROM game_radar ORDER BY added_at DESC');
    res.json(result.rows);
  } catch (err) {
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

    // Fetch game info + AI match in parallel
    const [gameInfo, ] = await Promise.all([
      fetchRawgInfo(name).catch(() => null),
    ]);

    const match = await runMatchAnalysis({
      name: gameInfo?.name ?? name,
      genres: gameInfo?.genres ?? [],
      platforms: gameInfo?.platforms ?? [],
      description: gameInfo?.description ?? '',
      release_date: gameInfo?.release_date ?? null,
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
        gameInfo?.release_date ?? null,
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
