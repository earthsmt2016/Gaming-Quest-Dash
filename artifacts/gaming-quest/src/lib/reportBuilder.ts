import { LogEntry, formatDate, monStart, sunEnd } from './logParser';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReportTemplate = 'classic' | 'magazine' | 'compact' | 'minimal' | 'custom';
export type ReportTheme    = 'green' | 'blue' | 'purple' | 'slate' | 'crimson' | 'amber' | 'teal' | 'rose' | 'custom';
export type FontChoice     = 'inter' | 'georgia' | 'mono';
export type HeaderStyle    = 'banner' | 'siderule' | 'centered';

export interface ReportOptions {
  template:     ReportTemplate;
  theme:        ReportTheme;
  customColor:  string;
  fontChoice:   FontChoice;
  headerStyle:  HeaderStyle;
  showTable:    boolean;
  showInsights: boolean;
  showBreakdown:boolean;
  showFocus:    boolean;
}
export const DEFAULT_OPTIONS: ReportOptions = {
  template: 'classic', theme: 'green',
  customColor: '#e85d04',
  fontChoice: 'inter',
  headerStyle: 'banner',
  showTable: true, showInsights: true, showBreakdown: true, showFocus: true,
};

// ─── Theme colours ─────────────────────────────────────────────────────────────

interface ThemeColors { primary: string; dark: string; bg: string; bgLight: string; border: string; }
const THEMES: Record<ReportTheme, ThemeColors> = {
  green:   { primary: '#1a6b4a', dark: '#1a3d2b', bg: '#e6f4ef', bgLight: '#f0faf5', border: '#b7dfc8' },
  blue:    { primary: '#1565c0', dark: '#0d2b5e', bg: '#e3f2fd', bgLight: '#f0f7ff', border: '#a3c8f5' },
  purple:  { primary: '#7b1fa2', dark: '#3a0d5c', bg: '#f3e5f5', bgLight: '#faf0fd', border: '#d7a8e8' },
  slate:   { primary: '#455a64', dark: '#1c2830', bg: '#eceff1', bgLight: '#f5f7f8', border: '#b8c7cc' },
  crimson: { primary: '#c62828', dark: '#7f0000', bg: '#fce4e4', bgLight: '#fff5f5', border: '#f0a0a0' },
  amber:   { primary: '#e65100', dark: '#8d3200', bg: '#fbe9e7', bgLight: '#fff8f5', border: '#f4a87c' },
  teal:    { primary: '#00796b', dark: '#004d40', bg: '#e0f2f1', bgLight: '#f0faf9', border: '#80cbc4' },
  rose:    { primary: '#c2185b', dark: '#880e4f', bg: '#fce4ec', bgLight: '#fff5f8', border: '#f48fb1' },
  custom:  { primary: '#1a6b4a', dark: '#1a3d2b', bg: '#e6f4ef', bgLight: '#f0faf5', border: '#b7dfc8' },
};

function hexToRgb(hex: string): [number, number, number] {
  const h = (hex.startsWith('#') ? hex.slice(1) : hex).padEnd(6, '0');
  return [parseInt(h.slice(0,2),16)||0, parseInt(h.slice(2,4),16)||0, parseInt(h.slice(4,6),16)||0];
}

function buildCustomTheme(hex: string): ThemeColors {
  const [r, g, b] = hexToRgb(hex);
  const mix = (f: number) => {
    const n = (ch: number) => Math.round(255*(1-f) + ch*f).toString(16).padStart(2,'0');
    return `#${n(r)}${n(g)}${n(b)}`;
  };
  const darken = (f: number) => {
    const n = (ch: number) => Math.max(0, Math.min(255, Math.round(ch*f))).toString(16).padStart(2,'0');
    return `#${n(r)}${n(g)}${n(b)}`;
  };
  return { primary: hex, dark: darken(0.52), bg: mix(0.12), bgLight: mix(0.05), border: mix(0.32) };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m] ?? m));
}

function fmtMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtMinutesFull(mins: number): string {
  if (mins < 60) return `${mins} minutes`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${mins} minutes (${h} ${h === 1 ? 'hour' : 'hours'})`;
  return `${mins} minutes (${h}h ${m}m)`;
}

// ─── Data types ───────────────────────────────────────────────────────────────

export interface WeekSection {
  weekNum: number; start: Date; end: Date;
  logs: LogEntry[]; label: string; isCurrentWeek: boolean;
}

export type FocusItem = {
  title: string; priority: 'high' | 'medium' | 'low';
  label: string; sessions: { date: string; action: string; minutes: number }[];
};

type GameStats = { min: number; types: Set<string>; actions: string[]; entries: LogEntry[] };

const CREDITS_RE = /saw the credits|finished the game|completed the main.?run|rolled credits/i;

// ─── Data processing ──────────────────────────────────────────────────────────

export function splitIntoWeeks(logs: LogEntry[], from: Date, to: Date): WeekSection[] {
  if (!logs.length) return [];
  const earliest = new Date(Math.max(from.getTime(), Math.min(...logs.map(l => l.date.getTime()))));
  const latest   = new Date(Math.min(to.getTime(),   Math.max(...logs.map(l => l.date.getTime()))));
  const weeks: WeekSection[] = [];
  let cursor = monStart(earliest);
  let weekNum = 1;
  const today = new Date();
  while (cursor <= latest) {
    const wEnd = sunEnd(cursor);
    const cappedEnd = wEnd > to ? to : wEnd;
    const wLogs = logs.filter(l => l.date >= cursor && l.date <= cappedEnd)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    if (wLogs.length > 0) {
      weeks.push({ weekNum, start: new Date(cursor), end: new Date(cappedEnd), logs: wLogs,
        label: `Week ${weekNum}`, isCurrentWeek: today >= cursor && today <= wEnd });
      weekNum++;
    }
    cursor = new Date(wEnd.getTime() + 1);
  }
  return weeks;
}

function byGameStats(logs: LogEntry[]): Record<string, GameStats> {
  const map: Record<string, GameStats> = {};
  for (const l of logs) {
    if (!map[l.game]) map[l.game] = { min: 0, types: new Set(), actions: [], entries: [] };
    map[l.game].min += l.minutes;
    map[l.game].types.add(l.type);
    map[l.game].actions.push(l.action);
    map[l.game].entries.push(l);
  }
  return map;
}

function typeLabel(type: string): string {
  return ({ progress: 'Progress', complete: 'Complete', boss: 'Boss',
    'rank-up': 'Rank Up', purchase: 'New Game' } as Record<string, string>)[type] ?? type;
}

function isFullyCompleted(d: { types: Set<string>; actions: string[] }): boolean {
  return d.types.has('complete') || d.actions.some(a => CREDITS_RE.test(a));
}

function isCompetitive(d: { types: Set<string> }): boolean {
  return d.types.has('rank-up') && !d.types.has('progress') && !d.types.has('complete')
    && !d.types.has('boss') && !d.types.has('purchase');
}

function lastSessions(d: { entries: LogEntry[] }) {
  return [...d.entries]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map(e => ({ date: formatDate(e.date), action: e.action, minutes: e.minutes }));
}

function weekNarrative(section: WeekSection): string {
  const { logs } = section;
  const stats = byGameStats(logs);
  const ranked = Object.entries(stats).sort((a, b) => b[1].min - a[1].min);
  const gameNames = ranked.map(([g]) => g);
  const totalMins = logs.reduce((s, l) => s + l.minutes, 0);
  const sessions = logs.length;
  const prefix = section.isCurrentWeek ? 'This current week' : 'This week';
  const parts: string[] = [];
  if (!ranked.length) return '';

  if (ranked.length === 1) {
    const [g, d] = ranked[0];
    parts.push(`${prefix} was fully dedicated to ${g} — ${sessions} session${sessions !== 1 ? 's' : ''} totalling ${fmtMinutesFull(d.min)}.`);
  } else if (ranked.length === 2) {
    parts.push(`${prefix} split time between ${gameNames[0]} (${fmtMinutesFull(ranked[0][1].min)}) and ${gameNames[1]} (${fmtMinutesFull(ranked[1][1].min)}), covering ${sessions} sessions and ${fmtMinutesFull(totalMins)} total.`);
  } else {
    const top = ranked[0];
    const dominated = top[1].min > ranked[1][1].min * 1.5;
    if (dominated)
      parts.push(`${prefix} was ${top[0]}-heavy (${fmtMinutesFull(top[1].min)}) with lighter sessions in ${gameNames.slice(1).join(', ')}. Total: ${sessions} sessions, ${fmtMinutesFull(totalMins)}.`);
    else
      parts.push(`${prefix} spread across ${gameNames.length} titles — ${gameNames.join(', ')}. Total: ${sessions} sessions, ${fmtMinutesFull(totalMins)}.`);
  }

  const breakdowns: string[] = [];
  for (const [game, d] of ranked) {
    const highlights: string[] = [];
    if (d.types.has('complete')) highlights.push('reached the credits');
    if (d.types.has('boss')) highlights.push('defeated a boss');
    if (d.types.has('rank-up')) {
      const last = d.entries.filter(e => e.type === 'rank-up').pop();
      highlights.push(last ? `ranked up (${last.action})` : 'ranked up');
    }
    if (d.types.has('purchase')) highlights.push('purchased and started');
    const note = highlights.length ? ` — ${highlights.join(', ')}` : '';
    breakdowns.push(`${game}: ${fmtMinutesFull(d.min)}${note}.`);
  }
  if (breakdowns.length)
    parts.push('<br><strong>Session breakdown:</strong><br>' + breakdowns.map(b => `&nbsp;&nbsp;• ${esc(b)}`).join('<br>'));

  return parts.join(' ');
}

function executiveSummary(logs: LogEntry[], weeks: WeekSection[],
  manualCompletions: Set<string>, paused: Set<string>): string {
  const stats = byGameStats(logs);
  const ranked = Object.entries(stats).sort((a, b) => b[1].min - a[1].min);
  const total = logs.reduce((s, l) => s + l.minutes, 0);
  const sessions = logs.length;
  const done = (g: string, d: GameStats) => isFullyCompleted(d) || manualCompletions.has(g);
  const completeGames   = ranked.filter(([g, d]) => done(g, d)).map(([g]) => g);
  const pausedGames     = ranked.filter(([g, d]) => !done(g, d) && paused.has(g)).map(([g]) => g);
  const bossGames       = ranked.filter(([g, d]) => d.types.has('boss') && !done(g, d) && !paused.has(g)).map(([g]) => g);
  const rankUpGames     = ranked.filter(([g, d]) => d.types.has('rank-up') && !done(g, d) && !paused.has(g)).map(([g]) => g);
  const purchasedGames  = ranked.filter(([g, d]) => d.types.has('purchase') && !done(g, d) && !paused.has(g)).map(([g]) => g);
  const topGame = ranked[0]?.[0];
  const parts: string[] = [];
  parts.push(`This report covers ${weeks.length} week${weeks.length !== 1 ? 's' : ''} of gaming: `
    + `${sessions} sessions, ${fmtMinutesFull(total)} across ${ranked.length} title${ranked.length !== 1 ? 's' : ''}.`);
  if (topGame) {
    const topPct = Math.round((stats[topGame].min / total) * 100);
    parts.push(`Top title: ${topGame} at ${fmtMinutesFull(stats[topGame].min)} (${topPct}% of total playtime).`);
  }
  if (completeGames.length) parts.push(`Completions: ${completeGames.join(', ')}.`);
  if (pausedGames.length)   parts.push(`Put down / on hold: ${pausedGames.join(', ')}.`);
  if (bossGames.length)     parts.push(`Boss encounters (no full completion yet): ${bossGames.join(', ')}.`);
  if (rankUpGames.length)   parts.push(`Competitive rank progress: ${rankUpGames.join(', ')}.`);
  if (purchasedGames.length) parts.push(`New this period: ${purchasedGames.join(', ')}.`);
  return parts.join(' ');
}

function overallBullets(logs: LogEntry[], manualCompletions: Set<string>, paused: Set<string>): string[] {
  const stats = byGameStats(logs);
  const ranked = Object.entries(stats).sort((a, b) => b[1].min - a[1].min);
  const done = (g: string, d: GameStats) => isFullyCompleted(d) || manualCompletions.has(g);
  const bullets: string[] = [];
  for (const [game, d] of ranked) {
    if (done(game, d)) {
      const note = manualCompletions.has(game) && !isFullyCompleted(d)
        ? 'Manually marked complete' : 'Reached the credits / main run';
      bullets.push(`Completion — ${game}: ${note} (${fmtMinutesFull(d.min)} total).`);
    } else if (d.types.has('boss')) {
      const cnt = d.entries.filter(e => e.type === 'boss').length;
      bullets.push(`Boss Progress — ${game}: ${cnt} boss encounter${cnt > 1 ? 's' : ''} (${fmtMinutesFull(d.min)} total).`);
    } else if (d.types.has('complete')) {
      bullets.push(`Milestone — ${game}: Major area completions (${fmtMinutesFull(d.min)} total).`);
    }
  }
  for (const [game, d] of ranked)
    if (!done(game, d) && d.types.has('purchase'))
      bullets.push(`New Game — ${game}: Started. ${fmtMinutesFull(d.min)} logged so far.`);
  for (const [game, d] of ranked.filter(([g, d]) => !done(g, d) && !paused.has(g) && d.types.has('rank-up'))) {
    const rl = d.entries.filter(e => e.type === 'rank-up');
    bullets.push(`Competitive — ${game}: ${rl.length} rank-up event${rl.length > 1 ? 's' : ''} logged.`);
  }
  for (const [game, d] of ranked.filter(([g, d]) =>
    !done(g, d) && !paused.has(g) && !d.types.has('boss') && !d.types.has('rank-up') && !d.types.has('purchase')))
    bullets.push(`Ongoing — ${game}: ${d.entries.length} session${d.entries.length !== 1 ? 's' : ''}, ${fmtMinutesFull(d.min)} total.`);
  for (const [game, d] of ranked.filter(([g, d]) => !done(g, d) && paused.has(g)))
    bullets.push(`On Hold — ${game}: Intentionally paused (${fmtMinutesFull(d.min)} invested).`);
  return bullets;
}

export function nextWeekFocus(logs: LogEntry[], manualCompletions: Set<string> = new Set(), paused: Set<string> = new Set()): FocusItem[] {
  if (!logs.length) return [];
  const stats = byGameStats(logs);
  const ranked = Object.entries(stats).sort((a, b) => b[1].min - a[1].min);
  const recentCutoff = new Date(Math.max(...logs.map(l => l.date.getTime())) - 14 * 86400000);
  const recentGames = new Set(logs.filter(l => l.date >= recentCutoff).map(l => l.game));
  const high: FocusItem[] = [], medium: FocusItem[] = [], low: FocusItem[] = [];
  for (const [game, d] of ranked) {
    if (isFullyCompleted(d) || manualCompletions.has(game) || paused.has(game)) continue;
    if (isCompetitive(d)) { medium.push({ title: game, priority: 'medium', label: 'Competitive — cap sessions', sessions: lastSessions(d) }); continue; }
    const atBoss = [...d.entries].sort((a, b) => b.date.getTime() - a.date.getTime())[0]?.type === 'boss';
    if (atBoss && recentGames.has(game)) { high.push({ title: game, priority: 'high', label: 'Boss fight reached — finish it', sessions: lastSessions(d) }); continue; }
    if ((d.types.has('progress') || d.types.has('purchase')) && recentGames.has(game) && !d.types.has('rank-up')) {
      high.push({ title: game, priority: 'high', label: d.types.has('purchase') && !d.types.has('progress') ? 'Newly started — build momentum' : 'Active story — keep going', sessions: lastSessions(d) }); continue;
    }
    if (d.types.has('rank-up') && (d.types.has('progress') || d.types.has('boss'))) { high.push({ title: game, priority: 'high', label: 'Story unfinished — story first', sessions: lastSessions(d) }); continue; }
    if (!recentGames.has(game) && d.min > 30) low.push({ title: game, priority: 'low', label: `Stalled — ${fmtMinutesFull(d.min)} invested`, sessions: lastSessions(d) });
  }
  return [...high, ...medium, ...low].slice(0, 7);
}

// ─── Type badge styles ────────────────────────────────────────────────────────

const TYPE_STYLES: Record<string, string> = {
  progress:  'background:#e8f4fd;color:#1565c0',
  complete:  'background:#e8f5e9;color:#2e7d32',
  boss:      'background:#fce4ec;color:#b71c1c',
  'rank-up': 'background:#fff3e0;color:#e65100',
  purchase:  'background:#f3e5f5;color:#6a1b9a',
};
const PRIORITY_COLOR: Record<string, string> = { high:'#1a6b4a', medium:'#7a5c00', low:'#555' };
const PRIORITY_BG:    Record<string, string> = { high:'#e6f4ef', medium:'#fef8e6', low:'#f5f5f5' };

// ─── Shared table row builder ─────────────────────────────────────────────────

function logRow(l: LogEntry): string {
  const bs = TYPE_STYLES[l.type] ?? 'background:#eee;color:#333';
  return `<tr>
    <td class="col-ts">${esc(formatDate(l.date))}</td>
    <td class="col-gm">${esc(l.game)}</td>
    <td class="col-ac">${esc(l.action)}</td>
    <td class="col-ty"><span class="type-badge" style="${bs}">${esc(typeLabel(l.type))}</span></td>
    <td class="col-pt">${l.minutes}m</td>
  </tr>`;
}

const TABLE_COLS = `
  <colgroup>
    <col style="width:14%"><col style="width:22%">
    <col style="width:38%"><col style="width:14%"><col style="width:12%">
  </colgroup>`;
const TABLE_HEAD = `<thead><tr>
  <th class="col-ts">Date</th><th class="col-gm">Game</th>
  <th class="col-ac">Session Notes</th><th class="col-ty">Type</th>
  <th class="col-pt" style="text-align:right">Time</th>
</tr></thead>`;

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIC TEMPLATE
// ─────────────────────────────────────────────────────────────────────────────

function classicStyles(c: ThemeColors): string {
  return `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Inter', Arial, sans-serif;
  background: #fff;
  color: #111;
  font-size: 10.5pt;
  line-height: 1.55;
  padding: 32px 40px;
  max-width: 900px;
  min-width: 640px;
  margin: 0 auto;
}
.report-header {
  border-bottom: 3px solid ${c.primary};
  padding-bottom: 18px;
  margin-bottom: 22px;
}
.report-eyebrow {
  font-size: 8.5pt;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: ${c.primary};
  font-weight: 700;
  margin-bottom: 6px;
}
.report-title { font-size: 24pt; font-weight: 800; color: ${c.dark}; margin-bottom: 6px; line-height: 1.1; }
.report-meta { font-size: 9.5pt; color: #444; }
.stats-bar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin: 18px 0 0;
}
.stat-cell {
  background: ${c.bg};
  border-radius: 6px;
  padding: 10px 12px;
  border: 1px solid ${c.border};
}
.stat-val { font-size: 17pt; font-weight: 800; color: ${c.dark}; line-height: 1; }
.stat-label { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.08em; color: #666; margin-top: 3px; }
h2 {
  font-size: 11pt;
  font-weight: 700;
  color: ${c.dark};
  border-bottom: 2px solid ${c.primary};
  padding-bottom: 5px;
  margin: 24px 0 10px;
}
.exec-summary { font-size: 10pt; color: #222; line-height: 1.8; }
.week-heading { font-size: 10.5pt; font-weight: 700; color: ${c.dark}; margin: 24px 0 5px; }
.week-narrative {
  font-size: 9.5pt;
  color: #333;
  line-height: 1.7;
  margin-bottom: 10px;
  padding: 9px 14px;
  background: ${c.bgLight};
  border-left: 3px solid ${c.primary};
  border-radius: 0 4px 4px 0;
}
table { width: 100%; border-collapse: collapse; margin-bottom: 6px; table-layout: fixed; word-break: break-word; }
thead tr { background: ${c.bg}; }
th {
  text-align: left;
  font-size: 8.5pt;
  font-weight: 700;
  padding: 8px 10px;
  border-bottom: 2px solid ${c.border};
  color: #444;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
td { font-size: 9pt; padding: 8px 10px; line-height: 1.5; vertical-align: top; border-bottom: 1px solid #eee; }
tr:nth-child(even) td { background: #fafafa; }
.type-badge { display:inline-block; font-size:7.5pt; font-weight:600; padding:2px 6px; border-radius:4px; white-space:nowrap; }
.week-total { font-size:9.5pt; font-weight:700; margin:6px 0 18px; color:#333; }
.breakdown-list { list-style:none; padding:0; display:flex; flex-direction:column; gap:6px; margin-top:6px; }
.breakdown-list li { font-size:9.5pt; line-height:1.6; padding:8px 12px; background:${c.bgLight}; border-radius:4px; border-left:3px solid ${c.border}; }
.breakdown-list li strong { color:${c.dark}; }
.focus-grid { display:flex; flex-direction:column; gap:8px; margin-top:8px; }
.focus-item { padding:11px 14px; border-radius:6px; border-left:4px solid; }
.focus-priority { font-size:7.5pt; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:3px; }
.focus-title { font-size:10.5pt; font-weight:700; margin-bottom:3px; }
.focus-label { font-size:9pt; line-height:1.5; color:#333; }
.focus-insight { font-size:10pt; font-weight:500; color:#111; line-height:1.4; margin:5px 0 8px; }
.focus-sessions { font-size:8.5pt; color:#666; border-top:1px solid rgba(0,0,0,0.08); padding-top:6px; margin-top:4px; }
@media print {
  @page { size: A4 portrait; margin: 12mm 14mm; }
  body { padding:0; margin:0; max-width:none; width:100%; font-size:9.5pt; }
  .stats-bar { grid-template-columns: repeat(4,1fr); }
  th, td { padding:5px 7px; font-size:8.5pt; }
  .type-badge { font-size:7pt; padding:1px 4px; }
  .no-break { break-inside:avoid; }
  tr { break-inside:avoid; }
  thead { display:table-header-group; }
  .week-narrative, .stat-cell, .breakdown-list li, .focus-item { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
}`;
}

function buildClassicReport(
  title: string, from: Date, to: Date, asc: LogEntry[],
  total: number, gameCount: number, weeks: WeekSection[],
  execSummary: string, breakdownBullets: string[],
  focusItems: FocusItem[], aiInsights: Record<string, string>,
  opts: ReportOptions, c: ThemeColors,
): string {
  const weekSections = weeks.map((w, i) => {
    const wTotal = w.logs.reduce((s, l) => s + l.minutes, 0);
    const totalLabel = (i === weeks.length - 1 && w.isCurrentWeek)
      ? `${w.label} total so far: ${fmtMinutes(wTotal)}`
      : `${w.label} total: ${fmtMinutes(wTotal)}`;
    const tableHtml = opts.showTable ? `
      <table>${TABLE_COLS}${TABLE_HEAD}
        <tbody>${w.logs.map(logRow).join('')}</tbody>
      </table>` : '';
    return `
      <div class="no-break">
        <div class="week-heading">${esc(w.label)}: ${esc(formatDate(w.start))} – ${esc(formatDate(w.end))}</div>
        <div class="week-narrative">${weekNarrative(w)}</div>
        ${tableHtml}
        <div class="week-total">${esc(totalLabel)}</div>
      </div>`;
  }).join('');

  const breakdownHtml = opts.showBreakdown
    ? `<h2>Game Breakdown</h2>
       <ul class="breakdown-list">${breakdownBullets.map(b => {
         const [head, ...rest] = b.split(' — ');
         return `<li><strong>${esc(head)}</strong>${rest.length ? ' — ' + esc(rest.join(' — ')) : ''}</li>`;
       }).join('')}</ul>`
    : '';

  const focusHtml = opts.showFocus && focusItems.length
    ? `<h2>Next Period: Focus Priority</h2>
       <div class="focus-grid">${focusItems.map(item => {
         const insight = opts.showInsights ? aiInsights?.[item.title] : null;
         const sessHtml = item.sessions.slice(0,3).map(s =>
           `${esc(s.date)}: ${esc(s.action.slice(0,60))}${s.action.length > 60 ? '…' : ''} (${s.minutes}m)`
         ).join(' &middot; ');
         return `<div class="focus-item" style="background:${PRIORITY_BG[item.priority]};border-color:${PRIORITY_COLOR[item.priority]}">
           <div class="focus-priority" style="color:${PRIORITY_COLOR[item.priority]}">${item.priority.toUpperCase()} PRIORITY</div>
           <div class="focus-title">${esc(item.title)}</div>
           ${insight
             ? `<div class="focus-insight">${esc(insight)}</div>`
             : `<div class="focus-label">${esc(item.label)}</div>`}
           ${sessHtml ? `<div class="focus-sessions">${sessHtml}</div>` : ''}
         </div>`;
       }).join('')}</div>`
    : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(title)}</title>
    <style>${classicStyles(c)}</style>
  </head><body>
    <div class="report-header">
      <div class="report-eyebrow">Gaming Quest Dashboard</div>
      <div class="report-title">${esc(title)}</div>
      <div class="report-meta">${esc(formatDate(from))} – ${esc(formatDate(to))}</div>
      <div class="stats-bar">
        ${[['Total Playtime', fmtMinutes(total)], ['Games Played', String(gameCount)],
           ['Sessions', String(asc.length)], ['Weeks', String(weeks.length)]
          ].map(([k, v]) => `<div class="stat-cell"><div class="stat-val">${v}</div><div class="stat-label">${k}</div></div>`).join('')}
      </div>
    </div>
    <h2>Summary</h2>
    <div class="exec-summary"><p>${esc(execSummary)}</p></div>
    ${weekSections}
    ${breakdownHtml}
    ${focusHtml}
  </body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAGAZINE TEMPLATE
// ─────────────────────────────────────────────────────────────────────────────

function magazineStyles(c: ThemeColors): string {
  return `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', Arial, sans-serif; background: #f2f1ec; color: #111; font-size: 10pt; line-height: 1.55; }
.hero {
  background: linear-gradient(140deg, ${c.dark} 0%, ${c.primary} 100%);
  color: white;
  padding: 40px 48px 32px;
}
.hero-eyebrow { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.18em; opacity: 0.65; margin-bottom: 10px; }
.hero-title { font-size: 30pt; font-weight: 800; line-height: 1.1; margin-bottom: 6px; }
.hero-date { font-size: 10pt; opacity: 0.8; margin-bottom: 28px; }
.hero-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.hero-stat { background: rgba(255,255,255,0.13); border-radius: 8px; padding: 14px 16px; border: 1px solid rgba(255,255,255,0.18); }
.hero-stat-val { font-size: 22pt; font-weight: 800; line-height: 1; }
.hero-stat-label { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.7; margin-top: 4px; }
.body { padding: 32px 48px 48px; }
.section-header {
  font-size: 9pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em;
  color: ${c.primary};
  border-bottom: 2px solid ${c.primary};
  padding-bottom: 8px;
  margin: 32px 0 16px;
}
.section-header:first-child { margin-top: 0; }
.summary-box {
  background: white;
  border-radius: 8px;
  padding: 18px 20px;
  font-size: 10pt;
  color: #222;
  line-height: 1.8;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.game-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.game-card {
  background: white;
  border-radius: 8px;
  padding: 16px;
  border-left: 4px solid ${c.primary};
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.game-name { font-size: 11pt; font-weight: 700; color: ${c.dark}; margin-bottom: 4px; }
.game-time { font-size: 16pt; font-weight: 800; color: ${c.primary}; margin-bottom: 6px; line-height: 1; }
.game-meta { font-size: 8.5pt; color: #666; display: flex; flex-wrap: wrap; gap: 4px 10px; }
.game-types { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.game-last { font-size: 9pt; color: #444; margin-top: 8px; font-style: italic; line-height: 1.4; border-top: 1px solid #eee; padding-top: 8px; }
.insight-card {
  background: white;
  border-radius: 8px;
  padding: 16px 18px;
  margin-bottom: 10px;
  border-left: 4px solid ${c.primary};
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.insight-game { font-size: 10.5pt; font-weight: 700; color: ${c.dark}; margin-bottom: 6px; }
.insight-text { font-size: 10pt; color: #333; line-height: 1.6; }
.focus-card {
  background: white;
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 8px;
  border-left: 4px solid;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.focus-priority { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 3px; }
.focus-title { font-size: 11pt; font-weight: 700; margin-bottom: 4px; }
.focus-insight { font-size: 10pt; font-weight: 500; line-height: 1.5; margin-bottom: 6px; }
.focus-label { font-size: 9.5pt; color: #444; margin-bottom: 6px; line-height: 1.4; }
.focus-sessions { font-size: 8.5pt; color: #777; border-top: 1px solid rgba(0,0,0,0.08); padding-top: 6px; }
table { width:100%; border-collapse:collapse; margin-bottom:6px; table-layout:fixed; word-break:break-word; background:white; border-radius:8px; overflow:hidden; }
thead tr { background:${c.bg}; }
th { text-align:left; font-size:8.5pt; font-weight:700; padding:9px 11px; border-bottom:2px solid ${c.border}; color:${c.dark}; text-transform:uppercase; letter-spacing:0.06em; }
td { font-size:9pt; padding:8px 11px; line-height:1.5; vertical-align:top; border-bottom:1px solid #f0f0f0; }
tr:nth-child(even) td { background:#fafafa; }
.type-badge { display:inline-block; font-size:7.5pt; font-weight:600; padding:2px 6px; border-radius:4px; white-space:nowrap; }
.week-label { font-size:9.5pt; font-weight:700; color:${c.dark}; margin:20px 0 8px; }
.week-total { font-size:9.5pt; font-weight:700; margin:6px 0; color:#333; }
@media print {
  @page { size:A4 portrait; margin:8mm 10mm; }
  body { background:white; font-size:9pt; }
  .hero { -webkit-print-color-adjust:exact; print-color-adjust:exact; padding:24px 32px; }
  .hero-title { font-size:22pt; }
  .hero-stats { grid-template-columns:repeat(4,1fr); }
  .hero-stat { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .body { padding:16px 32px 32px; }
  .game-grid { grid-template-columns:repeat(2,1fr); }
  .game-card, .insight-card, .focus-card, .summary-box { box-shadow:none; -webkit-print-color-adjust:exact; print-color-adjust:exact; break-inside:avoid; }
  th, td { padding:5px 7px; font-size:8pt; }
  .type-badge { font-size:7pt; padding:1px 4px; }
  tr { break-inside:avoid; }
  thead { display:table-header-group; }
}`;
}

function buildMagazineReport(
  title: string, from: Date, to: Date, asc: LogEntry[],
  total: number, gameCount: number, weeks: WeekSection[],
  execSummary: string, breakdownBullets: string[],
  focusItems: FocusItem[], aiInsights: Record<string, string>,
  opts: ReportOptions, c: ThemeColors,
): string {
  const gameStats = byGameStats(asc);
  const ranked = Object.entries(gameStats).sort((a, b) => b[1].min - a[1].min);

  const gameCards = ranked.map(([game, d]) => {
    const badges = [...d.types].map(t => {
      const bs = TYPE_STYLES[t] ?? 'background:#eee;color:#333';
      return `<span class="type-badge" style="${bs}">${typeLabel(t)}</span>`;
    }).join('');
    const lastEntry = [...d.entries].sort((a, b) => b.date.getTime() - a.date.getTime())[0];
    return `<div class="game-card">
      <div class="game-name">${esc(game)}</div>
      <div class="game-time">${fmtMinutes(d.min)}</div>
      <div class="game-meta">
        <span>${d.entries.length} session${d.entries.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="game-types">${badges}</div>
      ${lastEntry ? `<div class="game-last">${esc(lastEntry.action.slice(0,80))}${lastEntry.action.length > 80 ? '…' : ''}</div>` : ''}
    </div>`;
  }).join('');

  const insightsHtml = opts.showInsights && Object.keys(aiInsights).length
    ? `<div class="section-header">AI Recommendations</div>
       ${Object.entries(aiInsights).filter(([, v]) => v).map(([game, step]) =>
         `<div class="insight-card">
           <div class="insight-game">${esc(game)}</div>
           <div class="insight-text">${esc(step)}</div>
         </div>`
       ).join('')}`
    : '';

  const focusHtml = opts.showFocus && focusItems.length
    ? `<div class="section-header">Next Period: Focus Priority</div>
       ${focusItems.map(item => {
         const insight = opts.showInsights ? aiInsights?.[item.title] : null;
         const sessHtml = item.sessions.slice(0,3).map(s =>
           `${esc(s.date)}: ${esc(s.action.slice(0,55))}${s.action.length > 55 ? '…' : ''} (${s.minutes}m)`
         ).join(' &middot; ');
         return `<div class="focus-card" style="border-color:${PRIORITY_COLOR[item.priority]}">
           <div class="focus-priority" style="color:${PRIORITY_COLOR[item.priority]}">${item.priority.toUpperCase()}</div>
           <div class="focus-title">${esc(item.title)}</div>
           ${insight ? `<div class="focus-insight">${esc(insight)}</div>` : `<div class="focus-label">${esc(item.label)}</div>`}
           ${sessHtml ? `<div class="focus-sessions">${sessHtml}</div>` : ''}
         </div>`;
       }).join('')}`
    : '';

  const tableHtml = opts.showTable
    ? `<div class="section-header">Session Log</div>
       ${weeks.map(w => {
         const wTotal = w.logs.reduce((s, l) => s + l.minutes, 0);
         return `<div class="week-label">${esc(w.label)}: ${esc(formatDate(w.start))} – ${esc(formatDate(w.end))}</div>
           <table>${TABLE_COLS}${TABLE_HEAD}<tbody>${w.logs.map(logRow).join('')}</tbody></table>
           <div class="week-total">Total: ${fmtMinutes(wTotal)}</div>`;
       }).join('')}`
    : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(title)}</title>
    <style>${magazineStyles(c)}</style>
  </head><body>
    <div class="hero">
      <div class="hero-eyebrow">Gaming Quest Dashboard</div>
      <div class="hero-title">${esc(title)}</div>
      <div class="hero-date">${esc(formatDate(from))} – ${esc(formatDate(to))}</div>
      <div class="hero-stats">
        ${[['Total Playtime',fmtMinutes(total)],['Games Played',String(gameCount)],
           ['Sessions',String(asc.length)],['Weeks',String(weeks.length)]]
          .map(([k,v]) => `<div class="hero-stat"><div class="hero-stat-val">${v}</div><div class="hero-stat-label">${k}</div></div>`).join('')}
      </div>
    </div>
    <div class="body">
      <div class="section-header">Overview</div>
      <div class="summary-box">${esc(execSummary)}</div>
      <div class="section-header">Games This Period</div>
      <div class="game-grid">${gameCards}</div>
      ${insightsHtml}
      ${focusHtml}
      ${tableHtml}
    </div>
  </body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPACT TEMPLATE
// ─────────────────────────────────────────────────────────────────────────────

function compactStyles(c: ThemeColors): string {
  return `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', Arial, sans-serif; background: #fff; color: #111; font-size: 9pt; line-height: 1.45; padding: 14px 20px; max-width: 900px; margin: 0 auto; }
.cmp-header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid ${c.primary}; padding-bottom: 7px; margin-bottom: 10px; gap: 12px; }
.cmp-title { font-size: 15pt; font-weight: 700; color: ${c.dark}; }
.cmp-meta { font-size: 8pt; color: #555; white-space: nowrap; }
.cmp-stats { display: flex; gap: 18px; margin-bottom: 12px; background: ${c.bg}; padding: 7px 12px; border-radius: 4px; flex-wrap: wrap; border: 1px solid ${c.border}; }
.cmp-stat { font-size: 8.5pt; }
.cmp-stat strong { font-size: 13pt; display: block; line-height: 1.1; color: ${c.dark}; }
.cmp-stat span { text-transform: uppercase; letter-spacing: 0.05em; color: #666; font-size: 7.5pt; }
h2 { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: ${c.primary}; margin: 14px 0 5px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
.cmp-narrative { font-size: 8.5pt; color: #333; line-height: 1.6; padding: 6px 10px; background: ${c.bgLight}; border-left: 2px solid ${c.border}; margin-bottom: 7px; border-radius: 0 3px 3px 0; }
.cmp-week-head { font-size: 9pt; font-weight: 700; color: ${c.dark}; margin: 12px 0 4px; }
.cmp-total { font-size: 8.5pt; font-weight: 700; color: #333; margin: 4px 0 10px; }
table { width:100%; border-collapse:collapse; margin-bottom:4px; table-layout:fixed; word-break:break-word; }
thead tr { background:${c.bg}; }
th { text-align:left; font-size:7.5pt; font-weight:700; padding:5px 7px; border-bottom:1px solid ${c.border}; color:#444; text-transform:uppercase; letter-spacing:0.05em; }
td { font-size:8.5pt; padding:5px 7px; line-height:1.4; vertical-align:top; border-bottom:1px solid #eee; }
tr:nth-child(even) td { background:#fafafa; }
.type-badge { display:inline-block; font-size:7pt; font-weight:600; padding:1px 5px; border-radius:3px; white-space:nowrap; }
ul.cmp-bullets { list-style:none; padding:0; display:flex; flex-direction:column; gap:3px; }
ul.cmp-bullets li { font-size:8.5pt; padding:5px 9px; background:${c.bgLight}; border-left:2px solid ${c.border}; border-radius:0 3px 3px 0; }
ul.cmp-bullets li strong { color:${c.dark}; }
.cmp-focus-item { display:flex; align-items:baseline; gap:8px; padding:4px 0; border-bottom:1px solid #eee; font-size:8.5pt; }
.cmp-focus-badge { font-size:7pt; font-weight:700; padding:1px 5px; border-radius:3px; white-space:nowrap; flex-shrink:0; }
@media print {
  @page { size:A4 portrait; margin:10mm 12mm; }
  body { padding:0; margin:0; max-width:none; width:100%; }
  .cmp-stats { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  th, td { padding:4px 6px; }
  tr { break-inside:avoid; }
  thead { display:table-header-group; }
  h2 { break-before:auto; }
  .cmp-narrative { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  ul.cmp-bullets li { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
}`;
}

function buildCompactReport(
  title: string, from: Date, to: Date, asc: LogEntry[],
  total: number, gameCount: number, weeks: WeekSection[],
  execSummary: string, breakdownBullets: string[],
  focusItems: FocusItem[], aiInsights: Record<string, string>,
  opts: ReportOptions, c: ThemeColors,
): string {
  const weekSections = weeks.map(w => {
    const wTotal = w.logs.reduce((s, l) => s + l.minutes, 0);
    const tableHtml = opts.showTable ? `<table>${TABLE_COLS}${TABLE_HEAD}
      <tbody>${w.logs.map(logRow).join('')}</tbody></table>` : '';
    return `<div class="cmp-week-head">${esc(w.label)}: ${esc(formatDate(w.start))} – ${esc(formatDate(w.end))}</div>
      <div class="cmp-narrative">${weekNarrative(w)}</div>
      ${tableHtml}
      <div class="cmp-total">Total: ${fmtMinutes(wTotal)}</div>`;
  }).join('');

  const breakdownHtml = opts.showBreakdown && breakdownBullets.length
    ? `<h2>Game Breakdown</h2>
       <ul class="cmp-bullets">${breakdownBullets.map(b => {
         const [head, ...rest] = b.split(' — ');
         return `<li><strong>${esc(head)}</strong>${rest.length ? ' — ' + esc(rest.join(' — ')) : ''}</li>`;
       }).join('')}</ul>` : '';

  const focusHtml = opts.showFocus && focusItems.length
    ? `<h2>Focus Priority</h2>
       <div>${focusItems.map(item => {
         const insight = opts.showInsights ? aiInsights?.[item.title] : null;
         const bg = PRIORITY_BG[item.priority];
         const col = PRIORITY_COLOR[item.priority];
         return `<div class="cmp-focus-item">
           <span class="cmp-focus-badge" style="background:${bg};color:${col}">${item.priority.toUpperCase()}</span>
           <span><strong>${esc(item.title)}</strong> — ${insight ? esc(insight) : esc(item.label)}</span>
         </div>`;
       }).join('')}</div>` : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(title)}</title>
    <style>${compactStyles(c)}</style>
  </head><body>
    <div class="cmp-header">
      <div class="cmp-title">${esc(title)}</div>
      <div class="cmp-meta">${esc(formatDate(from))} – ${esc(formatDate(to))}</div>
    </div>
    <div class="cmp-stats">
      ${[['Playtime',fmtMinutes(total)],['Games',String(gameCount)],
         ['Sessions',String(asc.length)],['Weeks',String(weeks.length)]]
        .map(([k,v]) => `<div class="cmp-stat"><strong>${v}</strong><span>${k}</span></div>`).join('')}
    </div>
    <p style="font-size:8.5pt;color:#333;line-height:1.7;margin-bottom:12px">${esc(execSummary)}</p>
    ${weekSections}
    ${breakdownHtml}
    ${focusHtml}
  </body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MINIMAL TEMPLATE
// ─────────────────────────────────────────────────────────────────────────────

function minimalStyles(c: ThemeColors): string {
  return `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', Arial, sans-serif; background: #fff; color: #111; font-size: 10.5pt; line-height: 1.65; padding: 40px 48px; max-width: 900px; margin: 0 auto; }
.mn-eyebrow { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.18em; color: ${c.primary}; font-weight: 700; margin-bottom: 8px; }
.mn-title { font-size: 28pt; font-weight: 800; color: #111; margin-bottom: 5px; line-height: 1.05; }
.mn-date { font-size: 10pt; color: #666; margin-bottom: 18px; }
.mn-rule { height: 2px; background: ${c.primary}; margin-bottom: 24px; }
.mn-stats { display: flex; gap: 36px; margin-bottom: 30px; flex-wrap: wrap; }
.mn-stat { border-top: 2px solid ${c.primary}; padding-top: 8px; }
.mn-stat-val { font-size: 20pt; font-weight: 800; color: #111; line-height: 1; }
.mn-stat-label { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.1em; color: #888; margin-top: 3px; }
h2 { font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: ${c.primary}; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #ddd; }
.mn-summary { font-size: 10.5pt; color: #222; line-height: 1.85; }
.mn-week-head { font-size: 10.5pt; font-weight: 700; color: #111; margin: 24px 0 6px; }
.mn-narrative { font-size: 9.5pt; color: #444; line-height: 1.75; margin-bottom: 10px; padding: 0 0 0 12px; border-left: 2px solid ${c.primary}; }
table { width:100%; border-collapse:collapse; margin-bottom:6px; table-layout:fixed; word-break:break-word; }
thead tr { background: transparent; }
th { text-align:left; font-size:7.5pt; font-weight:700; padding:7px 8px; border-bottom:2px solid #111; color:#111; text-transform:uppercase; letter-spacing:0.06em; }
td { font-size:9pt; padding:7px 8px; line-height:1.5; vertical-align:top; border-bottom:1px solid #ebebeb; }
.type-badge { display:inline-block; font-size:7.5pt; font-weight:600; padding:2px 6px; border-radius:3px; white-space:nowrap; }
.mn-week-total { font-size:9.5pt; font-weight:700; margin:5px 0 18px; color:#444; }
.mn-bullets { list-style:none; padding:0; display:flex; flex-direction:column; gap:4px; }
.mn-bullets li { font-size:9.5pt; padding:7px 10px 7px 12px; border-left:2px solid ${c.border}; }
.mn-bullets li strong { color:#111; }
.mn-focus { display:flex; flex-direction:column; gap:6px; margin-top:8px; }
.mn-focus-item { display:flex; gap:12px; align-items:flex-start; padding:9px 12px; border-left:3px solid; }
.mn-priority { font-size:7pt; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; white-space:nowrap; margin-top:3px; flex-shrink:0; min-width:52px; }
.mn-ftitle { font-size:10pt; font-weight:700; margin-bottom:2px; }
.mn-flabel { font-size:9pt; color:#444; }
.mn-insight { font-size:9.5pt; color:#222; font-weight:500; }
@media print {
  @page { size:A4 portrait; margin:14mm 16mm; }
  body { padding:0; margin:0; max-width:none; font-size:9.5pt; }
  thead { display:table-header-group; }
  tr { break-inside:avoid; }
  .mn-narrative, .mn-focus-item, .mn-bullets li { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
}`;
}

function buildMinimalReport(
  title: string, from: Date, to: Date, asc: LogEntry[],
  total: number, gameCount: number, weeks: WeekSection[],
  execSummary: string, breakdownBullets: string[],
  focusItems: FocusItem[], aiInsights: Record<string, string>,
  opts: ReportOptions, c: ThemeColors,
): string {
  const weekSections = weeks.map((w, i) => {
    const wTotal = w.logs.reduce((s, l) => s + l.minutes, 0);
    const totalLabel = (i === weeks.length - 1 && w.isCurrentWeek)
      ? `${w.label} total so far: ${fmtMinutes(wTotal)}`
      : `${w.label} total: ${fmtMinutes(wTotal)}`;
    const tableHtml = opts.showTable ? `<table>${TABLE_COLS}${TABLE_HEAD}
      <tbody>${w.logs.map(logRow).join('')}</tbody></table>` : '';
    return `<div class="mn-week-head">${esc(w.label)}: ${esc(formatDate(w.start))} – ${esc(formatDate(w.end))}</div>
      <div class="mn-narrative">${weekNarrative(w)}</div>
      ${tableHtml}
      <div class="mn-week-total">${esc(totalLabel)}</div>`;
  }).join('');

  const breakdownHtml = opts.showBreakdown && breakdownBullets.length
    ? `<h2>Game Breakdown</h2>
       <ul class="mn-bullets">${breakdownBullets.map(b => {
         const [head, ...rest] = b.split(' — ');
         return `<li><strong>${esc(head)}</strong>${rest.length ? ' — ' + esc(rest.join(' — ')) : ''}</li>`;
       }).join('')}</ul>` : '';

  const focusHtml = opts.showFocus && focusItems.length
    ? `<h2>Next Period: Focus Priority</h2>
       <div class="mn-focus">${focusItems.map(item => {
         const col = PRIORITY_COLOR[item.priority];
         const insight = opts.showInsights ? aiInsights?.[item.title] : null;
         return `<div class="mn-focus-item" style="border-color:${col};background:${PRIORITY_BG[item.priority]}">
           <div class="mn-priority" style="color:${col}">${item.priority.toUpperCase()}</div>
           <div>
             <div class="mn-ftitle">${esc(item.title)}</div>
             ${insight ? `<div class="mn-insight">${esc(insight)}</div>` : `<div class="mn-flabel">${esc(item.label)}</div>`}
           </div>
         </div>`;
       }).join('')}</div>` : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(title)}</title>
    <style>${minimalStyles(c)}</style>
  </head><body>
    <div class="mn-eyebrow">Gaming Quest Dashboard</div>
    <div class="mn-title">${esc(title)}</div>
    <div class="mn-date">${esc(formatDate(from))} – ${esc(formatDate(to))}</div>
    <div class="mn-rule"></div>
    <div class="mn-stats">
      ${[['Total Playtime', fmtMinutes(total)], ['Games Played', String(gameCount)],
         ['Sessions', String(asc.length)], ['Weeks', String(weeks.length)]]
        .map(([k, v]) => `<div class="mn-stat"><div class="mn-stat-val">${v}</div><div class="mn-stat-label">${k}</div></div>`).join('')}
    </div>
    <h2>Summary</h2>
    <div class="mn-summary">${esc(execSummary)}</div>
    ${weekSections}
    ${breakdownHtml}
    ${focusHtml}
  </body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM TEMPLATE
// ─────────────────────────────────────────────────────────────────────────────

function customFontStack(f: FontChoice): string {
  if (f === 'georgia') return "Georgia, 'Times New Roman', serif";
  if (f === 'mono') return "'Courier New', Courier, monospace";
  return "'Inter', Arial, sans-serif";
}
function customFontImport(f: FontChoice): string {
  return f === 'inter'
    ? "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');"
    : '';
}

function customStyles(c: ThemeColors, opts: ReportOptions): string {
  const font = customFontStack(opts.fontChoice);
  const mono = opts.fontChoice === 'mono';
  return `
${customFontImport(opts.fontChoice)}
*, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
body { font-family:${font}; background:#fff; color:#111; font-size:${mono?'9.5':'10.5'}pt; line-height:1.6; max-width:900px; margin:0 auto; padding:${opts.headerStyle==='banner'?'0':'36px 44px'}; }
/* Banner header */
.cu-banner { background:linear-gradient(140deg,${c.dark} 0%,${c.primary} 100%); color:white; padding:36px 44px 28px; }
.cu-centered-wrap { text-align:center; padding:32px 44px 0; border-bottom:3px solid ${c.primary}; }
.cu-siderule-wrap { padding:28px 44px 0; border-left:6px solid ${c.primary}; margin:0 0 0 44px; }
.cu-eyebrow { font-size:7.5pt; text-transform:uppercase; letter-spacing:0.16em; opacity:.7; margin-bottom:8px; font-weight:700; }
.cu-title { font-size:${mono?'20':'26'}pt; font-weight:800; line-height:1.1; margin-bottom:5px; }
.cu-date { font-size:10pt; opacity:.8; margin-bottom:22px; }
.cu-stats { display:flex; gap:${opts.headerStyle==='banner'?'12px':'28px'}; flex-wrap:wrap; ${opts.headerStyle==='centered'?'justify-content:center;':''} margin-bottom:${opts.headerStyle==='banner'?'0':'20px'}; }
.cu-stat { ${opts.headerStyle==='banner'?`background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:12px 16px;`:`border-top:2px solid ${c.primary};padding-top:7px;`} }
.cu-stat-val { font-size:${opts.headerStyle==='banner'?'20':'18'}pt; font-weight:800; line-height:1; ${opts.headerStyle!=='banner'?'color:#111;':''} }
.cu-stat-lbl { font-size:7.5pt; text-transform:uppercase; letter-spacing:.08em; opacity:.75; margin-top:3px; ${opts.headerStyle!=='banner'?'color:#888;':''} }
.cu-body { padding:${opts.headerStyle==='banner'?'28px 44px 44px':opts.headerStyle==='centered'?'24px 44px 44px':'24px 44px 44px 50px'}; }
h2 { font-size:${mono?'8.5':'9'}pt; font-weight:700; text-transform:uppercase; letter-spacing:.12em; color:${c.primary}; margin:24px 0 10px; padding-bottom:5px; border-bottom:1px solid #ddd; ${mono?'font-family:'+font+';':''} }
.cu-summary { font-size:${mono?'9':'10'}pt; color:#222; line-height:1.8; }
.cu-week-head { font-size:10pt; font-weight:700; color:${c.dark}; margin:20px 0 5px; }
.cu-narrative { font-size:9.5pt; color:#444; line-height:1.7; margin-bottom:9px; padding:8px 12px; background:${c.bgLight}; border-left:3px solid ${c.primary}; border-radius:0 4px 4px 0; }
table { width:100%; border-collapse:collapse; margin-bottom:6px; table-layout:fixed; word-break:break-word; }
thead tr { background:${c.bg}; }
th { text-align:left; font-size:8pt; font-weight:700; padding:7px 9px; border-bottom:2px solid ${c.border}; color:#444; text-transform:uppercase; letter-spacing:.05em; }
td { font-size:9pt; padding:7px 9px; line-height:1.5; vertical-align:top; border-bottom:1px solid #eee; }
tr:nth-child(even) td { background:#fafafa; }
.type-badge { display:inline-block; font-size:7.5pt; font-weight:600; padding:2px 6px; border-radius:4px; white-space:nowrap; }
.cu-week-total { font-size:9.5pt; font-weight:700; margin:5px 0 16px; color:#333; }
.cu-bullets { list-style:none; padding:0; display:flex; flex-direction:column; gap:4px; }
.cu-bullets li { font-size:9.5pt; padding:7px 10px 7px 12px; background:${c.bgLight}; border-left:3px solid ${c.border}; border-radius:0 4px 4px 0; }
.cu-bullets li strong { color:${c.dark}; }
.cu-focus { display:flex; flex-direction:column; gap:7px; }
.cu-focus-item { padding:11px 14px; border-radius:5px; border-left:4px solid; }
.cu-fp { font-size:7.5pt; font-weight:700; text-transform:uppercase; letter-spacing:.06em; margin-bottom:3px; }
.cu-ft { font-size:10.5pt; font-weight:700; margin-bottom:3px; }
.cu-fl { font-size:9pt; color:#444; }
.cu-fi { font-size:10pt; font-weight:500; color:#111; }
@media print {
  @page { size:A4 portrait; margin:${opts.headerStyle==='banner'?'0 0 10mm':'12mm 14mm'}; }
  body { padding:0; margin:0; max-width:none; font-size:9pt; }
  .cu-banner { -webkit-print-color-adjust:exact; print-color-adjust:exact; padding:24px 32px 20px; }
  .cu-stat { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .cu-body { padding:${opts.headerStyle==='banner'?'20px 32px 32px':opts.headerStyle==='centered'?'16px 32px 32px':'16px 32px 32px 38px'}; }
  thead { display:table-header-group; }
  tr { break-inside:avoid; }
  .cu-narrative, .cu-focus-item, .cu-bullets li { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
}`;
}

function buildCustomReport(
  title: string, from: Date, to: Date, asc: LogEntry[],
  total: number, gameCount: number, weeks: WeekSection[],
  execSummary: string, breakdownBullets: string[],
  focusItems: FocusItem[], aiInsights: Record<string, string>,
  opts: ReportOptions, c: ThemeColors,
): string {
  const stats = [['Total Playtime', fmtMinutes(total)], ['Games Played', String(gameCount)],
                 ['Sessions', String(asc.length)], ['Weeks', String(weeks.length)]];
  const statsHtml = stats.map(([k,v]) =>
    `<div class="cu-stat"><div class="cu-stat-val">${v}</div><div class="cu-stat-lbl">${k}</div></div>`
  ).join('');

  let headerHtml: string;
  if (opts.headerStyle === 'banner') {
    headerHtml = `<div class="cu-banner">
      <div class="cu-eyebrow">Gaming Quest Dashboard</div>
      <div class="cu-title">${esc(title)}</div>
      <div class="cu-date">${esc(formatDate(from))} – ${esc(formatDate(to))}</div>
      <div class="cu-stats">${statsHtml}</div>
    </div>`;
  } else if (opts.headerStyle === 'centered') {
    headerHtml = `<div class="cu-centered-wrap">
      <div class="cu-eyebrow">Gaming Quest Dashboard</div>
      <div class="cu-title">${esc(title)}</div>
      <div class="cu-date">${esc(formatDate(from))} – ${esc(formatDate(to))}</div>
      <div class="cu-stats">${statsHtml}</div>
    </div>`;
  } else {
    headerHtml = `<div class="cu-siderule-wrap">
      <div class="cu-eyebrow" style="color:${c.primary}">Gaming Quest Dashboard</div>
      <div class="cu-title" style="color:${c.dark}">${esc(title)}</div>
      <div class="cu-date" style="color:#555;opacity:1">${esc(formatDate(from))} – ${esc(formatDate(to))}</div>
      <div class="cu-stats">${statsHtml}</div>
    </div>`;
  }

  const weekSections = weeks.map((w, i) => {
    const wTotal = w.logs.reduce((s, l) => s + l.minutes, 0);
    const totalLabel = (i === weeks.length - 1 && w.isCurrentWeek)
      ? `${w.label} total so far: ${fmtMinutes(wTotal)}`
      : `${w.label} total: ${fmtMinutes(wTotal)}`;
    const tableHtml = opts.showTable ? `<table>${TABLE_COLS}${TABLE_HEAD}
      <tbody>${w.logs.map(logRow).join('')}</tbody></table>` : '';
    return `<div class="cu-week-head">${esc(w.label)}: ${esc(formatDate(w.start))} – ${esc(formatDate(w.end))}</div>
      <div class="cu-narrative">${weekNarrative(w)}</div>
      ${tableHtml}
      <div class="cu-week-total">${esc(totalLabel)}</div>`;
  }).join('');

  const breakdownHtml = opts.showBreakdown && breakdownBullets.length
    ? `<h2>Game Breakdown</h2>
       <ul class="cu-bullets">${breakdownBullets.map(b => {
         const [head, ...rest] = b.split(' — ');
         return `<li><strong>${esc(head)}</strong>${rest.length ? ' — ' + esc(rest.join(' — ')) : ''}</li>`;
       }).join('')}</ul>` : '';

  const focusHtml = opts.showFocus && focusItems.length
    ? `<h2>Next Period: Focus Priority</h2>
       <div class="cu-focus">${focusItems.map(item => {
         const insight = opts.showInsights ? aiInsights?.[item.title] : null;
         return `<div class="cu-focus-item" style="background:${PRIORITY_BG[item.priority]};border-color:${PRIORITY_COLOR[item.priority]}">
           <div class="cu-fp" style="color:${PRIORITY_COLOR[item.priority]}">${item.priority.toUpperCase()} PRIORITY</div>
           <div class="cu-ft">${esc(item.title)}</div>
           ${insight ? `<div class="cu-fi">${esc(insight)}</div>` : `<div class="cu-fl">${esc(item.label)}</div>`}
         </div>`;
       }).join('')}</div>` : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(title)}</title>
    <style>${customStyles(c, opts)}</style>
  </head><body>
    ${headerHtml}
    <div class="cu-body">
      <h2>Summary</h2>
      <div class="cu-summary">${esc(execSummary)}</div>
      ${weekSections}
      ${breakdownHtml}
      ${focusHtml}
    </div>
  </body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function buildPdfReport(
  from: Date, to: Date, logs: LogEntry[],
  title?: string,
  aiInsights: Record<string, string> = {},
  manualCompletions: Set<string> = new Set(),
  paused: Set<string> = new Set(),
  options?: Partial<ReportOptions>,
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const c = opts.theme === 'custom' ? buildCustomTheme(opts.customColor || DEFAULT_OPTIONS.customColor) : THEMES[opts.theme];
  const asc = [...logs].sort((a, b) => a.date.getTime() - b.date.getTime());
  const total = asc.reduce((s, l) => s + l.minutes, 0);
  const gameCount = new Set(asc.map(l => l.game)).size;
  const weeks = splitIntoWeeks(asc, from, to);
  const reportTitle = title ?? `${formatDate(from)} – ${formatDate(to)}`;
  const execSummary = executiveSummary(asc, weeks, manualCompletions, paused);
  const breakdownBullets = overallBullets(asc, manualCompletions, paused);
  const focusItems = nextWeekFocus(asc, manualCompletions, paused);

  const args: [string, Date, Date, LogEntry[], number, number, WeekSection[], string, string[], FocusItem[], Record<string, string>, ReportOptions, ThemeColors] =
    [reportTitle, from, to, asc, total, gameCount, weeks, execSummary, breakdownBullets, focusItems, aiInsights, opts, c];

  switch (opts.template) {
    case 'magazine': return buildMagazineReport(...args);
    case 'compact':  return buildCompactReport(...args);
    case 'minimal':  return buildMinimalReport(...args);
    case 'custom':   return buildCustomReport(...args);
    default:         return buildClassicReport(...args);
  }
}

export function printReport(html: string): void {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { alert('Pop-up blocked. Please allow pop-ups for this site to generate the PDF.'); return; }
  w.document.write(html);
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}
