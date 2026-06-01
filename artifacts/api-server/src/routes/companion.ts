import { Router } from "express";
import { pool } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id         SERIAL PRIMARY KEY,
      role       TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

ensureTable().catch(err => console.error("companion ensureTable:", err));

// ─── Build context snapshot for the AI ─────────────────────────────────────
async function buildContext(): Promise<string> {
  const [profileRes, activeRes, logsRes, sessionRes] = await Promise.all([
    pool.query(`SELECT * FROM user_profile WHERE id=1`),
    pool.query(`SELECT game, title, type, difficulty, progress, target, xp_reward FROM quests WHERE status='active' ORDER BY accepted_at DESC LIMIT 5`),
    pool.query(`SELECT game, title, difficulty, xp_earned, time_taken_minutes, completed_at FROM quest_logs ORDER BY completed_at DESC LIMIT 5`),
    pool.query(`SELECT game, action, minutes, type, timestamp FROM log_entries ORDER BY timestamp DESC LIMIT 12`),
  ]);

  const profile = profileRes.rows[0];
  const activeQuests = activeRes.rows;
  const completedLogs = logsRes.rows;
  const sessions = sessionRes.rows;

  const games = [...new Set(sessions.map((r: any) => r.game))];

  const lines: string[] = [];

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

  lines.push(`\nGAMES CURRENTLY PLAYING: ${games.join(', ') || 'none logged yet'}`);

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

const SYSTEM_PROMPT_BASE = `You are an elite AI gaming companion — part personal coach, part strategist, part friend. You have a PhD-level understanding of game design, mechanics, and player psychology. You deeply know this specific player through their history and profile.

Your personality: warm, enthusiastic about games, insightful, and direct. You never give generic advice — everything is tailored to THIS player's actual data.

You can help with:
- Analyzing gaming sessions, progress, and performance patterns
- Creating detailed strategies and builds for specific games or challenges
- Suggesting what to play next based on history, goals, and mood
- Breaking down complex game mechanics with clarity and depth
- Generating simple scripts (AutoHotkey, Python, AHK, etc.) for automation
- Creating custom quests tailored to the player's goals
- Skill-building exercises and practice routines

Rules:
- Always reference the player's actual game history and data when relevant
- Be specific, not generic — "you've been grinding Mario Kart Tour" not "gaming"
- Keep responses conversational and engaging, not wall-of-text
- When suggesting quests or strategies, be concrete and actionable
- If asked for a script, provide clean, working code with explanations`;

// ─── POST /api/companion/chat ───────────────────────────────────────────────
router.post("/companion/chat", async (req, res) => {
  try {
    await ensureTable();
    const { message } = req.body as { message: string };
    if (!message?.trim()) {
      res.status(400).json({ error: "message is required" }); return;
    }

    // Build fresh context snapshot
    const context = await buildContext();

    // Fetch last 20 conversation turns for history
    const histRes = await pool.query(
      `SELECT role, content FROM ai_conversations ORDER BY created_at DESC LIMIT 20`
    );
    const history = histRes.rows.reverse(); // oldest first

    // Build messages array
    const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\n--- PLAYER DATA (as of now) ---\n${context}`;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...history.map((h: any) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user', content: message.trim() },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-5.4',
      max_completion_tokens: 1200,
      messages,
    });

    const reply = response.choices[0]?.message?.content?.trim() ?? "I'm having trouble responding right now. Try again!";

    // Save both turns
    await pool.query(
      `INSERT INTO ai_conversations (role, content) VALUES ($1, $2), ($3, $4)`,
      ['user', message.trim(), 'assistant', reply]
    );

    // Keep conversation history trimmed to last 100 rows
    await pool.query(`
      DELETE FROM ai_conversations WHERE id NOT IN (
        SELECT id FROM ai_conversations ORDER BY created_at DESC LIMIT 100
      )
    `);

    res.json({ reply });
  } catch (err) {
    console.error("companion chat error:", err);
    res.status(500).json({ error: "Failed to get response", detail: String(err) });
  }
});

// ─── GET /api/companion/history ─────────────────────────────────────────────
router.get("/companion/history", async (_req, res) => {
  try {
    await ensureTable();
    const r = await pool.query(
      `SELECT id, role, content, created_at FROM ai_conversations ORDER BY created_at ASC LIMIT 60`
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch history", detail: String(err) });
  }
});

// ─── DELETE /api/companion/history ──────────────────────────────────────────
router.delete("/companion/history", async (_req, res) => {
  try {
    await ensureTable();
    await pool.query(`TRUNCATE ai_conversations`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear history", detail: String(err) });
  }
});

export default router;
