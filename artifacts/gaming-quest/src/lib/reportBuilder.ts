import { LogEntry, NeedsWorkItem, Summary, formatDate, formatDateTime, labelType, badgeFor } from './logParser';

function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m] ?? m));
}

export function buildReport(
  from: Date,
  to: Date,
  logs: LogEntry[],
  summary: Summary,
  next: NeedsWorkItem[],
  label?: string,
): string {
  const asc = [...logs].sort((a, b) => a.date.getTime() - b.date.getTime());
  const rows = asc.length
    ? asc.map(l => `<tr>
        <td class="ts">${esc(formatDateTime(l.date))}</td>
        <td class="gm">${esc(l.game)}</td>
        <td class="ac">${esc(l.action)}</td>
        <td class="ty">${esc(labelType(l.type))}</td>
        <td class="pt">${l.minutes} min</td>
      </tr>`).join('')
    : '<tr><td colspan="5" style="padding:20px;text-align:center;color:#666">No entries for this period.</td></tr>';

  const needsWorkItems = next.length
    ? next.map(item => `<div class="next-item">
        <div class="next-head"><strong>${esc(item.game)}</strong><span class="badge ${badgeFor(item.status)}">${esc(item.status)}</span></div>
        <div style="font-size:12px;color:#444">${esc(item.note)}</div>
      </div>`).join('')
    : '<div class="next-item">No follow-up recommendations available yet.</div>';

  const bulletHtml = (summary.bullets.length ? summary.bullets : ['No entries were logged for this period.'])
    .map(t => `<div class="bullet">${esc(t)}</div>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>gaming-report-${from.toISOString().slice(0, 10)}</title>
  <link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap" rel="stylesheet">
  <style>
    body{font-family:'Satoshi',Inter,sans-serif;background:#fff;color:#111;padding:28px;max-width:1100px;margin:0 auto}
    h1{font-size:22px;margin:0 0 6px}
    h2{font-size:13px;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.06em;color:#555}
    .meta{font-size:13px;color:#555;margin:0 0 16px}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0 18px}
    .box{border:1px solid #cfcfcf;padding:10px;border-radius:8px}
    .box .lbl{font-size:11px;color:#555;text-transform:uppercase;letter-spacing:.06em}
    .box strong{display:block;font-size:17px;margin-top:3px}
    .bullets{display:grid;gap:8px;margin-bottom:18px}
    .bullet{border:1px solid #cfcfcf;padding:10px;border-radius:8px;font-size:13px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #cfcfcf;padding:7px 8px;font-size:11px;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}
    th{background:#f8f8f8;text-transform:uppercase;font-size:10px;letter-spacing:.04em;text-align:left}
    .ts{width:20%}.gm{width:18%}.ac{width:42%}.ty{width:10%}.pt{width:10%}
    .next-list{display:grid;gap:8px;margin-top:8px}
    .next-item{border:1px solid #cfcfcf;padding:10px;border-radius:8px}
    .next-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px}
    .badge{padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}
    .progress{background:#dde8f4}.complete{background:#dcead0}.rank-up{background:#f4e5ba}.purchase{background:#eadcf5}.boss{background:#f1d7e4}
    @media(max-width:700px){.grid{grid-template-columns:repeat(2,1fr)}}
    @media print{@page{size:A4;margin:14mm}}
  </style>
</head>
<body>
  <div style="text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:#666;margin-bottom:6px">ALL GAMING LOGS REPORT</div>
  <h1>Gaming Quest Log Report</h1>
  <p class="meta">Coverage Period: ${formatDate(from)} – ${formatDate(to)}${label ? ` · ${esc(label)}` : ''}</p>
  <div class="grid">
    <div class="box"><div class="lbl">Total Playtime</div><strong>${summary.total} min</strong></div>
    <div class="box"><div class="lbl">Games Logged</div><strong>${summary.games}</strong></div>
    <div class="box"><div class="lbl">Entries</div><strong>${asc.length}</strong></div>
    <div class="box"><div class="lbl">Needs Work</div><strong>${next.filter(n => ['Needs attention', 'Light progress'].includes(n.status)).length}</strong></div>
  </div>
  <h2>Executive Summary</h2>
  <div class="bullets">${bulletHtml}</div>
  <h2>Entries</h2>
  <table>
    <thead><tr>
      <th class="ts">Timestamp</th>
      <th class="gm">Game</th>
      <th class="ac">Action</th>
      <th class="ty">Type</th>
      <th class="pt">Playtime</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <h2>What Needs Work Next</h2>
  <div class="next-list">${needsWorkItems}</div>
</body>
</html>`;
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
