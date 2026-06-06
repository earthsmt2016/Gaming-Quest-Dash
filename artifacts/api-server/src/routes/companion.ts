import { Router } from "express";
import { pool } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

const execFileAsync = promisify(execFile);

const router = Router();

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id           SERIAL PRIMARY KEY,
      role         TEXT NOT NULL,
      content      TEXT NOT NULL,
      game_context TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS game_context TEXT`);
}

ensureTable().catch(err => console.error("companion ensureTable:", err));

// ─── Tools ────────────────────────────────────────────────────────────────────

const TOOLS: any[] = [
  {
    type: 'function',
    function: {
      name: 'get_backlog_health',
      description: 'Get detailed backlog health data: health score, neglected games, active game count, paused games, and specific per-game recommendations. Call this at the start of any conversation about what to play, backlog management, or when the player seems unsure what to focus on.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_game_stats',
      description: 'Get session statistics (session count, total minutes, avg session length) for a specific game or all games over a recent time period.',
      parameters: {
        type: 'object',
        properties: {
          game: { type: 'string', description: 'Game name to filter by. Omit to get stats for all games.' },
          days: { type: 'number', description: 'How many days back to look. Default: 30.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_quest_status',
      description: 'Get the player\'s active quests and recently completed quests, optionally filtered by game.',
      parameters: {
        type: 'object',
        properties: {
          game: { type: 'string', description: 'Filter to a specific game. Omit for all games.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_games',
      description: 'Get a breakdown of time played per game. Great for charts showing gaming distribution.',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'How many days back to look. Default: 30.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_session_history',
      description: 'Get recent individual gaming sessions with dates, actions, and durations.',
      parameters: {
        type: 'object',
        properties: {
          game: { type: 'string', description: 'Filter to a specific game. Omit for all games.' },
          limit: { type: 'number', description: 'Max sessions to return. Default: 20.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_script',
      description: 'Write and execute a JavaScript or Python script on the server for calculations or data analysis.',
      parameters: {
        type: 'object',
        properties: {
          language: { type: 'string', enum: ['javascript', 'python'] },
          code: { type: 'string', description: 'The complete script code to run.' },
        },
        required: ['language', 'code'],
      },
    },
  },
];

async function executeTool(name: string, args: Record<string, any>): Promise<string> {
  try {
    if (name === 'get_backlog_health') {
      const [allGamesRes, recentRes, paused14Res, pausedRes, completionsRes, lastPlayedRes] = await Promise.all([
        pool.query(`SELECT DISTINCT game FROM log_entries`),
        pool.query(`SELECT DISTINCT game FROM log_entries WHERE timestamp::timestamptz > NOW() - INTERVAL '14 days'`),
        pool.query(`SELECT DISTINCT game FROM log_entries WHERE timestamp::timestamptz > NOW() - INTERVAL '30 days'`),
        pool.query(`SELECT game FROM game_pauses`),
        pool.query(`SELECT game FROM game_completions`).catch(() => ({ rows: [] as any[] })),
        pool.query(`SELECT game, MAX(timestamp::timestamptz) as last_session, SUM(minutes) as total_minutes, COUNT(*) as session_count FROM log_entries GROUP BY game`),
      ]);

      const completedSet = new Set(completionsRes.rows.map((r: any) => r.game));
      const pausedSet = new Set(pausedRes.rows.map((r: any) => r.game));
      const recentSet = new Set(recentRes.rows.map((r: any) => r.game));
      const recent30Set = new Set(paused14Res.rows.map((r: any) => r.game));

      const activeBacklog: string[] = allGamesRes.rows
        .map((r: any) => r.game)
        .filter((g: string) => !completedSet.has(g) && !pausedSet.has(g));

      const gameMap: Record<string, any> = {};
      for (const r of lastPlayedRes.rows) {
        gameMap[r.game] = r;
      }

      const activeDetails = activeBacklog
        .map(g => {
          const info = gameMap[g] ?? {};
          const daysSince = info.last_session
            ? Math.floor((Date.now() - new Date(info.last_session).getTime()) / 86400000)
            : 999;
          return {
            game: g,
            days_since_last_session: daysSince,
            total_hours: Math.round(Number(info.total_minutes ?? 0) / 60 * 10) / 10,
            session_count: Number(info.session_count ?? 0),
          };
        })
        .sort((a, b) => b.days_since_last_session - a.days_since_last_session);

      const neglected14 = activeDetails.filter(g => g.days_since_last_session >= 14);
      const neglected30 = activeDetails.filter(g => g.days_since_last_session >= 30);
      const currentlyActive = activeDetails.filter(g => g.days_since_last_session < 14);

      const neglectPenalty = Math.min(neglected14.length * 5, 35);
      const backlogPenalty = Math.min(Math.max(activeBacklog.length - 6, 0) * 4, 30);
      const rotationPenalty = Math.min(Math.max(currentlyActive.length - 3, 0) * 5, 15);
      const healthScore = Math.max(0, 100 - neglectPenalty - backlogPenalty - rotationPenalty);
      const healthLabel = healthScore >= 80 ? 'Healthy' : healthScore >= 60 ? 'Fair' : healthScore >= 40 ? 'At Risk' : 'Critical';

      const recommendations: Array<{ action: string; game: string; reason: string }> = [];
      for (const g of neglected30.slice(0, 3)) {
        recommendations.push({ action: 'put_on_hold', game: g.game, reason: `Not played in ${g.days_since_last_session} days — either commit to it or bench it` });
      }
      for (const g of neglected14.filter(x => x.days_since_last_session < 30).slice(0, 2)) {
        recommendations.push({ action: 'put_on_hold', game: g.game, reason: `No sessions in ${g.days_since_last_session} days — losing momentum` });
      }

      return JSON.stringify({
        health_score: healthScore,
        health_label: healthLabel,
        active_backlog_count: activeBacklog.length,
        completed_count: completedSet.size,
        paused_games: pausedRes.rows.map((r: any) => r.game),
        currently_active_games: currentlyActive.map(g => g.game),
        neglected_14d: neglected14,
        neglected_30d: neglected30,
        all_active_details: activeDetails,
        recommendations,
      });
    }

    if (name === 'get_game_stats') {
      const days = Number(args.days ?? 30);
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const r = args.game
        ? await pool.query(
            `SELECT game, COUNT(*) as sessions, SUM(minutes) as total_minutes, ROUND(AVG(minutes)) as avg_minutes, MAX(timestamp::date) as last_played
             FROM log_entries WHERE game=$1 AND timestamp >= $2 GROUP BY game`,
            [args.game, since]
          )
        : await pool.query(
            `SELECT game, COUNT(*) as sessions, SUM(minutes) as total_minutes, ROUND(AVG(minutes)) as avg_minutes, MAX(timestamp::date) as last_played
             FROM log_entries WHERE timestamp >= $1 GROUP BY game ORDER BY total_minutes DESC`,
            [since]
          );
      return JSON.stringify({ period_days: days, stats: r.rows });
    }

    if (name === 'get_quest_status') {
      const gp = args.game ? [args.game] : [];
      const gc = args.game ? 'AND game=$1' : '';
      const [activeRes, doneRes] = await Promise.all([
        pool.query(`SELECT game, title, type, difficulty, progress, target, xp_reward, estimated_minutes FROM quests WHERE status='active' ${gc} ORDER BY accepted_at DESC LIMIT 10`, gp),
        pool.query(`SELECT game, title, xp_earned, time_taken_minutes, difficulty, completed_at::date as date FROM quest_logs WHERE 1=1 ${args.game ? 'AND game=$1' : ''} ORDER BY completed_at DESC LIMIT 8`, gp),
      ]);
      return JSON.stringify({ active_quests: activeRes.rows, recent_completions: doneRes.rows });
    }

    if (name === 'get_top_games') {
      const days = Number(args.days ?? 30);
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const r = await pool.query(
        `SELECT game, SUM(minutes) as total_minutes, COUNT(*) as sessions FROM log_entries WHERE timestamp >= $1 GROUP BY game ORDER BY total_minutes DESC LIMIT 12`,
        [since]
      );
      return JSON.stringify({ period_days: days, games: r.rows });
    }

    if (name === 'get_session_history') {
      const limit = Number(args.limit ?? 20);
      const gp = args.game ? [args.game, limit] : [limit];
      const gc = args.game ? 'WHERE game=$1' : '';
      const lp = args.game ? '$2' : '$1';
      const r = await pool.query(
        `SELECT game, action, minutes, type, timestamp::date as date FROM log_entries ${gc} ORDER BY timestamp DESC LIMIT ${lp}`,
        gp
      );
      return JSON.stringify({ sessions: r.rows });
    }

    if (name === 'execute_script') {
      const language = String(args.language ?? 'javascript');
      const code = String(args.code ?? '');
      if (!code.trim()) return JSON.stringify({ error: 'No code provided' });

      const ext = language === 'python' ? '.py' : '.js';
      const tmpFile = path.join(os.tmpdir(), `companion_${Date.now()}${ext}`);
      try {
        await fs.writeFile(tmpFile, code, 'utf8');
        const binary = language === 'python' ? 'python3' : 'node';
        const { stdout, stderr } = await execFileAsync(binary, [tmpFile], {
          timeout: 12000,
          maxBuffer: 1024 * 128,
        });
        return JSON.stringify({
          success: true,
          output: stdout.slice(0, 3000) || '(no output)',
          warnings: stderr.slice(0, 500) || undefined,
        });
      } catch (err: any) {
        return JSON.stringify({
          success: false,
          error: (err.stderr?.toString() || err.message || 'Execution failed').slice(0, 1000),
          output: err.stdout?.toString().slice(0, 500),
        });
      } finally {
        fs.unlink(tmpFile).catch(() => {});
      }
    }

    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (err) {
    return JSON.stringify({ error: String(err) });
  }
}

// ─── Build context snapshot ───────────────────────────────────────────────────

async function buildContext(game?: string): Promise<string> {
  const gp = game ? [game] : [];
  const gc = game ? 'AND game=$1' : '';
  const gcWhere = game ? 'WHERE game=$1' : '';

  const [profileRes, activeRes, logsRes, sessionRes, pausedRes, completionsRes, allGamesRes, recentGamesRes] = await Promise.all([
    pool.query(`SELECT * FROM user_profile WHERE id=1`),
    pool.query(`SELECT game, title, type, difficulty, progress, target, xp_reward FROM quests WHERE status='active' ${gc} ORDER BY accepted_at DESC LIMIT 5`, gp),
    pool.query(`SELECT game, title, difficulty, xp_earned, time_taken_minutes, completed_at FROM quest_logs ${gcWhere} ORDER BY completed_at DESC LIMIT 5`, gp),
    pool.query(`SELECT game, action, minutes, type, timestamp FROM log_entries ${gcWhere} ORDER BY timestamp DESC LIMIT 12`, gp),
    pool.query(`SELECT game FROM game_pauses`),
    pool.query(`SELECT game FROM game_completions`).catch(() => ({ rows: [] as any[] })),
    pool.query(`SELECT DISTINCT game FROM log_entries`),
    pool.query(`SELECT DISTINCT game FROM log_entries WHERE timestamp::timestamptz > NOW() - INTERVAL '14 days'`),
  ]);

  const profile = profileRes.rows[0];
  const activeQuests = activeRes.rows;
  const completedLogs = logsRes.rows;
  const sessions = sessionRes.rows;

  const completedSet = new Set(completionsRes.rows.map((r: any) => r.game));
  const pausedSet = new Set(pausedRes.rows.map((r: any) => r.game));
  const recentSet = new Set(recentGamesRes.rows.map((r: any) => r.game));
  const activeBacklog = allGamesRes.rows.map((r: any) => r.game).filter((g: string) => !completedSet.has(g) && !pausedSet.has(g));
  const neglected = activeBacklog.filter((g: string) => !recentSet.has(g));

  const neglectPenalty = Math.min(neglected.length * 5, 35);
  const backlogPenalty = Math.min(Math.max(activeBacklog.length - 6, 0) * 4, 30);
  const activePlaying = activeBacklog.filter((g: string) => recentSet.has(g));
  const rotationPenalty = Math.min(Math.max(activePlaying.length - 3, 0) * 5, 15);
  const healthScore = Math.max(0, 100 - neglectPenalty - backlogPenalty - rotationPenalty);
  const healthLabel = healthScore >= 80 ? '✅ Healthy' : healthScore >= 60 ? '⚠️ Fair' : healthScore >= 40 ? '🔴 At Risk' : '💀 Critical';

  const lines: string[] = [];

  // Backlog health snapshot — always at the top so AI has instant awareness
  lines.push(`BACKLOG HEALTH: ${healthScore}/100 (${healthLabel})`);
  lines.push(`  Active backlog: ${activeBacklog.length} games | Currently playing: ${activePlaying.join(', ') || 'none'}`);
  if (neglected.length > 0) lines.push(`  ⚠️ NEGLECTED (14d+): ${neglected.join(', ')}`);
  if (pausedSet.size > 0) lines.push(`  ⏸ Paused: ${[...pausedSet].join(', ')}`);
  lines.push('');

  if (game) lines.push(`GAME FOCUS: ${game}\n`);

  if (profile) {
    const pref = Array.isArray(profile.preferred_types) ? profile.preferred_types : [];
    const avoid = Array.isArray(profile.avoided_types) ? profile.avoided_types : [];
    lines.push(`PLAYER PROFILE:`);
    lines.push(`  Preferred difficulty: ${profile.preferred_difficulty}`);
    lines.push(`  Preferred quest types: ${pref.join(', ') || 'not established yet'}`);
    lines.push(`  Avoided types: ${avoid.join(', ') || 'none'}`);
    lines.push(`  Avg session: ~${profile.avg_session_minutes} minutes`);
    if (profile.personality_summary) lines.push(`  Personality: ${profile.personality_summary}`);
  }

  if (activeQuests.length) {
    lines.push(`\nACTIVE QUESTS:`);
    for (const q of activeQuests) {
      const pct = Math.round((q.progress / (q.target || 100)) * 100);
      lines.push(`  ⚔️ "${q.title}" [${q.game}, ${q.type}, ${q.difficulty}, ${pct}% done, +${q.xp_reward}XP]`);
    }
  } else {
    lines.push(`\nACTIVE QUESTS: none`);
  }

  if (completedLogs.length) {
    lines.push(`\nRECENT COMPLETIONS:`);
    for (const l of completedLogs) {
      lines.push(`  ✅ "${l.title}" [${l.game}, ${l.difficulty}, ${l.time_taken_minutes}m, +${l.xp_earned}XP] — ${new Date(l.completed_at).toLocaleDateString()}`);
    }
  }

  if (sessions.length) {
    lines.push(`\nRECENT SESSIONS:`);
    for (const s of sessions) {
      lines.push(`  ${s.timestamp} | ${s.game} | ${s.action} | ${s.minutes}m [${s.type}]`);
    }
  }

  return lines.join('\n');
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_BASE = `You are an elite AI gaming companion — part personal coach, part strategist, part friend. Your #1 mission is to help this player maintain a healthy backlog and ensure every game they touch is actually progressing.

Your personality: warm, enthusiastic, direct, slightly opinionated. You're not afraid to say "you haven't touched that game in 6 weeks — let's be real about whether you'll ever go back."

**BACKLOG MANAGEMENT IS YOUR PRIMARY JOB.** On any open-ended question ("what should I play?", "how am I doing?", "any advice?"), ALWAYS start by calling get_backlog_health and then give specific, actionable guidance based on the real data.

You have live tools to query the player's gaming database. USE THEM proactively.

CHARTS: Embed charts when data is better shown visually:
[CHART:{"type":"bar","title":"Time Played (last 30d)","labels":["Game A","Game B"],"values":[120,45],"unit":"minutes"}]
Chart types: "bar", "line", "pie", "donut". Labels and values must be the same length.
Only produce charts from real tool data, never invented.

GAME ACTIONS: You can embed interactive action buttons directly in your response. Use these to let the player act on your recommendations immediately — no navigation needed.

Format (one per line, between paragraphs):
[ACTION:{"type":"put_on_hold","game":"EXACT_GAME_NAME","label":"Put on hold","detail":"Not played in 45 days"}]
[ACTION:{"type":"remove_hold","game":"EXACT_GAME_NAME","label":"Take off hold","detail":"Ready to resume?"}]
[ACTION:{"type":"mark_complete","game":"EXACT_GAME_NAME","label":"Mark as complete","detail":"You've put 40h in"}]

Action rules:
- ALWAYS use [ACTION:...] blocks when recommending a game be put on hold, resumed, or marked done
- Use put_on_hold when: neglected 14+ days AND the player has 5+ active games
- Use mark_complete when: the player seems genuinely done with a game
- Use remove_hold when: suggesting a paused game worth returning to
- game field MUST be the exact game name from the player's data — copy it precisely
- Always write a sentence BEFORE the action button explaining your reasoning
- You can include multiple action buttons in one response when the situation warrants it

SCRIPT EXECUTION: You can write and run scripts via execute_script for calculations or data analysis.

Core rules:
- Always reference actual data ("you've logged 4 sessions this week") not vague generalizations
- Be direct about neglected games — don't soften it
- Keep responses conversational, not wall-of-text
- Prioritize the player's backlog health score improving over everything else`;

function makeSystemPrompt(context: string, game?: string): string {
  const gameLine = game ? `\n\nYou are currently in the ${game} chat context. Focus your answers on this game unless asked otherwise.` : '';
  return `${SYSTEM_PROMPT_BASE}${gameLine}\n\n--- PLAYER DATA (as of now) ---\n${context}`;
}

// ─── POST /api/companion/chat ─────────────────────────────────────────────────

router.post("/companion/chat", async (req, res) => {
  try {
    await ensureTable();
    const { message, game } = req.body as { message: string; game?: string };
    if (!message?.trim()) {
      res.status(400).json({ error: "message is required" }); return;
    }

    const context = await buildContext(game);

    const histRes = await pool.query(
      `SELECT role, content FROM ai_conversations WHERE (game_context IS NOT DISTINCT FROM $1) ORDER BY created_at DESC LIMIT 20`,
      [game ?? null]
    );
    const history = histRes.rows.reverse();

    const systemPrompt = makeSystemPrompt(context, game);

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((h: any) => ({ role: h.role, content: h.content })),
      { role: 'user', content: message.trim() },
    ];

    // Tool-calling loop (max 4 rounds)
    let finalReply = '';
    for (let round = 0; round < 4; round++) {
      const response = await openai.chat.completions.create({
        model: 'gpt-5.4',
        max_completion_tokens: 1800,
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
      });

      const choice = response.choices[0];
      const msg = choice.message;

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        finalReply = msg.content?.trim() ?? "I'm having trouble responding right now. Try again!";
        break;
      }

      messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });
      for (const tc of msg.tool_calls) {
        let args: Record<string, any> = {};
        try { args = JSON.parse(tc.function.arguments); } catch {}
        const result = await executeTool(tc.function.name, args);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }
    }

    if (!finalReply) {
      finalReply = "I ran into an issue fetching your data. Try asking again!";
    }

    await pool.query(
      `INSERT INTO ai_conversations (role, content, game_context) VALUES ($1,$2,$3), ($4,$5,$6)`,
      ['user', message.trim(), game ?? null, 'assistant', finalReply, game ?? null]
    );

    await pool.query(`
      DELETE FROM ai_conversations WHERE id NOT IN (
        SELECT id FROM ai_conversations WHERE (game_context IS NOT DISTINCT FROM $1) ORDER BY created_at DESC LIMIT 100
      ) AND (game_context IS NOT DISTINCT FROM $1)
    `, [game ?? null]);

    res.json({ reply: finalReply });
  } catch (err) {
    console.error("companion chat error:", err);
    res.status(500).json({ error: "Failed to get response", detail: String(err) });
  }
});

// ─── GET /api/companion/history ───────────────────────────────────────────────

router.get("/companion/history", async (req, res) => {
  try {
    await ensureTable();
    const game = req.query.game as string | undefined;
    const r = await pool.query(
      `SELECT id, role, content, created_at FROM ai_conversations WHERE (game_context IS NOT DISTINCT FROM $1) ORDER BY created_at ASC LIMIT 60`,
      [game ?? null]
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch history", detail: String(err) });
  }
});

// ─── DELETE /api/companion/history ───────────────────────────────────────────

router.delete("/companion/history", async (req, res) => {
  try {
    await ensureTable();
    const game = req.query.game as string | undefined;
    if (game) {
      await pool.query(`DELETE FROM ai_conversations WHERE game_context=$1`, [game]);
    } else {
      await pool.query(`DELETE FROM ai_conversations WHERE game_context IS NULL`);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear history", detail: String(err) });
  }
});

export default router;
