import { LogEntry, parseRaw, dedupe } from './logParser';

const BASE = `${import.meta.env.BASE_URL}api`;

export interface ApiLogRow {
  id: number;
  timestamp: string;
  game: string;
  action: string;
  minutes: number;
  type: string;
  screenshotPath?: string | null;
  createdAt: string;
}

function rowToEntry(row: ApiLogRow): LogEntry | null {
  const fakeLog = `${row.timestamp} | ${row.game} | ${row.action} | ${row.minutes} | ${row.type}`;
  const parsed = parseRaw(fakeLog);
  if (!parsed.length) return null;
  return { ...parsed[0], id: String(row.id), screenshotPath: row.screenshotPath ?? undefined };
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
    screenshotPath: e.screenshotPath ?? null,
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

export interface LogPatch {
  game?: string;
  action?: string;
  minutes?: number;
  type?: string;
  timestamp?: string;
  screenshotPath?: string | null;
}

export async function updateLog(id: string, patch: LogPatch): Promise<LogEntry> {
  const res = await fetch(`${BASE}/logs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const j = await res.json(); detail += `: ${j.error || JSON.stringify(j)}`; } catch {}
    throw new Error(detail);
  }
  const row: ApiLogRow = await res.json();
  const entry = rowToEntry(row);
  if (!entry) throw new Error('Could not parse updated entry');
  return entry;
}

export async function deleteLog(id: string): Promise<void> {
  const res = await fetch(`${BASE}/logs/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete log entry');
}

// ─── Screenshot ───────────────────────────────────────────────────────────────

export interface ScreenshotAnalysis {
  game: string;
  action: string;
  type: string;
  minutes: number;
  confidence: number;
}

export async function analyzeScreenshot(
  imageBase64: string,
  mimeType: string,
  existingGames?: string[],
): Promise<ScreenshotAnalysis> {
  const res = await fetch(`${BASE}/screenshot-analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType, existingGames }),
  });
  if (!res.ok) throw new Error('Screenshot analysis failed');
  return res.json();
}

export async function requestUploadUrl(file: File): Promise<{ uploadURL: string; objectPath: string }> {
  const res = await fetch(`${BASE}/storage/uploads/request-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!res.ok) throw new Error('Failed to get upload URL');
  return res.json();
}

export async function uploadFile(file: File): Promise<string> {
  const { uploadURL, objectPath } = await requestUploadUrl(file);
  const putRes = await fetch(uploadURL, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!putRes.ok) throw new Error('Failed to upload file to storage');
  return objectPath;
}

export function screenshotUrl(objectPath: string): string {
  return `${BASE}/storage${objectPath}`;
}

// ─── Focus insights ───────────────────────────────────────────────────────────

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
  } catch { return new Set(); }
}

export async function toggleCompletion(game: string): Promise<boolean> {
  const res = await fetch(`${BASE}/completions/${encodeURIComponent(game)}`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to toggle completion');
  return (await res.json()).completed as boolean;
}

export async function fetchPaused(): Promise<Set<string>> {
  try {
    const res = await fetch(`${BASE}/paused`);
    if (!res.ok) return new Set();
    const data: string[] = await res.json();
    return new Set(data);
  } catch { return new Set(); }
}

export async function togglePaused(game: string): Promise<boolean> {
  const res = await fetch(`${BASE}/paused/${encodeURIComponent(game)}`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to toggle pause');
  return (await res.json()).paused as boolean;
}

export async function fetchGuides(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${BASE}/guides`);
    if (!res.ok) return {};
    const rows: { game: string; url: string }[] = await res.json();
    return Object.fromEntries(rows.map(r => [r.game, r.url]));
  } catch { return {}; }
}

export async function setGuide(game: string, url: string): Promise<void> {
  await fetch(`${BASE}/guides/${encodeURIComponent(game)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

export async function deleteGuide(game: string): Promise<void> {
  await fetch(`${BASE}/guides/${encodeURIComponent(game)}`, { method: 'DELETE' });
}

export interface YouTubeVideo {
  id: string; title: string; thumbnail: string; duration: string; views: number;
}

export async function searchYouTubeGuides(game: string, hint?: string): Promise<YouTubeVideo[] | null> {
  const url = new URL(`${BASE}/youtube-guides/${encodeURIComponent(game)}`);
  if (hint) url.searchParams.set('hint', hint);
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.unavailable) return null;
  return data as YouTubeVideo[];
}

// ─── Daily Plan ───────────────────────────────────────────────────────────────

export interface DailyPlanGame {
  title: string; daysSinceLastPlayed: number; minutesThisWeek: number;
  avgSessionMinutes: number; totalMinutesLogged: number; priorityLabel: string;
  recentSessions: { date: string; action: string; minutes: number }[];
}

export interface DailyPlanPick { game: string; minutes: number; why: string; }

export async function fetchDailyPlan(
  availableMinutes: number, dayOfWeek: string, games: DailyPlanGame[]
): Promise<DailyPlanPick[]> {
  const res = await fetch(`${BASE}/daily-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ availableMinutes, dayOfWeek, games }),
  });
  if (!res.ok) return [];
  return (await res.json()).picks ?? [];
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
  return (await res.json()).insights ?? [];
}

// ─── Saved Reports ────────────────────────────────────────────────────────────

export interface ReportSchedule { id: number | null; day_of_week: number; hour: number; minute: number; enabled: boolean; }
export interface SavedReportMeta { id: number; title: string; period_from: string; period_to: string; trigger_type: 'manual' | 'scheduled'; generated_at: string; log_count: number; game_count: number; playtime_mins: number; insight_count: number; }
export interface SavedReportFull extends SavedReportMeta {
  logs_json: Array<{ timestamp: string; game: string; action: string; minutes: number; type: string }>;
  ai_insights_json: Record<string, string>;
  options_json: Record<string, unknown>;
}

export async function fetchReportSchedule(): Promise<ReportSchedule> {
  const res = await fetch(`${BASE}/report-schedule`);
  if (!res.ok) return { id: null, day_of_week: 0, hour: 17, minute: 0, enabled: false };
  return res.json();
}

export async function saveReportSchedule(s: Omit<ReportSchedule, 'id'>): Promise<ReportSchedule> {
  const res = await fetch(`${BASE}/report-schedule`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s),
  });
  if (!res.ok) throw new Error('Failed to save schedule');
  return res.json();
}

export async function fetchSavedReports(): Promise<SavedReportMeta[]> {
  const res = await fetch(`${BASE}/saved-reports`);
  if (!res.ok) return [];
  return res.json();
}

export async function fetchSavedReport(id: number): Promise<SavedReportFull> {
  const res = await fetch(`${BASE}/saved-reports/${id}`);
  if (!res.ok) throw new Error('Failed to fetch report');
  return res.json();
}

export interface SaveReportPayload {
  title: string; period_from: string; period_to: string;
  logs_json: Array<{ timestamp: string; game: string; action: string; minutes: number; type: string }>;
  ai_insights_json: Record<string, string>;
  trigger_type?: 'manual' | 'scheduled';
}

export async function saveReport(payload: SaveReportPayload): Promise<SavedReportMeta> {
  const res = await fetch(`${BASE}/saved-reports`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save report');
  return res.json();
}

export async function fetchReportPreview(): Promise<{ periodFrom: string; periodTo: string; isCurrentWeek: boolean } | null> {
  const res = await fetch(`${BASE}/reports/generate-preview`);
  if (res.status === 422) return null;
  if (!res.ok) return null;
  return res.json();
}

export async function triggerReport(options?: Record<string, unknown>): Promise<{ periodFrom: string; periodTo: string }> {
  const res = await fetch(`${BASE}/reports/generate-now`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ options: options ?? {} }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || 'Generation failed');
  }
  return res.json();
}

export async function patchReportInsights(id: number, ai_insights_json: Record<string, string>): Promise<void> {
  await fetch(`${BASE}/saved-reports/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ai_insights_json }),
  });
}

export async function deleteReport(id: number): Promise<void> {
  const res = await fetch(`${BASE}/saved-reports/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete report');
}
