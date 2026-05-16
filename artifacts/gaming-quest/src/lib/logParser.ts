export type ActionType = 'progress' | 'complete' | 'rank-up' | 'purchase' | 'boss';

export interface LogEntry {
  id: string;
  timestamp: string;
  date: Date;
  game: string;
  action: string;
  minutes: number;
  type: ActionType;
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
  const al = action.toLowerCase();
  if (al.includes('bought')) return 'purchase';
  if (al.includes('rank') || al.includes('level')) return 'rank-up';
  if (al.includes('defeated') || al.includes('boss')) return 'boss';
  if (al.includes('completed') || al.includes('credits')) return 'complete';
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
      const [ts, game, action, minText, type] = parts;
      const date = parseDate(ts);
      const minutes = parseInt(String(minText).replace(/[^\d]/g, ''), 10);
      if (!date || !game || !action || isNaN(minutes)) return null;
      return {
        id: `${date.getTime()}-${i}`,
        timestamp: ts,
        date,
        game,
        action,
        minutes,
        type: normaliseType(type, action),
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
  status: 'Needs attention' | 'Light progress' | 'On track' | 'Completed or parked';
  note: string;
  wm: number;
}

export function nextWork(allLogs: LogEntry[]): NeedsWorkItem[] {
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
    'Completed or parked': 3,
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
      if (/credits|final boss|completed/i.test(lat.action)) {
        status = 'Completed or parked';
        note = 'A major milestone was recently completed.';
      }
      return { game, status, note, wm } as NeedsWorkItem;
    })
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.wm - b.wm)
    .slice(0, 6);
}

export function badgeFor(status: NeedsWorkItem['status']): ActionType {
  if (status === 'Needs attention') return 'boss';
  if (status === 'Light progress') return 'rank-up';
  if (status === 'Completed or parked') return 'complete';
  return 'progress';
}
