import { Router } from "express";
import { pool } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

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
      name: 'get_game_stats',
      description: 'Get session statistics (session count, total minutes, avg session length) for a specific game or all games over a recent time period. Use when the player asks about how much they\'ve played a game.',
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
      description: 'Get a breakdown of time played per game. Great for charts showing gaming distribution. Use when asked about most played games or time breakdown.',
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
      description: 'Get recent individual gaming sessions with dates, actions, and durations. Use for trend analysis or when the player asks about specific recent sessions.',
      parameters: {
        type: 'object',
        properties: {
          game: { type: 'string', description: 'Filter to a specific game. Omit for all games.' },
          limit: { type: 'number', description: 'Max sessions to return. Default: 20.' },
        },
      },
    },
  },
];

async function executeTool(name: string, args: Record<string, any>): Promise<string> {
  try {
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

  const [profileRes, activeRes, logsRes, sessionRes] = await Promise.all([
    pool.query(`SELECT * FROM user_profile WHERE id=1`),
    pool.query(`SELECT game, title, type, difficulty, progress, target, xp_reward FROM quests WHERE status='active' ${gc} ORDER BY accepted_at DESC LIMIT 5`, gp),
    pool.query(`SELECT game, title, difficulty, xp_earned, time_taken_minutes, completed_at FROM quest_logs ${gcWhere} ORDER BY completed_at DESC LIMIT 5`, gp),
    pool.query(`SELECT game, action, minutes, type, timestamp FROM log_entries ${gcWhere} ORDER BY timestamp DESC LIMIT 12`, gp),
  ]);

  const profile = profileRes.rows[0];
  const activeQuests = activeRes.rows;
  const completedLogs = logsRes.rows;
  const sessions = sessionRes.rows;
  const games = [...new Set(sessions.map((r: any) => r.game))];
  const lines: string[] = [];

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

  lines.push(`\nGAMES IN RECENT SESSIONS: ${games.join(', ') || 'none logged yet'}`);

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

const SYSTEM_PROMPT_BASE = `You are an elite AI gaming companion — part personal coach, part strategist, part friend. You have a PhD-level understanding of game design, mechanics, and player psychology. You deeply know this specific player through their history and profile.

Your personality: warm, enthusiastic about games, insightful, and direct. You never give generic advice — everything is tailored to THIS player's actual data.

You have live tools to query the player's gaming database. USE THEM proactively — whenever the player asks about their stats, sessions, progress, or time played, call the relevant tool first. Do not estimate from context alone.

CHARTS: When data is better shown visually, embed a chart using this exact format on its own line:
[CHART:{"type":"bar","title":"Time Played (last 30d)","labels":["Game A","Game B"],"values":[120,45],"unit":"minutes"}]

Chart types:
- "bar" — horizontal bars, best for comparing games or categories
- "line" — line over time, best for session trends (use date labels like "Mon", "Jun 1")
- "pie" — circular, best for showing proportional share across a few items
- "donut" — like pie but with a hole, great for time-split breakdowns
Rules:
- labels and values must be the same length.
- unit examples: "minutes", "sessions", "XP", "hours" — "minutes" values will be auto-converted to hours in the UI.
- You can mix chart + text in one message. Put the chart on its own line between paragraphs.
- Only produce a chart when you have real data from a tool call. Never invent chart data.

Rules:
- Always reference the player's actual game history when relevant
- Be specific: "you've logged 4 sessions in Mario Kart Tour this week" not "you play a lot"
- Keep responses conversational, not wall-of-text
- When suggesting quests or strategies, be concrete and actionable`;

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

    // Tool-calling loop (max 3 rounds)
    let finalReply = '';
    for (let round = 0; round < 3; round++) {
      const response = await openai.chat.completions.create({
        model: 'gpt-5.4',
        max_completion_tokens: 1500,
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

      // Execute all tool calls
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

    // Save both turns
    await pool.query(
      `INSERT INTO ai_conversations (role, content, game_context) VALUES ($1,$2,$3), ($4,$5,$6)`,
      ['user', message.trim(), game ?? null, 'assistant', finalReply, game ?? null]
    );

    // Trim to last 100 rows per game context
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
