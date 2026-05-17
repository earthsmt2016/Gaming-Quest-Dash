import React, { useState, useEffect, useCallback } from 'react';
import {
  ReportSchedule,
  SavedReportMeta,
  SavedReportFull,
  fetchReportSchedule,
  saveReportSchedule,
  fetchSavedReports,
  fetchSavedReport,
  deleteReport,
} from '../lib/api';

const DAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const TYPE_LABELS: Record<string, string> = {
  progress: 'Progress', complete: 'Complete', 'rank-up': 'Rank Up',
  purchase: 'Purchase', boss: 'Boss',
};

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function padTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface ReportsPageProps {
  open: boolean;
  onClose: () => void;
}

export default function ReportsPage({ open, onClose }: ReportsPageProps) {
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

  const loadAll = useCallback(async () => {
    setReportsLoading(true);
    try {
      const [sched, reps] = await Promise.all([fetchReportSchedule(), fetchSavedReports()]);
      setSchedule(sched);
      setScheduleTime(padTime(sched.hour, sched.minute));
      setReports(reps);
    } catch {
      // ignore
    } finally {
      setReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadAll();
  }, [open, loadAll]);

  const handleSaveSchedule = async () => {
    const [hStr, mStr] = scheduleTime.split(':');
    const hour = parseInt(hStr, 10);
    const minute = parseInt(mStr, 10);
    setScheduleSaving(true);
    try {
      const saved = await saveReportSchedule({ day_of_week: schedule.day_of_week, hour, minute, enabled: schedule.enabled });
      setSchedule(saved);
      setScheduleSaved(true);
      setTimeout(() => setScheduleSaved(false), 2500);
    } catch {
      alert('Could not save schedule.');
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleView = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); setFullReport(null); return; }
    setExpandedId(id);
    setFullReport(null);
    setViewLoading(true);
    try {
      const data = await fetchSavedReport(id);
      setFullReport(data);
    } catch {
      alert('Could not load report.');
      setExpandedId(null);
    } finally {
      setViewLoading(false);
    }
  };

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await deleteReport(id);
      setReports(prev => prev.filter(r => r.id !== id));
      if (expandedId === id) { setExpandedId(null); setFullReport(null); }
    } catch {
      alert('Could not delete report.');
    } finally {
      setDeletingId(null);
    }
  };

  if (!open) return null;

  return (
    <>
      <style>{`
        .rp-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(28,24,20,.42);
          display: flex; align-items: flex-start; justify-content: center;
          padding: 20px 12px;
          overflow-y: auto;
        }
        .rp-modal {
          background: var(--paper);
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.25);
          width: 100%;
          max-width: 760px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          margin: auto;
        }
        .rp-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 20px 14px;
          border-bottom: 1px solid var(--line);
          gap: 12px;
        }
        .rp-body { padding: 20px; display: flex; flex-direction: column; gap: 24px; }
        .rp-section-title {
          font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--muted); font-weight: 700; margin: 0 0 12px;
        }
        .rp-schedule-grid {
          display: grid;
          grid-template-columns: 1fr 1fr auto;
          gap: 10px; align-items: end;
        }
        .rp-label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
        .rp-input {
          border: 1px solid var(--line); border-radius: 8px;
          padding: 8px 10px; font-size: 14px; background: var(--paper);
          font-family: inherit; width: 100%; box-sizing: border-box;
        }
        .rp-toggle-row {
          display: flex; align-items: center; gap: 10px;
          margin-top: 10px; font-size: 14px;
        }
        .rp-toggle {
          width: 40px; height: 22px; background: var(--line);
          border-radius: 11px; border: none; cursor: pointer;
          position: relative; transition: background 0.2s; flex-shrink: 0;
          padding: 0;
        }
        .rp-toggle.on { background: var(--accent); }
        .rp-toggle::after {
          content: ''; position: absolute; top: 3px; left: 3px;
          width: 16px; height: 16px; background: #fff; border-radius: 50%;
          transition: left 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        .rp-toggle.on::after { left: 21px; }
        .rp-report-card {
          border: 1px solid var(--soft-line, var(--line));
          border-radius: 12px; overflow: hidden;
        }
        .rp-report-row {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 14px; background: var(--paper);
          flex-wrap: wrap; cursor: pointer;
        }
        .rp-report-row:hover { background: var(--paper-2); }
        .rp-badge-auto {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          padding: 2px 7px; border-radius: 6px; letter-spacing: 0.06em;
          background: #e8f3ff; color: #1a6bb5; flex-shrink: 0;
        }
        .rp-badge-manual {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          padding: 2px 7px; border-radius: 6px; letter-spacing: 0.06em;
          background: #e8f8f0; color: #2d6a4f; flex-shrink: 0;
        }
        .rp-viewer {
          border-top: 1px solid var(--soft-line, var(--line));
          padding: 16px;
          background: #fffdf8;
        }
        .rp-stat-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px; margin-bottom: 14px;
        }
        .rp-stat-cell {
          background: var(--paper); border: 1px solid var(--line);
          border-radius: 8px; padding: 10px;
        }
        .rp-insight-card {
          background: var(--paper); border: 1px solid var(--soft-line, var(--line));
          border-radius: 10px; padding: 11px 13px; margin-bottom: 8px;
        }
        .rp-table-wrap {
          overflow-x: auto; border: 1px solid var(--soft-line, var(--line));
          border-radius: 10px; margin-top: 14px;
        }
        .rp-table { width: 100%; border-collapse: collapse; min-width: 580px; }
        .rp-th {
          background: #f8f3eb; text-align: left; font-size: 11px;
          text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted);
          border-bottom: 1px solid var(--line); padding: 9px 10px;
        }
        .rp-td {
          padding: 9px 10px; border-bottom: 1px solid var(--soft-line, #eee);
          font-size: 13px; vertical-align: top;
        }
        .rp-empty { padding: 32px; text-align: center; color: var(--muted); font-size: 14px; }
        @media (max-width: 600px) {
          .rp-schedule-grid { grid-template-columns: auto auto; justify-content: start; }
          .rp-schedule-grid > :last-child { grid-column: 1 / -1; }
          .rp-input { box-sizing: border-box; min-width: 0; }
          .rp-stat-grid { grid-template-columns: repeat(3, 1fr); }
        }
      `}</style>

      <div className="rp-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="rp-modal">
          {/* Header */}
          <div className="rp-header">
            <div>
              <h2 style={{ margin: 0, fontSize: '19px' }}>Saved Reports</h2>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                {reports.length} report{reports.length === 1 ? '' : 's'} saved
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: 'var(--muted)', lineHeight: 1, padding: '4px', flexShrink: 0 }}
              aria-label="Close"
            >×</button>
          </div>

          <div className="rp-body">
            {/* ── Schedule ── */}
            <section>
              <div className="rp-section-title">Auto-generate schedule</div>

              <div className="rp-schedule-grid">
                <label className="rp-label">
                  <span>Day</span>
                  <select
                    className="rp-input"
                    value={schedule.day_of_week}
                    onChange={e => setSchedule(s => ({ ...s, day_of_week: Number(e.target.value) }))}
                  >
                    {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </label>

                <label className="rp-label">
                  <span>Time</span>
                  <input
                    type="time"
                    className="rp-input"
                    value={scheduleTime}
                    onChange={e => setScheduleTime(e.target.value)}
                  />
                </label>

                <button
                  className="btn primary"
                  onClick={handleSaveSchedule}
                  disabled={scheduleSaving}
                  style={{ padding: '8px 16px', alignSelf: 'flex-end', whiteSpace: 'nowrap' }}
                >
                  {scheduleSaved ? '✓ Saved' : scheduleSaving ? 'Saving…' : 'Save schedule'}
                </button>
              </div>

              <div className="rp-toggle-row">
                <button
                  className={`rp-toggle${schedule.enabled ? ' on' : ''}`}
                  onClick={() => setSchedule(s => ({ ...s, enabled: !s.enabled }))}
                  aria-label="Enable schedule"
                />
                <span style={{ color: schedule.enabled ? 'var(--text)' : 'var(--muted)' }}>
                  {schedule.enabled
                    ? `Auto-generate every ${DAYS.find(d => d.value === schedule.day_of_week)?.label} at ${scheduleTime}`
                    : 'Schedule disabled — toggle to enable'}
                </span>
              </div>
            </section>

            {/* ── Reports list ── */}
            <section>
              <div className="rp-section-title">All reports</div>

              {reportsLoading ? (
                <div className="rp-empty">Loading…</div>
              ) : reports.length === 0 ? (
                <div className="rp-empty">
                  No reports saved yet.<br />
                  <span style={{ fontSize: '13px' }}>Use "Save to library" on the weekly report panel, or enable the schedule above.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {reports.map(r => (
                    <div key={r.id} className="rp-report-card">
                      <div className="rp-report-row" onClick={() => handleView(r.id)}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '2px' }}>
                            {r.title}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                            Saved {fmtDateTime(r.generated_at)} · {r.log_count} entr{r.log_count === 1 ? 'y' : 'ies'}
                          </div>
                        </div>
                        <span className={r.trigger_type === 'scheduled' ? 'rp-badge-auto' : 'rp-badge-manual'}>
                          {r.trigger_type === 'scheduled' ? 'Auto' : 'Manual'}
                        </span>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                          <button
                            className="btn soft"
                            onClick={e => { e.stopPropagation(); handleView(r.id); }}
                            style={{ fontSize: '12px', padding: '4px 10px' }}
                          >
                            {expandedId === r.id ? 'Collapse ▲' : 'View ▼'}
                          </button>
                          <button
                            className="btn soft"
                            onClick={e => { e.stopPropagation(); handleDelete(r.id, r.title); }}
                            disabled={deletingId === r.id}
                            style={{ fontSize: '12px', padding: '4px 10px', color: '#c0392b' }}
                          >
                            {deletingId === r.id ? '…' : 'Delete'}
                          </button>
                        </div>
                      </div>

                      {/* Inline viewer */}
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
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

function ReportViewer({ report }: { report: SavedReportFull }) {
  const logs = report.logs_json ?? [];
  const insights = report.ai_insights_json ?? {};
  const insightEntries = Object.entries(insights).filter(([, v]) => v);

  const totalMins = logs.reduce((s, l) => s + l.minutes, 0);
  const games = new Set(logs.map(l => l.game)).size;

  return (
    <>
      {/* Stats */}
      <div className="rp-stat-grid">
        {[
          ['Playtime', `${totalMins}m`],
          ['Games', String(games)],
          ['Entries', String(logs.length)],
        ].map(([k, v]) => (
          <div key={k} className="rp-stat-cell">
            <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{k}</div>
            <strong style={{ display: 'block', fontSize: '18px', marginTop: '2px' }}>{v}</strong>
          </div>
        ))}
      </div>

      {/* AI next steps */}
      {insightEntries.length > 0 && (
        <div style={{ marginBottom: '6px' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px', fontWeight: 700 }}>
            AI next steps
          </div>
          {insightEntries.map(([game, step]) => (
            <div key={game} className="rp-insight-card">
              <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '3px' }}>{game}</div>
              <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.45 }}>{step}</div>
            </div>
          ))}
        </div>
      )}

      {/* Log table */}
      <div className="rp-table-wrap">
        <table className="rp-table">
          <thead>
            <tr>
              {['Timestamp', 'Game', 'Action', 'Type', 'Playtime'].map(h => (
                <th key={h} className="rp-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>
                  No entries in this report.
                </td>
              </tr>
            ) : [...logs]
              .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
              .map((l, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fffdf8' : undefined }}>
                  <td className="rp-td" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(l.timestamp)}</td>
                  <td className="rp-td" style={{ fontWeight: 600 }}>{l.game}</td>
                  <td className="rp-td">{l.action}</td>
                  <td className="rp-td">
                    <span className={`badge ${l.type}`}>{TYPE_LABELS[l.type] ?? l.type}</span>
                  </td>
                  <td className="rp-td" style={{ whiteSpace: 'nowrap' }}>{l.minutes} min</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
