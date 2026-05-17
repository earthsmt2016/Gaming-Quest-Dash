import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import TopBar from './components/TopBar';
import Hero from './components/Hero';
import StatsStrip from './components/StatsStrip';
import QuestTable from './components/QuestTable';
import PeriodDownload from './components/PeriodDownload';
import WeeklyReport from './components/WeeklyReport';
import NeedsWork from './components/NeedsWork';
import DailyCheckin from './components/DailyCheckin';
import ReportsPage from './components/ReportsPage';
import GameLibrary from './components/GameLibrary';
import EditLogModal from './components/EditLogModal';
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
  computeRecommendations,
  SAMPLE_LOGS,
} from './lib/logParser';
import { buildPdfReport, printReport, nextWeekFocus } from './lib/reportBuilder';
import { fetchLogs, saveLogs, clearLogs, fetchFocusInsights, fetchCompletions, toggleCompletion, fetchPaused, togglePaused, fetchGuides, setGuide, deleteGuide, updateLog, deleteLog, saveReport } from './lib/api';

function getWeekLogs(logs: LogEntry[]): LogEntry[] {
  const s = monStart(new Date()), e = sunEnd(new Date());
  return logs.filter(l => l.date >= s && l.date <= e).sort((a, b) => a.date.getTime() - b.date.getTime());
}

function getLogsForPeriod(logs: LogEntry[], from: Date, to: Date): LogEntry[] {
  return logs.filter(l => l.date >= from && l.date <= to).sort((a, b) => a.date.getTime() - b.date.getTime());
}

type LoadState = 'loading' | 'ready' | 'error';

export default function App() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [saving, setSaving] = useState(false);
  const [completions, setCompletions] = useState<Set<string>>(new Set());
  const [paused, setPaused] = useState<Set<string>>(new Set());
  const [guides, setGuides] = useState<Record<string, string>>({});
  const [rawLogs, setRawLogs] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [reportSaving, setReportSaving] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);
  const [gameFilter, setGameFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const weeklyRef = useRef<HTMLElement>(null);

  // Load logs, completions, paused state and guides from API on mount
  useEffect(() => {
    Promise.all([fetchLogs(), fetchCompletions(), fetchPaused(), fetchGuides()])
      .then(([entries, comps, pausedGames, guideMap]) => {
        setLogs(entries);
        setCompletions(comps);
        setPaused(pausedGames);
        setGuides(guideMap);
        setLoadState('ready');
      })
      .catch(() => setLoadState('error'));
  }, []);

  // Filtered logs
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
    [...new Set(logs.map(l => l.game))].sort((a, b) => a.localeCompare(b)),
    [logs]);

  const types = useMemo(() =>
    [...new Set(logs.map(l => l.type))].sort((a, b) => a.localeCompare(b)),
    [logs]);

  const weekLogs = useMemo(() => getWeekLogs(logs), [logs]);
  const weeklySummary = useMemo(() => summarise(weekLogs), [weekLogs]);
  const needsWorkItems = useMemo(() => nextWork(logs, completions, paused), [logs, completions, paused]);
  const streak = useMemo(() => computeStreak(logs), [logs]);

  const playtime = useMemo(() => filtered.reduce((s, l) => s + l.minutes, 0), [filtered]);
  const gamesCount = useMemo(() => new Set(filtered.map(l => l.game)).size, [filtered]);
  const focusCount = useMemo(() =>
    needsWorkItems.filter(n => ['Needs attention', 'Light progress'].includes(n.status)).length,
    [needsWorkItems]);

  const rangeLabel = useMemo(() => {
    if (loadState === 'loading') return 'Loading saved logs…';
    if (loadState === 'error') return 'Could not connect to server.';
    if (!filtered.length) return 'No logs loaded yet.';
    const sorted = [...filtered].sort((a, b) => a.date.getTime() - b.date.getTime());
    return `Coverage: ${formatDate(sorted[0].date)} – ${formatDate(sorted[sorted.length - 1].date)}`;
  }, [filtered, loadState]);

  const importLogs = useCallback(async (raw: string) => {
    const parsed = parseRaw(raw);
    if (!parsed.length) {
      alert('No valid rows found. Format: timestamp | game | action | minutes | type');
      return false;
    }
    // Only send new entries (not already in DB — deduped by key)
    const existing = new Set(logs.map(l => `${l.timestamp}|${l.game}|${l.action}|${l.minutes}|${l.type}`));
    const newEntries = parsed.filter(e => {
      const k = `${e.timestamp}|${e.game}|${e.action}|${e.minutes}|${e.type}`;
      return !existing.has(k);
    });
    if (!newEntries.length) {
      alert('All entries already saved — no new rows to import.');
      return false;
    }
    setSaving(true);
    try {
      const saved = await saveLogs(newEntries);
      setLogs(prev => dedupe([...prev, ...saved]).sort((a, b) => b.date.getTime() - a.date.getTime()));
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
    const newEntries = parsed.filter(e => {
      const k = `${e.timestamp}|${e.game}|${e.action}|${e.minutes}|${e.type}`;
      return !existing.has(k);
    });
    if (!newEntries.length) {
      setSidebarOpen(false);
      return;
    }
    setSaving(true);
    try {
      const saved = await saveLogs(newEntries);
      setLogs(prev => dedupe([...prev, ...saved]).sort((a, b) => b.date.getTime() - a.date.getTime()));
    } catch {
      alert('Failed to save sample data.');
    } finally {
      setSaving(false);
    }
    setSidebarOpen(false);
  }, [logs]);

  const handleClear = useCallback(async () => {
    if (!confirm('Delete all saved logs? This cannot be undone.')) return;
    setSaving(true);
    try {
      await clearLogs();
      setLogs([]);
      setRawLogs('');
      setGameFilter('all');
      setTypeFilter('all');
      setFromDate('');
      setToDate('');
    } catch {
      alert('Failed to clear logs.');
    } finally {
      setSaving(false);
    }
  }, []);

  const handleThisWeek = useCallback(() => {
    const s = monStart(new Date()), e = sunEnd(new Date());
    setFromDate(s.toISOString().slice(0, 10));
    setToDate(e.toISOString().slice(0, 10));
    setSidebarOpen(false);
  }, []);

  const handleReset = useCallback(() => {
    setGameFilter('all');
    setTypeFilter('all');
    setFromDate('');
    setToDate('');
  }, []);

  const handleToggleCompletion = useCallback(async (game: string) => {
    const nowDone = await toggleCompletion(game);
    setCompletions(prev => {
      const next = new Set(prev);
      if (nowDone) next.add(game); else next.delete(game);
      return next;
    });
  }, []);

  const handleTogglePaused = useCallback(async (game: string) => {
    const nowPaused = await togglePaused(game);
    setPaused(prev => {
      const next = new Set(prev);
      if (nowPaused) next.add(game); else next.delete(game);
      return next;
    });
  }, []);

  const handleSetGuide = useCallback(async (game: string, url: string) => {
    await setGuide(game, url);
    setGuides(prev => ({ ...prev, [game]: url }));
  }, []);

  const handleDeleteGuide = useCallback(async (game: string) => {
    await deleteGuide(game);
    setGuides(prev => { const next = { ...prev }; delete next[game]; return next; });
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

  const [pdfGenerating, setPdfGenerating] = useState(false);

  const handleSaveWeekToLibrary = useCallback(async () => {
    if (reportSaving || pdfGenerating) return;
    const wl = getWeekLogs(logs);
    if (!wl.length) { alert('No logs for this week yet.'); return; }
    setReportSaving(true);
    try {
      const start = monStart(new Date()), end = sunEnd(new Date());
      const focusItems = nextWeekFocus(wl, completions, paused);
      const rawInsights = await fetchFocusInsights(focusItems);
      const aiInsights = Object.fromEntries(rawInsights.map(i => [i.title, i.nextStep]));
      const title = `Week of ${formatDate(start)} – ${formatDate(end)}`;
      await saveReport({
        title,
        period_from: start.toISOString().slice(0, 10),
        period_to: end.toISOString().slice(0, 10),
        logs_json: wl.map(l => ({ timestamp: l.timestamp, game: l.game, action: l.action, minutes: l.minutes, type: l.type })),
        ai_insights_json: aiInsights,
        trigger_type: 'manual',
      });
      alert('Report saved to library!');
    } catch (err) {
      alert(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
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
      const html = buildPdfReport(start, end, wl, 'This Week', aiInsights, completions, paused);
      printReport(html);
    } finally {
      setPdfGenerating(false);
    }
  }, [logs, pdfGenerating]);

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
      const html = buildPdfReport(from, to, periodLogs, undefined, aiInsights, completions, paused);
      printReport(html);
    } finally {
      setPdfGenerating(false);
    }
  }, [logs, pdfGenerating]);

  const scrollToReport = useCallback(() => {
    weeklyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  return (
    <>
      <style>{`
        @media (min-width: 768px) {
          .stats-grid { grid-template-columns: repeat(3, 1fr) !important; }
          .report-meta-grid { grid-template-columns: repeat(4, 1fr) !important; }
        }
        @media (min-width: 1024px) {
          .stats-grid { grid-template-columns: repeat(5, 1fr) !important; }
        }
        @media (min-width: 1100px) {
          .desktop-sidebar {
            position: static !important;
            transform: none !important;
            box-shadow: none !important;
          }
          .hamburger-btn { display: none !important; }
        }
        select:focus, input:focus, textarea:focus {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
          border-color: transparent;
        }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <TopBar
          onHamburger={() => setSidebarOpen(o => !o)}
          onWeekReport={scrollToReport}
          onDownloadWeek={handleDownloadWeek}
          onOpenReports={() => setReportsOpen(true)}
          pdfGenerating={pdfGenerating}
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
            types={types}
            gameFilter={gameFilter}
            typeFilter={typeFilter}
            fromDate={fromDate}
            toDate={toDate}
            onGameFilter={setGameFilter}
            onTypeFilter={setTypeFilter}
            onFromDate={setFromDate}
            onToDate={setToDate}
            onThisWeek={handleThisWeek}
            onReset={handleReset}
            saving={saving}
          />

          <main style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}>
            {loadState === 'loading' && (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: '14px' }}>
                Loading saved logs…
              </div>
            )}
            {loadState === 'error' && (
              <div style={{
                padding: '14px 16px',
                background: '#fff0f0',
                border: '1px solid #f5c6cb',
                borderRadius: 'var(--radius)',
                fontSize: '14px',
                color: '#842029',
              }}>
                Could not reach the server. Check your connection and reload.
              </div>
            )}
            <ReportsPage
              open={reportsOpen}
              onClose={() => setReportsOpen(false)}
            />
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
                <Hero
                  rangeLabel={rangeLabel}
                  onScrollToReport={scrollToReport}
                  onDownloadWeek={handleDownloadWeek}
                  pdfGenerating={pdfGenerating}
                />
                <DailyCheckin
                  logs={logs}
                  manualCompletions={completions}
                  paused={paused}
                />
                <StatsStrip
                  entries={filtered.length}
                  playtime={playtime}
                  games={gamesCount}
                  needsWork={focusCount}
                  streak={streak}
                />
                <QuestTable entries={filtered} onEdit={setEditingEntry} />
                <PeriodDownload onDownload={handleDownloadCustom} pdfGenerating={pdfGenerating} />
                <WeeklyReport
                  ref={weeklyRef}
                  weekLogs={weekLogs}
                  summary={weeklySummary}
                  onDownload={handleDownloadWeek}
                  pdfGenerating={pdfGenerating}
                  onSaveToLibrary={handleSaveWeekToLibrary}
                  reportSaving={reportSaving}
                />
                <NeedsWork
                  items={needsWorkItems}
                  manualCompletions={completions}
                  paused={paused}
                  guides={guides}
                  onToggleCompletion={handleToggleCompletion}
                  onTogglePaused={handleTogglePaused}
                  onSetGuide={handleSetGuide}
                  onDeleteGuide={handleDeleteGuide}
                  onOpenLibrary={() => setLibraryOpen(true)}
                />
              </>
            )}
          </main>
        </div>
      </div>
    </>
  );
}

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
  types: string[];
  gameFilter: string;
  typeFilter: string;
  fromDate: string;
  toDate: string;
  onGameFilter: (v: string) => void;
  onTypeFilter: (v: string) => void;
  onFromDate: (v: string) => void;
  onToDate: (v: string) => void;
  onThisWeek: () => void;
  onReset: () => void;
  saving: boolean;
}

function DesktopSidebar(props: SidebarProps) {
  const [qaOpen, setQaOpen] = React.useState(false);
  const [qaDate, setQaDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [qaTime, setQaTime] = React.useState(() => new Date().toTimeString().slice(0, 5));
  const [qaGame, setQaGame] = React.useState('');
  const [qaAction, setQaAction] = React.useState('');
  const [qaMinutes, setQaMinutes] = React.useState(30);
  const [qaType, setQaType] = React.useState<ActionType>('progress');
  const [qaAdding, setQaAdding] = React.useState(false);
  const [qaError, setQaError] = React.useState('');

  const handleQuickAdd = async () => {
    if (!qaGame.trim() || !qaAction.trim()) { setQaError('Game and action are required.'); return; }
    const rawLine = `${qaDate} ${qaTime} | ${qaGame.trim()} | ${qaAction.trim()} | ${qaMinutes} | ${qaType}`;
    setQaAdding(true); setQaError('');
    try {
      await props.onQuickAdd(rawLine);
      setQaAction('');
      setQaDate(new Date().toISOString().slice(0, 10));
      setQaTime(new Date().toTimeString().slice(0, 5));
    } catch (e: any) {
      setQaError(e.message ?? 'Failed to save.');
    } finally {
      setQaAdding(false);
    }
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

  function labelType(t: string): string {
    return t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

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
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%',
            }}
          >
            <div className="eyebrow" style={{ margin: 0 }}>Quick add</div>
            <span style={{ fontSize: '18px', color: 'var(--muted)', lineHeight: 1 }}>{qaOpen ? '−' : '+'}</span>
          </button>

          {qaOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              {qaError && (
                <div style={{ fontSize: '13px', color: '#c0392b', background: '#fff0f0', padding: '7px 10px', borderRadius: '6px' }}>
                  {qaError}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <label style={qaLabelStyle}>
                  <span>Date</span>
                  <input type="date" value={qaDate} onChange={e => setQaDate(e.target.value)} style={qaInputStyle} />
                </label>
                <label style={qaLabelStyle}>
                  <span>Time</span>
                  <input type="time" value={qaTime} onChange={e => setQaTime(e.target.value)} style={qaInputStyle} />
                </label>
              </div>
              <label style={qaLabelStyle}>
                <span>Game</span>
                <input type="text" placeholder="Game title" value={qaGame}
                  onChange={e => setQaGame(e.target.value)} list="qa-games" style={qaInputStyle} />
                <datalist id="qa-games">{props.games.map(g => <option key={g} value={g} />)}</datalist>
              </label>
              <label style={qaLabelStyle}>
                <span>Action / Notes</span>
                <textarea placeholder="What happened?" value={qaAction} onChange={e => setQaAction(e.target.value)}
                  rows={2} style={{ ...qaInputStyle, resize: 'vertical' }} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <label style={qaLabelStyle}>
                  <span>Minutes (0 = no time)</span>
                  <input type="number" min={0} max={999} value={qaMinutes}
                    onChange={e => setQaMinutes(Number(e.target.value))} style={qaInputStyle} />
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
                style={{
                  width: '100%', minHeight: '140px', border: '1px solid var(--line)',
                  background: 'var(--paper)', borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px', fontSize: '14px', resize: 'vertical',
                }}
              />
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button className="btn primary" onClick={props.onImport} disabled={props.saving}>
                {props.saving ? 'Saving…' : 'Import'}
              </button>
              <button className="btn" onClick={props.onSample} disabled={props.saving}>Sample data</button>
              <button className="btn" onClick={props.onClear} disabled={props.saving}>Clear all</button>
            </div>
          </div>
        </section>

        <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: 0 }} />

        {/* Filters */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="eyebrow">Filters</div>

          <label style={labelWrapStyle}>
            <span>Game title</span>
            <select value={props.gameFilter} onChange={e => props.onGameFilter(e.target.value)} style={inputStyle}>
              <option value="all">All games</option>
              {props.games.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>

          <label style={labelWrapStyle}>
            <span>Action type</span>
            <select value={props.typeFilter} onChange={e => props.onTypeFilter(e.target.value)} style={inputStyle}>
              <option value="all">All types</option>
              {props.types.map(t => <option key={t} value={t}>{labelType(t)}</option>)}
            </select>
          </label>

          <label style={labelWrapStyle}>
            <span>From date</span>
            <input type="date" value={props.fromDate} onChange={e => props.onFromDate(e.target.value)} style={inputStyle} />
          </label>

          <label style={labelWrapStyle}>
            <span>To date</span>
            <input type="date" value={props.toDate} onChange={e => props.onToDate(e.target.value)} style={inputStyle} />
          </label>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button className="btn soft" onClick={props.onThisWeek}>This week</button>
            <button className="btn" onClick={props.onReset}>Reset</button>
          </div>
        </section>
      </aside>

      <style>{`
        @media (min-width: 1100px) {
          .desktop-sidebar {
            position: static !important;
            transform: none !important;
            box-shadow: none !important;
            height: auto !important;
            top: auto !important;
            left: auto !important;
          }
          .mobile-overlay { display: none !important; }
          .hamburger-btn { display: none !important; }
        }
      `}</style>
    </>
  );
}
