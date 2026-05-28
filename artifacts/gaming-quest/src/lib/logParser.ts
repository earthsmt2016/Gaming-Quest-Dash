export type ActionType = 'progress' | 'complete' | 'rank-up' | 'purchase' | 'boss';

export interface LogEntry {
  id: string;
  timestamp: string;
  date: Date;
  game: string;
  action: string;
  minutes: number;
  type: ActionType;
  screenshotPath?: string;
}

export const SAMPLE_LOGS = `2026-04-30 20:30 | Sonic Superstars | Bought the game and completed the first area. | 45 | purchase
2026-05-01 13:30 | Resident Evil 3 | Reached the sewers. | 25 | progress
2026-05-01 13:40 | Sonic Superstars | Cleared both acts for Bridge Island. | 55 | progress
2026-05-01 20:42 | Sonic Superstars | Completed Speed Jungle and Sky Temple; gained two additional Chaos Emeralds. | 70 | complete
2026-05-02 08:45 | Burnout Paradise Remastered | Earned the D License; three events remaining for the C License. | 30 | progress
2026-05-02 09:03 | Sonic x Shadow Generations | Completed Crisis City (7th area) and started Rooftop Run (8th area). | 60 | progress
2026-05-05 19:00 | Sonic x Shadow Generations | Completed Rooftop Run (8th area) and Planet Wisp (9th area). | 30 | complete
2026-05-07 19:00 | Sonic x Shadow Generations | Obtained the last 3 boss keys. | 30 | boss
2026-05-09 11:35 | Sonic x Shadow Generations | Defeated the final boss, got the last Chaos Emerald, defeated Time Eater with S rank, and saw the credits. | 60 | complete
2026-05-09 20:00 | Shadow Generations | Completed Space Colony ARK Acts 1 and 2. | 20 | complete
2026-05-09 20:30 | Shadow Generations | Completed Rail Canyon Act 1. | 15 | progress
2026-05-12 21:00 | Tekken 8 | Reached overall level 15 and started playing as Homelander and Kano. | 45 | rank-up
2026-05-12 21:00 | Rise of the Tomb Raider | Defeated the bear. | 35 | boss
2026-05-12 21:00 | Rayman Legends | Passed 200 Teensies and completed the first 3 areas. | 70 | complete
2026-05-12 21:00 | Mario Kart Tour | Ranked up from 33 to 34 and finished 2nd on a strong leaderboard. | 30 | rank-up
2026-05-13 22:26 | Mario Kart Tour | Took 1st place with just under 26k points, with 6 days left in the tour. | 60 | rank-up
2026-05-13 23:00 | Tekken 8 | Reached overall level 16 and continued playing Homelander, who feels especially fun to use. | 15 | progress`;

function normaliseType(t: string, action: string): ActionType {
  const s = (t || '').trim().toLowerCase();
  const validTypes: ActionType[] = ['progress', 'complete', 'rank-up', 'purchase', 'boss'];
  if (validTypes.includes(s as ActionType)) return s as ActionType;

  // Map common category labels users write in the 3rd pipe field
  const categoryMap: Record<string, ActionType> = {
    'final boss': 'boss', 'boss fight': 'boss', 'boss battle': 'boss',
    'keys collected': 'boss', 'boss key': 'boss',
    'new game': 'purchase', 'purchased': 'purchase',
    'level up': 'rank-up', 'ranked match': 'rank-up', 'rank up': 'rank-up',
    'score push': 'rank-up', 'morning session': 'rank-up',
    'story progress': 'progress', 'license progress': 'progress',
    'collectibles': 'progress', 'exploration': 'progress',
    'credits': 'complete', 'ending': 'complete',
  };

  // Check action text — strong completion signals always override the category label.
  // e.g. "Final Boss | ...saw the credits" should be 'complete', not 'boss'.
  const al = action.toLowerCase();
  if (/saw the credits|finished the game|completed the main.?run|rolled credits/.test(al)) return 'complete';
  if (al.includes('bought') || al.includes('purchased') || al.includes('new game')) return 'purchase';
  if (al.includes('rank') || al.includes('level') || al.includes('tier') || al.includes('score push')) return 'rank-up';
  if (al.includes('defeated') || al.includes('boss') || al.includes('key')) return 'boss';
  if (al.includes('credits')) return 'complete';
  return 'progress';
}

function parseDate(ts: string): Date | null {
  const d = new Date(ts.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

export function parseRaw(raw: string): LogEntry[] {
  return raw
    .split(/\n+/)
    .map(l => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const parts = line.includes('|')
        ? line.split('|').map(s => s.trim())
        : line.split(',').map(s => s.trim());
      if (parts.length < 4) return null;

      let ts: string, game: string, action: string, minutes: number, typeHint: string;

      if (parts.length >= 5) {
        // Original format: timestamp | game | action | minutes | type
        [ts, game, action] = parts;
        typeHint = parts[4] ?? '';
        minutes = parseInt(String(parts[3]).replace(/[^\d]/g, ''), 10);
      } else {
        // Natural format: timestamp | game | category | description (N min)
        // e.g. 2026-05-15 21:28 | Mario Kart Tour | Score Push | Improved score to 28,079. (30 min)
        [ts, game, typeHint] = parts;
        const descField = parts[3];
        // Extract minutes from trailing "(N min)" pattern
        const minMatch = descField.match(/\((\d+)\s*min\)\s*$/i);
        if (!minMatch) return null;
        minutes = parseInt(minMatch[1], 10);
        // Strip the "(N min)" suffix to get the clean action text
        action = descField.replace(/\s*\(\d+\s*min\)\s*$/i, '').trim();
      }

      const date = parseDate(ts);
      if (!date || !game || !action || isNaN(minutes) || minutes < 0) return null;
      return {
        id: `${date.getTime()}-${i}`,
        timestamp: ts,
        date,
        game,
        action,
        minutes,
        type: normaliseType(typeHint, action),
      } as LogEntry;
    })
    .filter((x): x is LogEntry => x !== null);
}

export function dedupe(logs: LogEntry[]): LogEntry[] {
  const seen = new Set<string>();
  return logs.filter(l => {
    const k = `${l.timestamp}|${l.game}|${l.action}|${l.minutes}|${l.type}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function monStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function sunEnd(date: Date): Date {
  const d = monStart(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d);
}

export function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export function labelType(t: string): string {
  return t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export interface Summary {
  total: number;
  games: number;
  bullets: string[];
}

export function summarise(logs: LogEntry[]): Summary {
  const total = logs.reduce((s, l) => s + l.minutes, 0);
  const games = new Set(logs.map(l => l.game)).size;
  const byGame: Record<string, { min: number; cnt: number }> = {};
  logs.forEach(l => {
    if (!byGame[l.game]) byGame[l.game] = { min: 0, cnt: 0 };
    byGame[l.game].min += l.minutes;
    byGame[l.game].cnt += 1;
  });
  const ranked = Object.entries(byGame).sort((a, b) => b[1].min - a[1].min);
  const bullets: string[] = [];
  if (ranked[0]) {
    bullets.push(`${ranked[0][0]} led with ${ranked[0][1].min} minutes across ${ranked[0][1].cnt} session${ranked[0][1].cnt > 1 ? 's' : ''}.`);
  }
  const comps = logs.filter(l => ['complete', 'boss'].includes(l.type)).length;
  if (comps) bullets.push(`${comps} major milestone ${comps === 1 ? 'entry was' : 'entries were'} logged.`);
  const rups = logs.filter(l => l.type === 'rank-up').length;
  if (rups) bullets.push(`${rups} competitive progress ${rups === 1 ? 'entry' : 'entries'} recorded.`);
  if (games > 2) bullets.push(`${games} different games were active during this period.`);
  return { total, games, bullets };
}

export interface NeedsWorkItem {
  game: string;
  status: 'Needs attention' | 'Light progress' | 'On track' | 'On hold' | 'Completed or parked';
  note: string;
  wm: number;
}

export function nextWork(
  allLogs: LogEntry[],
  manualCompletions: Set<string> = new Set(),
  paused: Set<string> = new Set(),
): NeedsWorkItem[] {
  const cut = new Date();
  cut.setDate(cut.getDate() - 28);
  const recent = allLogs.filter(l => l.date >= cut);
  const weekStart = monStart(new Date());
  const weekEnd = sunEnd(new Date());
  const week = allLogs.filter(l => l.date >= weekStart && l.date <= weekEnd);

  const ORDER: Record<string, number> = {
    'Needs attention': 0,
    'Light progress': 1,
    'On track': 2,
    'On hold': 3,
    'Completed or parked': 4,
  };

  const games = [...new Set(recent.map(l => l.game))];
  return games
    .map(game => {
      const rel = recent.filter(l => l.game === game).sort((a, b) => b.date.getTime() - a.date.getTime());
      const wl = week.filter(l => l.game === game);
      const wm = wl.reduce((s, l) => s + l.minutes, 0);
      const lat = rel[0];
      let status: NeedsWorkItem['status'] = 'On track';
      let note = `Played ${wm} minutes this week.`;
      if (!wl.length) {
        status = 'Needs attention';
        note = `No sessions this week. Last touched ${formatDate(lat.date)}.`;
      } else if (wm < 30) {
        status = 'Light progress';
        note = `Only ${wm} min this week — good candidate for next session.`;
      }
      const CREDITS_RE = /saw the credits|finished the game|completed the main.?run|rolled credits/i;
      const isAutoDone = rel.some(l => CREDITS_RE.test(l.action));
      const isManualDone = manualCompletions.has(game);
      if (paused.has(game)) {
        status = 'On hold';
        note = 'Intentionally put down — resume when ready.';
      }
      if (isAutoDone || isManualDone) {
        status = 'Completed or parked';
        note = isManualDone && !isAutoDone
          ? 'Manually marked as completed.'
          : 'Game completed — credits rolled.';
      }
      return { game, status, note, wm } as NeedsWorkItem;
    })
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.wm - b.wm)
    .slice(0, 7);
}

export interface Recommendation {
  game: string;
  suggestedMinutes: number;
  priorityLabel: string;
  sessions: { date: string; action: string; minutes: number }[];
  reason: string;
  status: NeedsWorkItem['status'];
}

function roundToFive(n: number): number {
  return Math.max(5, Math.round(n / 5) * 5);
}

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

export function computeRecommendations(
  availableMinutes: number,
  allLogs: LogEntry[],
  manualCompletions: Set<string> = new Set(),
  paused: Set<string> = new Set(),
): Recommendation[] {
  if (!availableMinutes || !allLogs.length) return [];

  const cut = new Date();
  cut.setDate(cut.getDate() - 60);
  const recent = allLogs.filter(l => l.date >= cut);

  const weekStart = monStart(new Date());
  const weekEnd = sunEnd(new Date());
  const weekLogs = allLogs.filter(l => l.date >= weekStart && l.date <= weekEnd);

  const CREDITS_RE = /saw the credits|finished the game|completed the main.?run|rolled credits/i;

  // Build per-game stats for active games only
  const gameMap: Record<string, { lastDate: Date; weekMin: number; totalMin: number; sessions: number }> = {};
  recent.forEach(l => {
    if (!gameMap[l.game]) gameMap[l.game] = { lastDate: l.date, weekMin: 0, totalMin: 0, sessions: 0 };
    if (l.date > gameMap[l.game].lastDate) gameMap[l.game].lastDate = l.date;
    gameMap[l.game].totalMin += l.minutes;
    gameMap[l.game].sessions += 1;
  });
  weekLogs.forEach(l => {
    if (gameMap[l.game]) gameMap[l.game].weekMin += l.minutes;
  });

  const activeGames = Object.entries(gameMap).filter(([game]) => {
    if (paused.has(game)) return false;
    if (manualCompletions.has(game)) return false;
    const gameLogs = allLogs.filter(l => l.game === game);
    if (gameLogs.some(l => CREDITS_RE.test(l.action))) return false;
    return true;
  });

  if (!activeGames.length) return [];

  // Score: higher = needs more attention + strategic priority
  const scored = activeGames.map(([game, stats]) => {
    const days = daysSince(stats.lastDate);
    const weekPenalty = stats.weekMin === 0 ? 30 : stats.weekMin < 30 ? 10 : 0;

    // Strategic priority based on game type history
    const gameLogs = allLogs.filter(l => l.game === game);
    const types = new Set(gameLogs.map(l => l.type));
    const isCreditsRolled = gameLogs.some(l => CREDITS_RE.test(l.action));

    const latestGameLog = [...gameLogs].sort((a, b) => b.date.getTime() - a.date.getTime())[0];
    const atBoss = latestGameLog?.type === 'boss';

    let priorityBonus = 0;
    let priorityLabel = '';
    if (!isCreditsRolled) {
      if (atBoss) {
        priorityBonus = 100; priorityLabel = '🔥 Boss fight reached';
      } else if (types.has('purchase') && !types.has('progress')) {
        priorityBonus = 60; priorityLabel = '✨ Just started';
      } else if (types.has('progress') && !types.has('rank-up')) {
        priorityBonus = 50; priorityLabel = '📖 Active story run';
      } else if (types.has('rank-up') && (types.has('progress') || types.has('boss'))) {
        priorityBonus = 40; priorityLabel = '⚔️ Story unfinished';
      }
    }

    const score = days + weekPenalty + priorityBonus;
    return { game, stats, score, priorityLabel };
  }).sort((a, b) => b.score - a.score);

  // Decide how many games to recommend
  const maxGames = availableMinutes < 30 ? 1 : availableMinutes < 60 ? 2 : 3;
  const MIN_PER_GAME = 15;
  const picks: typeof scored = [];
  for (const candidate of scored) {
    if (picks.length >= maxGames) break;
    const remaining = availableMinutes - picks.reduce((s, p) => s + MIN_PER_GAME, 0);
    if (remaining >= MIN_PER_GAME) picks.push(candidate);
  }

  // Split time across picks
  const splits: number[] = [];
  if (picks.length === 1) {
    splits.push(availableMinutes);
  } else if (picks.length === 2) {
    const first = roundToFive(availableMinutes * 0.6);
    splits.push(first, availableMinutes - first);
  } else {
    const first = roundToFive(availableMinutes * 0.5);
    const second = roundToFive(availableMinutes * 0.3);
    splits.push(first, second, availableMinutes - first - second);
  }

  return picks.map((pick, i) => {
    const mins = Math.max(MIN_PER_GAME, splits[i] ?? MIN_PER_GAME);
    const days = daysSince(pick.stats.lastDate);

    let status: NeedsWorkItem['status'] = 'On track';
    let reason = '';

    const isBoss  = pick.priorityLabel.includes('Boss fight');
    const isNew   = pick.priorityLabel.includes('Just started');
    const isStory = pick.priorityLabel.includes('story run');
    const isComp  = pick.priorityLabel.includes('Competitive');

    if (pick.stats.weekMin === 0) {
      status = 'Needs attention';
      if (isBoss) {
        reason = `Boss fight stalled ${days} day${days === 1 ? '' : 's'} — get back in while the fight is fresh, before you lose context and have to re-learn the mechanics.`;
      } else if (isNew) {
        reason = `Just picked up — an early second session cements the habit. Leave it any longer and it risks becoming shelf dust.`;
      } else if (isStory) {
        reason = `Active story run with no sessions ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`} — jump back in to stay immersed and keep the narrative thread alive.`;
      } else if (isComp) {
        reason = `Competitive game neglected ${days === 0 ? 'today' : `for ${days} day${days === 1 ? '' : 's'}`} — mechanical skills rust quickly; even a short session maintains your level.`;
      } else {
        reason = days === 0
          ? `No session yet today — a great time to log some time and extend your streak.`
          : `${days} day${days === 1 ? '' : 's'} without a session — worth revisiting before momentum fully drops.`;
      }
    } else if (pick.stats.weekMin < 30) {
      status = 'Light progress';
      if (isBoss) {
        reason = `Boss fight active — only ${pick.stats.weekMin}m this week. A focused push now keeps your boss-fight rhythm sharp and gets you closer to the win.`;
      } else if (isStory) {
        reason = `Story run at ${pick.stats.weekMin}m this week — a longer session now helps maintain immersion and move the plot forward meaningfully.`;
      } else {
        reason = `Only ${pick.stats.weekMin}m this week — a short focused push would make a real difference and keep this from falling behind.`;
      }
    } else {
      // On track
      if (isBoss) {
        reason = `Boss fight in progress with ${pick.stats.weekMin}m this week — stay locked in and finish it while your skills and memory are at their sharpest.`;
      } else if (isStory) {
        reason = `Good story momentum at ${pick.stats.weekMin}m this week — keep pushing to reach the next chapter and maintain your narrative immersion.`;
      } else if (isComp) {
        reason = `Competitive streak active with ${pick.stats.weekMin}m this week — consistency is what separates ranked improvement from stalling.`;
      } else {
        reason = `${pick.stats.weekMin}m this week — solid momentum. Another session keeps the progress curve going upward.`;
      }
    }

    const sessions = [...allLogs.filter(l => l.game === pick.game)]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map(l => ({ date: l.timestamp.slice(0, 10), action: l.action, minutes: l.minutes }));

    return { game: pick.game, suggestedMinutes: mins, reason, status, priorityLabel: pick.priorityLabel, sessions };
  });
}

/** Returns the current consecutive-day play streak (days in a row with ≥1 log). */
export function computeStreak(logs: LogEntry[]): number {
  if (!logs.length) return 0;
  const days = new Set(logs.map(l => l.date.toDateString()));
  let streak = 0;
  const check = new Date();
  check.setHours(0, 0, 0, 0);
  // If today has no entry, start checking from yesterday so the streak isn't broken yet
  if (!days.has(check.toDateString())) {
    check.setDate(check.getDate() - 1);
  }
  while (days.has(check.toDateString())) {
    streak++;
    check.setDate(check.getDate() - 1);
  }
  return streak;
}

export function badgeFor(status: NeedsWorkItem['status']): ActionType {
  if (status === 'Needs attention') return 'boss';
  if (status === 'Light progress') return 'rank-up';
  if (status === 'On hold') return 'purchase';
  if (status === 'Completed or parked') return 'complete';
  return 'progress';
}
