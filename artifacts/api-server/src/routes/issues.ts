import { Router } from "express";
import { pool } from "@workspace/db";
import { aiForRoute } from "../lib/aiLogger";
import { getConfig } from "./aiCost";

const router = Router();

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_issues (
      id          SERIAL PRIMARY KEY,
      page        TEXT NOT NULL DEFAULT '',
      element     TEXT,
      description TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'open',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
ensureTable().catch(err => console.error("issues ensureTable:", err));

async function logIssue(page: string, element: string, description: string) {
  const { rows } = await pool.query(
    `INSERT INTO app_issues (page, element, description) VALUES ($1, $2, $3) RETURNING *`,
    [page || '', element || '', description]
  );
  return rows[0];
}

const FIX_TYPES = ['put_on_hold', 'remove_hold', 'mark_complete'] as const;
type FixType = typeof FIX_TYPES[number];

const APP_GUIDE = `The app is "Gaming Quest Dashboard", a personal gaming tracker. Main areas (top navigation):
- Dashboard: overview, active quests, AI companion chat, daily plan.
- Quest Log (Log): raw play sessions; paste/import logs in the left "Raw Logs" panel using format "timestamp | game | action | minutes | type".
- Games: list of games with status (active / on hold / completed), platforms and guides.
- Quests: accept, track, and complete quests; generate new ones.
- Reports: weekly reports and schedules.
- Radar: AI suggestions for what to play next.
- Settings / AI pages: "AI Usage" shows OpenAI spend; "Configure" (AI Cost Settings) toggles AI features and models.
Games can be: active (in the backlog), "on hold" (paused), or "completed". A game becomes active automatically when it has logged sessions and is neither on hold nor completed.`;

const SYSTEM_PROMPT = `You are the in-app support triage assistant for the Gaming Quest Dashboard. A user just reported an issue from inside the app. Decide the single best way to help, then reply with STRICT JSON only (no markdown).

${APP_GUIDE}

You can resolve two kinds of things directly:
1. "self_serve" — the user is confused about how to do something, where to find a feature, or how the app behaves. Give clear, numbered troubleshooting / how-to steps.
2. "auto_fix" — the user's data is in the wrong state and it can be fixed with one of these safe actions on a SPECIFIC game:
   - "put_on_hold": pause a game that should not be in the active backlog.
   - "remove_hold": resume a game that is currently on hold but shouldn't be.
   - "mark_complete": mark a game the user has finished as completed.
   Only propose a fix for a game name that appears in the GAME STATE lists provided, copied EXACTLY. Include a short "label" (button text) and "detail" (why) for each fix. You may also include steps alongside fixes.
Otherwise use:
3. "log" — anything that needs a developer: bugs, crashes, wrong numbers, visual glitches, missing/blank data, feature requests, or anything you cannot resolve with steps or the actions above. The issue will be logged for review.

Respond with this exact JSON shape:
{
  "category": "self_serve" | "auto_fix" | "log",
  "summary": "1-2 sentences addressed directly to the user explaining what you found / will do",
  "steps": ["step 1", "step 2"],
  "fixes": [{ "type": "put_on_hold" | "remove_hold" | "mark_complete", "game": "Exact Game Name", "label": "Put X on hold", "detail": "short reason" }]
}
Rules: steps is [] when not relevant. fixes is [] unless category is "auto_fix". Never invent game names. Keep summary friendly and concise. When in doubt, prefer "log".`;

// POST /api/issues/triage — AI triage: troubleshoot, auto-fix, or log
router.post("/issues/triage", async (req, res) => {
  const { page, element, description } = req.body as { page?: string; element?: string; description?: string };
  const desc = (description ?? '').trim();
  if (!desc) {
    res.status(400).json({ error: "description is required" });
    return;
  }

  try {
    const { enabled, model, max_tokens } = await getConfig('issue-triage');

    if (!enabled) {
      const issue = await logIssue(page ?? '', element ?? '', desc);
      res.json({ category: 'log', logged: true, issue, summary: "Thanks — this has been logged for review.", steps: [], fixes: [] });
      return;
    }

    // Build game-state context
    const [allGamesRes, pausedRes, completedRes] = await Promise.all([
      pool.query(`SELECT DISTINCT game FROM log_entries`),
      pool.query(`SELECT game FROM game_pauses`),
      pool.query(`SELECT game FROM game_completions`).catch(() => ({ rows: [] as any[] })),
    ]);
    const pausedSet = new Set<string>(pausedRes.rows.map((r: any) => r.game));
    const completedSet = new Set<string>(completedRes.rows.map((r: any) => r.game));
    const activeGames = allGamesRes.rows
      .map((r: any) => r.game)
      .filter((g: string) => !pausedSet.has(g) && !completedSet.has(g));
    const validGames = new Set<string>([...activeGames, ...pausedSet, ...completedSet]);

    const stateLines = [
      `GAME STATE:`,
      `  Active backlog: ${activeGames.join(', ') || '(none)'}`,
      `  On hold: ${[...pausedSet].join(', ') || '(none)'}`,
      `  Completed: ${[...completedSet].join(', ') || '(none)'}`,
    ].join('\n');

    const userMsg = `${stateLines}\n\nISSUE REPORT:\n  Page: ${page || '(unknown)'}\n  Element: ${element || '(none)'}\n  Description: ${desc}`;

    const response = await aiForRoute('issue-triage').chat.completions.create({
      model,
      max_completion_tokens: max_tokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
    });

    let parsed: any = null;
    try { parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}'); } catch { /* fall through */ }

    if (!parsed || typeof parsed !== 'object') {
      const issue = await logIssue(page ?? '', element ?? '', desc);
      res.json({ category: 'log', logged: true, issue, summary: "Thanks — this has been logged for review.", steps: [], fixes: [] });
      return;
    }

    let category: 'self_serve' | 'auto_fix' | 'log' =
      parsed.category === 'self_serve' || parsed.category === 'auto_fix' ? parsed.category : 'log';
    const summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 600) : '';
    const steps = Array.isArray(parsed.steps)
      ? parsed.steps.filter((s: any) => typeof s === 'string' && s.trim()).map((s: string) => s.trim()).slice(0, 6)
      : [];

    // Validate fixes against real game state so we never render a nonsensical button
    const fixes = (Array.isArray(parsed.fixes) ? parsed.fixes : [])
      .filter((f: any) => f && FIX_TYPES.includes(f.type) && typeof f.game === 'string' && validGames.has(f.game))
      .filter((f: any) => {
        const t = f.type as FixType;
        if (t === 'remove_hold') return pausedSet.has(f.game);
        if (t === 'put_on_hold') return !pausedSet.has(f.game) && !completedSet.has(f.game);
        if (t === 'mark_complete') return !completedSet.has(f.game);
        return false;
      })
      .slice(0, 5)
      .map((f: any) => ({
        type: f.type as FixType,
        game: f.game as string,
        label: typeof f.label === 'string' && f.label.trim() ? f.label.trim().slice(0, 60) : undefined,
        detail: typeof f.detail === 'string' ? f.detail.trim().slice(0, 140) : undefined,
      }));

    if (category === 'auto_fix' && fixes.length === 0) {
      category = steps.length > 0 ? 'self_serve' : 'log';
    }

    if (category === 'log' || (steps.length === 0 && fixes.length === 0)) {
      const issue = await logIssue(page ?? '', element ?? '', desc);
      res.json({
        category: 'log',
        logged: true,
        issue,
        summary: summary || "Thanks — this looks like something to look into. It's been logged for review.",
        steps: [],
        fixes: [],
      });
      return;
    }

    res.json({ category, logged: false, summary, steps, fixes });
  } catch (err) {
    console.error("issue triage error:", err);
    try {
      const issue = await logIssue(page ?? '', element ?? '', desc);
      res.json({ category: 'log', logged: true, issue, summary: "Thanks — this has been logged for review.", steps: [], fixes: [] });
    } catch (e2: any) {
      res.status(500).json({ error: e2.message });
    }
  }
});

router.get("/issues", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM app_issues ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/issues", async (req, res) => {
  try {
    const { page, element, description } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO app_issues (page, element, description)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [page || '', element || '', description]);
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/issues/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const { rows } = await pool.query(`
      UPDATE app_issues SET status = $2 WHERE id = $1 RETURNING *
    `, [req.params.id, status]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/issues/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM app_issues WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
