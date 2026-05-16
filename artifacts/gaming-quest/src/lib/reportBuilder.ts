import { LogEntry, formatDate, formatDateTime, monStart, sunEnd } from './logParser';

function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m] ?? m));
}

function fmtMinutes(mins: number): string {
  if (mins < 60) return `${mins} minutes`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${mins} minutes (${h} ${h === 1 ? 'hour' : 'hours'})`;
  const hFrac = +(mins / 60).toFixed(2);
  // Use fractional form for simple halves/quarters, otherwise H hr M min
  const frac = mins / 60;
  const simple = frac === Math.floor(frac) || (frac * 4) === Math.floor(frac * 4);
  if (simple) return `${mins} minutes (${frac % 1 === 0 ? frac : hFrac} hours)`;
  return `${mins} minutes (${h} hour${h !== 1 ? 's' : ''} ${m} minutes)`;
}

export interface WeekSection {
  weekNum: number;
  start: Date;
  end: Date;
  logs: LogEntry[];
  label: string; // e.g. "Week 1"
  isCurrentWeek: boolean;
}

/** Split a set of logs into Mon–Sun calendar weeks within a date range */
export function splitIntoWeeks(logs: LogEntry[], from: Date, to: Date): WeekSection[] {
  if (!logs.length) return [];

  // Walk from the Monday of the earliest log to the Sunday of the latest
  const earliest = new Date(Math.max(from.getTime(), Math.min(...logs.map(l => l.date.getTime()))));
  const latest   = new Date(Math.min(to.getTime(),   Math.max(...logs.map(l => l.date.getTime()))));

  const weeks: WeekSection[] = [];
  let cursor = monStart(earliest);
  let weekNum = 1;
  const today = new Date();

  while (cursor <= latest) {
    const wEnd = sunEnd(cursor);
    const cappedEnd = wEnd > to ? to : wEnd;
    const wLogs = logs
      .filter(l => l.date >= cursor && l.date <= cappedEnd)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (wLogs.length > 0) {
      weeks.push({
        weekNum,
        start: new Date(cursor),
        end: new Date(cappedEnd),
        logs: wLogs,
        label: `Week ${weekNum}`,
        isCurrentWeek: today >= cursor && today <= wEnd,
      });
      weekNum++;
    }

    cursor = new Date(wEnd.getTime() + 1);
  }

  return weeks;
}

/** Generate a short narrative sentence for a week */
function weekNarrative(section: WeekSection): string {
  const logs = section.logs;
  const byGame: Record<string, { min: number; cnt: number }> = {};
  logs.forEach(l => {
    if (!byGame[l.game]) byGame[l.game] = { min: 0, cnt: 0 };
    byGame[l.game].min += l.minutes;
    byGame[l.game].cnt++;
  });
  const ranked = Object.entries(byGame).sort((a, b) => b[1].min - a[1].min);
  const gameNames = ranked.map(([g]) => g);
  const completes = logs.filter(l => ['complete', 'boss'].includes(l.type));
  const rankUps = logs.filter(l => l.type === 'rank-up');
  const purchases = logs.filter(l => l.type === 'purchase');

  const parts: string[] = [];

  if (ranked.length === 1) {
    const [top] = ranked;
    parts.push(`This week was entirely dedicated to ${top[0]}.`);
  } else if (ranked.length === 2) {
    parts.push(`This week featured ${gameNames[0]} and ${gameNames[1]}.`);
  } else {
    const top = gameNames[0];
    const others = gameNames.slice(1).join(', ');
    const dominated = ranked[0][1].min > ranked[1][1].min * 1.5;
    if (dominated) {
      parts.push(`This week was ${top}-heavy, with additional progress in ${others}.`);
    } else {
      parts.push(`This week saw varied activity across ${gameNames.length} titles: ${gameNames.join(', ')}.`);
    }
  }

  const milestones: string[] = [];
  if (completes.length) {
    const games = [...new Set(completes.map(l => l.game))];
    milestones.push(`completion milestones in ${games.join(' and ')}`);
  }
  if (rankUps.length) {
    const games = [...new Set(rankUps.map(l => l.game))];
    milestones.push(`competitive progress in ${games.join(' and ')}`);
  }
  if (purchases.length) {
    const games = [...new Set(purchases.map(l => l.game))];
    milestones.push(`new purchase${purchases.length > 1 ? 's' : ''} (${games.join(', ')})`);
  }

  if (section.isCurrentWeek) {
    parts[0] = parts[0].replace('This week', 'This current week');
    if (ranked.length > 2) {
      parts[0] = `This current week shifted to a more varied portfolio, with activity spread across ${gameNames.join(', ')}.`;
    }
  }

  return parts.join(' ');
}

/** Generate the executive summary for the whole period */
function executiveSummary(logs: LogEntry[], weeks: WeekSection[]): string {
  const byGame: Record<string, { min: number; types: Set<string> }> = {};
  logs.forEach(l => {
    if (!byGame[l.game]) byGame[l.game] = { min: 0, types: new Set() };
    byGame[l.game].min += l.minutes;
    byGame[l.game].types.add(l.type);
  });
  const gameList = Object.keys(byGame);
  const completeGames = gameList.filter(g => byGame[g].types.has('complete'));
  const progressGames = gameList.filter(g => !byGame[g].types.has('complete') && byGame[g].types.has('progress'));
  const rankUpGames = gameList.filter(g => byGame[g].types.has('rank-up'));
  const ranked = Object.entries(byGame).sort((a, b) => b[1].min - a[1].min);

  const parts: string[] = [];

  parts.push(
    `This report consolidates all gaming activity logged${weeks.length > 1 ? ` so far across ${weeks.length} reporting window${weeks.length > 1 ? 's' : ''}` : ''}.`
  );

  const descriptions: string[] = [];
  if (completeGames.length) descriptions.push(`major ${completeGames.join(' and ')} completion milestones`);
  if (rankUpGames.length) descriptions.push(`competitive ${rankUpGames.join(' and ')} gains`);
  if (progressGames.length) descriptions.push(`steady advancement in ${progressGames.join(', ')}`);

  if (descriptions.length) {
    const tracked = ranked.map(([g]) => g);
    parts.push(
      `The tracked play shows a mix of focused completion runs and broader variety weeks, ranging from ${descriptions.join(', and ')}.`
    );
  }

  return parts.join(' ');
}

/** Generate overall breakdown bullets */
function overallBullets(logs: LogEntry[], weeks: WeekSection[]): string[] {
  const byGame: Record<string, { min: number; types: Set<string>; actions: string[] }> = {};
  logs.forEach(l => {
    if (!byGame[l.game]) byGame[l.game] = { min: 0, types: new Set(), actions: [] };
    byGame[l.game].min += l.minutes;
    byGame[l.game].types.add(l.type);
    byGame[l.game].actions.push(l.action);
  });
  const ranked = Object.entries(byGame).sort((a, b) => b[1].min - a[1].min);

  const bullets: string[] = [];

  // Completions / major milestones
  for (const [game, data] of ranked) {
    if (data.types.has('complete') || data.types.has('boss')) {
      const creditAction = data.actions.find(a => /credits|final boss|completed the main/i.test(a));
      if (creditAction) {
        bullets.push(`Focused Completion: ${game} reached the credits / main-run end.`);
      } else {
        const bossCount = logs.filter(l => l.game === game && l.type === 'boss').length;
        if (bossCount) {
          bullets.push(`Boss Progress: ${game} had ${bossCount} boss encounter${bossCount > 1 ? 's' : ''} logged.`);
        } else {
          bullets.push(`Completion Milestone: ${game} logged major completion entries.`);
        }
      }
    }
  }

  // New momentum / games that started this period
  for (const [game, data] of ranked) {
    if (data.types.has('purchase')) {
      bullets.push(`New Purchase: ${game} was acquired and play began this period.`);
    }
  }

  // Rank-up / competitive
  const rankUpGames = ranked.filter(([, d]) => d.types.has('rank-up')).map(([g]) => g);
  if (rankUpGames.length) {
    const details: string[] = [];
    for (const game of rankUpGames) {
      const rl = logs.filter(l => l.game === game && l.type === 'rank-up');
      details.push(`${game} (${rl.length} rank-up entr${rl.length > 1 ? 'ies' : 'y'})`);
    }
    bullets.push(`Competitive Progress: ${details.join(', ')}.`);
  }

  // Variety / portfolio
  const allGames = Object.keys(byGame);
  if (allGames.length > 3) {
    bullets.push(`Total Portfolio: Logged titles now include ${allGames.join(', ')}.`);
  }

  // Progress-only games
  const progressOnly = ranked
    .filter(([, d]) => !d.types.has('complete') && !d.types.has('boss') && !d.types.has('rank-up') && !d.types.has('purchase'))
    .map(([g]) => g);
  if (progressOnly.length) {
    bullets.push(`Steady Advancement: ${progressOnly.join(', ')} ${progressOnly.length > 1 ? 'are' : 'is'} ongoing with regular progress entries.`);
  }

  return bullets;
}

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
    font-size: 13pt;
    font-weight: 700;
    margin-bottom: 2px;
  }

  .report-meta {
    font-size: 10pt;
    color: #333;
    margin-bottom: 2px;
  }

  .divider {
    border: none;
    border-top: 1px solid #ccc;
    margin: 14px 0;
  }

  h2 {
    font-size: 11pt;
    font-weight: 700;
    margin: 20px 0 6px;
  }

  .exec-summary {
    font-size: 10pt;
    color: #222;
    line-height: 1.7;
    margin-bottom: 12px;
  }

  /* Week sections */
  .week-heading {
    font-size: 11pt;
    font-weight: 700;
    margin: 20px 0 4px;
  }

  .week-narrative {
    font-size: 10pt;
    color: #333;
    line-height: 1.6;
    margin-bottom: 10px;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
    table-layout: fixed;
  }

  thead tr {
    background: #f2f2f2;
  }

  th {
    text-align: left;
    font-size: 9pt;
    font-weight: 600;
    padding: 7px 10px;
    border-bottom: 1.5px solid #aaa;
    color: #444;
  }

  td {
    font-size: 9.5pt;
    padding: 7px 10px;
    vertical-align: top;
    border-bottom: 1px solid #e0e0e0;
    word-break: break-word;
    overflow-wrap: break-word;
  }

  tr:nth-child(even) td { background: #fafafa; }

  .col-ts  { width: 17%; }
  .col-gm  { width: 20%; }
  .col-ac  { width: 53%; }
  .col-pt  { width: 10%; white-space: nowrap; text-align: right; }

  th.col-pt { text-align: right; }

  .week-total {
    font-size: 10pt;
    font-weight: 700;
    margin: 8px 0 18px;
    color: #222;
  }

  /* Overall breakdown */
  .breakdown-list {
    list-style: disc;
    padding-left: 18px;
    margin-top: 6px;
  }

  .breakdown-list li {
    font-size: 10pt;
    margin-bottom: 6px;
    line-height: 1.6;
  }

  @media print {
    @page { size: A4; margin: 14mm 16mm; }
    body { padding: 0; font-size: 10pt; }
    .no-break { page-break-inside: avoid; }
    .week-heading { page-break-before: auto; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
  }
`;

export function buildPdfReport(
  from: Date,
  to: Date,
  logs: LogEntry[],
  title?: string,
): string {
  const asc = [...logs].sort((a, b) => a.date.getTime() - b.date.getTime());
  const total = asc.reduce((s, l) => s + l.minutes, 0);
  const gameCount = new Set(asc.map(l => l.game)).size;
  const weeks = splitIntoWeeks(asc, from, to);
  const execSummary = executiveSummary(asc, weeks);
  const breakdownBullets = overallBullets(asc, weeks);

  const weekSections = weeks.map((w, i) => {
    const wTotal = w.logs.reduce((s, l) => s + l.minutes, 0);
    const isLast = i === weeks.length - 1;
    const narrative = weekNarrative(w);

    const rows = w.logs.map(l => `
      <tr>
        <td class="col-ts">${esc(formatDate(l.date))}</td>
        <td class="col-gm">${esc(l.game)}</td>
        <td class="col-ac">${esc(l.action)}</td>
        <td class="col-pt">${l.minutes} min</td>
      </tr>
    `).join('');

    const totalLabel = isLast && w.isCurrentWeek
      ? `${w.label} Total So Far: ${fmtMinutes(wTotal)}`
      : `${w.label} Total: ${fmtMinutes(wTotal)}`;

    return `
      <div class="no-break">
        <div class="week-heading">${esc(w.label)}: ${esc(formatDate(w.start))} – ${esc(formatDate(w.end))}</div>
        <p class="week-narrative">${esc(narrative)}</p>
        <table>
          <thead>
            <tr>
              <th class="col-ts">Timestamp</th>
              <th class="col-gm">Game</th>
              <th class="col-ac">Action</th>
              <th class="col-pt">Playtime</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="week-total">${esc(totalLabel)}</div>
      </div>
    `;
  }).join('');

  const breakdownHtml = breakdownBullets.length
    ? `<ul class="breakdown-list">${breakdownBullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`
    : '<p style="font-size:10pt;color:#555">No breakdown available yet.</p>';

  const emptyNote = !asc.length
    ? '<p style="padding:24px;text-align:center;color:#666;font-size:10pt;">No entries were logged for this period.</p>'
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title || 'Gaming Report'}</title>
  <style>${REPORT_STYLES}</style>
</head>
<body>
  <div class="report-label">All Gaming Logs Report</div>
  <div class="report-title">Gaming Quest Log${title ? ` — ${esc(title)}` : ''}</div>
  <div class="report-meta">Coverage Period: ${esc(formatDate(from))} – ${esc(formatDate(to))}</div>
  <div class="report-meta">Total Logged Playtime: ${esc(fmtMinutes(total))}</div>
  <div class="report-meta">Total Games Logged: ${gameCount}</div>

  <hr class="divider">

  ${asc.length ? `
  <h2>Executive Summary</h2>
  <p class="exec-summary">${esc(execSummary)}</p>

  ${weekSections}

  <hr class="divider">

  <h2>Overall Breakdown</h2>
  ${breakdownHtml}
  ` : emptyNote}
</body>
</html>`;
}

/** Open report in a new window and trigger print dialog */
export function printReport(html: string): void {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Please allow popups so the report can open for printing/saving as PDF.');
    return;
  }
  win.document.write(html);
  win.document.close();
  // Give fonts time to load before printing
  win.onload = () => {
    setTimeout(() => win.print(), 600);
  };
  // Fallback if onload already fired
  setTimeout(() => {
    if (win.document.readyState === 'complete') win.print();
  }, 1200);
}

/** Legacy: download as HTML file */
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

// Keep old buildReport export for any callers — redirect to new builder
export { buildPdfReport as buildReport };
