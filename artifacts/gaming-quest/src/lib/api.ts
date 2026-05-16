import { LogEntry, parseRaw, dedupe } from './logParser';

const BASE = `${import.meta.env.BASE_URL}api`;

export interface ApiLogRow {
  id: number;
  timestamp: string;
  game: string;
  action: string;
  minutes: number;
  type: string;
  createdAt: string;
}

function rowToEntry(row: ApiLogRow): LogEntry | null {
  const fakeLog = `${row.timestamp} | ${row.game} | ${row.action} | ${row.minutes} | ${row.type}`;
  const parsed = parseRaw(fakeLog);
  if (!parsed.length) return null;
  return { ...parsed[0], id: String(row.id) };
}

export async function fetchLogs(): Promise<LogEntry[]> {
  const res = await fetch(`${BASE}/logs`);
  if (!res.ok) throw new Error('Failed to fetch logs');
  const rows: ApiLogRow[] = await res.json();
  return rows.map(rowToEntry).filter((e): e is LogEntry => e !== null);
}

export async function saveLogs(entries: LogEntry[]): Promise<LogEntry[]> {
  const body = entries.map(e => ({
    timestamp: e.timestamp,
    game: e.game,
    action: e.action,
    minutes: e.minutes,
    type: e.type,
  }));
  const res = await fetch(`${BASE}/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const j = await res.json(); detail += `: ${j.error || j.detail || JSON.stringify(j)}`; } catch {}
    throw new Error(detail);
  }
  const rows: ApiLogRow[] = await res.json();
  return rows.map(rowToEntry).filter((e): e is LogEntry => e !== null);
}

export async function clearLogs(): Promise<void> {
  const res = await fetch(`${BASE}/logs`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to clear logs');
}

export interface FocusGame {
  title: string;
  label: string;
  sessions: { date: string; action: string; minutes: number }[];
}

export async function fetchCompletions(): Promise<Set<string>> {
  try {
    const res = await fetch(`${BASE}/completions`);
    if (!res.ok) return new Set();
    const data: string[] = await res.json();
    return new Set(data);
  } catch {
    return new Set();
  }
}

export async function toggleCompletion(game: string): Promise<boolean> {
  const res = await fetch(`${BASE}/completions/${encodeURIComponent(game)}`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to toggle completion');
  const data = await res.json();
  return data.completed as boolean;
}

export async function fetchFocusInsights(
  games: FocusGame[]
): Promise<{ title: string; nextStep: string }[]> {
  const res = await fetch(`${BASE}/focus-insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ games }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.insights ?? [];
}
