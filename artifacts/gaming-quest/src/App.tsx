import React, { useState, useCallback, useMemo, useEffect } from 'react';
import TopBar from './components/TopBar';
import Hero from './components/Hero';
import StatsStrip from './components/StatsStrip';
import QuestTable from './components/QuestTable';
import PeriodDownload from './components/PeriodDownload';
import WeeklyReport from './components/WeeklyReport';
import GamesPage from './components/GamesPage';
import DailyCheckin from './components/DailyCheckin';
import ReportsPage from './components/ReportsPage';
import QuestsPage from './components/QuestsPage';
import ActiveQuestsWidget from './components/ActiveQuestsWidget';
import CompanionChat from './components/CompanionChat';
import CoachCard from './components/CoachCard';
import WeeklyAIReview from './components/WeeklyAIReview';
import ProgressWidget from './components/ProgressWidget';
import GoalsWidget from './components/GoalsWidget';
import GameLibrary from './components/GameLibrary';
import EditLogModal from './components/EditLogModal';
import { QuestsProvider } from './context/QuestsContext';
import {
  LogEntry,
  ActionType,
  parseRaw,
  dedupe,
  monStart,
  sunEnd,
  formatDate,
  summarise,
  nextWork,
  computeStreak,
  SAMPLE_LOGS,
} from './lib/logParser';
import { buildPdfReport, printReport, nextWeekFocus } from './lib/reportBuilder';
import { useReportOptions } from './hooks/useReportOptions';
import {
  fetchLogs, saveLogs, clearLogs, fetchFocusInsights,
  fetchCompletions, toggleCompletion, fetchPaused, togglePaused,
  fetchPlatforms, setGamePlatform,
  updateLog, deleteLog, saveReport, patchReportInsights,
  triggerQuestRefresh,
} from './lib/api';

export type Page = 'dashboard' | 'log' | 'games' | 'quests' | 'reports';

function getWeekLogs(logs: LogEntry[]): LogEntry[] {
  const s = monStart(new Date()), e = sunEnd(new Date());
  return logs.filter(l => l.date >= s && l.date <= e).sort((a, b) => a.date.getTime() - b.date.getTime());
}

function getLogsForPeriod(logs: LogEntry[], from: Date, to: Date): LogEntry[] {
  return logs.filter(l => l.date >= from && l.date <= to).sort((a, b) => a.date.getTime() - b.date.getTime());
}

function fmtMins(m: number): string {
  if (m === 0) return '0m';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

function labelType(t: string): string {
  return t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

type LoadState = 'loading' | 'ready' | 'error';

export default function App() {
  const [reportOptions] = useReportOptions();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [saving, setSaving] = useState(false);
  const [completions, setCompletions] = useState<Set<string>>(new Set());
  const [paused, setPaused] = useState<Set<string>>(new Set());
  const [platforms, setPlatforms] = useState<Record<string, string>>({});
  const [rawLogs, setRawLogs] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);
  const [activePage, setActivePage] = useState<Page>('dashboard');

  const navigateTo = (page: Page) => {
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const [reportSaving, setReportSaving] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  // Log-page filter state
  const [gameFilter, setGameFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    Promise.all([fetchLogs(), fetchCompletions(), fetchPaused(), fetchPlatforms()])
      .then(([entries, comps, pausedGames, platformMap]) => {
        setLogs(entries);
        setCompletions(comps);
        setPaused(pausedGames);
        setPlatforms(platformMap);
        setLoadState('ready');
      })
      .catch(() => setLoadState('error'));
  }, []);

  const filtered = useMemo(() => {
    const from = fromDate ? new Date(fromDate + 'T00:00:00') : null;
    const to = toDate ? new Date(toDate + 'T23:59:59') : null;
    return logs
      .filter(l => {
        if (gameFilter !== 'all' && l.game !== gameFilter) return false;
        if (typeFilter !== 'all' && l.type !== typeFilter) return false;
        if (from && l.date < from) return false;
        if (to && l.date > to) return false;
        return true;
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [logs, gameFilter, typeFilter, fromDate, toDate]);

  const games = useMemo(() =>
    [...new Set(logs.map(l => l.game))].sort((a, b) => a.localeCompare(b)), [logs]);

  const types = useMemo(() =>
    [...new Set(logs.map(l => l.type))].sort((a, b) => a.localeCompare(b)), [logs]);

  const weekLogs = useMemo(() => getWeekLogs(logs), [logs]);
  const weeklySummary = useMemo(() => summarise(weekLogs), [weekLogs]);
  const needsWorkItems = useMemo(() => nextWork(logs, completions, paused), [logs, completions, paused]);
  const streak = useMemo(() => computeStreak(logs), [logs]);

  // Dashboard — unfiltered stats
  const allPlaytime = useMemo(() => logs.reduce((s, l) => s + l.minutes, 0), [logs]);
  const allGamesCount = useMemo(() => new Set(logs.map(l => l.game)).size, [logs]);
  const focusCount = useMemo(() =>
    needsWorkItems.filter(n => ['Needs attention', 'Light progress'].includes(n.status)).length,
    [needsWorkItems]);

  // Dashboard — this week card
  const weekPlaytime = useMemo(() => weekLogs.reduce((s, l) => s + l.minutes, 0), [weekLogs]);
  const weekGamesCount = useMemo(() => new Set(weekLogs.map(l => l.game)).size, [weekLogs]);
  const weekDaysCount = useMemo(() =>
    new Set(weekLogs.map(l => l.date.toISOString().slice(0, 10))).size, [weekLogs]);

  // Dashboard — recent 5 entries
  const recentLogs = useMemo(() =>
    [...logs].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5), [logs]);

  // Dashboard — needs-attention preview (top 5)
  const needsAttentionPreview = useMemo(() =>
    needsWorkItems.filter(i => ['Needs attention', 'Light progress'].includes(i.status)).slice(0, 5),
    [needsWorkItems]);

  const rangeLabel = useMemo(() => {
    if (loadState === 'loading') return 'Loading saved logs…';
    if (loadState === 'error') return 'Could not connect to server.';
    if (!logs.length) return 'No logs loaded yet.';
    const sorted = [...logs].sort((a, b) => a.date.getTime() - b.date.getTime());
    return `Coverage: ${formatDate(sorted[0].date)} – ${formatDate(sorted[sorted.length - 1].date)}`;
  }, [logs, loadState]);

  const importLogs = useCallback(async (raw: string) => {
    const parsed = parseRaw(raw);
    if (!parsed.length) {
      alert('No valid rows found. Format: timestamp | game | action | minutes | type');
      return false;
    }
    const existing = new Set(logs.map(l => `${l.timestamp}|${l.game}|${l.action}|${l.minutes}|${l.type}`));
    const newEntries = parsed.filter(e => !existing.has(`${e.timestamp}|${e.game}|${e.action}|${e.minutes}|${e.type}`));
    if (!newEntries.length) {
      alert('All entries already saved — no new rows to import.');
      return false;
    }
    setSaving(true);
    try {
      const saved = await saveLogs(newEntries);
      setLogs(prev => dedupe([...prev, ...saved]).sort((a, b) => b.date.getTime() - a.date.getTime()));

      // Fire-and-forget: refresh quest pool for every newly logged game
      const uniqueGames = [...new Set(newEntries.map(e => e.game))];
      triggerQuestRefresh(uniqueGames);
    } catch (err) {
      alert(`Failed to save logs: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    } finally {
      setSaving(false);
    }
    return true;
  }, [logs]);

  const handleImport = useCallback(async () => {
    const ok = await importLogs(rawLogs);
    if (ok) setSidebarOpen(false);
  }, [rawLogs, importLogs]);

  const handleSample = useCallback(async () => {
    setRawLogs(SAMPLE_LOGS);
    const parsed = parseRaw(SAMPLE_LOGS);
    const existing = new Set(logs.map(l => `${l.timestamp}|${l.game}|${l.action}|${l.minutes}|${l.type}`));
    const newEntries = parsed.filter(e => !existing.has(`${e.timestamp}|${e.game}|${e.action}|${e.minutes}|${e.type}`));
    if (!newEntries.length) { setSidebarOpen(false); return; }
    setSaving(true);
    try {
      const saved = await saveLogs(newEntries);
      setLogs(prev => dedupe([...prev, ...saved]).sort((a, b) => b.date.getTime() - a.date.getTime()));
    } catch { alert('Failed to save sample data.'); }
    finally { setSaving(false); }
    setSidebarOpen(false);
  }, [logs]);

  const handleClear = useCallback(async () => {
    if (!confirm('Delete all saved logs? This cannot be undone.')) return;
    setSaving(true);
    try {
      await clearLogs();
      setLogs([]); setRawLogs('');
      setGameFilter('all'); setTypeFilter('all');
      setFromDate(''); setToDate('');
    } catch { alert('Failed to clear logs.'); }
    finally { setSaving(false); }
  }, []);

  const handleThisWeek = useCallback(() => {
    const s = monStart(new Date()), e = sunEnd(new Date());
    setFromDate(s.toISOString().slice(0, 10));
    setToDate(e.toISOString().slice(0, 10));
  }, []);

  const handleResetFilters = useCallback(() => {
    setGameFilter('all'); setTypeFilter('all');
    setFromDate(''); setToDate('');
  }, []);

  const handleToggleCompletion = useCallback(async (game: string) => {
    const nowDone = await toggleCompletion(game);
    setCompletions(prev => { const n = new Set(prev); if (nowDone) n.add(game); else n.delete(game); return n; });
  }, []);

  const handleTogglePaused = useCallback(async (game: string) => {
    const nowPaused = await togglePaused(game);
    setPaused(prev => { const n = new Set(prev); if (nowPaused) n.add(game); else n.delete(game); return n; });
  }, []);

  const handleSetPlatform = useCallback(async (game: string, platform: string) => {
    await setGamePlatform(game, platform);
    setPlatforms(prev => {
      const n = { ...prev };
      if (platform) n[game] = platform; else delete n[game];
      return n;
    });
  }, []);

  const handleQuickAdd = useCallback(async (rawLine: string) => {
    await importLogs(rawLine);
  }, [importLogs]);

  const handleSaveEdit = useCallback(async (id: string, patch: Parameters<typeof updateLog>[1]) => {
    const updated = await updateLog(id, patch);
    setLogs(prev => prev.map(l => l.id === id ? updated : l));
  }, []);

  const handleDeleteEntry = useCallback(async (id: string) => {
    await deleteLog(id);
    setLogs(prev => prev.filter(l => l.id !== id));
  }, []);

  const handleSaveWeekToLibrary = useCallback(async () => {
    if (reportSaving || pdfGenerating) return;
    const wl = getWeekLogs(logs);
    if (!wl.length) { alert('No logs for this week yet.'); return; }
    setReportSaving(true);
    try {
      const start = monStart(new Date()), end = sunEnd(new Date());
      const title = `Week of ${formatDate(start)} – ${formatDate(end)}`;
      const saved = await saveReport({
        title,
        period_from: start.toISOString().slice(0, 10),
        period_to: end.toISOString().slice(0, 10),
        logs_json: wl.map(l => ({ timestamp: l.timestamp, game: l.game, action: l.action, minutes: l.minutes, type: l.type })),
        ai_insights_json: {},
        trigger_type: 'manual',
      });
      alert('Report saved to library!');
      setReportSaving(false);
      const focusItems = nextWeekFocus(wl, completions, paused);
      if (focusItems.length > 0) {
        const rawInsights = await fetchFocusInsights(focusItems);
        if (rawInsights.length > 0) {
          const aiInsights = Object.fromEntries(rawInsights.map(i => [i.title, i.nextStep]));
          await patchReportInsights(saved.id, aiInsights);
        }
      }
    } catch (err) {
      alert(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
      setReportSaving(false);
    }
  }, [logs, reportSaving, pdfGenerating, completions, paused]);

  const handleDownloadWeek = useCallback(async () => {
    if (pdfGenerating) return;
    setPdfGenerating(true);
    try {
      const start = monStart(new Date()), end = sunEnd(new Date());
      const wl = getWeekLogs(logs);
      const focusItems = nextWeekFocus(wl, completions, paused);
      const rawInsights = await fetchFocusInsights(focusItems);
      const aiInsights = Object.fromEntries(rawInsights.map(i => [i.title, i.nextStep]));
      const html = buildPdfReport(start, end, wl, 'This Week', aiInsights, completions, paused, reportOptions);
      printReport(html);
    } finally { setPdfGenerating(false); }
  }, [logs, pdfGenerating, completions, paused, reportOptions]);

  const handleDownloadCustom = useCallback(async (fromStr: string, toStr: string) => {
    if (pdfGenerating) return;
    setPdfGenerating(true);
    try {
      const from = new Date(fromStr + 'T00:00:00');
      const to = new Date(toStr + 'T23:59:59');
      const periodLogs = getLogsForPeriod(logs, from, to);
      const focusItems = nextWeekFocus(periodLogs, completions, paused);
      const rawInsights = await fetchFocusInsights(focusItems);
      const aiInsights = Object.fromEntries(rawInsights.map(i => [i.title, i.nextStep]));
      const html = buildPdfReport(from, to, periodLogs, undefined, aiInsights, completions, paused, reportOptions);
      printReport(html);
    } finally { setPdfGenerating(false); }
  }, [logs, pdfGenerating, completions, paused, reportOptions]);

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  return (
    <QuestsProvider>
    <>
      <style>{`
        @media (min-width: 1100px) {
          .desktop-sidebar { position: static !important; transform: none !important; box-shadow: none !important; }
          .hamburger-btn { display: none !important; }
        }
        select:focus, input:focus, textarea:focus {
          outline: 2px solid var(--accent); outline-offset: 2px; border-color: transparent;
        }
        .filter-bar {
          display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end;
          background: var(--paper); border: 1px solid var(--line);
          border-radius: var(--radius); padding: 12px 14px;
          box-shadow: var(--shadow);
        }
        .filter-bar select, .filter-bar input {
          border: 1px solid var(--line); background: var(--paper);
          border-radius: var(--radius-sm); padding: 7px 10px;
          font-size: 13px; font-family: inherit; min-height: 36px; max-width: 180px;
        }
        .dash-card {
          background: var(--paper); border: 1px solid var(--line);
          border-radius: var(--radius); box-shadow: var(--shadow); padding: 16px;
        }
        .dash-section-label {
          font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--muted); font-weight: 700; margin: 0 0 10px;
        }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <TopBar
          activePage={activePage}
          onPageChange={navigateTo}
          onHamburger={() => setSidebarOpen(o => !o)}
        />

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <DesktopSidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            rawLogs={rawLogs}
            onRawLogsChange={setRawLogs}
            onImport={handleImport}
            onSample={handleSample}
            onClear={handleClear}
            onQuickAdd={handleQuickAdd}
            games={games}
            saving={saving}
          />

          <main style={{
            flex: 1, overflowY: 'auto', padding: '16px',
            display: 'flex', flexDirection: 'column', gap: '16px',
          }}>
            {loadState === 'loading' && (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: '14px' }}>
                Loading saved logs…
              </div>
            )}
            {loadState === 'error' && (
              <div style={{ padding: '14px 16px', background: '#fff0f0', border: '1px solid #f5c6cb', borderRadius: 'var(--radius)', fontSize: '14px', color: '#842029' }}>
                Could not reach the server. Check your connection and reload.
              </div>
            )}

            <GameLibrary
              open={libraryOpen}
              onClose={() => setLibraryOpen(false)}
              logs={logs}
              manualCompletions={completions}
              paused={paused}
              onToggleCompletion={handleToggleCompletion}
              onTogglePaused={handleTogglePaused}
            />
            <EditLogModal
              entry={editingEntry}
              onClose={() => setEditingEntry(null)}
              onSave={handleSaveEdit}
              onDelete={handleDeleteEntry}
            />

            {loadState === 'ready' && (
              <>
                {/* ── Dashboard ── */}
                {activePage === 'dashboard' && (
                  <>
                    <Hero
                      rangeLabel={rangeLabel}
                    />
                    <DailyCheckin logs={logs} manualCompletions={completions} paused={paused} />

                    {/* AI Coach Card — personalised nightly recommendation */}
                    <CoachCard />

                    {/* Game Progress Tracking */}
                    <ProgressWidget />

                    {/* Personal Goals */}
                    <GoalsWidget />

                    {/* AI Companion Chat */}
                    <CompanionChat />

                    <StatsStrip
                      entries={weekLogs.length}
                      playtime={weekPlaytime}
                      games={weekGamesCount}
                      needsWork={focusCount}
                      streak={streak}
                    />

                    {/* Active Quests widget */}
                    <ActiveQuestsWidget onNavigate={() => navigateTo('quests')} />

                    {/* Needs attention — full width, prominent */}
                    <div className="dash-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div className="dash-section-label" style={{ margin: 0 }}>Needs attention</div>
                        <button
                          onClick={() => setActivePage('games')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--accent)', fontWeight: 600, padding: 0 }}
                        >
                          See all →
                        </button>
                      </div>
                      {needsAttentionPreview.length === 0 ? (
                        <div style={{ fontSize: '13px', color: 'var(--muted)' }}>All games on track this week. 🎉</div>
                      ) : needsAttentionPreview.map((item, i) => (
                        <div key={item.game} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: i < needsAttentionPreview.length - 1 ? '1px solid var(--soft-line)' : 'none', gap: '10px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '14px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.game}</div>
                            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>{item.note}</div>
                          </div>
                          <span style={{
                            fontSize: '11px', fontWeight: 700, flexShrink: 0,
                            color: item.status === 'Needs attention' ? '#b71c1c' : '#bf360c',
                            background: item.status === 'Needs attention' ? '#ffebee' : '#fbe9e7',
                            borderRadius: '4px', padding: '3px 7px', marginTop: '2px',
                          }}>{item.status}</span>
                        </div>
                      ))}
                    </div>

                    {/* This week */}
                    <div className="dash-card">
                      <div className="dash-section-label">This week</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {([
                          ['Sessions', weekLogs.length],
                          ['Playtime', fmtMins(weekPlaytime)],
                          ['Games', weekGamesCount],
                          ['Days played', `${weekDaysCount} / 7`],
                        ] as [string, string | number][]).map(([k, v]) => (
                          <div key={k} style={{ background: 'var(--paper-2)', borderRadius: '8px', padding: '10px 12px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</div>
                            <strong style={{ display: 'block', fontSize: '19px', marginTop: '2px' }}>{v}</strong>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Recent activity */}
                    <div className="dash-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div className="dash-section-label" style={{ margin: 0 }}>Recent activity</div>
                        <button
                          onClick={() => setActivePage('log')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--accent)', fontWeight: 600, padding: 0 }}
                        >
                          View all →
                        </button>
                      </div>
                      {recentLogs.length === 0 ? (
                        <div style={{ fontSize: '13px', color: 'var(--muted)' }}>No logs yet — import or add your first entry.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {recentLogs.map(l => (
                            <div key={l.id} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid var(--soft-line)', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{l.timestamp.slice(0, 10)}</span>
                              <span style={{ fontSize: '13px', fontWeight: 700, flexShrink: 0, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.game}</span>
                              <span style={{ fontSize: '12px', color: 'var(--muted)', flex: 1, minWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.action}</span>
                              {l.minutes > 0 && (
                                <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtMins(l.minutes)}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* AI Weekly Review */}
                    <WeeklyAIReview />

                    {/* Weekly report preview */}
                    <WeeklyReport
                      weekLogs={weekLogs}
                      summary={weeklySummary}
                      onDownload={handleDownloadWeek}
                      pdfGenerating={pdfGenerating}
                      onSaveToLibrary={handleSaveWeekToLibrary}
                      reportSaving={reportSaving}
                    />
                  </>
                )}

                {/* ── Quest Log ── */}
                {activePage === 'log' && (
                  <>
                    <div className="filter-bar">
                      {([
                        { label: 'Game', el: (
                          <select value={gameFilter} onChange={e => setGameFilter(e.target.value)}>
                            <option value="all">All games</option>
                            {games.map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        )},
                        { label: 'Type', el: (
                          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                            <option value="all">All types</option>
                            {types.map(t => <option key={t} value={t}>{labelType(t)}</option>)}
                          </select>
                        )},
                        { label: 'From', el: <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /> },
                        { label: 'To',   el: <input type="date" value={toDate}   onChange={e => setToDate(e.target.value)}   /> },
                      ] as { label: string; el: React.ReactNode }[]).map(({ label, el }) => (
                        <label key={label} style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                          {label}{el}
                        </label>
                      ))}
                      <div style={{ display: 'flex', gap: '6px', alignSelf: 'flex-end' }}>
                        <button className="btn soft" onClick={handleThisWeek} style={{ fontSize: '12px', padding: '7px 12px' }}>This week</button>
                        <button className="btn" onClick={handleResetFilters} style={{ fontSize: '12px', padding: '7px 12px' }}>Reset</button>
                      </div>
                    </div>
                    <QuestTable entries={filtered} onEdit={setEditingEntry} onSave={handleSaveEdit} />
                  </>
                )}

                {/* ── Games ── */}
                {activePage === 'games' && (
                  <GamesPage
                    logs={logs}
                    completions={completions}
                    paused={paused}
                    platforms={platforms}
                    onToggleCompletion={handleToggleCompletion}
                    onTogglePaused={handleTogglePaused}
                    onSetPlatform={handleSetPlatform}
                    onOpenLibrary={() => setLibraryOpen(true)}
                  />
                )}

                {/* ── Quests ── */}
                {activePage === 'quests' && <QuestsPage />}

                {/* ── Reports ── */}
                {activePage === 'reports' && (
                  <>
                    <ReportsPage />
                    <PeriodDownload onDownload={handleDownloadCustom} pdfGenerating={pdfGenerating} />
                  </>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </>
    </QuestsProvider>
  );
}

// ─── DesktopSidebar ────────────────────────────────────────────────────────

const QA_TYPES: { value: ActionType; label: string }[] = [
  { value: 'progress', label: 'Progress' },
  { value: 'boss',     label: 'Boss' },
  { value: 'complete', label: 'Complete' },
  { value: 'rank-up',  label: 'Rank Up' },
  { value: 'purchase', label: 'Purchase' },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  rawLogs: string;
  onRawLogsChange: (v: string) => void;
  onImport: () => void;
  onSample: () => void;
  onClear: () => void;
  onQuickAdd: (raw: string) => Promise<void>;
  games: string[];
  saving: boolean;
}

function DesktopSidebar(props: SidebarProps) {
  const [qaOpen, setQaOpen] = React.useState(false);
  const [qaDateTime, setQaDateTime] = React.useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  });
  const [qaAdjustTime, setQaAdjustTime] = React.useState(false);
  const [qaGame, setQaGame] = React.useState('');
  const [qaAction, setQaAction] = React.useState('');
  const [qaMinutes, setQaMinutes] = React.useState(30);
  const [qaType, setQaType] = React.useState<ActionType>('progress');
  const [qaAdding, setQaAdding] = React.useState(false);
  const [qaError, setQaError] = React.useState('');

  function nowLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  const handleQuickAdd = async () => {
    if (!qaGame.trim() || !qaAction.trim()) { setQaError('Game and action are required.'); return; }
    const ts = (qaAdjustTime ? qaDateTime : nowLocal()).replace('T', ' ');
    const rawLine = `${ts} | ${qaGame.trim()} | ${qaAction.trim()} | ${qaMinutes} | ${qaType}`;
    setQaAdding(true); setQaError('');
    try {
      await props.onQuickAdd(rawLine);
      setQaAction(''); setQaGame(''); setQaMinutes(30); setQaType('progress');
      setQaDateTime(nowLocal()); setQaAdjustTime(false); setQaError('');
    } catch (e: unknown) {
      setQaError(e instanceof Error ? e.message : 'Failed to save.');
    } finally { setQaAdding(false); }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', minHeight: '44px', border: '1px solid var(--line)',
    background: 'var(--paper)', borderRadius: 'var(--radius-sm)',
    padding: '10px 12px', fontSize: '15px', boxSizing: 'border-box', fontFamily: 'inherit',
  };
  const qaInputStyle: React.CSSProperties = {
    width: '100%', border: '1px solid var(--line)', background: 'var(--paper)',
    borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: '14px',
    boxSizing: 'border-box', fontFamily: 'inherit',
  };
  const labelWrapStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px' };
  const qaLabelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' };

  return (
    <>
      {props.open && (
        <div
          onClick={props.onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(28,24,20,.38)', zIndex: 9 }}
          className="mobile-overlay"
        />
      )}
      <aside
        className="desktop-sidebar"
        style={{
          width: '320px', flexShrink: 0, overflowY: 'auto',
          borderRight: '1px solid var(--line)', background: 'var(--paper-2)',
          padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px',
          position: 'fixed', top: 0, left: 0, height: '100dvh', zIndex: 10,
          transform: props.open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
          boxShadow: props.open ? '4px 0 24px rgba(0,0,0,0.15)' : 'none',
        }}
      >
        {/* Quick Add */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            onClick={() => setQaOpen(v => !v)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%' }}
          >
            <div className="eyebrow" style={{ margin: 0 }}>Quick add</div>
            <span style={{ fontSize: '18px', color: 'var(--muted)', lineHeight: 1 }}>{qaOpen ? '−' : '+'}</span>
          </button>

          {qaOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              {qaError && (
                <div style={{ fontSize: '13px', color: '#c0392b', background: '#fff0f0', padding: '7px 10px', borderRadius: '6px' }}>{qaError}</div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Logged at: now</span>
                <button
                  type="button"
                  onClick={() => { setQaAdjustTime(v => !v); setQaDateTime(nowLocal()); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--accent)', fontWeight: 600, padding: 0 }}
                >
                  {qaAdjustTime ? 'Use now' : 'Adjust time'}
                </button>
              </div>
              {qaAdjustTime && (
                <input type="datetime-local" value={qaDateTime} onChange={e => setQaDateTime(e.target.value)} style={qaInputStyle} />
              )}
              <label style={qaLabelStyle}>
                <span>Game</span>
                <input type="text" placeholder="Game title" value={qaGame} onChange={e => setQaGame(e.target.value)} list="qa-games" style={qaInputStyle} />
                <datalist id="qa-games">{props.games.map(g => <option key={g} value={g} />)}</datalist>
              </label>
              <label style={qaLabelStyle}>
                <span>Action / Notes</span>
                <textarea placeholder="What happened?" value={qaAction} onChange={e => setQaAction(e.target.value)} rows={2} style={{ ...qaInputStyle, resize: 'vertical' }} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,160px) minmax(0,160px)', columnGap: '24px', rowGap: '12px' }}>
                <label style={qaLabelStyle}>
                  <span>Minutes</span>
                  <input type="number" min={0} max={999} value={qaMinutes} onChange={e => setQaMinutes(Number(e.target.value))} style={qaInputStyle} />
                </label>
                <label style={qaLabelStyle}>
                  <span>Type</span>
                  <select value={qaType} onChange={e => setQaType(e.target.value as ActionType)} style={qaInputStyle}>
                    {QA_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </label>
              </div>
              <button className="btn primary" onClick={handleQuickAdd} disabled={qaAdding} style={{ width: '100%' }}>
                {qaAdding ? 'Adding…' : '+ Add entry'}
              </button>
            </div>
          )}
        </section>

        <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: 0 }} />

        {/* Raw Logs */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="eyebrow">Raw logs</div>
          <p className="muted" style={{ margin: 0, fontSize: '13px' }}>
            Format: <code>timestamp | game | action | minutes | type</code><br />
            <span style={{ fontSize: '12px' }}>Use <code>0</code> minutes for achievements with no playtime.</span>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={labelWrapStyle}>
              <span>Paste logs here</span>
              <textarea
                value={props.rawLogs}
                onChange={e => props.onRawLogsChange(e.target.value)}
                placeholder="2026-05-13 22:26 | Mario Kart Tour | 1st place | 60 | rank-up"
                style={{ width: '100%', minHeight: '140px', border: '1px solid var(--line)', background: 'var(--paper)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: '14px', resize: 'vertical' }}
              />
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button className="btn primary" onClick={props.onImport} disabled={props.saving}>{props.saving ? 'Saving…' : 'Import'}</button>
              <button className="btn" onClick={props.onSample} disabled={props.saving}>Sample data</button>
              <button className="btn" onClick={props.onClear} disabled={props.saving}>Clear all</button>
            </div>
          </div>
        </section>
      </aside>

      <style>{`
        @media (min-width: 1100px) {
          .desktop-sidebar { position: static !important; transform: none !important; box-shadow: none !important; height: auto !important; top: auto !important; left: auto !important; }
          .mobile-overlay { display: none !important; }
          .hamburger-btn { display: none !important; }
        }
      `}</style>
    </>
  );
}
