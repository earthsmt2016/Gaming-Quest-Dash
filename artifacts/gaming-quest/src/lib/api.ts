import { LogEntry, parseRaw } from './logParser';
import { supabase, EDGE, EDGE_HEADERS } from './supabase';

export interface ApiLogRow {
  id: number;
  timestamp: string;
  game: string;
  action: string;
  minutes: number;
  type: string;
  screenshot_path?: string | null;
  created_at: string;
}

function rowToEntry(row: ApiLogRow): LogEntry | null {
  const fakeLog = `${row.timestamp} | ${row.game} | ${row.action} | ${row.minutes} | ${row.type}`;
  const parsed = parseRaw(fakeLog);
  if (!parsed.length) return null;
  return { ...parsed[0], id: String(row.id), screenshotPath: row.screenshot_path ?? undefined };
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export async function fetchLogs(): Promise<LogEntry[]> {
  const { data, error } = await supabase
    .from('log_entries')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as ApiLogRow[]).map(rowToEntry).filter((e): e is LogEntry => e !== null);
}

export async function saveLogs(entries: LogEntry[]): Promise<LogEntry[]> {
  const values = entries.map(e => ({
    timestamp: e.timestamp,
    game: e.game,
    action: e.action,
    minutes: e.minutes,
    type: e.type,
    screenshot_path: e.screenshotPath ?? null,
  }));
  const { data, error } = await supabase
    .from('log_entries')
    .insert(values)
    .select();
  if (error) throw new Error(error.message);
  return (data as ApiLogRow[]).map(rowToEntry).filter((e): e is LogEntry => e !== null);
}

export async function clearLogs(): Promise<void> {
  const { error } = await supabase.from('log_entries').delete().neq('id', 0);
  if (error) throw new Error(error.message);
}

export interface LogPatch {
  game?: string; action?: string; minutes?: number;
  type?: string; timestamp?: string; screenshotPath?: string | null;
}

export async function updateLog(id: string, patch: LogPatch): Promise<LogEntry> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.game !== undefined) dbPatch.game = patch.game;
  if (patch.action !== undefined) dbPatch.action = patch.action;
  if (patch.minutes !== undefined) dbPatch.minutes = patch.minutes;
  if (patch.type !== undefined) dbPatch.type = patch.type;
  if (patch.timestamp !== undefined) dbPatch.timestamp = patch.timestamp;
  if (patch.screenshotPath !== undefined) dbPatch.screenshot_path = patch.screenshotPath;
  const { data, error } = await supabase
    .from('log_entries')
    .update(dbPatch)
    .eq('id', Number(id))
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Entry not found');
  const entry = rowToEntry(data as ApiLogRow);
  if (!entry) throw new Error('Could not parse updated entry');
  return entry;
}

export async function deleteLog(id: string): Promise<void> {
  const { error } = await supabase.from('log_entries').delete().eq('id', Number(id));
  if (error) throw new Error(error.message);
}

// ─── Completions ──────────────────────────────────────────────────────────────

export async function fetchCompletions(): Promise<Set<string>> {
  try {
    const { data } = await supabase.from('game_completions').select('game');
    return new Set((data ?? []).map((r: { game: string }) => r.game));
  } catch { return new Set(); }
}

export async function toggleCompletion(game: string): Promise<boolean> {
  const { data } = await supabase
    .from('game_completions').select('game').eq('game', game).maybeSingle();
  if (data) {
    await supabase.from('game_completions').delete().eq('game', game);
    return false;
  } else {
    await supabase.from('game_completions').insert({ game });
    return true;
  }
}

// ─── Pauses ───────────────────────────────────────────────────────────────────

export async function fetchPaused(): Promise<Set<string>> {
  try {
    const { data } = await supabase.from('game_pauses').select('game');
    return new Set((data ?? []).map((r: { game: string }) => r.game));
  } catch { return new Set(); }
}

export async function togglePaused(game: string): Promise<boolean> {
  const { data } = await supabase
    .from('game_pauses').select('game').eq('game', game).maybeSingle();
  if (data) {
    await supabase.from('game_pauses').delete().eq('game', game);
    return false;
  } else {
    await supabase.from('game_pauses').insert({ game });
    return true;
  }
}

// ─── Platforms ────────────────────────────────────────────────────────────────

export async function fetchPlatforms(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.from('game_platforms').select('game, platform');
    return Object.fromEntries((data ?? []).map((r: { game: string; platform: string }) => [r.game, r.platform]));
  } catch { return {}; }
}

export async function setGamePlatform(game: string, platform: string): Promise<void> {
  await supabase.from('game_platforms').upsert({ game, platform, set_at: new Date().toISOString() });
}

// ─── Guides ───────────────────────────────────────────────────────────────────

export async function fetchGuides(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.from('game_guides').select('game, url');
    return Object.fromEntries((data ?? []).map((r: { game: string; url: string }) => [r.game, r.url]));
  } catch { return {}; }
}

export async function setGuide(game: string, url: string): Promise<void> {
  await supabase.from('game_guides').upsert({ game, url });
}

export async function deleteGuide(game: string): Promise<void> {
  await supabase.from('game_guides').delete().eq('game', game);
}

// ─── Report Schedule ──────────────────────────────────────────────────────────

export interface ReportSchedule { id: number | null; day_of_week: number; hour: number; minute: number; enabled: boolean; }

export async function fetchReportSchedule(): Promise<ReportSchedule> {
  const { data } = await supabase.from('report_schedule').select('*').limit(1).maybeSingle();
  return data ?? { id: null, day_of_week: 0, hour: 17, minute: 0, enabled: false };
}

export async function saveReportSchedule(s: Omit<ReportSchedule, 'id'>): Promise<ReportSchedule> {
  const existing = await fetchReportSchedule();
  if (existing.id) {
    const { data, error } = await supabase
      .from('report_schedule').update(s).eq('id', existing.id).select().maybeSingle();
    if (error) throw new Error(error.message);
    return data as ReportSchedule;
  } else {
    const { data, error } = await supabase
      .from('report_schedule').insert(s).select().maybeSingle();
    if (error) throw new Error(error.message);
    return data as ReportSchedule;
  }
}

// ─── Saved Reports ────────────────────────────────────────────────────────────

export interface SavedReportMeta { id: number; title: string; period_from: string; period_to: string; trigger_type: 'manual' | 'scheduled'; generated_at: string; log_count: number; game_count: number; playtime_mins: number; insight_count: number; options_json?: Record<string, unknown> | null; }
export interface SavedReportFull extends SavedReportMeta {
  logs_json: Array<{ timestamp: string; game: string; action: string; minutes: number; type: string }>;
  ai_insights_json: Record<string, string>;
  options_json: Record<string, unknown>;
}

export async function fetchSavedReports(): Promise<SavedReportMeta[]> {
  const { data } = await supabase
    .from('saved_reports')
    .select('id, title, period_from, period_to, trigger_type, generated_at, logs_json, ai_insights_json, options_json')
    .order('generated_at', { ascending: false });
  if (!data) return [];
  return (data as SavedReportFull[]).map(r => ({
    ...r,
    log_count: Array.isArray(r.logs_json) ? r.logs_json.length : 0,
    game_count: Array.isArray(r.logs_json) ? new Set(r.logs_json.map(l => l.game)).size : 0,
    playtime_mins: Array.isArray(r.logs_json) ? r.logs_json.reduce((s, l) => s + (l.minutes || 0), 0) : 0,
    insight_count: r.ai_insights_json ? Object.values(r.ai_insights_json).filter(v => v !== '').length : 0,
  }));
}

export async function fetchSavedReport(id: number): Promise<SavedReportFull> {
  const { data, error } = await supabase
    .from('saved_reports').select('*').eq('id', id).maybeSingle();
  if (error || !data) throw new Error('Failed to fetch report');
  return data as SavedReportFull;
}

export interface SaveReportPayload {
  title: string; period_from: string; period_to: string;
  logs_json: Array<{ timestamp: string; game: string; action: string; minutes: number; type: string }>;
  ai_insights_json: Record<string, string>;
  trigger_type?: 'manual' | 'scheduled';
}

export async function saveReport(payload: SaveReportPayload): Promise<SavedReportMeta> {
  const { data, error } = await supabase
    .from('saved_reports').insert({ ...payload, options_json: {} }).select().maybeSingle();
  if (error) throw new Error(error.message);
  return data as SavedReportMeta;
}

export async function patchReportInsights(id: number, ai_insights_json: Record<string, string>): Promise<void> {
  await supabase.from('saved_reports').update({ ai_insights_json }).eq('id', id);
}

export async function deleteReport(id: number): Promise<void> {
  const { error } = await supabase.from('saved_reports').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Edge Function calls (AI / YouTube) ──────────────────────────────────────

export interface ScreenshotAnalysis {
  game: string; action: string; type: string; minutes: number; confidence: number;
}

export async function analyzeScreenshot(
  imageBase64: string, mimeType: string, existingGames?: string[],
): Promise<ScreenshotAnalysis> {
  const res = await fetch(`${EDGE}/screenshot-analyze`, {
    method: 'POST', headers: EDGE_HEADERS,
    body: JSON.stringify({ imageBase64, mimeType, existingGames }),
  });
  if (!res.ok) throw new Error('Screenshot analysis failed');
  return res.json();
}

export async function requestUploadUrl(file: File): Promise<{ uploadURL: string; objectPath: string }> {
  const res = await fetch(`${EDGE}/storage-upload`, {
    method: 'POST', headers: EDGE_HEADERS,
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!res.ok) throw new Error('Failed to get upload URL');
  return res.json();
}

export async function uploadFile(file: File): Promise<string> {
  const { uploadURL, objectPath } = await requestUploadUrl(file);
  const putRes = await fetch(uploadURL, {
    method: 'PUT', headers: { 'Content-Type': file.type }, body: file,
  });
  if (!putRes.ok) throw new Error('Failed to upload file to storage');
  return objectPath;
}

export function screenshotUrl(objectPath: string): string {
  return `${EDGE}/storage-serve${objectPath}`;
}

export interface YouTubeVideo {
  id: string; title: string; thumbnail: string; duration: string; views: number;
}

export async function searchYouTubeGuides(game: string, hint?: string): Promise<YouTubeVideo[] | null> {
  const params = new URLSearchParams({ game });
  if (hint) params.set('hint', hint);
  const res = await fetch(`${EDGE}/youtube-guides?${params}`, { headers: EDGE_HEADERS });
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.unavailable) return null;
  return data as YouTubeVideo[];
}

export interface DailyPlanGame {
  title: string; daysSinceLastPlayed: number; minutesThisWeek: number;
  avgSessionMinutes: number; totalMinutesLogged: number; priorityLabel: string;
  recentSessions: { date: string; action: string; minutes: number }[];
}
export interface DailyPlanPick { game: string; minutes: number; why: string; }

export async function fetchDailyPlan(
  availableMinutes: number, dayOfWeek: string, games: DailyPlanGame[]
): Promise<DailyPlanPick[]> {
  const res = await fetch(`${EDGE}/daily-plan`, {
    method: 'POST', headers: EDGE_HEADERS,
    body: JSON.stringify({ availableMinutes, dayOfWeek, games }),
  });
  if (!res.ok) return [];
  return (await res.json()).picks ?? [];
}

export interface FocusGame {
  title: string; label: string;
  sessions: { date: string; action: string; minutes: number }[];
}

export async function fetchFocusInsights(games: FocusGame[]): Promise<{ title: string; nextStep: string }[]> {
  const res = await fetch(`${EDGE}/focus-insights`, {
    method: 'POST', headers: EDGE_HEADERS,
    body: JSON.stringify({ games }),
  });
  if (!res.ok) return [];
  return (await res.json()).insights ?? [];
}

export async function fetchReportPreview(): Promise<{ periodFrom: string; periodTo: string; isCurrentWeek: boolean } | null> {
  const res = await fetch(`${EDGE}/generate-report?preview=true`, { headers: EDGE_HEADERS });
  if (!res.ok) return null;
  return res.json();
}

export async function triggerReport(options?: Record<string, unknown>): Promise<{ periodFrom: string; periodTo: string }> {
  const res = await fetch(`${EDGE}/generate-report`, {
    method: 'POST', headers: EDGE_HEADERS,
    body: JSON.stringify({ options: options ?? {} }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || 'Generation failed');
  }
  return res.json();
}
