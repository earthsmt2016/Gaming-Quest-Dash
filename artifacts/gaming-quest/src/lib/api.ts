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

export async function fetchPlatforms(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${BASE}/platforms`);
    if (!res.ok) return {};
    const rows: { game: string; platform: string }[] = await res.json();
    return Object.fromEntries(rows.map(r => [r.game, r.platform]));
  } catch { return {}; }
}

export async function setGamePlatform(game: string, platform: string): Promise<void> {
  const res = await fetch(`${BASE}/platforms/${encodeURIComponent(game)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform }),
  });
  if (!res.ok) throw new Error('Failed to set platform');
}

export async function fetchUntaggedActiveGames(): Promise<string[]> {
  try {
    const res = await fetch(`${BASE}/platforms/active-untagged`);
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
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

export interface ActiveQuestContext {
  game: string;
  title: string;
  estimated_minutes: number;
  difficulty: string;
}

export async function fetchDailyPlan(
  availableMinutes: number,
  dayOfWeek: string,
  games: DailyPlanGame[],
  activeQuests?: ActiveQuestContext[],
  sessionMode?: string,
  platformMode?: string,
): Promise<DailyPlanPick[]> {
  const res = await fetch(`${BASE}/daily-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ availableMinutes, dayOfWeek, games, activeQuests, sessionMode, platformMode }),
  });
  if (!res.ok) return [];
  return (await res.json()).picks ?? [];
}

export interface WeeklyAIReview {
  narrative: string;
  highlights: string[];
  next_week_focus: string;
  mood: 'great' | 'good' | 'quiet' | 'mixed';
  total_minutes: number;
  session_count: number;
  games_played: number;
  quests_completed: number;
}

export async function fetchWeeklyAIReview(): Promise<WeeklyAIReview> {
  const res = await fetch(`${BASE}/ai/weekly-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error('Failed to generate weekly review');
  return res.json();
}

export async function fetchSubQuest(
  questId: number,
  availableMinutes: number
): Promise<{ title: string; goal: string; minutes: number }> {
  const res = await fetch(`${BASE}/quests/${questId}/sub-quest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ availableMinutes }),
  });
  if (!res.ok) throw new Error('sub-quest failed');
  return res.json();
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

// ─── Quests ───────────────────────────────────────────────────────────────────

export interface Quest {
  id: number;
  game: string;
  title: string;
  description: string;
  type: 'challenge' | 'exploration' | 'grind' | 'skill';
  difficulty: 'easy' | 'medium' | 'hard' | 'legendary';
  xp_reward: number;
  estimated_minutes: number;
  status: 'suggested' | 'active' | 'completed' | 'rejected' | 'archived';
  progress: number;
  target: number;
  ai_generated: boolean;
  reasoning?: string | null;
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  archived_at?: string | null;
}

export interface UserProfile {
  id: number;
  preferred_difficulty: string;
  preferred_types: string[];
  avoided_types: string[];
  avg_session_minutes: number;
  completion_rates: Record<string, { completed: number; rejected: number }>;
  personality_summary: string | null;
  updated_at: string;
}

export interface QuestLog {
  id: number;
  quest_id: number;
  game: string;
  title: string;
  xp_earned: number;
  time_taken_minutes: number;
  difficulty: string;
  completed_at: string;
}

export interface QuestVideoLink {
  id?: string;
  title: string;
  thumbnail?: string;
  duration?: string;
  url?: string;
}

export interface QuestGuide {
  id: number;
  quest_id: number;
  steps: string[];
  youtube_links: QuestVideoLink[];
  tips: string | null;
  generated_at: string;
}

export async function fetchSuggestedQuests(): Promise<Quest[]> {
  const res = await fetch(`${BASE}/quests/suggested`, { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchActiveQuests(): Promise<Quest[]> {
  const res = await fetch(`${BASE}/quests/active`, { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchQuestLogs(): Promise<QuestLog[]> {
  const res = await fetch(`${BASE}/quests/logs`);
  if (!res.ok) return [];
  return res.json();
}

export async function fetchGames(): Promise<string[]> {
  const res = await fetch(`${BASE}/games`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.games ?? [];
}

export async function triggerQuestRefresh(games?: string[]): Promise<void> {
  try {
    await fetch(`${BASE}/quests/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ games: games ?? [] }),
    });
  } catch { /* fire-and-forget, ignore errors */ }
}

export async function generateQuests(game?: string, count?: number, difficulty?: string, games?: string[]): Promise<{ quests: Quest[]; count: number }> {
  const res = await fetch(`${BASE}/quests/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game, count, difficulty, games }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || 'Generation failed');
  }
  return res.json();
}

// ─── Quest Mini Logs ──────────────────────────────────────────────────────────

export interface QuestMiniLog {
  id: number;
  quest_id: number;
  note: string;
  created_at: string;
}

export async function fetchMiniLogs(questId: number): Promise<QuestMiniLog[]> {
  try {
    const res = await fetch(`${BASE}/quests/${questId}/mini-logs`);
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

export async function addMiniLog(questId: number, note: string): Promise<QuestMiniLog> {
  const res = await fetch(`${BASE}/quests/${questId}/mini-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });
  if (!res.ok) throw new Error('Failed to add mini log');
  return res.json();
}

export async function deleteMiniLog(questId: number, logId: number): Promise<void> {
  await fetch(`${BASE}/quests/${questId}/mini-logs/${logId}`, { method: 'DELETE' });
}

export async function deleteQuest(id: number): Promise<void> {
  await fetch(`${BASE}/quests/${id}`, { method: 'DELETE' });
}

export async function fetchQuestRecommendations(minutes: number, games?: string[]): Promise<{ fitting: Quest[]; partial: Quest[] }> {
  try {
    let url = `${BASE}/quests/recommendations?minutes=${minutes}`;
    if (games && games.length > 0) url += `&games=${encodeURIComponent(games.join('|'))}`;
    const res = await fetch(url);
    if (!res.ok) return { fitting: [], partial: [] };
    return res.json();
  } catch { return { fitting: [], partial: [] }; }
}

export async function acceptQuest(id: number): Promise<Quest> {
  const res = await fetch(`${BASE}/quests/${id}/accept`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to accept quest');
  return res.json();
}

export async function rejectQuest(id: number): Promise<{ rejected: boolean; game: string; replacement: Quest | null }> {
  const res = await fetch(`${BASE}/quests/${id}/reject`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to reject quest');
  return res.json();
}

export async function updateQuestProgress(id: number, progress: number): Promise<Quest> {
  const res = await fetch(`${BASE}/quests/${id}/progress`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ progress }),
  });
  if (!res.ok) throw new Error('Failed to update progress');
  return res.json();
}

export async function completeQuest(id: number, time_taken_minutes?: number): Promise<{ quest: Quest; log: QuestLog }> {
  const res = await fetch(`${BASE}/quests/${id}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ time_taken_minutes: time_taken_minutes ?? 0 }),
  });
  if (!res.ok) throw new Error('Failed to complete quest');
  return res.json();
}

export async function fetchQuestGuide(id: number): Promise<QuestGuide> {
  const res = await fetch(`${BASE}/quests/${id}/guide`);
  if (!res.ok) throw new Error('Failed to fetch guide');
  return res.json();
}

export async function addVideoToGuide(questId: number, video: { id: string; title: string; thumbnail?: string; duration?: string }): Promise<QuestGuide> {
  const res = await fetch(`${BASE}/quests/${questId}/guide/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(video),
  });
  if (!res.ok) throw new Error('Failed to add video');
  return res.json();
}

export async function removeVideoFromGuide(questId: number, videoId: string): Promise<QuestGuide> {
  const res = await fetch(`${BASE}/quests/${questId}/guide/videos/${encodeURIComponent(videoId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to remove video');
  return res.json();
}

export async function submitQuestFeedback(id: number, rating: 1 | -1, comment?: string): Promise<void> {
  const res = await fetch(`${BASE}/quests/${id}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating, comment }),
  });
  if (!res.ok) throw new Error('Failed to save feedback');
}

export async function fetchUserProfile(): Promise<UserProfile | null> {
  try {
    const res = await fetch(`${BASE}/quests/profile`);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function rebuildUserProfile(): Promise<UserProfile | null> {
  try {
    const res = await fetch(`${BASE}/quests/profile/rebuild`, { method: 'POST' });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

// ─── AI Companion ─────────────────────────────────────────────────────────────

export interface CompanionMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export async function sendCompanionMessage(message: string, game?: string): Promise<{ reply: string }> {
  const res = await fetch(`${BASE}/companion/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, game: game ?? null }),
  });
  if (!res.ok) throw new Error('Failed to send message');
  return res.json();
}

export async function fetchCompanionHistory(game?: string): Promise<CompanionMessage[]> {
  try {
    const url = game ? `${BASE}/companion/history?game=${encodeURIComponent(game)}` : `${BASE}/companion/history`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

export async function clearCompanionHistory(game?: string): Promise<void> {
  const url = game ? `${BASE}/companion/history?game=${encodeURIComponent(game)}` : `${BASE}/companion/history`;
  await fetch(url, { method: 'DELETE' });
}

// ─── Game Progress ─────────────────────────────────────────────────────────────

export interface GameProgressRow {
  game: string;
  current_percentage: number;
  status: string;
  estimated_hours_remaining: number | null;
  notes: string | null;
  last_updated_at: string | null;
  total_minutes: number;
  session_count: number;
  last_played: string | null;
  milestone_count: number;
  milestones_completed: number;
}

export interface ProgressHistoryEntry {
  id: number;
  game: string;
  percentage: number;
  delta: number | null;
  notes: string | null;
  recorded_at: string;
}

export interface ProgressMilestone {
  id: number;
  game: string;
  title: string;
  description: string | null;
  category: string;
  completed_at: string | null;
  progress_value: number | null;
  created_at: string;
}

export interface GameProgressDetail extends GameProgressRow {
  history: ProgressHistoryEntry[];
  milestones: ProgressMilestone[];
  velocity_per_hour: number | null;
  estimated_completion_hours: number | null;
  estimated_completion_date: string | null;
  total_minutes_30d: number;
}

export async function fetchAllProgress(): Promise<GameProgressRow[]> {
  try {
    const res = await fetch(`${BASE}/progress`);
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

export async function fetchGameProgress(game: string): Promise<GameProgressDetail | null> {
  try {
    const res = await fetch(`${BASE}/progress/${encodeURIComponent(game)}`);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function updateGameProgress(
  game: string,
  data: { percentage: number; status?: string; estimated_hours_remaining?: number | null; notes?: string }
): Promise<GameProgressRow> {
  const res = await fetch(`${BASE}/progress/${encodeURIComponent(game)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update progress');
  return res.json();
}

export async function addMilestone(
  game: string,
  data: { title: string; description?: string; category?: string; progress_value?: number }
): Promise<ProgressMilestone> {
  const res = await fetch(`${BASE}/progress/${encodeURIComponent(game)}/milestone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add milestone');
  return res.json();
}

export async function deleteMilestone(game: string, id: number): Promise<void> {
  await fetch(`${BASE}/progress/${encodeURIComponent(game)}/milestone/${id}`, {
    method: 'DELETE',
  });
}

// ─── Goals ────────────────────────────────────────────────────────────────────

export interface Goal {
  id: number;
  game: string;
  title: string;
  description: string | null;
  goal_type: string;
  status: string;
  priority: string;
  progress_type: string;
  current_value: number;
  target_value: number;
  percentage: number;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
  update_count: number;
  last_updated: string | null;
}

export interface GoalSuggestion {
  title: string;
  description: string;
  goal_type: string;
  priority: string;
  progress_type: string;
  target_value: number;
  reason: string;
}

export interface GoalAnalytics {
  total: number;
  completed: number;
  in_progress: number;
  not_started: number;
  abandoned: number;
  completion_rate: number | null;
  avg_completion_hours: number | null;
  by_type: { goal_type: string; count: number; completed: number }[];
  longest_running: { title: string; game: string; days_running: number } | null;
}

export async function fetchGoals(filters?: { game?: string; status?: string }): Promise<Goal[]> {
  const params = new URLSearchParams();
  if (filters?.game)   params.set('game', filters.game);
  if (filters?.status) params.set('status', filters.status);
  const res = await fetch(`${BASE}/goals?${params}`);
  if (!res.ok) throw new Error('Failed to fetch goals');
  return res.json();
}

export async function createGoal(data: Partial<Goal> & { game: string; title: string }): Promise<Goal> {
  const res = await fetch(`${BASE}/goals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create goal');
  return res.json();
}

export async function updateGoal(id: number, data: Partial<Goal>): Promise<Goal> {
  const res = await fetch(`${BASE}/goals/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update goal');
  return res.json();
}

export async function updateGoalProgress(id: number, value: number, note?: string): Promise<Goal> {
  const res = await fetch(`${BASE}/goals/${id}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value, note }),
  });
  if (!res.ok) throw new Error('Failed to update goal progress');
  return res.json();
}

export async function deleteGoal(id: number): Promise<void> {
  await fetch(`${BASE}/goals/${id}`, { method: 'DELETE' });
}

export async function fetchGoalAnalytics(): Promise<GoalAnalytics> {
  const res = await fetch(`${BASE}/goals/analytics`);
  if (!res.ok) throw new Error('Failed to fetch goal analytics');
  return res.json();
}

export async function fetchAIGoalSuggestions(game: string): Promise<GoalSuggestion[]> {
  const res = await fetch(`${BASE}/ai/goal-suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game }),
  });
  if (!res.ok) throw new Error('Failed to fetch AI goal suggestions');
  const data = await res.json();
  return data.suggestions ?? [];
}

// ─── Game Knowledge ───────────────────────────────────────────────────────────

export interface KnowledgeMilestone {
  title: string;
  description: string;
  story_pct: number;
  full_pct: number;
  confidence: number;
}

export interface RemainingItem {
  title: string;
  description: string;
  category?: string;
}

export interface GameKnowledge {
  game: string;
  hasKnowledge: boolean;
  genre: string | null;
  story_summary: string | null;
  story_percentage: number;
  full_percentage: number;
  estimated_story_hours: number | null;
  estimated_full_hours: number | null;
  story_milestones: KnowledgeMilestone[];
  remaining_story: RemainingItem[];
  remaining_full: RemainingItem[];
  knowledge_source: string;
  confidence: number;
  generated_at: string | null;
  updated_at: string | null;
  pending: ProgressEstimate[];
  total_minutes_played: number;
  time_story_est: number | null;
  time_full_est: number | null;
}

export interface ProgressEstimate {
  id: number;
  game: string;
  trigger_type: string;
  trigger_context: string | null;
  story_pct_current: number;
  full_pct_current: number;
  story_pct_suggested: number;
  full_pct_suggested: number;
  milestone_reached: string | null;
  confidence: number;
  reasoning: string | null;
  status: string;
  created_at: string;
}

export async function fetchGameKnowledge(game: string): Promise<GameKnowledge> {
  const res = await fetch(`${BASE}/games/${encodeURIComponent(game)}/knowledge`);
  if (!res.ok) throw new Error('Failed to fetch game knowledge');
  return res.json();
}

export async function generateGameKnowledge(game: string): Promise<GameKnowledge> {
  const res = await fetch(`${BASE}/games/${encodeURIComponent(game)}/knowledge/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to generate game knowledge');
  return res.json();
}

export async function updateGameKnowledge(
  game: string,
  data: { story_percentage?: number; full_percentage?: number }
): Promise<GameKnowledge> {
  const res = await fetch(`${BASE}/games/${encodeURIComponent(game)}/knowledge`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update game knowledge');
  return res.json();
}

export async function inferGameProgress(game: string): Promise<{
  game: string; has_update: boolean; reasoning: string; confidence: number; suggestion?: ProgressEstimate;
}> {
  const res = await fetch(`${BASE}/games/${encodeURIComponent(game)}/progress/infer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to infer progress');
  return res.json();
}

export async function resolveProgressSuggestion(
  game: string,
  id: number,
  action: 'accept' | 'reject' | 'edit',
  overrides?: { story_pct?: number; full_pct?: number }
): Promise<{ ok: boolean; status: string }> {
  const res = await fetch(
    `${BASE}/games/${encodeURIComponent(game)}/progress/suggestions/${id}/resolve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...overrides }),
    }
  );
  if (!res.ok) throw new Error('Failed to resolve suggestion');
  return res.json();
}

export async function fetchPendingSuggestions(): Promise<ProgressEstimate[]> {
  const res = await fetch(`${BASE}/games/pending-suggestions`);
  if (!res.ok) throw new Error('Failed to fetch pending suggestions');
  return res.json();
}

export interface HealthSettings {
  console_neglect_days: number;
  console_rotation_limit: number;
  console_backlog_limit: number;
  mobile_neglect_days: number;
  mobile_rotation_limit: number;
  mobile_backlog_limit: number;
}

export async function fetchSettings(): Promise<HealthSettings> {
  const res = await fetch(`${BASE}/settings`);
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

export async function saveSettings(s: HealthSettings): Promise<HealthSettings> {
  const res = await fetch(`${BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s),
  });
  if (!res.ok) throw new Error('Failed to save settings');
  return res.json();
}

export interface Issue {
  id: number;
  page: string;
  element: string | null;
  description: string;
  status: string;
  created_at: string;
}

export async function createIssue(data: { page: string; element: string; description: string }): Promise<Issue> {
  const res = await fetch(`${BASE}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create issue');
  return res.json();
}

export type IssueFixType = 'put_on_hold' | 'remove_hold' | 'mark_complete';

export interface IssueFix {
  type: IssueFixType;
  game: string;
  label?: string;
  detail?: string;
}

export interface IssueTriage {
  category: 'self_serve' | 'auto_fix' | 'log';
  summary: string;
  steps: string[];
  fixes: IssueFix[];
  logged: boolean;
  issue?: Issue;
}

export async function triageIssue(data: { page: string; element: string; description: string }): Promise<IssueTriage> {
  const res = await fetch(`${BASE}/issues/triage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to triage issue');
  const raw = await res.json();
  return {
    category: raw.category ?? 'log',
    summary: raw.summary ?? '',
    steps: Array.isArray(raw.steps) ? raw.steps : [],
    fixes: Array.isArray(raw.fixes) ? raw.fixes : [],
    logged: Boolean(raw.logged),
    issue: raw.issue,
  };
}

export async function fetchIssues(): Promise<Issue[]> {
  const res = await fetch(`${BASE}/issues`);
  if (!res.ok) throw new Error('Failed to fetch issues');
  return res.json();
}

export async function resolveIssue(id: number, status: 'resolved' | 'open'): Promise<Issue> {
  const res = await fetch(`${BASE}/issues/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update issue');
  return res.json();
}

export async function deleteIssue(id: number): Promise<void> {
  const res = await fetch(`${BASE}/issues/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete issue');
}

export interface AiUsageSummary {
  today: { cost: string; calls: string; tokens: string };
  week: { cost: string; calls: string; tokens: string };
  month: { cost: string; calls: string; tokens: string };
  byRoute: { route: string; model: string; calls: string; cost: string; tokens: string }[];
  daily: { day: string; cost: string; calls: string }[];
  monthDaily: { day: string; cost: string; calls: string }[];
}

export async function fetchAiUsage(): Promise<AiUsageSummary> {
  const res = await fetch(`${BASE}/ai-usage`);
  if (!res.ok) throw new Error('Failed to fetch AI usage');
  return res.json();
}

export async function fetchAiUsageGbp(): Promise<AiUsageSummary> {
  const res = await fetch(`${BASE}/ai-usage/gbp`);
  if (!res.ok) throw new Error('Failed to fetch AI usage');
  return res.json();
}

export interface AiCostSettings {
  preset: 'low' | 'recommended' | 'max';
  overrides: Record<string, { model: string; max_tokens: number; enabled: boolean }>;
}

export async function fetchAiCostSettings(): Promise<AiCostSettings> {
  const res = await fetch(`${BASE}/ai-cost/settings`);
  if (!res.ok) throw new Error('Failed to fetch AI cost settings');
  return res.json();
}

export async function saveAiCostSettings(s: AiCostSettings): Promise<AiCostSettings> {
  const res = await fetch(`${BASE}/ai-cost/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s),
  });
  if (!res.ok) throw new Error('Failed to save AI cost settings');
  return res.json();
}

export async function saveAiCostFeature(name: string, cfg: { model?: string; max_tokens?: number; enabled?: boolean }): Promise<{ model: string; max_tokens: number; enabled: boolean }> {
  const res = await fetch(`${BASE}/ai-cost/feature/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
  if (!res.ok) throw new Error('Failed to save feature config');
  return res.json();
}
