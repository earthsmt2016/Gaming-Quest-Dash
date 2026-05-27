import React, { useState, useEffect, useCallback } from 'react';
import {
  ReportSchedule, SavedReportMeta, SavedReportFull,
  fetchReportSchedule, saveReportSchedule,
  fetchSavedReports, fetchSavedReport, deleteReport, triggerReport,
} from '../lib/api';
import {
  buildPdfReport, printReport,
  ReportTemplate, ReportTheme, ReportOptions, DEFAULT_OPTIONS,
} from '../lib/reportBuilder';
import { useReportOptions } from '../hooks/useReportOptions';

const DAYS = [
  { value: 0, label: 'Sunday' }, { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' }, { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' }, { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];
const TYPE_LABELS: Record<string, string> = {
  progress: 'Progress', complete: 'Complete', 'rank-up': 'Rank Up', purchase: 'New Game', boss: 'Boss',
};
const TYPE_STYLES: Record<string, React.CSSProperties> = {
  progress: { background: '#e8f4fd', color: '#1565c0' },
  complete:  { background: '#e8f5e9', color: '#2e7d32' },
  boss:      { background: '#fce4ec', color: '#b71c1c' },
  'rank-up': { background: '#fff3e0', color: '#e65100' },
  purchase:  { background: '#f3e5f5', color: '#6a1b9a' },
};
const DEFAULT_BADGE: React.CSSProperties = { background: '#eee', color: '#333' };

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtMins(m: number): string {
  if (m === 0) return '0m';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}
function utcHMToLocal(utcHour: number, utcMin: number): string {
  const d = new Date();
  d.setUTCHours(utcHour, utcMin, 0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function localHMToUtc(localTime: string): { hour: number; minute: number } {
  const [h, m] = localTime.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return { hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

const TEMPLATES: { id: ReportTemplate; label: string; desc: string; preview: string }[] = [
  { id: 'classic',  label: 'Classic',  desc: 'Clean & professional',
    preview: `<div style="padding:6px 7px;font-size:9px;line-height:1.4">
      <div style="background:#1a6b4a;color:white;padding:3px 5px;border-radius:2px;margin-bottom:3px;font-weight:700">Report Title</div>
      <div style="background:#e6f4ef;height:5px;border-radius:1px;margin-bottom:2px"></div>
      <div style="height:3px;background:#f0f0f0;border-radius:1px;margin-bottom:2px;width:90%"></div>
      <div style="height:3px;background:#f0f0f0;border-radius:1px;margin-bottom:4px;width:75%"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px">
        ${[1,2,3].map(() => `<div style="background:#e6f4ef;height:14px;border-radius:2px"></div>`).join('')}
      </div>
    </div>` },
  { id: 'magazine', label: 'Magazine', desc: 'Editorial & visual',
    preview: `<div style="padding:0;font-size:9px;overflow:hidden;border-radius:5px">
      <div style="background:linear-gradient(140deg,#1a3d2b,#1a6b4a);color:white;padding:6px 7px">
        <div style="font-size:7px;opacity:0.65;margin-bottom:2px">GAMING QUEST</div>
        <div style="font-weight:700;margin-bottom:4px">Report Title</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px">
          ${[1,2].map(() => `<div style="background:rgba(255,255,255,0.15);padding:3px;border-radius:2px">
            <div style="font-size:9px;font-weight:700">14h</div><div style="font-size:6px;opacity:0.7">PLAYTIME</div>
          </div>`).join('')}
        </div>
      </div>
      <div style="padding:5px 7px;background:#f2f1ec">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px">
          ${[1,2].map(() => `<div style="background:white;border-left:3px solid #1a6b4a;padding:4px;border-radius:0 3px 3px 0;height:20px"></div>`).join('')}
        </div>
      </div>
    </div>` },
  { id: 'compact',  label: 'Compact',  desc: 'Dense & print-ready',
    preview: `<div style="padding:6px 7px;font-size:8px;line-height:1.4">
      <div style="display:flex;justify-content:space-between;border-bottom:2px solid #1a6b4a;padding-bottom:3px;margin-bottom:3px">
        <strong style="font-size:9px;color:#1a3d2b">Report</strong>
        <span style="font-size:7px;color:#666">12 May 2026</span>
      </div>
      <div style="display:flex;gap:5px;background:#e6f4ef;padding:3px 4px;border-radius:2px;margin-bottom:3px">
        ${[1,2,3].map(() => `<div><strong style="font-size:8px">14h</strong><div style="font-size:6px;color:#666">PLAY</div></div>`).join('')}
      </div>
      ${[1,2,3,4].map(() => `<div style="height:2px;background:#eee;border-radius:1px;margin-bottom:2px;width:${75+Math.random()*20|0}%"></div>`).join('')}
    </div>` },
];

const THEMES_META: { id: ReportTheme; label: string; primary: string; dark: string }[] = [
  { id: 'green',  label: 'Forest',  primary: '#1a6b4a', dark: '#1a3d2b' },
  { id: 'blue',   label: 'Ocean',   primary: '#1565c0', dark: '#0d2b5e' },
  { id: 'purple', label: 'Dusk',    primary: '#7b1fa2', dark: '#3a0d5c' },
  { id: 'slate',  label: 'Slate',   primary: '#455a64', dark: '#1c2830' },
];

interface ToolbarProps {
  options: ReportOptions;
  onChange: (patch: Partial<ReportOptions>) => void;
}

function ReportToolbar({ options, onChange }: ToolbarProps) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <style>{`
        .rt-card { background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
        .rt-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; cursor: pointer; user-select: none; }
        .rt-header:hover { background: var(--paper-2); }
        .rt-body { padding: 16px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 18px; }
        .rt-section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin-bottom: 8px; }
        .rt-template-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .rt-template-card {
          border: 2px solid var(--line); border-radius: 8px; cursor: pointer;
          overflow: hidden; transition: border-color 0.12s, box-shadow 0.12s;
          background: #f8f7f2;
        }
        .rt-template-card:hover { border-color: var(--accent); }
        .rt-template-card.selected { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(26,107,74,0.18); }
        .rt-template-preview { height: 80px; overflow: hidden; border-bottom: 1px solid var(--line); }
        .rt-template-info { padding: 7px 8px; }
        .rt-template-name { font-size: 13px; font-weight: 700; }
        .rt-template-desc { font-size: 11px; color: var(--muted); margin-top: 1px; }
        .rt-theme-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .rt-theme-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 12px; border-radius: 20px;
          border: 2px solid var(--line); cursor: pointer; background: var(--paper);
          font: inherit; font-size: 13px; transition: all 0.12s;
        }
        .rt-theme-btn:hover { border-color: var(--accent); }
        .rt-theme-btn.selected { border-color: var(--accent); background: var(--paper-2); font-weight: 600; }
        .rt-swatch { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; }
        .rt-toggles { display: flex; flex-wrap: wrap; gap: 8px; }
        .rt-toggle-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 12px; border-radius: 6px;
          border: 1.5px solid var(--line); cursor: pointer; background: var(--paper);
          font: inherit; font-size: 13px; transition: all 0.12s;
        }
        .rt-toggle-btn:hover { border-color: var(--accent); }
        .rt-toggle-btn.on { background: var(--accent); border-color: var(--accent); color: white; }
        .rt-check { font-size: 11px; }
      `}</style>
      <div className="rt-card">
        <div className="rt-header" onClick={() => setOpen(v => !v)}>
          <div>
            <span style={{ fontWeight: 700, fontSize: '14px' }}>⚙ PDF Settings</span>
            <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--muted)' }}>
              {TEMPLATES.find(t => t.id === options.template)?.label} · {THEMES_META.find(t => t.id === options.theme)?.label}
            </span>
          </div>
          <span style={{ color: 'var(--muted)', fontSize: '18px', lineHeight: 1 }}>{open ? '−' : '+'}</span>
        </div>
        {open && (
          <div className="rt-body">
            {/* Template */}
            <div>
              <div className="rt-section-label">Template</div>
              <div className="rt-template-grid">
                {TEMPLATES.map(t => (
                  <button
                    key={t.id}
                    className={`rt-template-card${options.template === t.id ? ' selected' : ''}`}
                    onClick={() => onChange({ template: t.id })}
                  >
                    <div
                      className="rt-template-preview"
                      dangerouslySetInnerHTML={{ __html: t.preview }}
                    />
                    <div className="rt-template-info">
                      <div className="rt-template-name">{t.label}</div>
                      <div className="rt-template-desc">{t.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Theme */}
            <div>
              <div className="rt-section-label">Colour Theme</div>
              <div className="rt-theme-row">
                {THEMES_META.map(th => (
                  <button
                    key={th.id}
                    className={`rt-theme-btn${options.theme === th.id ? ' selected' : ''}`}
                    onClick={() => onChange({ theme: th.id })}
                  >
                    <span className="rt-swatch" style={{ background: th.primary }} />
                    {th.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sections */}
            <div>
              <div className="rt-section-label">Include in PDF</div>
              <div className="rt-toggles">
                {([
                  ['showTable',    'Log table'],
                  ['showInsights', 'AI insights'],
                  ['showBreakdown','Breakdown'],
                  ['showFocus',    'Focus list'],
                ] as [keyof ReportOptions, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    className={`rt-toggle-btn${options[key] ? ' on' : ''}`}
                    onClick={() => onChange({ [key]: !options[key] })}
                  >
                    <span className="rt-check">{options[key] ? '✓' : '○'}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── In-app ReportViewer ──────────────────────────────────────────────────────

function ReportViewer({ report }: { report: SavedReportFull }) {
  const [showLog, setShowLog] = useState(false);
  const logs: Array<{ timestamp: string; game: string; action: string; minutes: number; type: string }> = report.logs_json ?? [];
  const insights = report.ai_insights_json ?? {};
  const insightEntries = Object.entries(insights).filter(([, v]) => v);

  const totalMins = logs.reduce((s, l) => s + l.minutes, 0);
  const gameCount = new Set(logs.map(l => l.game)).size;
  const sessions = logs.length;

  // Per-game grouping
  const gameMap: Record<string, { mins: number; types: Set<string>; entries: typeof logs }> = {};
  for (const l of logs) {
    if (!gameMap[l.game]) gameMap[l.game] = { mins: 0, types: new Set(), entries: [] };
    gameMap[l.game].mins += l.minutes;
    gameMap[l.game].types.add(l.type);
    gameMap[l.game].entries.push(l);
  }
  const rankedGames = Object.entries(gameMap).sort((a, b) => b[1].mins - a[1].mins);

  return (
    <>
      <style>{`
        .rv-cover {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px;
        }
        .rv-stat {
          background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px;
        }
        .rv-stat-val { font-size: 20px; font-weight: 800; line-height: 1; }
        .rv-stat-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 3px; }
        .rv-section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin: 14px 0 8px; }
        .rv-game-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
        .rv-game-card {
          border: 1px solid var(--soft-line, var(--line)); border-radius: 8px; padding: 12px 14px;
          background: #fffef9; border-left: 4px solid var(--accent);
        }
        .rv-game-name { font-size: 13px; font-weight: 700; margin-bottom: 3px; }
        .rv-game-time { font-size: 19px; font-weight: 800; color: var(--accent); line-height: 1; margin-bottom: 6px; }
        .rv-game-meta { font-size: 11px; color: var(--muted); margin-bottom: 6px; }
        .rv-badges { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 7px; }
        .rv-badge { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; }
        .rv-game-last { font-size: 11px; color: #555; line-height: 1.4; border-top: 1px solid var(--soft-line); padding-top: 7px; font-style: italic; }
        .rv-insight-card {
          background: var(--paper-2); border: 1px solid var(--line); border-radius: 8px;
          padding: 14px 16px; margin-bottom: 8px; border-left: 4px solid var(--accent);
        }
        .rv-insight-game { font-size: 13px; font-weight: 700; margin-bottom: 5px; }
        .rv-insight-text { font-size: 12px; color: #333; line-height: 1.55; }
        .rv-table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; }
        .rv-table { width: 100%; border-collapse: collapse; min-width: 500px; }
        .rv-th {
          background: #f8f3eb; font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em;
          color: var(--muted); border-bottom: 1px solid var(--line); padding: 8px 10px; text-align: left; font-weight: 700;
        }
        .rv-td { padding: 8px 10px; border-bottom: 1px solid var(--soft-line, #eee); font-size: 12px; vertical-align: top; }
        .rv-type-badge { display:inline-block; font-size:10px; font-weight:600; padding:2px 6px; border-radius:4px; white-space:nowrap; }
      `}</style>

      {/* Stats row */}
      <div className="rv-cover">
        {[['Playtime', fmtMins(totalMins)], ['Games', String(gameCount)], ['Sessions', String(sessions)]].map(([k, v]) => (
          <div key={k} className="rv-stat">
            <div className="rv-stat-val">{v}</div>
            <div className="rv-stat-label">{k}</div>
          </div>
        ))}
      </div>

      {/* Per-game cards */}
      <div className="rv-section-title">Games this period</div>
      <div className="rv-game-grid">
        {rankedGames.map(([game, d]) => {
          const lastEntry = [...d.entries].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
          return (
            <div key={game} className="rv-game-card">
              <div className="rv-game-name">{game}</div>
              <div className="rv-game-time">{fmtMins(d.mins)}</div>
              <div className="rv-game-meta">{d.entries.length} session{d.entries.length !== 1 ? 's' : ''}</div>
              <div className="rv-badges">
                {[...d.types].map(t => (
                  <span key={t} className="rv-badge" style={TYPE_STYLES[t] ?? DEFAULT_BADGE}>
                    {TYPE_LABELS[t] ?? t}
                  </span>
                ))}
              </div>
              {lastEntry && (
                <div className="rv-game-last">
                  {lastEntry.action.slice(0, 72)}{lastEntry.action.length > 72 ? '…' : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* AI insights */}
      {insightEntries.length > 0 && (
        <>
          <div className="rv-section-title">AI recommendations</div>
          {insightEntries.map(([game, step]) => (
            <div key={game} className="rv-insight-card">
              <div className="rv-insight-game">{game}</div>
              <div className="rv-insight-text">{step}</div>
            </div>
          ))}
        </>
      )}

      {/* Session log (collapsible) */}
      <div style={{ marginTop: '14px' }}>
        <button
          onClick={() => setShowLog(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--accent)', fontWeight: 600, padding: 0 }}
        >
          {showLog ? '▲ Hide session log' : '▼ Show session log'} ({logs.length} entries)
        </button>
        {showLog && (
          <div className="rv-table-wrap" style={{ marginTop: '8px' }}>
            <table className="rv-table">
              <thead>
                <tr>{['Timestamp', 'Game', 'Action', 'Type', 'Time'].map(h => (
                  <th key={h} className="rv-th">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {[...logs]
                  .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                  .map((l, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fffdf8' : undefined }}>
                      <td className="rv-td" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(l.timestamp)}</td>
                      <td className="rv-td" style={{ fontWeight: 600 }}>{l.game}</td>
                      <td className="rv-td">{l.action}</td>
                      <td className="rv-td">
                        <span className="rv-type-badge" style={TYPE_STYLES[l.type] ?? DEFAULT_BADGE}>
                          {TYPE_LABELS[l.type] ?? l.type}
                        </span>
                      </td>
                      <td className="rv-td" style={{ whiteSpace: 'nowrap' }}>{l.minutes}m</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [options, patchOptions] = useReportOptions();

  const [schedule, setSchedule] = useState<ReportSchedule>({ id: null, day_of_week: 0, hour: 17, minute: 0, enabled: false });
  const [scheduleTime, setScheduleTime] = useState('17:00');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  const [reports, setReports] = useState<SavedReportMeta[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [fullReport, setFullReport] = useState<SavedReportFull | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);

  const loadAll = useCallback(async () => {
    setReportsLoading(true);
    try {
      const [sched, reps] = await Promise.all([fetchReportSchedule(), fetchSavedReports()]);
      setSchedule(sched);
      setScheduleTime(utcHMToLocal(sched.hour, sched.minute));
      setReports(reps);
    } catch { }
    finally { setReportsLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, []);

  const handleDownloadPdf = useCallback(async (r: SavedReportMeta) => {
    if (pdfLoadingId) return;
    setPdfLoadingId(r.id);
    try {
      const full = await fetchSavedReport(r.id);
      const from = new Date(r.period_from);
      const to = new Date(r.period_to);
      const logs = (full.logs_json ?? []).map((l: any) => ({ ...l, date: new Date(l.timestamp) }));
      const insights = full.ai_insights_json ?? {};
      const html = buildPdfReport(from, to, logs, r.title, insights, new Set(), new Set(), options);
      printReport(html);
    } finally { setPdfLoadingId(null); }
  }, [pdfLoadingId, options]);

  const handleGenerateNow = async () => {
    if (generating) return;
    setGenerating(true);
    try { await triggerReport(); await loadAll(); }
    catch { alert('Could not generate report. Check that you have log entries this week.'); }
    finally { setGenerating(false); }
  };

  const handleSaveSchedule = async () => {
    const { hour, minute } = localHMToUtc(scheduleTime);
    setScheduleSaving(true);
    try {
      const saved = await saveReportSchedule({ day_of_week: schedule.day_of_week, hour, minute, enabled: schedule.enabled });
      setSchedule(saved);
      setScheduleSaved(true);
      setTimeout(() => setScheduleSaved(false), 2500);
    } catch { alert('Could not save schedule.'); }
    finally { setScheduleSaving(false); }
  };

  const handleView = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); setFullReport(null); return; }
    setExpandedId(id); setFullReport(null); setViewLoading(true);
    try { setFullReport(await fetchSavedReport(id)); }
    catch { alert('Could not load report.'); setExpandedId(null); }
    finally { setViewLoading(false); }
  };

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await deleteReport(id);
      setReports(prev => prev.filter(r => r.id !== id));
      if (expandedId === id) { setExpandedId(null); setFullReport(null); }
    } catch { alert('Could not delete report.'); }
    finally { setDeletingId(null); }
  };

  return (
    <>
      <style>{`
        .rp-section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin: 0 0 12px; }
        .rp-schedule-grid { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: end; }
        .rp-field { display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
        .rp-input {
          border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px;
          font-size: 14px; background: var(--paper); font-family: inherit;
          width: 100%; box-sizing: border-box;
        }
        .rp-toggle-row { display: flex; align-items: center; gap: 10px; margin-top: 10px; font-size: 14px; }
        .rp-toggle {
          width: 40px; height: 22px; background: var(--line); border-radius: 11px;
          border: none; cursor: pointer; position: relative; transition: background 0.2s; flex-shrink: 0; padding: 0;
        }
        .rp-toggle.on { background: var(--accent); }
        .rp-toggle::after {
          content:''; position:absolute; top:3px; left:3px; width:16px; height:16px;
          background:#fff; border-radius:50%; transition:left 0.2s; box-shadow:0 1px 3px rgba(0,0,0,0.2);
        }
        .rp-toggle.on::after { left:21px; }
        .rp-report-card { border: 1px solid var(--soft-line, var(--line)); border-radius: 12px; overflow: hidden; }
        .rp-report-row {
          display: flex; align-items: center; gap: 10px; padding: 14px 16px;
          background: var(--paper); flex-wrap: wrap; cursor: pointer;
        }
        .rp-report-row:hover { background: var(--paper-2); }
        .rp-badge-auto { font-size:10px; font-weight:700; text-transform:uppercase; padding:2px 7px; border-radius:6px; letter-spacing:0.06em; background:#e8f3ff; color:#1a6bb5; flex-shrink:0; }
        .rp-badge-manual { font-size:10px; font-weight:700; text-transform:uppercase; padding:2px 7px; border-radius:6px; letter-spacing:0.06em; background:#e8f8f0; color:#2d6a4f; flex-shrink:0; }
        .rp-viewer { border-top: 1px solid var(--soft-line, var(--line)); padding: 18px; background: #fffdf8; }
        .rp-empty { padding: 32px; text-align: center; color: var(--muted); font-size: 14px; }
        @media (max-width: 600px) {
          .rp-schedule-grid { grid-template-columns: auto auto; justify-content: start; }
          .rp-schedule-grid > :last-child { grid-column: 1 / -1; }
        }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* PDF Settings toolbar */}
        <ReportToolbar options={options} onChange={patchOptions} />

        {/* Schedule */}
        <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '16px', boxShadow: 'var(--shadow)' }}>
          <div className="rp-section-label">Auto-generate schedule</div>
          <div className="rp-schedule-grid">
            <label className="rp-field">
              <span>Day</span>
              <select className="rp-input" value={schedule.day_of_week}
                onChange={e => setSchedule(s => ({ ...s, day_of_week: Number(e.target.value) }))}>
                {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </label>
            <label className="rp-field">
              <span>Time</span>
              <input type="time" className="rp-input" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} />
            </label>
            <button className="btn primary" onClick={handleSaveSchedule} disabled={scheduleSaving}
              style={{ padding: '8px 16px', alignSelf: 'flex-end', whiteSpace: 'nowrap' }}>
              {scheduleSaved ? '✓ Saved' : scheduleSaving ? 'Saving…' : 'Save schedule'}
            </button>
          </div>
          <div className="rp-toggle-row">
            <button className={`rp-toggle${schedule.enabled ? ' on' : ''}`}
              onClick={() => setSchedule(s => ({ ...s, enabled: !s.enabled }))} aria-label="Enable schedule" />
            <span style={{ color: schedule.enabled ? 'var(--text)' : 'var(--muted)' }}>
              {schedule.enabled
                ? `Auto-generate every ${DAYS.find(d => d.value === schedule.day_of_week)?.label} at ${scheduleTime}`
                : 'Schedule disabled — toggle to enable'}
            </span>
          </div>
          <button className="btn soft" onClick={handleGenerateNow} disabled={generating}
            style={{ marginTop: '10px', fontSize: '13px', padding: '6px 14px' }}>
            {generating ? '⏳ Generating…' : '⚡ Generate now'}
          </button>
        </div>

        {/* Reports list */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div className="rp-section-label" style={{ margin: 0 }}>
              All reports
              {reports.length > 0 && (
                <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--muted)', fontWeight: 400 }}>
                  ({reports.length})
                </span>
              )}
            </div>
          </div>

          {reportsLoading ? (
            <div className="rp-empty">Loading…</div>
          ) : reports.length === 0 ? (
            <div className="rp-empty">
              No reports saved yet.<br />
              <span style={{ fontSize: '13px' }}>
                Use "Save to library" on the weekly report panel, or enable the schedule above.
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {reports.map(r => (
                <div key={r.id} className="rp-report-card">
                  <div className="rp-report-row" onClick={() => handleView(r.id)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '2px' }}>{r.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        {fmtDate(r.period_from)} – {fmtDate(r.period_to)} · {r.log_count} entr{r.log_count === 1 ? 'y' : 'ies'} · Saved {fmtDateTime(r.generated_at)}
                      </div>
                    </div>
                    <span className={r.trigger_type === 'scheduled' ? 'rp-badge-auto' : 'rp-badge-manual'}>
                      {r.trigger_type === 'scheduled' ? 'Auto' : 'Manual'}
                    </span>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button className="btn soft" onClick={e => { e.stopPropagation(); handleView(r.id); }}
                        style={{ fontSize: '12px', padding: '4px 10px' }}>
                        {expandedId === r.id ? '▲ Collapse' : '▼ View'}
                      </button>
                      <button className="btn soft" onClick={e => { e.stopPropagation(); handleDownloadPdf(r); }}
                        disabled={pdfLoadingId === r.id} title="Download PDF"
                        style={{ fontSize: '12px', padding: '4px 10px' }}>
                        {pdfLoadingId === r.id ? '…' : '⬇ PDF'}
                      </button>
                      <button className="btn soft" onClick={e => { e.stopPropagation(); handleDelete(r.id, r.title); }}
                        disabled={deletingId === r.id}
                        style={{ fontSize: '12px', padding: '4px 10px', color: '#c0392b' }}>
                        {deletingId === r.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  </div>

                  {expandedId === r.id && (
                    <div className="rp-viewer">
                      {viewLoading || !fullReport ? (
                        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px', fontSize: '13px' }}>
                          Loading report…
                        </div>
                      ) : (
                        <ReportViewer report={fullReport} />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
