import { Router } from "express";
import { pool } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

async function ensureCoachTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_recommendations (
      id                SERIAL PRIMARY KEY,
      game              TEXT NOT NULL,
      headline          TEXT NOT NULL,
      suggested_minutes INTEGER NOT NULL DEFAULT 60,
      reasoning         JSONB NOT NULL DEFAULT '[]',
      alternative_game  TEXT,
      alternative_why   TEXT,
      confidence_score  FLOAT NOT NULL DEFAULT 0.5,
      fulfilled         BOOLEAN NOT NULL DEFAULT false,
      fulfilled_at      TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE ai_recommendations ADD COLUMN IF NOT EXISTS alternative_minutes INTEGER`);
  await pool.query(`ALTER TABLE ai_recommendations ADD COLUMN IF NOT EXISTS alternative_quest TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_insights (
      id         SERIAL PRIMARY KEY,
      type       TEXT NOT NULL,
      content    TEXT NOT NULL,
      game       TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

ensureCoachTables().catch(err => console.error("coachCard ensureTables:", err));

// ─── GET /api/backlog-health ────────────────────────────────────────────────
router.get("/backlog-health", async (_req, res) => {
  try {
    await ensureCoachTables();

    const [allGames, weekSessions, completions, paused, platforms] = await Promise.all([
      pool.query(`SELECT game, MAX(timestamp::timestamptz) as last_played FROM log_entries GROUP BY game`),
      pool.query(`SELECT game, COUNT(*)::int as sessions_this_week FROM log_entries WHERE timestamp::timestamptz > NOW() - INTERVAL '7 days' GROUP BY game`),
      pool.query(`SELECT game FROM game_completions`).catch(() => ({ rows: [] })),
      pool.query(`SELECT game FROM game_pauses`).catch(() => ({ rows: [] })),
      pool.query(`SELECT game, platform FROM game_platforms`).catch(() => ({ rows: [] })),
    ]);

    const completedSet  = new Set(completions.rows.map((r: any) => r.game));
    const pausedSet     = new Set(paused.rows.map((r: any) => r.game));
    const platformMap   = new Map<string, string>(platforms.rows.map((r: any) => [r.game, r.platform]));
    const weekMap       = new Map<string, number>(weekSessions.rows.map((r: any) => [r.game, r.sessions_this_week]));

    const isMobile = (game: string) => MOBILE_PLATFORMS.has(platformMap.get(game) ?? '');

    const now = Date.now();
    const active = allGames.rows.filter((r: any) => !completedSet.has(r.game) && !pausedSet.has(r.game))
      .map((r: any) => ({
        game: r.game,
        last_played: new Date(r.last_played),
        days_idle: Math.floor((now - new Date(r.last_played).getTime()) / 86400000),
        sessions_this_week: weekMap.get(r.game) ?? 0,
        platform: platformMap.get(r.game) ?? null,
        mobile: isMobile(r.game),
      }));

    // Mobile: neglect threshold 28 days (not 14); excluded from rotation count; counts as 0.5 in backlog
    const CONSOLE_NEGLECT_DAYS = 14;
    const MOBILE_NEGLECT_DAYS  = 28;

    const neglected = active.filter(r =>
      r.days_idle > (r.mobile ? MOBILE_NEGLECT_DAYS : CONSOLE_NEGLECT_DAYS)
    ).sort((a, b) => b.days_idle - a.days_idle); // most idle first

    // Rotation: console-only games played this week
    const rotatingConsole = active.filter(r => !r.mobile && r.sessions_this_week > 0)
      .sort((a, b) => b.sessions_this_week - a.sessions_this_week);
    const rotatingCount = rotatingConsole.length;

    // Backlog: mobile counts as 0.5
    const backlogWeight = active.reduce((sum, r) => sum + (r.mobile ? 0.5 : 1), 0);
    const BACKLOG_LIMIT = 6;

    const neglectPenalty  = Math.min(35, neglected.length * 5);
    const rotationPenalty = Math.min(15, Math.max(0, rotatingCount - 3) * 5);
    const backlogPenalty  = Math.min(30, Math.max(0, Math.floor(backlogWeight) - BACKLOG_LIMIT) * 4);

    let score = 100 - neglectPenalty - rotationPenalty - backlogPenalty;
    score = Math.max(0, Math.min(100, Math.round(score)));

    const label = score >= 80 ? 'Healthy' : score >= 60 ? 'Fair' : score >= 40 ? 'At Risk' : 'Critical';

    // Build penalty breakdown with actionable tips
    const penalties: { label: string; deduction: number; tip: string }[] = [];
    if (neglectPenalty > 0) {
      const consoleNeglected = neglected.filter(r => !r.mobile).length;
      const mobileNeglected  = neglected.filter(r => r.mobile).length;
      const parts = [
        consoleNeglected > 0 ? `${consoleNeglected} console (14+ days)` : null,
        mobileNeglected  > 0 ? `${mobileNeglected} mobile (28+ days)` : null,
      ].filter(Boolean).join(', ');
      const toRecover = Math.min(neglected.length, 4);
      penalties.push({
        label: `${neglected.length} game${neglected.length > 1 ? 's' : ''} idle — ${parts}`,
        deduction: neglectPenalty,
        tip: `Put ${toRecover}+ on hold → recover up to +${toRecover * 5} pts`,
      });
    }
    if (rotationPenalty > 0) {
      penalties.push({
        label: `Playing ${rotatingCount} console games this week (ideal: ≤3)`,
        deduction: rotationPenalty,
        tip: `Focus on 3 games this week → +${rotationPenalty} pts`,
      });
    }
    if (backlogPenalty > 0) {
      const extra = Math.floor(backlogWeight) - BACKLOG_LIMIT;
      penalties.push({
        label: `${active.length} active games — ${Math.floor(backlogWeight)} weighted (ideal: ≤${BACKLOG_LIMIT})`,
        deduction: backlogPenalty,
        tip: `Put ${extra} game${extra > 1 ? 's' : ''} on hold → +${backlogPenalty} pts`,
      });
    }

    // Neglected: already sorted most-idle first
    // Rotating: sorted by fewest sessions first (easiest to drop)
    const rotatingGamesSorted = [...rotatingConsole].sort((a, b) => a.sessions_this_week - b.sessions_this_week);

    // Active game list (non-neglected), oldest-played first — most natural to bench
    const neglectedSet = new Set(neglected.map(r => r.game));
    const activeGameList = active
      .filter(r => !neglectedSet.has(r.game))
      .sort((a, b) => a.last_played.getTime() - b.last_played.getTime());

    type GameEntry = { game: string; days_idle?: number; sessions_this_week?: number; platform: string | null; mobile: boolean };

    res.json({
      health_score: score,
      label,
      active_games: active.length,
      paused_games: pausedSet.size,
      completed_games: completedSet.size,
      neglected_count: neglected.length,
      neglected_games: neglected as GameEntry[],
      rotating_this_week: rotatingCount,
      rotating_games: rotatingGamesSorted as GameEntry[],
      active_game_list: activeGameList as GameEntry[],
      risks: [],
      penalties,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to compute backlog health", detail: String(err) });
  }
});

const MOBILE_PLATFORMS = new Set(['mobile_paid', 'apple_arcade']);
const XBOX_PLATFORMS   = new Set(['xbox_paid', 'xbox_gamepass']);

const PLATFORM_LABELS: Record<string, string> = {
  mobile_paid:   'Mobile (Paid)',
  apple_arcade:  'Apple Arcade',
  xbox_paid:     'Xbox (Paid)',
  xbox_gamepass: 'Xbox Game Pass',
  playstation:   'PlayStation',
  switch:        'Switch',
  pc:            'PC / Steam',
};

// ─── POST /api/ai/coach-card ────────────────────────────────────────────────
router.post("/ai/coach-card", async (req, res) => {
  try {
    await ensureCoachTables();
    const platform_mode: string | null = req.body?.platform_mode ?? null; // 'mobile' | 'xbox' | null

    const [profile, recentLogs, quests, gameHistory, completions, progressData, knowledgeData, platformData] = await Promise.all([
      pool.query(`SELECT * FROM user_profile WHERE id=1`),
      pool.query(`SELECT game, action, minutes, timestamp FROM log_entries ORDER BY timestamp::timestamptz DESC LIMIT 40`),
      pool.query(`SELECT game, title, status, difficulty, estimated_minutes FROM quests WHERE status IN ('active','suggested') ORDER BY status DESC`),
      pool.query(`
        SELECT game, MAX(timestamp::timestamptz) as last_played,
               COUNT(*)::int as sessions, SUM(minutes)::int as total_minutes
        FROM log_entries WHERE timestamp::timestamptz > NOW() - INTERVAL '90 days'
        GROUP BY game ORDER BY last_played DESC
      `),
      pool.query(`SELECT game FROM game_completions`).catch(() => ({ rows: [] })),
      pool.query(`SELECT game, current_percentage, status, estimated_hours_remaining FROM game_progress ORDER BY current_percentage DESC`).catch(() => ({ rows: [] })),
      pool.query(`SELECT game, story_percentage, full_percentage, estimated_story_hours, estimated_full_hours FROM game_knowledge`).catch(() => ({ rows: [] })),
      pool.query(`SELECT game, platform FROM game_platforms`).catch(() => ({ rows: [] })),
    ]);

    const p = profile.rows[0] ?? {};
    const completedSet = new Set(completions.rows.map((r: any) => r.game));
    const now = Date.now();

    // Build platform map & determine which platform set applies to the requested mode
    const platformMap = new Map<string, string>(platformData.rows.map((r: any) => [r.game, r.platform]));
    const modeSet = platform_mode === 'mobile' ? MOBILE_PLATFORMS : platform_mode === 'xbox' ? XBOX_PLATFORMS : null;

    const gameLines = gameHistory.rows
      .filter((g: any) => !completedSet.has(g.game))
      .filter((g: any) => {
        if (!modeSet) return true; // no filter
        const plat = platformMap.get(g.game);
        return plat ? modeSet.has(plat) : false; // exclude games with no matching platform
      })
      .map((g: any) => {
        const daysSince = Math.round((now - new Date(g.last_played).getTime()) / 86400000);
        const hasActive    = quests.rows.some((q: any) => q.game === g.game && q.status === 'active');
        const hasSuggested = quests.rows.some((q: any) => q.game === g.game && q.status === 'suggested');
        const plat = platformMap.get(g.game);
        const platTag = plat ? `📍 ${PLATFORM_LABELS[plat] ?? plat}` : null;
        const questTag = hasActive ? '🗡 active quest' : hasSuggested ? '💡 suggested quest' : null;
        const tags = [platTag, questTag].filter(Boolean).join(', ');
        return `${g.game}: ${g.sessions} sessions, last played ${daysSince}d ago, ${Math.round(g.total_minutes / 60 * 10) / 10}h total${tags ? ` (${tags})` : ''}`;
      }).join('\n');

    const questLines = quests.rows
      .map((q: any) => `[${q.status.toUpperCase()}] ${q.game}: "${q.title}" — ${q.difficulty}, ${q.estimated_minutes}m`)
      .join('\n');

    const recentActivity = recentLogs.rows.slice(0, 12)
      .map((l: any) => `${new Date(l.timestamp).toLocaleDateString()} — ${l.game}: ${l.action} (${l.minutes}m)`)
      .join('\n');

    const progressLines = progressData.rows.length > 0
      ? progressData.rows
          .filter((g: any) => !completedSet.has(g.game))
          .map((g: any) => {
            const hrs = g.estimated_hours_remaining ? `, ~${g.estimated_hours_remaining}h remaining` : '';
            return `${g.game}: ${g.current_percentage}% complete (${g.status}${hrs})`;
          }).join('\n')
      : '(no progress data set yet)';

    const knowledgeMap = new Map(knowledgeData.rows.map((r: any) => [r.game, r]));
    const knowledgeLines = knowledgeData.rows.length > 0
      ? knowledgeData.rows
          .filter((g: any) => !completedSet.has(g.game))
          .map((g: any) => {
            const storyHrs = g.estimated_story_hours ? `~${g.estimated_story_hours}h story` : '';
            const fullHrs  = g.estimated_full_hours  ? `~${g.estimated_full_hours}h full`  : '';
            const timeEst  = [storyHrs, fullHrs].filter(Boolean).join(', ');
            return `${g.game}: story ${g.story_percentage}%, full completion ${g.full_percentage}%${timeEst ? ` (${timeEst})` : ''}`;
          }).join('\n')
      : '(no AI knowledge maps generated yet)';

    // Compute backlog health for the prompt
    const [bAllGames, bRecentGames, bCompletions, bPaused] = await Promise.all([
      pool.query(`SELECT game, MAX(timestamp::timestamptz) as last_played FROM log_entries GROUP BY game`),
      pool.query(`SELECT DISTINCT game FROM log_entries WHERE timestamp::timestamptz > NOW() - INTERVAL '7 days'`),
      pool.query(`SELECT game FROM game_completions`).catch(() => ({ rows: [] })),
      pool.query(`SELECT game FROM game_pauses`).catch(() => ({ rows: [] })),
    ]);
    const bCompletedSet = new Set(bCompletions.rows.map((r: any) => r.game));
    const bPausedSet    = new Set(bPaused.rows.map((r: any) => r.game));
    const bActiveWeek   = new Set(bRecentGames.rows.map((r: any) => r.game));
    const bActive       = bAllGames.rows.filter((r: any) => !bCompletedSet.has(r.game) && !bPausedSet.has(r.game));
    const bNow = Date.now();
    const bNeglected    = bActive.filter((r: any) => (bNow - new Date(r.last_played).getTime()) > 14 * 86400000);
    const bRotating     = bActive.filter((r: any) => bActiveWeek.has(r.game)).length;
    const bScore        = Math.max(0, 100 - bNeglected.length * 10 - Math.max(0, bRotating - 3) * 8 - Math.max(0, bActive.length - 5) * 5);
    const bLabel        = bScore >= 80 ? 'Healthy' : bScore >= 60 ? 'Fair' : bScore >= 40 ? 'At Risk' : 'Critical';
    const bHealthLines  = [
      bNeglected.length > 0 ? `- ${bNeglected.length} neglected games (14+ days idle): -${bNeglected.length * 10} pts — names: ${bNeglected.slice(0, 5).map((r: any) => r.game).join(', ')}` : null,
      bRotating > 3 ? `- Playing ${bRotating} games this week (ideal ≤3): -${Math.max(0, bRotating - 3) * 8} pts` : null,
      bActive.length > 5 ? `- ${bActive.length} active games (ideal ≤5): -${Math.max(0, bActive.length - 5) * 5} pts` : null,
    ].filter(Boolean).join('\n');

    const avgMin = p.avg_session_minutes ?? 60;
    const mobileSessionRange = `15–45 min`;
    const consoleSessionRange = `${Math.max(45, Math.round(avgMin * 0.75))}–${Math.max(90, Math.round(avgMin * 1.5))} min`;

    const platformConstraint = platform_mode === 'mobile'
      ? `\n⚠️ PLATFORM FILTER — MOBILE: Recommend only games tagged with a mobile platform above. The alternative must also be a mobile game.\n⏱️ SESSION LENGTH — MOBILE: Mobile games are played in short bursts. suggested_minutes MUST be between 15 and 45. alternative_minutes MUST also be between 15 and 45. Do NOT suggest 60+ minute mobile sessions.`
      : platform_mode === 'xbox'
      ? `\n⚠️ PLATFORM FILTER — XBOX: Recommend only games tagged with an Xbox platform above. The alternative must also be an Xbox game.\n⏱️ SESSION LENGTH — XBOX: Console sessions suit longer play. suggested_minutes should be in the range ${consoleSessionRange} based on the player's avg session of ~${avgMin} min. alternative_minutes should be at least 45.`
      : '';

    const systemPrompt = `You are a personal gaming strategist coach. Give ONE sharp, data-backed recommendation for what the player should play tonight.

PLAYER PROFILE:
- Preferred difficulty: ${p.preferred_difficulty ?? 'medium'}
- Avg session: ~${p.avg_session_minutes ?? 60} min
- Playstyle: ${p.personality_summary ?? 'Not yet established — limited data available'}
- Coaching notes: ${(p as any).coaching_summary ?? 'n/a'}${platformConstraint}

BACKLOG HEALTH: ${bScore}/100 (${bLabel})
${bHealthLines || '- No issues detected'}
${bScore < 60 ? `⚠️ Backlog is ${bLabel} — factor this into your recommendation. Preferring neglected games helps the score. If a game is clearly abandoned, mention it should be put on hold.` : ''}

RECENT ACTIVITY (last 12 sessions):
${recentActivity || '(none)'}

ACTIVE GAMES (last 90 days)${platform_mode ? ` — filtered to ${platform_mode === 'mobile' ? 'Mobile' : 'Xbox'} only` : ''}:
${gameLines || `(no ${platform_mode ? (platform_mode === 'mobile' ? 'mobile' : 'xbox') + ' ' : ''}games tracked yet — suggest tagging games with their platform first)`}

GAME PROGRESS (manual tracking):
${progressLines}

AI GAME KNOWLEDGE (story vs full completion):
${knowledgeLines}

QUESTS:
${questLines || '(no quests)'}

Rules for your response:
- Pick the game most deserving of play tonight based on the data
- If a PLATFORM FILTER is active, ONLY pick games from that platform list — do not break this rule
- If backlog health is Critical or At Risk, at least one "why" bullet should reference a neglected game or suggest putting an idle game on hold
- Each "why" bullet must cite a specific data point (days since played, quest availability, session count, etc.)
- suggested_minutes: follow the SESSION LENGTH rule above if a platform filter is active; otherwise use the player's avg session (~${avgMin} min)
- alternative must be a DIFFERENT game — a shorter/lighter change-of-pace option
- alternative_minutes: follow the SESSION LENGTH rule if a platform filter is active; otherwise noticeably shorter than suggested_minutes
- alternative_quest must be a specific named quest or objective in the alternative game (not generic)
- alternative_why is 1 punchy sentence explaining why it's a good change of pace right now
- confidence_score: 0.0–1.0 based on how much data you have (low if very little history)

Respond ONLY with valid JSON, no markdown:
{
  "headline": "<punchy one-liner, e.g. 'Burnout Paradise is calling — last played 4 days ago'>",
  "game": "<exact game name from the list>",
  "suggested_minutes": <number>,
  "why": ["<bullet 1 citing data>", "<bullet 2>", "<bullet 3>"],
  "alternative_game": "<different game or null>",
  "alternative_minutes": <number or null>,
  "alternative_quest": "<specific named quest/objective in alternative_game, or null>",
  "alternative_why": "<1 punchy sentence — why this is a good change-of-pace pick right now>",
  "confidence_score": <0.0–1.0>
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-5.4',
      max_completion_tokens: 400,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: "Generate tonight's recommendation." },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '';
    let card: any = null;
    try { card = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) try { card = JSON.parse(m[0]); } catch { /* ignore */ }
    }

    if (!card?.game) {
      res.status(500).json({ error: "AI returned invalid response" });
      return;
    }

    const saved = await pool.query(
      `INSERT INTO ai_recommendations (game, headline, suggested_minutes, reasoning, alternative_game, alternative_why, alternative_minutes, alternative_quest, confidence_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, created_at`,
      [card.game, card.headline, card.suggested_minutes ?? 60,
       JSON.stringify(card.why ?? []),
       card.alternative_game ?? null, card.alternative_why ?? null,
       card.alternative_minutes ?? null, card.alternative_quest ?? null,
       card.confidence_score ?? 0.5]
    );

    // Phase 10: Persist key insights to ai_insights table (fire-and-forget)
    const insightContent = `Tonight's pick: ${card.game} (${card.suggested_minutes}m) — ${(card.why ?? []).join(' | ')}`;
    pool.query(
      `INSERT INTO ai_insights (type, content, game) VALUES ('recommendation', $1, $2)`,
      [insightContent, card.game]
    ).catch(() => {});

    res.json({
      ...card,
      id: saved.rows[0].id,
      created_at: saved.rows[0].created_at,
      platform: platformMap.get(card.game) ?? null,
      alt_platform: card.alternative_game ? (platformMap.get(card.alternative_game) ?? null) : null,
      platform_mode: platform_mode ?? null,
    });
  } catch (err) {
    console.error("coach-card error:", err);
    res.status(500).json({ error: "Failed to generate coach card", detail: String(err) });
  }
});

// ─── GET /api/ai/coach-card/latest ─────────────────────────────────────────
// Returns most recent recommendation — avoids re-calling AI on every page load
router.get("/ai/coach-card/latest", async (_req, res) => {
  try {
    await ensureCoachTables();
    const [recResult, pausedResult, platformResult] = await Promise.all([
      pool.query(`SELECT * FROM ai_recommendations ORDER BY created_at DESC LIMIT 1`),
      pool.query(`SELECT game FROM game_pauses`).catch(() => ({ rows: [] })),
      pool.query(`SELECT game, platform FROM game_platforms`).catch(() => ({ rows: [] })),
    ]);
    if (!recResult.rows.length) { res.json(null); return; }
    const r = recResult.rows[0];
    const pausedSet = new Set((pausedResult as any).rows.map((p: any) => p.game));
    const platMap = new Map<string, string>((platformResult as any).rows.map((p: any) => [p.game, p.platform]));
    res.json({
      id: r.id,
      game: r.game,
      headline: r.headline,
      suggested_minutes: r.suggested_minutes,
      why: r.reasoning,
      alternative_game: r.alternative_game,
      alternative_why: r.alternative_why,
      alternative_minutes: r.alternative_minutes,
      alternative_quest: r.alternative_quest,
      confidence_score: r.confidence_score,
      created_at: r.created_at,
      fulfilled: r.fulfilled,
      fulfilled_at: r.fulfilled_at,
      // Live pause state — lets the frontend warn when the pick is now on hold
      game_is_paused: pausedSet.has(r.game),
      alt_is_paused: r.alternative_game ? pausedSet.has(r.alternative_game) : false,
      // Platform info — looked up live so it's always current
      platform: platMap.get(r.game) ?? null,
      alt_platform: r.alternative_game ? (platMap.get(r.alternative_game) ?? null) : null,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch latest recommendation", detail: String(err) });
  }
});

// ─── GET /api/ai/recommendations ───────────────────────────────────────────
router.get("/ai/recommendations", async (_req, res) => {
  try {
    await ensureCoachTables();
    const result = await pool.query(
      `SELECT * FROM ai_recommendations ORDER BY created_at DESC LIMIT 20`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch recommendations", detail: String(err) });
  }
});

// ─── POST /api/ai/weekly-review (Phase 8) ──────────────────────────────────
router.post("/ai/weekly-review", async (req, res) => {
  try {
    await ensureCoachTables();

    const [weekLogs, topGames, questActivity, profile] = await Promise.all([
      pool.query(`
        SELECT game, action, minutes, timestamp::timestamptz as ts
        FROM log_entries
        WHERE timestamp::timestamptz >= date_trunc('week', NOW())
        ORDER BY timestamp::timestamptz ASC
      `),
      pool.query(`
        SELECT game, COUNT(*)::int as sessions, SUM(minutes)::int as total_minutes
        FROM log_entries
        WHERE timestamp::timestamptz >= date_trunc('week', NOW())
        GROUP BY game ORDER BY total_minutes DESC
      `),
      pool.query(`
        SELECT COUNT(*)::int as cnt FROM quests
        WHERE status='completed' AND completed_at >= date_trunc('week', NOW())
      `),
      pool.query(`SELECT personality_summary, coaching_summary, playstyle_tags, avg_sessions_per_week FROM user_profile WHERE id=1`),
    ]);

    const totalMinutes = weekLogs.rows.reduce((s: number, r: any) => s + (r.minutes || 0), 0);
    const sessionCount = weekLogs.rows.length;
    const gamesPlayed = new Set(weekLogs.rows.map((r: any) => r.game)).size;
    const questCompleted = questActivity.rows[0]?.cnt ?? 0;

    const topGamesStr = topGames.rows.slice(0, 5)
      .map((g: any) => `${g.game}: ${g.sessions} sessions, ${g.total_minutes}m`)
      .join('\n');

    const sessionList = weekLogs.rows.slice(0, 15)
      .map((r: any) => `${new Date(r.ts).toLocaleDateString()} — ${r.game}: ${r.action} (${r.minutes}m)`)
      .join('\n');

    const p = profile.rows[0] ?? {};

    const systemPrompt = `You are a personal gaming coach writing a brief weekly review. Be warm, specific, and insightful.

PLAYER: ${p.personality_summary ?? 'Gaming enthusiast'}
COACHING NOTE: ${p.coaching_summary ?? 'Keep building your backlog down'}

THIS WEEK:
Total playtime: ${totalMinutes}m (${Math.round(totalMinutes / 60 * 10) / 10}h)
Sessions: ${sessionCount}
Games played: ${gamesPlayed}
Quests completed: ${questCompleted}

Top games this week:
${topGamesStr || '(no sessions logged)'}

Session log:
${sessionList || '(no sessions)'}

Write a weekly review as valid JSON, no markdown:
{
  "narrative": "<3-4 sentences reviewing the week. Be specific — name games, session counts, milestones. Acknowledge patterns. Use second person ('You').>",
  "highlights": ["<specific highlight 1>", "<specific highlight 2>"],
  "next_week_focus": "<1 actionable sentence about what to prioritise next week, citing specific games or goals>",
  "mood": "<one of: great | good | quiet | mixed>"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-5.4',
      max_completion_tokens: 350,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Generate my weekly review.' },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '';
    let review: any = null;
    try { review = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) try { review = JSON.parse(m[0]); } catch { /* ignore */ }
    }

    if (!review) { res.status(500).json({ error: "AI returned invalid response" }); return; }

    // Save the review as an insight
    pool.query(
      `INSERT INTO ai_insights (type, content) VALUES ('weekly_review', $1)`,
      [review.narrative]
    ).catch(() => {});

    res.json({ ...review, total_minutes: totalMinutes, session_count: sessionCount, games_played: gamesPlayed, quests_completed: questCompleted });
  } catch (err) {
    console.error("weekly-review error:", err);
    res.status(500).json({ error: "Failed to generate weekly review", detail: String(err) });
  }
});

// ─── GET /api/ai/insights (Phase 10) ───────────────────────────────────────
router.get("/ai/insights", async (_req, res) => {
  try {
    await ensureCoachTables();
    const result = await pool.query(
      `SELECT * FROM ai_insights ORDER BY created_at DESC LIMIT 15`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch insights", detail: String(err) });
  }
});

// ─── Export fulfillment helper for use in logEntries ────────────────────────
export async function markRecommendationFulfilled(games: string[]): Promise<void> {
  try {
    await pool.query(`
      UPDATE ai_recommendations SET fulfilled=true, fulfilled_at=NOW()
      WHERE game = ANY($1::text[]) AND fulfilled=false
        AND created_at > NOW() - INTERVAL '24 hours'
    `, [games]);
  } catch (err) {
    console.error("markRecommendationFulfilled error:", err);
  }
}

export default router;
