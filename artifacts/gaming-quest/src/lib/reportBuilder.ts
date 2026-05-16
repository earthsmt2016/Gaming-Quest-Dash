import { LogEntry, formatDate, monStart, sunEnd } from './logParser';

function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m] ?? m));
}

function fmtMinutes(mins: number): string {
  if (mins < 60) return `${mins} minutes`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${mins} minutes (${h} ${h === 1 ? 'hour' : 'hours'})`;
  const frac = mins / 60;
  const simple = (frac * 4) === Math.floor(frac * 4);
  if (simple) return `${mins} minutes (${+frac.toFixed(2)} hours)`;
  return `${mins} minutes (${h} hour${h !== 1 ? 's' : ''} ${m} min)`;
}

export interface WeekSection {
  weekNum: number;
  start: Date;
  end: Date;
  logs: LogEntry[];
  label: string;
  isCurrentWeek: boolean;
}

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
    const wLogs = logs.filter(l => l.date >= cursor && l.date <= cappedEnd).sort((a, b) => a.date.getTime() - b.date.getTime());
    if (wLogs.length > 0) {
      weeks.push({ weekNum, start: new Date(cursor), end: new Date(cappedEnd), logs: wLogs, label: `Week ${weekNum}`, isCurrentWeek: today >= cursor && today <= wEnd });
      weekNum++;
    }
    cursor = new Date(wEnd.getTime() + 1);
  }
  return weeks;
}

function byGameStats(logs: LogEntry[]): Record<string, { min: number; types: Set<string>; actions: string[]; entries: LogEntry[] }> {
  const map: Record<string, { min: number; types: Set<string>; actions: string[]; entries: LogEntry[] }> = {};
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
  const labels: Record<string, string> = {
    progress: 'Progress', complete: 'Complete', boss: 'Boss', 'rank-up': 'Rank Up', purchase: 'New Game',
  };
  return labels[type] ?? type;
}

function weekNarrative(section: WeekSection): string {
  const logs = section.logs;
  const stats = byGameStats(logs);
  const ranked = Object.entries(stats).sort((a, b) => b[1].min - a[1].min);
  const gameNames = ranked.map(([g]) => g);
  const totalMins = logs.reduce((s, l) => s + l.minutes, 0);
  const sessions = logs.length;
  const prefix = section.isCurrentWeek ? 'This current week' : 'This week';

  const parts: string[] = [];

  if (ranked.length === 0) return '';

  if (ranked.length === 1) {
    const [g, d] = ranked[0];
    parts.push(`${prefix} was fully dedicated to ${g} — ${sessions} session${sessions !== 1 ? 's' : ''} totalling ${fmtMinutes(d.min)}.`);
  } else if (ranked.length === 2) {
    parts.push(`${prefix} split time between ${gameNames[0]} (${fmtMinutes(ranked[0][1].min)}) and ${gameNames[1]} (${fmtMinutes(ranked[1][1].min)}), covering ${sessions} sessions and ${fmtMinutes(totalMins)} total.`);
  } else {
    const top = ranked[0];
    const dominated = top[1].min > ranked[1][1].min * 1.5;
    if (dominated) {
      parts.push(`${prefix} was ${top[0]}-heavy (${fmtMinutes(top[1].min)}) with lighter sessions in ${gameNames.slice(1).join(', ')}. Total: ${sessions} sessions, ${fmtMinutes(totalMins)}.`);
    } else {
      parts.push(`${prefix} was well-spread across ${gameNames.length} titles — ${gameNames.join(', ')}. Total: ${sessions} sessions, ${fmtMinutes(totalMins)}.`);
    }
  }

  const gameBreakdowns: string[] = [];
  for (const [game, d] of ranked) {
    const highlights: string[] = [];
    if (d.types.has('complete')) {
      const creditAction = d.actions.find(a => /credits|final boss|completed the main|saw the credits/i.test(a));
      highlights.push(creditAction ? `reached the credits` : `logged a major completion`);
    }
    if (d.types.has('boss')) highlights.push(`defeated a boss`);
    if (d.types.has('rank-up')) {
      const lastRank = d.entries.filter(e => e.type === 'rank-up').pop();
      highlights.push(lastRank ? `ranked up (${lastRank.action})` : `ranked up`);
    }
    if (d.types.has('purchase')) highlights.push(`purchased and started`);
    const note = highlights.length ? ` — ${highlights.join(', ')}` : '';
    gameBreakdowns.push(`${game}: ${fmtMinutes(d.min)}${note}.`);
  }

  if (gameBreakdowns.length) {
    parts.push('<br><strong>Session breakdown:</strong><br>' + gameBreakdowns.map(b => `&nbsp;&nbsp;• ${esc(b)}`).join('<br>'));
  }

  return parts.join(' ');
}

function executiveSummary(logs: LogEntry[], weeks: WeekSection[]): string {
  const stats = byGameStats(logs);
  const ranked = Object.entries(stats).sort((a, b) => b[1].min - a[1].min);
  const total = logs.reduce((s, l) => s + l.minutes, 0);
  const sessions = logs.length;
  const completeGames = ranked.filter(([, d]) => d.types.has('complete')).map(([g]) => g);
  const bossGames = ranked.filter(([, d]) => d.types.has('boss') && !d.types.has('complete')).map(([g]) => g);
  const rankUpGames = ranked.filter(([, d]) => d.types.has('rank-up')).map(([g]) => g);
  const purchasedGames = ranked.filter(([, d]) => d.types.has('purchase')).map(([g]) => g);
  const progressOnly = ranked.filter(([, d]) => !d.types.has('complete') && !d.types.has('boss') && !d.types.has('rank-up') && !d.types.has('purchase')).map(([g]) => g);
  const topGame = ranked[0]?.[0];

  const parts: string[] = [];

  parts.push(
    `This report covers ${weeks.length} week${weeks.length !== 1 ? 's' : ''} of gaming activity: ` +
    `${sessions} total sessions, ${fmtMinutes(total)} logged across ${ranked.length} title${ranked.length !== 1 ? 's' : ''}.`
  );

  if (topGame) {
    const topPct = Math.round((stats[topGame].min / total) * 100);
    parts.push(
      `The most-played title was ${topGame} at ${fmtMinutes(stats[topGame].min)} (${topPct}% of total playtime).`
    );
  }

  if (completeGames.length) {
    parts.push(`Major completions this period: ${completeGames.join(', ')}.`);
  }
  if (bossGames.length) {
    parts.push(`Boss encounters logged (no full completion yet): ${bossGames.join(', ')}.`);
  }
  if (rankUpGames.length) {
    parts.push(`Competitive rank progress recorded in: ${rankUpGames.join(', ')}.`);
  }
  if (purchasedGames.length) {
    parts.push(`New acquisitions this period: ${purchasedGames.join(', ')}.`);
  }
  if (progressOnly.length) {
    parts.push(`Ongoing progress (not yet completed): ${progressOnly.join(', ')}.`);
  }

  return parts.join(' ');
}

function overallBullets(logs: LogEntry[]): string[] {
  const stats = byGameStats(logs);
  const ranked = Object.entries(stats).sort((a, b) => b[1].min - a[1].min);
  const bullets: string[] = [];

  for (const [game, d] of ranked) {
    if (d.types.has('complete') || d.types.has('boss')) {
      const creditAction = d.actions.find(a => /credits|final boss|completed the main|saw the credits/i.test(a));
      if (creditAction) {
        bullets.push(`Completion — ${game}: Reached the credits / main-run end (${fmtMinutes(d.min)} total).`);
      } else if (d.types.has('boss')) {
        const cnt = d.entries.filter(e => e.type === 'boss').length;
        bullets.push(`Boss Progress — ${game}: ${cnt} boss encounter${cnt > 1 ? 's' : ''} logged (${fmtMinutes(d.min)} total). Full completion not yet reached.`);
      } else {
        bullets.push(`Completion Milestone — ${game}: Major area completions logged (${fmtMinutes(d.min)} total).`);
      }
    }
  }

  for (const [game, d] of ranked) {
    if (d.types.has('purchase')) {
      const firstAction = d.entries.find(e => e.type === 'purchase');
      bullets.push(`New Game — ${game}: Acquired and play began${firstAction ? ` (first session: ${firstAction.action})` : ''}. ${fmtMinutes(d.min)} logged so far.`);
    }
  }

  const rankUpEntries = ranked.filter(([, d]) => d.types.has('rank-up'));
  if (rankUpEntries.length) {
    for (const [game, d] of rankUpEntries) {
      const rl = d.entries.filter(e => e.type === 'rank-up');
      const lastRank = rl[rl.length - 1];
      const detail = lastRank ? `Last recorded: ${lastRank.action}` : '';
      bullets.push(`Competitive — ${game}: ${rl.length} rank-up event${rl.length > 1 ? 's' : ''} over the period. ${detail}.`);
    }
  }

  const progressOnly = ranked.filter(([, d]) =>
    !d.types.has('complete') && !d.types.has('boss') && !d.types.has('rank-up') && !d.types.has('purchase')
  );
  for (const [game, d] of progressOnly) {
    bullets.push(`Ongoing — ${game}: ${d.entries.length} session${d.entries.length !== 1 ? 's' : ''}, ${fmtMinutes(d.min)} total. No completion milestone yet.`);
  }

  return bullets;
}

/** Returns true if a game is primarily competitive/multiplayer (only rank-up activity, no story arc) */
function isCompetitive(d: { types: Set<string> }): boolean {
  return d.types.has('rank-up') && !d.types.has('progress') && !d.types.has('complete') && !d.types.has('boss') && !d.types.has('purchase');
}

function nextWeekFocus(logs: LogEntry[]): { title: string; reason: string; priority: 'high' | 'medium' | 'low' }[] {
  if (!logs.length) return [];
  const stats = byGameStats(logs);
  const ranked = Object.entries(stats).sort((a, b) => b[1].min - a[1].min);

  const recentCutoff = new Date(Math.max(...logs.map(l => l.date.getTime())) - 14 * 24 * 60 * 60 * 1000);
  const recentGames = new Set(logs.filter(l => l.date >= recentCutoff).map(l => l.game));

  const high: { title: string; reason: string; priority: 'high' }[] = [];
  const medium: { title: string; reason: string; priority: 'medium' }[] = [];
  const low: { title: string; reason: string; priority: 'low' }[] = [];

  for (const [game, d] of ranked) {
    // Skip games that are fully completed.
    // Check both the type flag AND action text — a "Final Boss" entry that says
    // "saw the credits" is a completion regardless of how it was tagged.
    const creditsAction = d.actions.some(a => /saw the credits|finished the game|completed the main.?run|rolled credits/i.test(a));
    if (d.types.has('complete') || creditsAction) continue;

    // Competitive/multiplayer games → always medium with a caution note
    if (isCompetitive(d)) {
      const lastRank = [...d.entries].reverse().find(e => e.type === 'rank-up');
      medium.push({
        title: game,
        priority: 'medium',
        reason: `Competitive/multiplayer title. ${lastRank ? `Last session: ${lastRank.action}.` : ''} Note: sustained ranked play can divert time from finishing single-player titles — keep sessions contained so story progress doesn't stall.`,
      });
      continue;
    }

    // Single-player games with a boss encounter but no completion → high (close to the end)
    if (d.types.has('boss') && !d.types.has('complete') && recentGames.has(game)) {
      const lastBoss = [...d.entries].reverse().find(e => e.type === 'boss');
      high.push({
        title: game,
        priority: 'high',
        reason: `Boss encountered but not yet finished — push through to complete it. Last noted: "${lastBoss ? lastBoss.action : 'boss fight logged'}". Completing this frees up a slot for the next title.`,
      });
      continue;
    }

    // Active story progress in a single-player game → high
    if ((d.types.has('progress') || d.types.has('purchase')) && recentGames.has(game) && !d.types.has('rank-up')) {
      const lastEntry = [...d.entries].reverse().find(e => e.type === 'progress' || e.type === 'purchase');
      const isNew = d.types.has('purchase') && !d.types.has('progress');
      high.push({
        title: game,
        priority: 'high',
        reason: isNew
          ? `Recently started — build early momentum before other titles take over. First session: "${lastEntry ? lastEntry.action : 'play began'}".`
          : `Active story run — keep the momentum going. Currently at: "${lastEntry ? lastEntry.action : 'progress logged'}".`,
      });
      continue;
    }

    // Multiplayer/competitive game being played single-player too → HIGH
    // The story is unfinished and deserves focused sessions over ranked grinding
    if (d.types.has('rank-up') && (d.types.has('progress') || d.types.has('boss'))) {
      const lastStory = [...d.entries].reverse().find(e => e.type === 'progress' || e.type === 'boss');
      high.push({
        title: game,
        priority: 'high',
        reason: `Single-player story in progress alongside ranked play — prioritise story sessions to reach completion. Currently at: "${lastStory ? lastStory.action : 'progress logged'}". Consider limiting ranked matches this week to keep the story moving forward.`,
      });
      continue;
    }

    // Games not touched recently with meaningful time invested → low
    if (!recentGames.has(game) && d.min > 30) {
      low.push({
        title: game,
        priority: 'low',
        reason: `No recent sessions — ${fmtMinutes(d.min)} invested with no completion yet. Worth returning to before losing progress context.`,
      });
    }
  }

  return [...high, ...medium, ...low].slice(0, 7);
}

const PRIORITY_COLOR: Record<string, string> = {
  high: '#1a6b4a',
  medium: '#7a5c00',
  low: '#555',
};
const PRIORITY_BG: Record<string, string> = {
  high: '#e6f4ef',
  medium: '#fef8e6',
  low: '#f5f5f5',
};

const REPORT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', Arial, sans-serif;
    background: #fff;
    color: #111;
    font-size: 11pt;
    line-height: 1.5;
    padding: 28px 36px;
    max-width: 900px;
    min-width: 660px;
    margin: 0 auto;
  }

  .report-label {
    text-align: center;
    font-size: 9pt;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #555;
    margin-bottom: 6px;
  }

  .report-title {
    font-size: 26pt;
    font-weight: 700;
    line-height: 1.2;
    margin-bottom: 6px;
  }

  .report-meta {
    font-size: 10pt;
    color: #333;
    margin-bottom: 2px;
  }

  .divider {
    border: none;
    border-top: 1px solid #ccc;
    margin: 16px 0;
  }

  h2 {
    font-size: 11.5pt;
    font-weight: 700;
    margin: 22px 0 8px;
    padding-bottom: 4px;
    border-bottom: 2px solid #1a6b4a;
    color: #1a4a35;
  }

  .exec-summary {
    font-size: 10pt;
    color: #222;
    line-height: 1.8;
    margin-bottom: 12px;
  }

  .exec-summary p { margin-bottom: 6px; }

  .week-heading {
    font-size: 11pt;
    font-weight: 700;
    margin: 22px 0 4px;
    color: #1a4a35;
  }

  .week-narrative {
    font-size: 10pt;
    color: #333;
    line-height: 1.7;
    margin-bottom: 10px;
    padding: 10px 14px;
    background: #f8fbf9;
    border-left: 3px solid #1a6b4a;
    border-radius: 0 4px 4px 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
    table-layout: fixed;
    word-break: break-word;
    overflow-wrap: break-word;
  }

  thead tr { background: #f2f2f2; }

  th {
    text-align: left;
    font-size: 9.5pt;
    font-weight: 600;
    padding: 9px 12px;
    border-bottom: 1.5px solid #aaa;
    color: #444;
    overflow: hidden;
  }

  td {
    font-size: 9.5pt;
    padding: 9px 12px;
    line-height: 1.55;
    vertical-align: top;
    border-bottom: 1px solid #e0e0e0;
    word-break: break-word;
    overflow-wrap: anywhere;
    overflow: hidden;
    hyphens: auto;
  }

  tr:nth-child(even) td { background: #fafafa; }

  /* Columns total exactly 100% */
  .col-ts  { width: 14%; }
  .col-gm  { width: 19%; }
  .col-ac  { width: 47%; }
  .col-ty  { width: 11%; }
  .col-pt  { width: 9%; text-align: right; }
  th.col-pt { text-align: right; }

  .type-badge {
    display: inline-block;
    font-size: 7.5pt;
    font-weight: 600;
    padding: 2px 5px;
    border-radius: 4px;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
  }

  .week-total {
    font-size: 10pt;
    font-weight: 700;
    margin: 8px 0 20px;
    color: #222;
  }

  .breakdown-list {
    list-style: none;
    padding: 0;
    margin-top: 8px;
  }

  .breakdown-list li {
    font-size: 10pt;
    margin-bottom: 8px;
    line-height: 1.6;
    padding: 8px 12px;
    background: #fafafa;
    border-radius: 4px;
    border-left: 3px solid #ccc;
  }

  .breakdown-list li strong { color: #1a4a35; }

  /* Next week focus */
  .focus-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 8px;
  }

  .focus-item {
    padding: 12px 14px;
    border-radius: 6px;
    border-left: 4px solid;
  }

  .focus-item-title {
    font-size: 10.5pt;
    font-weight: 700;
    margin-bottom: 3px;
  }

  .focus-item-reason {
    font-size: 9.5pt;
    line-height: 1.6;
    color: #333;
  }

  .focus-item-priority {
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 4px;
  }

  @media print {
    @page { size: A4 portrait; margin: 12mm 14mm; }
    body { padding: 0; margin: 0; max-width: none; width: 100%; font-size: 9.5pt; }
    table { width: 100% !important; table-layout: fixed !important; }
    th, td { padding: 5px 6px; font-size: 8.5pt; overflow: hidden; }
    .type-badge { font-size: 7pt; padding: 1px 3px; }
    .no-break { page-break-inside: avoid; break-inside: avoid; }
    .week-heading { page-break-before: auto; break-before: auto; }
    table { page-break-inside: auto; break-inside: auto; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    thead { display: table-header-group; }
    .focus-item { break-inside: avoid; page-break-inside: avoid; }
    .week-narrative { background: #f8fbf9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    thead tr { background: #f2f2f2 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tr:nth-child(even) td { background: #fafafa !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

const TYPE_STYLES: Record<string, string> = {
  progress:  'background:#e8f4fd;color:#1565c0',
  complete:  'background:#e8f5e9;color:#2e7d32',
  boss:      'background:#fce4ec;color:#b71c1c',
  'rank-up': 'background:#fff3e0;color:#e65100',
  purchase:  'background:#f3e5f5;color:#6a1b9a',
};

export function buildPdfReport(from: Date, to: Date, logs: LogEntry[], title?: string): string {
  const asc = [...logs].sort((a, b) => a.date.getTime() - b.date.getTime());
  const total = asc.reduce((s, l) => s + l.minutes, 0);
  const gameCount = new Set(asc.map(l => l.game)).size;
  const weeks = splitIntoWeeks(asc, from, to);
  const execSummary = executiveSummary(asc, weeks);
  const breakdownBullets = overallBullets(asc);
  const focusItems = nextWeekFocus(asc);

  const weekSections = weeks.map((w, i) => {
    const wTotal = w.logs.reduce((s, l) => s + l.minutes, 0);
    const isLast = i === weeks.length - 1;
    const narrative = weekNarrative(w);

    const rows = w.logs.map(l => {
      const badgeStyle = TYPE_STYLES[l.type] ?? 'background:#eee;color:#333';
      return `
      <tr>
        <td class="col-ts">${esc(formatDate(l.date))}</td>
        <td class="col-gm">${esc(l.game)}</td>
        <td class="col-ac">${esc(l.action)}</td>
        <td class="col-ty"><span class="type-badge" style="${badgeStyle}">${esc(typeLabel(l.type))}</span></td>
        <td class="col-pt">${l.minutes} min</td>
      </tr>`;
    }).join('');

    const totalLabel = isLast && w.isCurrentWeek
      ? `${w.label} Total So Far: ${fmtMinutes(wTotal)}`
      : `${w.label} Total: ${fmtMinutes(wTotal)}`;

    return `
      <div class="no-break">
        <div class="week-heading">${esc(w.label)}: ${esc(formatDate(w.start))} – ${esc(formatDate(w.end))}</div>
        <div class="week-narrative">${narrative}</div>
        <table>
          <thead>
            <tr>
              <th class="col-ts">Date</th>
              <th class="col-gm">Game</th>
              <th class="col-ac">Session Notes</th>
              <th class="col-ty">Type</th>
              <th class="col-pt">Time</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="week-total">${esc(totalLabel)}</div>
      </div>`;
  }).join('');

  const breakdownHtml = breakdownBullets.length
    ? `<ul class="breakdown-list">${breakdownBullets.map(b => {
        const [head, ...rest] = b.split(' — ');
        return `<li><strong>${esc(head)}</strong>${rest.length ? ' — ' + esc(rest.join(' — ')) : ''}</li>`;
      }).join('')}</ul>`
    : '<p style="font-size:10pt;color:#555">No breakdown available yet.</p>';

  const focusHtml = focusItems.length
    ? `<div class="focus-grid">${focusItems.map(item => `
        <div class="focus-item" style="background:${PRIORITY_BG[item.priority]};border-color:${PRIORITY_COLOR[item.priority]}">
          <div class="focus-item-priority" style="color:${PRIORITY_COLOR[item.priority]}">${item.priority} priority</div>
          <div class="focus-item-title">${esc(item.title)}</div>
          <div class="focus-item-reason">${esc(item.reason)}</div>
        </div>`).join('')}</div>`
    : '<p style="font-size:10pt;color:#555">Not enough data yet to generate next-week recommendations.</p>';

  const emptyNote = !asc.length
    ? '<p style="padding:24px;text-align:center;color:#666;font-size:10pt;">No entries were logged for this period.</p>'
    : '';

  const execParas = execSummary.split('. ').filter(Boolean).map(s => `<p>${esc(s.endsWith('.') ? s : s + '.')}</p>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=700">
  <title>${title || 'Gaming Report'}</title>
  <style>${REPORT_STYLES}</style>
</head>
<body>
  <div class="report-label">Gaming Quest — Session Report</div>
  <div class="report-title">Gaming Quest Log${title ? ` — ${esc(title)}` : ''}</div>
  <div class="report-meta">Coverage Period: ${esc(formatDate(from))} – ${esc(formatDate(to))}</div>
  <div class="report-meta">Total Logged Playtime: ${esc(fmtMinutes(total))}</div>
  <div class="report-meta">Total Games Logged: ${gameCount} &nbsp;|&nbsp; Total Sessions: ${asc.length}</div>

  <hr class="divider">

  ${asc.length ? `
  <h2>Executive Summary</h2>
  <div class="exec-summary">${execParas}</div>

  ${weekSections}

  <hr class="divider">

  <h2>Overall Breakdown</h2>
  ${breakdownHtml}

  <hr class="divider">

  <h2>What to Work on Next Week</h2>
  ${focusHtml}
  ` : emptyNote}
</body>
</html>`;
}

export function printReport(html: string): void {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Please allow popups so the report can open for printing/saving as PDF.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.onload = () => { setTimeout(() => win.print(), 600); };
  setTimeout(() => { if (win.document.readyState === 'complete') win.print(); }, 1200);
}

export function downloadHtml(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { buildPdfReport as buildReport };
