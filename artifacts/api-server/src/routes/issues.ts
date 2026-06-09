import { Router } from "express";
import fs from "fs";
import path from "path";
import { pool } from "@workspace/db";
import { aiForRoute } from "../lib/aiLogger";
import { getConfig } from "./aiCost";

const router = Router();

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_issues (
      id           SERIAL PRIMARY KEY,
      page         TEXT NOT NULL DEFAULT '',
      element      TEXT,
      description  TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'open',
      nav_history  JSONB,
      interactions JSONB,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Migrate: add nav_history if it doesn't exist
  await pool.query(`
    ALTER TABLE app_issues ADD COLUMN IF NOT EXISTS nav_history JSONB
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE app_issues ADD COLUMN IF NOT EXISTS interactions JSONB
  `).catch(() => {});
}
ensureTable().catch(err => console.error("issues ensureTable:", err));

interface InteractionEvent {
  page: string;
  component: string;
  action: string;
  detail?: string;
  timestamp: string;
}

async function logIssue(page: string, element: string, description: string, navHistory?: NavHistoryEntry[], interactions?: InteractionEvent[]) {
  const { rows } = await pool.query(
    `INSERT INTO app_issues (page, element, description, nav_history, interactions) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [page || '', element || '', description, navHistory ? JSON.stringify(navHistory) : null, interactions ? JSON.stringify(interactions) : null]
  );
  return rows[0];
}

interface NavHistoryEntry {
  page: string;
  timestamp: string;
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
Games can be: active (in the backlog), "on hold" (paused), or "completed". A game becomes active automatically when it has logged sessions and is neither on hold nor completed.

BACKEND ROUTE MAP (api-server/src/routes/) — SQL queries live inside these TypeScript route handlers:
- quests.ts       → /api/quests/suggested, /api/quests/active, /api/quests/logs, quest generation
- pauses.ts       → /api/paused/:game (toggle pause; also archives quests on pause)
- logEntries.ts   → /api/logs (CRUD for play sessions / log entries)
- games.ts        → /api/games (game list, status, platforms)
- completions.ts  → /api/completions (mark/unmark completed)
- coachCard.ts    → /api/ai/coach-card (AI nightly recommendation)
- companion.ts    → /api/companion/chat (AI companion chat)
- health.ts       → /api/backlog-health (backlog stats)
- dailyPlan.ts    → /api/daily-plan (session planner)
- goals.ts        → /api/goals
- reports.ts      → /api/reports
Data filtering bugs (wrong items showing, items not disappearing, counts being off) almost always mean a missing SQL WHERE condition, a missing JOIN against a state table (e.g. game_pauses, completions), or a missing side-effect UPDATE/DELETE in a mutation route.`;

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

// ---------------------------------------------------------------------------
// Code diagnosis: for issues that look like real bugs, point at the likely
// source file/lines and propose a fix to REVIEW. Read-only — never edits files.
// ---------------------------------------------------------------------------

export interface CodeDiagnosis {
  file: string;
  startLine: number;
  endLine: number;
  cause: string;
  currentCode: string;
  proposedCode: string;
  explanation: string;
  confidence: 'low' | 'medium' | 'high';
}

function findWorkspaceRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const WORKSPACE_ROOT = findWorkspaceRoot();
const SOURCE_ROOTS = [
  'artifacts/gaming-quest/src',
  'artifacts/api-server/src',
]
  .map(r => path.join(WORKSPACE_ROOT, r))
  .filter(p => fs.existsSync(p));

// Both frontend and backend source roots are allowed for auto-apply.
const APPLY_ROOTS = SOURCE_ROOTS;

function listSourceFiles(): string[] {
  const out: string[] = [];
  const exts = new Set(['.ts', '.tsx']);
  const skipDirs = new Set(['node_modules', 'dist', 'build', '.vite', 'coverage']);
  for (const root of SOURCE_ROOTS) {
    const stack = [root];
    while (stack.length) {
      const cur = stack.pop()!;
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        const full = path.join(cur, e.name);
        if (e.isDirectory()) {
          if (!skipDirs.has(e.name)) stack.push(full);
        } else if (exts.has(path.extname(e.name)) && !e.name.endsWith('.d.ts')) {
          out.push(path.relative(WORKSPACE_ROOT, full));
        }
      }
    }
  }
  return out.sort();
}

// Reads a file ONLY if it resolves inside an allowed source root (no traversal).
function safeReadSource(relPath: string): string | null {
  const full = path.resolve(WORKSPACE_ROOT, relPath);
  if (!SOURCE_ROOTS.some(root => full === root || full.startsWith(root + path.sep))) return null;
  try {
    const stat = fs.statSync(full);
    if (!stat.isFile() || stat.size > 200_000) return null;
    return fs.readFileSync(full, 'utf8');
  } catch { return null; }
}

function numberLines(content: string, max = 900): string {
  const lines = content.split('\n');
  const body = lines.slice(0, max).map((l, i) => `${i + 1}\t${l}`).join('\n');
  return lines.length > max ? `${body}\n… (${lines.length - max} more lines truncated)` : body;
}

const normalizeWs = (s: string) => s.replace(/\s+/g, ' ').trim();

async function diagnoseCode(
  ctx: { page: string; element: string; description: string; navHistory?: NavHistoryEntry[]; interactions?: InteractionEvent[] },
  model: string,
  maxTokens: number,
): Promise<CodeDiagnosis[]> {
  const files = listSourceFiles();
  if (!files.length) return [];

  // Step 1 — locate the most relevant file(s).
  const locateSys = `You are a senior engineer for the "Gaming Quest Dashboard" codebase. Given a bug report and a list of source files, pick the 1-3 files MOST likely to contain the cause. Reply with STRICT JSON only: {"files":["relative/path.tsx"]}. Only choose paths from the provided list, copied EXACTLY.

Routing guidance:
- UI rendering / layout / interaction bugs → frontend component in artifacts/gaming-quest/src/components/
- Data filtering bugs (wrong items showing, items not disappearing, counts off) → backend route in artifacts/api-server/src/routes/ (e.g. quests.ts, pauses.ts, logEntries.ts)
- State mutation not persisting or not triggering side-effects → backend mutation route (POST/PUT/DELETE handler)
- Frontend and backend are BOTH suspect when data appears wrong in the UI — include both if unsure.`;
  const navLines = ctx.navHistory && ctx.navHistory.length
    ? `\nNAVIGATION HISTORY (last visited):\n${ctx.navHistory.map((h, i) => `  ${i + 1}. ${h.page} @ ${h.timestamp}`).join('\n')}`
    : '';
  const interactionLines = ctx.interactions && ctx.interactions.length
    ? `\nRECENT INTERACTIONS:\n${ctx.interactions.map((h, i) => `  ${i + 1}. ${h.component} — ${h.action}${h.detail ? ` (${h.detail})` : ''} @ ${h.timestamp}`).join('\n')}`
    : '';
  const locateUser = `${APP_GUIDE}${navLines}${interactionLines}\n\nSOURCE FILES:\n${files.join('\n')}\n\nBUG REPORT:\n  Page: ${ctx.page || '(unknown)'}\n  Element: ${ctx.element || '(none)'}\n  Description: ${ctx.description}`;

  const locateRes = await aiForRoute('issue-diagnosis').chat.completions.create({
    model,
    max_completion_tokens: 300,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: locateSys },
      { role: 'user', content: locateUser },
    ],
  });

  let chosen: string[] = [];
  try {
    const p = JSON.parse(locateRes.choices[0]?.message?.content ?? '{}');
    if (Array.isArray(p.files)) {
      chosen = p.files.filter((f: any) => typeof f === 'string' && files.includes(f)).slice(0, 3);
    }
  } catch { /* ignore */ }
  if (!chosen.length) return [];

  // Cap total prompt size so diagnosis cost/latency stays bounded as the codebase grows.
  const MAX_CONTEXT_CHARS = 60_000;
  const fileBlocks: string[] = [];
  let budget = MAX_CONTEXT_CHARS;
  for (const rel of chosen) {
    const content = safeReadSource(rel);
    if (content == null) continue;
    const block = `===== FILE: ${rel} =====\n${numberLines(content)}`;
    if (block.length > budget && fileBlocks.length > 0) break;
    fileBlocks.push(block.slice(0, budget));
    budget -= block.length;
    if (budget <= 0) break;
  }
  if (!fileBlocks.length) return [];

  // Step 2 — diagnose and propose ALL related changes.
  const diagSys = `You are a senior engineer diagnosing a bug in the "Gaming Quest Dashboard". You are given the full content of the most relevant source file(s), each line prefixed with its line number and a tab, plus a bug report. Identify ALL code locations that need fixing — every place the same root cause manifests — and propose a MINIMAL change for each.
Reply with STRICT JSON only:
{
  "found": true | false,
  "fixes": [
    {
      "file": "exact relative path from the provided files",
      "startLine": <first line number of the snippet>,
      "endLine": <last line number of the snippet>,
      "currentCode": "the exact existing code for those lines, WITHOUT the line-number prefixes",
      "proposedCode": "the replacement code for those lines",
      "cause": "1-2 sentence plain-English root cause for this location",
      "explanation": "1-3 sentences on why this change fixes it",
      "confidence": "low" | "medium" | "high"
    }
  ]
}
Set found=false if you cannot localize a concrete code-level cause. Include every affected location — do not stop at the first one. Each fix must be a separate non-overlapping snippet. Keep each snippet small and focused. currentCode must match the file exactly (minus line numbers). Never fabricate code that is not present in the file shown.

IMPORTANT — SQL query bugs to look for in backend route files:
- Missing WHERE/JOIN filter: a SELECT returns rows it should exclude (e.g. paused games, completed items). Fix: add AND game NOT IN (SELECT game FROM state_table) or a JOIN.
- Missing side-effect on mutation: a POST/PUT/DELETE changes one table but forgets to update a related table (e.g. pausing a game should also archive its suggested quests). Fix: add the missing UPDATE/DELETE after the primary mutation.
- Wrong status filter: a query uses status='X' but should also include or exclude another status value.
These are just as fixable as TypeScript bugs — propose the SQL change inside the pool.query(\`...\`) string.`;
  const diagUser = `BUG REPORT:\n  Page: ${ctx.page || '(unknown)'}\n  Element: ${ctx.element || '(none)'}\n  Description: ${ctx.description}${navLines}${interactionLines}\n\n${fileBlocks.join('\n\n')}`;

  const diagRes = await aiForRoute('issue-diagnosis').chat.completions.create({
    model,
    max_completion_tokens: maxTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: diagSys },
      { role: 'user', content: diagUser },
    ],
  });

  let parsed: any = null;
  try { parsed = JSON.parse(diagRes.choices[0]?.message?.content ?? '{}'); } catch { return []; }
  if (!parsed || typeof parsed !== 'object' || parsed.found === false) return [];

  const rawFixes: any[] = Array.isArray(parsed.fixes) ? parsed.fixes : [];
  const results: CodeDiagnosis[] = [];

  for (const d of rawFixes) {
    if (!d || typeof d !== 'object') continue;
    if (typeof d.file !== 'string' || !chosen.includes(d.file)) continue;
    const startLine = Number(d.startLine);
    const endLine = Number(d.endLine);
    if (!Number.isFinite(startLine) || !Number.isFinite(endLine) || startLine < 1 || endLine < startLine) continue;
    if (typeof d.currentCode !== 'string' || typeof d.proposedCode !== 'string') continue;
    if (!d.currentCode.trim() || !d.proposedCode.trim()) continue;

    // Anti-hallucination guard: the claimed "current code" must actually exist in the file.
    const fileContent = safeReadSource(d.file) ?? '';
    if (!normalizeWs(fileContent).includes(normalizeWs(d.currentCode))) continue;

    // Use the actual lines from the file (by startLine/endLine) as currentCode so the
    // apply-fix exact-match is guaranteed to succeed even if the AI returned slightly
    // different whitespace/indentation than what's really in the file.
    const fileLines = fileContent.split('\n');
    const extractedCode = fileLines.slice(startLine - 1, endLine).join('\n');
    const currentCode = (
      extractedCode.trim() &&
      normalizeWs(extractedCode).includes(normalizeWs(d.currentCode.trim().split('\n')[0]))
    ) ? extractedCode : d.currentCode;

    const confidence = d.confidence === 'high' || d.confidence === 'low' ? d.confidence : 'medium';
    results.push({
      file: d.file,
      startLine,
      endLine,
      cause: typeof d.cause === 'string' ? d.cause.slice(0, 400) : '',
      currentCode: currentCode.slice(0, 2000),
      proposedCode: d.proposedCode.slice(0, 2000),
      explanation: typeof d.explanation === 'string' ? d.explanation.slice(0, 500) : '',
      confidence,
    });
  }

  return results;
}

// Best-effort: never throw, gated behind its own feature toggle.
async function maybeDiagnose(ctx: { page: string; element: string; description: string; navHistory?: NavHistoryEntry[]; interactions?: InteractionEvent[] }): Promise<CodeDiagnosis[]> {
  try {
    const cfg = await getConfig('issue-diagnosis');
    if (!cfg.enabled) return [];
    return await diagnoseCode(ctx, cfg.model, cfg.max_tokens);
  } catch (err) {
    console.error("issue diagnosis error:", err);
    return [];
  }
}

// POST /api/issues/triage — AI triage: troubleshoot, auto-fix, or log
function sanitizeNavHistory(raw: any): NavHistoryEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const entries = raw
    .filter((h: any) => h && typeof h.page === 'string' && typeof h.timestamp === 'string')
    .slice(0, 15)
    .map((h: any) => ({
      page: h.page.slice(0, 50),
      timestamp: h.timestamp.slice(0, 50),
    }));
  return entries.length > 0 ? entries : undefined;
}

function sanitizeInteractions(raw: any): InteractionEvent[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const entries = raw
    .filter((h: any) => h && typeof h.page === 'string' && typeof h.component === 'string' && typeof h.action === 'string')
    .slice(0, 30)
    .map((h: any) => ({
      page: h.page.slice(0, 50),
      component: h.component.slice(0, 50),
      action: h.action.slice(0, 50),
      detail: typeof h.detail === 'string' ? h.detail.slice(0, 100) : undefined,
      timestamp: typeof h.timestamp === 'string' ? h.timestamp.slice(0, 50) : '',
    }));
  return entries.length > 0 ? entries : undefined;
}

router.post("/issues/triage", async (req, res) => {
  const { page, element, description } = req.body as { page?: string; element?: string; description?: string; navHistory?: NavHistoryEntry[]; interactions?: InteractionEvent[] };
  const navHistory = sanitizeNavHistory(req.body.navHistory);
  const interactions = sanitizeInteractions(req.body.interactions);
  const desc = (description ?? '').trim();
  if (!desc) {
    res.status(400).json({ error: "description is required" });
    return;
  }
  if (desc.length > 4000) {
    res.status(400).json({ error: "Description is too long (max 4000 chars)" });
    return;
  }

  try {
    const { enabled, model, max_tokens } = await getConfig('issue-triage');

    if (!enabled) {
      const issue = await logIssue(page ?? '', element ?? '', desc, navHistory, interactions);
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

    const navLines = navHistory && navHistory.length
      ? `\nNAVIGATION HISTORY (last visited):\n${navHistory.map((h, i) => `  ${i + 1}. ${h.page} @ ${h.timestamp}`).join('\n')}`
      : '';

    const interactionLines = interactions && interactions.length
      ? `\nRECENT INTERACTIONS (what the user clicked/used):\n${interactions.map((h, i) => `  ${i + 1}. ${h.component} — ${h.action}${h.detail ? ` (${h.detail})` : ''} @ ${h.timestamp}`).join('\n')}`
      : '';

    const userMsg = `${stateLines}${navLines}${interactionLines}\n\nISSUE REPORT:\n  Page: ${page || '(unknown)'}\n  Element: ${element || '(none)'}\n  Description: ${desc}`;

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
      const issue = await logIssue(page ?? '', element ?? '', desc, navHistory, interactions);
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
      const issue = await logIssue(page ?? '', element ?? '', desc, navHistory, interactions);
      const diagnoses = await maybeDiagnose({ page: page ?? '', element: element ?? '', description: desc, navHistory, interactions });
      res.json({
        category: 'log',
        logged: true,
        issue,
        summary: summary || "Thanks — this looks like something to look into. It's been logged for review.",
        steps: [],
        fixes: [],
        diagnoses,
      });
      return;
    }

    res.json({ category, logged: false, summary, steps, fixes });
  } catch (err) {
    console.error("issue triage error:", err);
    try {
      const issue = await logIssue(page ?? '', element ?? '', desc, navHistory, interactions);
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
    const navHistory = sanitizeNavHistory(req.body.navHistory);
    const interactions = sanitizeInteractions(req.body.interactions);
    const { rows } = await pool.query(`
      INSERT INTO app_issues (page, element, description, nav_history, interactions)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [page || '', element || '', description, navHistory ? JSON.stringify(navHistory) : null, interactions ? JSON.stringify(interactions) : null]);
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

// Applies a single proposed diagnosis fix to a source file.
// Safe by construction: the file must resolve inside an allowed source root,
// and currentCode must match the file content EXACTLY exactly once.
router.post("/issues/apply-fix", async (req, res) => {
  try {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ ok: false, error: "Auto-apply is only available in the development environment. Re-deploy after applying the fix locally." });
    }
    const { file, currentCode, proposedCode } = req.body ?? {};
    if (typeof file !== "string" || typeof currentCode !== "string" || typeof proposedCode !== "string") {
      return res.status(400).json({ ok: false, error: "file, currentCode and proposedCode are required" });
    }
    if (!currentCode.trim()) {
      return res.status(400).json({ ok: false, error: "currentCode is empty" });
    }
    const isBackend = typeof file === "string" && file.includes("api-server");
    if (proposedCode.length > 8000) {
      return res.status(400).json({ ok: false, error: "Proposed change is too large to auto-apply — apply it manually." });
    }
    const full = path.resolve(WORKSPACE_ROOT, file);
    if (!APPLY_ROOTS.some(root => full === root || full.startsWith(root + path.sep))) {
      return res.status(403).json({ ok: false, error: "File is outside the allowed source roots — apply this change manually." });
    }
    const content = safeReadSource(file);
    if (content == null) {
      return res.status(404).json({ ok: false, error: "Could not read the target file" });
    }
    const occurrences = content.split(currentCode).length - 1;
    if (occurrences === 0) {
      return res.status(409).json({ ok: false, error: "The current code no longer matches the file exactly — apply it manually." });
    }
    if (occurrences > 1) {
      return res.status(409).json({ ok: false, error: "The current code appears multiple times — apply it manually to avoid ambiguity." });
    }
    const updated = content.replace(currentCode, proposedCode);
    fs.writeFileSync(full, updated, "utf8");
    return res.json({ ok: true, file, requiresRestart: isBackend });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
