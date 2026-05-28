import { pool } from '@workspace/db';
import { openai } from '@workspace/integrations-openai-ai-server';

const CREDITS_RE = /saw the credits|finished the game|completed the main.?run|rolled credits/i;

function monStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

function sunEnd(date: Date): Date {
  const d = monStart(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function generateWeeklyReport(triggerType: 'scheduled' | 'manual' = 'scheduled'): Promise<{ periodFrom: string; periodTo: string } | null> {
  const now = new Date();
  const weekStart = monStart(now);
  const weekEnd = sunEnd(now);
  const today = now.toISOString().slice(0, 10);

  // Avoid double-generation on the same calendar day (scheduled only — manual always runs)
  if (triggerType === 'scheduled') {
    const dup = await pool.query(
      `SELECT id FROM saved_reports WHERE trigger_type='scheduled' AND generated_at::date = $1`,
      [today]
    );
    if (dup.rows.length > 0) {
      console.log('Scheduler: report already generated today, skipping.');
      return null;
    }
  }

  // Fetch ALL logs (used for AI context); filter to target week separately for the report snapshot
  const logsResult = await pool.query(
    `SELECT timestamp, game, action, minutes, type FROM log_entries ORDER BY timestamp`
  );
  const allLogs = logsResult.rows as { timestamp: string; game: string; action: string; minutes: number; type: string }[];

  let weekLogs = allLogs.filter(l => {
    const d = new Date(l.timestamp);
    return d >= weekStart && d <= weekEnd;
  });

  // For manual triggers: if current week has no logs, fall back to most recent week with data
  if (!weekLogs.length && triggerType === 'manual') {
    if (!allLogs.length) {
      console.log('Scheduler: no logs at all — skipping.');
      return null;
    }
    const latest = new Date(allLogs[allLogs.length - 1].timestamp);
    weekStart.setTime(monStart(latest).getTime());
    weekEnd.setTime(sunEnd(latest).getTime());
    weekLogs = allLogs.filter(l => {
      const d = new Date(l.timestamp);
      return d >= weekStart && d <= weekEnd;
    });
    console.log(`Scheduler: no current-week logs; using most recent week (${fmtDate(weekStart)} – ${fmtDate(weekEnd)}) for manual report.`);
  }

  if (!weekLogs.length) {
    console.log('Scheduler: no logs for current week — skipping.');
    return null;
  }

  // Load completions + pauses for filtering
  const [compRows, pauseRows] = await Promise.all([
    pool.query('SELECT game FROM game_completions').catch(() => ({ rows: [] })),
    pool.query('SELECT game FROM game_pauses').catch(() => ({ rows: [] })),
  ]);
  const completedGames = new Set((compRows.rows as { game: string }[]).map(r => r.game));
  const pausedGames = new Set((pauseRows.rows as { game: string }[]).map(r => r.game));

  // Build per-game map using ALL logs for AI context, but only active-this-week games
  const weekGameSet = new Set(weekLogs.map(l => l.game));
  const allGameMap: Record<string, typeof allLogs> = {};
  allLogs.forEach(l => {
    if (!allGameMap[l.game]) allGameMap[l.game] = [];
    allGameMap[l.game].push(l);
  });

  const focusGames = Object.entries(allGameMap)
    .filter(([game, logs]) => {
      if (!weekGameSet.has(game)) return false; // only games played this week
      if (completedGames.has(game) || pausedGames.has(game)) return false;
      if (logs.some(l => CREDITS_RE.test(l.action))) return false;
      return true;
    })
    .slice(0, 5)
    .map(([game, logs]) => {
      const wm = weekLogs.filter(l => l.game === game).reduce((s, l) => s + l.minutes, 0);
      // Pass all sessions sorted most-recent-first so the AI has full history
      const allSessions = [...logs]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .map(l => ({ date: l.timestamp.slice(0, 10), action: l.action, minutes: l.minutes }));
      return {
        title: game,
        label: wm < 30 ? 'Light progress' : 'On track',
        sessions: allSessions,
      };
    });

  // Generate AI insights
  const aiInsights: Record<string, string> = {};
  for (const game of focusGames) {
    try {
      const lines = game.sessions.map(s => `  - ${s.date} (${s.minutes}m): ${s.action}`).join('\n');
      const resp = await openai.chat.completions.create({
        model: 'gpt-5.4',
        max_completion_tokens: 200,
        messages: [
          {
            role: 'system',
            content: "You are a sharp, knowledgeable gaming advisor. Given a player's recent session notes, write exactly ONE actionable sentence (max 35 words) for their next session. Rules: (1) You MAY use your knowledge of the game's mechanics, typical goals, and progression to give meaningful advice — but NEVER state or imply where the player currently is in the game unless their notes explicitly say so. (2) Prioritise anything specific mentioned in the notes. (3) Be concrete and game-specific, not generic. (4) No preamble.",
          },
          {
            role: 'user',
            content: `Game: ${game.title}\nStatus: ${game.label}\nRecent sessions:\n${lines || '  (no notes recorded)'}`,
          },
        ],
      });
      aiInsights[game.title] = resp.choices[0]?.message?.content?.trim() || 'Continue from your last session.';
    } catch {
      aiInsights[game.title] = 'Continue from your last session.';
    }
  }

  const title = `Week of ${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`;

  await pool.query(
    `INSERT INTO saved_reports (title, period_from, period_to, logs_json, ai_insights_json, trigger_type)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      title,
      weekStart.toISOString().slice(0, 10),
      weekEnd.toISOString().slice(0, 10),
      JSON.stringify(weekLogs),
      JSON.stringify(aiInsights),
      triggerType,
    ]
  );

  console.log(`Scheduler: ${triggerType === 'scheduled' ? 'auto-generated' : 'manually generated'} report "${title}"`);
  return {
    periodFrom: weekStart.toISOString().slice(0, 10),
    periodTo: weekEnd.toISOString().slice(0, 10),
  };
}

export { generateWeeklyReport };

export function startScheduler(): void {
  console.log('Scheduler: started (checks every 60s)');

  // Track the last date we fired so we never double-generate on the same calendar day
  let lastFiredDate = '';

  setInterval(async () => {
    try {
      const result = await pool.query(
        'SELECT day_of_week, hour, minute, enabled FROM report_schedule LIMIT 1'
      );
      if (!result.rows.length) return;
      const { day_of_week, hour, minute, enabled } = result.rows[0];
      if (!enabled) return;

      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);

      // Already fired today — skip
      if (lastFiredDate === todayStr) return;

      const scheduledMinutes = hour * 60 + minute;
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      // Fire if: right day AND current time has reached or passed scheduled time (within 2h window)
      if (
        now.getDay() === day_of_week &&
        nowMinutes >= scheduledMinutes &&
        nowMinutes < scheduledMinutes + 120
      ) {
        console.log('Scheduler: trigger time reached, generating report…');
        lastFiredDate = todayStr;
        await generateWeeklyReport();
      }
    } catch (err) {
      console.warn('Scheduler check error:', (err as Error)?.message);
    }
  }, 60_000);
}
