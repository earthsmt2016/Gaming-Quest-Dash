import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { sendCompanionMessage, fetchCompanionHistory, clearCompanionHistory, fetchGames, CompanionMessage } from '../lib/api';

const QUICK_ACTIONS = [
  { label: '📊 Show my game breakdown', message: 'Show me a chart of how my time is split across games this month.' },
  { label: '🎮 What should I play today?', message: 'Based on my history and active quests, what should I play today and for how long?' },
  { label: '⚔️ Quest progress', message: 'How am I doing on my active quests? Give me a detailed status.' },
  { label: '📈 Session trends', message: 'Analyze my recent gaming sessions — what patterns do you see?' },
];

const CHART_COLORS = ['#6a1b9a', '#1565c0', '#00897b', '#f57c00', '#c62828', '#558b2f', '#6a1b9a', '#283593'];

// ─── Chart types ───────────────────────────────────────────────────────────────

interface ChartSpec {
  type: 'bar' | 'pie' | 'donut' | 'line';
  title: string;
  labels: string[];
  values: number[];
  unit?: string;
}

/**
 * Robust parser: tracks brace depth so JSON arrays inside [CHART:{...}]
 * don't break extraction. The naive regex /\[CHART:(.*?)\]/ stops at the
 * first ] inside the JSON (e.g. labels:[…]).
 */
function parseContentBlocks(text: string): Array<{ kind: 'text' | 'chart'; content: string }> {
  const blocks: Array<{ kind: 'text' | 'chart'; content: string }> = [];
  const MARKER = '[CHART:';
  let remaining = text;

  while (true) {
    const markerIdx = remaining.indexOf(MARKER);
    if (markerIdx === -1) {
      const leftover = remaining.trim();
      if (leftover) blocks.push({ kind: 'text', content: leftover });
      break;
    }

    const textBefore = remaining.slice(0, markerIdx).trim();
    if (textBefore) blocks.push({ kind: 'text', content: textBefore });

    // Walk forward tracking brace depth to find the end of the JSON object
    const jsonStart = markerIdx + MARKER.length;
    let depth = 0;
    let jsonEnd = -1;
    for (let i = jsonStart; i < remaining.length; i++) {
      const ch = remaining[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          // Expect a closing ] immediately after the JSON object
          if (remaining[i + 1] === ']') {
            blocks.push({ kind: 'chart', content: remaining.slice(jsonStart, i + 1) });
            jsonEnd = i + 2;
          }
          break;
        }
      }
    }

    if (jsonEnd === -1) {
      // Malformed — treat rest as plain text
      const rest = remaining.slice(markerIdx).trim();
      if (rest) blocks.push({ kind: 'text', content: rest });
      break;
    }

    remaining = remaining.slice(jsonEnd);
  }

  return blocks;
}

function InlineChart({ spec }: { spec: ChartSpec }) {
  const data = spec.labels.map((l, i) => ({ name: l, value: Number(spec.values[i] ?? 0) }));
  const fmt = (v: number) =>
    spec.unit === 'minutes' ? `${Math.round((v / 60) * 10) / 10}h`
    : spec.unit === 'hours' ? `${v}h`
    : `${v}${spec.unit ? ' ' + spec.unit : ''}`;

  const chartHeader = (
    <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {spec.title}
    </div>
  );

  const wrapStyle: React.CSSProperties = {
    margin: '8px 0', background: 'var(--paper-2)', borderRadius: '10px',
    padding: '12px', border: '1px solid var(--line)',
  };

  if (spec.type === 'pie' || spec.type === 'donut') {
    const inner = spec.type === 'donut' ? 48 : 0;
    return (
      <div style={wrapStyle}>
        {chartHeader}
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={data} dataKey="value" nameKey="name"
              cx="50%" cy="45%" outerRadius={80} innerRadius={inner}
            >
              {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: number) => [fmt(v), '']} />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => value.length > 22 ? value.slice(0, 20) + '…' : value}
              wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (spec.type === 'line') {
    return (
      <div style={wrapStyle}>
        {chartHeader}
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={fmt} />
            <Tooltip formatter={(v: number) => [fmt(v), spec.unit ?? 'value']} />
            <Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Default: horizontal bar chart
  return (
    <div style={wrapStyle}>
      {chartHeader}
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 28, top: 4, bottom: 4 }}>
          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmt} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
          <Tooltip formatter={(v: number) => [fmt(v), spec.unit ?? 'value']} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: '4px', padding: '12px 14px', alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: '7px', height: '7px', borderRadius: '50%', background: 'var(--muted)',
          animation: `companion-bounce 1.2s ${i * 0.2}s ease-in-out infinite`,
        }} />
      ))}
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, onCopy }: { msg: CompanionMessage; onCopy: (text: string) => void }) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  function formatInline(text: string): React.ReactNode[] {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((part, pi) => {
      if (part.startsWith('`') && part.endsWith('`'))
        return <code key={pi} style={{ background: 'rgba(0,0,0,0.08)', borderRadius: '3px', padding: '1px 4px', fontSize: '12px', fontFamily: 'monospace' }}>{part.slice(1, -1)}</code>;
      if (part.startsWith('**') && part.endsWith('**'))
        return <strong key={pi}>{part.slice(2, -2)}</strong>;
      return part;
    });
  }

  function renderText(text: string) {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;
    let k = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim().startsWith('```')) {
        const lang = line.trim().slice(3).trim();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) { codeLines.push(lines[i]); i++; }
        elements.push(
          <pre key={k++} style={{ background: '#1e1e2e', color: '#cdd6f4', borderRadius: '6px', padding: '10px 12px', fontSize: '12px', overflowX: 'auto', margin: '6px 0', fontFamily: 'monospace', lineHeight: 1.5 }}>
            {lang && <div style={{ fontSize: '10px', color: '#6c7086', marginBottom: '6px', textTransform: 'uppercase' }}>{lang}</div>}
            {codeLines.join('\n')}
          </pre>
        );
        i++; continue;
      }
      if (line.match(/^[-*•]\s/)) {
        const items: string[] = [];
        while (i < lines.length && lines[i].match(/^[-*•]\s/)) { items.push(lines[i].replace(/^[-*•]\s/, '')); i++; }
        elements.push(<ul key={k++} style={{ margin: '4px 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' }}>{items.map((item, ii) => <li key={ii} style={{ fontSize: '14px', lineHeight: 1.5 }}>{formatInline(item)}</li>)}</ul>);
        continue;
      }
      if (line.match(/^\d+\.\s/)) {
        const items: Array<{ header: string; bullets: string[] }> = [];
        while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
          const header = lines[i].replace(/^\d+\.\s/, '');
          i++;
          const bullets: string[] = [];
          while (i < lines.length && lines[i].match(/^[-*•]\s/)) {
            bullets.push(lines[i].replace(/^[-*•]\s/, ''));
            i++;
          }
          // skip blank separator lines between numbered items
          while (i < lines.length && !lines[i].trim() && i + 1 < lines.length && lines[i + 1].match(/^\d+\.\s/)) { i++; }
          items.push({ header, bullets });
        }
        elements.push(
          <ol key={k++} style={{ margin: '4px 0', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {items.map((item, ii) => (
              <li key={ii} style={{ fontSize: '14px', lineHeight: 1.5 }}>
                {formatInline(item.header)}
                {item.bullets.length > 0 && (
                  <ul style={{ margin: '4px 0 0', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {item.bullets.map((b, bi) => <li key={bi} style={{ fontSize: '13px', lineHeight: 1.5, listStyleType: 'disc' }}>{formatInline(b)}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        );
        continue;
      }
      if (!line.trim()) { elements.push(<div key={k++} style={{ height: '6px' }} />); i++; continue; }
      elements.push(<p key={k++} style={{ margin: 0, fontSize: '14px', lineHeight: 1.6 }}>{formatInline(line)}</p>);
      i++;
    }
    return elements;
  }

  const blocks = isUser ? null : parseContentBlocks(msg.content);

  return (
    <div style={{ display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row', gap: '8px', alignItems: 'flex-end' }}>
      {!isUser && (
        <div style={{ width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #6a1b9a, #1565c0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', marginBottom: '2px' }}>🤖</div>
      )}
      <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
        <div style={{
          background: isUser ? 'var(--accent)' : 'var(--paper)',
          color: isUser ? '#fff' : 'var(--text)',
          borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          padding: '10px 14px',
          border: isUser ? 'none' : '1px solid var(--line)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          width: isUser ? undefined : '100%',
        }}>
          {isUser
            ? <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5 }}>{msg.content}</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {blocks!.map((block, bi) => {
                  if (block.kind === 'chart') {
                    try {
                      const spec: ChartSpec = JSON.parse(block.content);
                      return <InlineChart key={bi} spec={spec} />;
                    } catch {
                      return null;
                    }
                  }
                  return <div key={bi}>{renderText(block.content)}</div>;
                })}
              </div>
            )
          }
        </div>
        {!isUser && (
          <button onClick={handleCopy} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', fontSize: '11px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '3px', borderRadius: '4px' }}>
            {copied ? '✓ Copied' : '⎘ Copy'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CompanionChat() {
  const [messages, setMessages] = useState<CompanionMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(true);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [games, setGames] = useState<string[]>([]);
  const [gamePickerOpen, setGamePickerOpen] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch games list once
  useEffect(() => {
    fetchGames().then(setGames).catch(() => {});
  }, []);

  // Reload history when game context changes
  useEffect(() => {
    setHistoryLoading(true);
    fetchCompanionHistory(selectedGame ?? undefined)
      .then(h => setMessages(h))
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [selectedGame]);

  useEffect(() => {
    if (!open || !messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages, open]);

  // Close game picker on outside click
  useEffect(() => {
    if (!gamePickerOpen) return;
    const handler = () => setGamePickerOpen(false);
    setTimeout(() => document.addEventListener('click', handler), 0);
    return () => document.removeEventListener('click', handler);
  }, [gamePickerOpen]);

  const handleSend = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const userMsg: CompanionMessage = { id: Date.now(), role: 'user', content, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError('');
    try {
      const { reply } = await sendCompanionMessage(content, selectedGame ?? undefined);
      const aiMsg: CompanionMessage = { id: Date.now() + 1, role: 'assistant', content: reply, created_at: new Date().toISOString() };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      setError('Failed to get a response. Try again.');
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading, selectedGame]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleCopy = (text: string) => { navigator.clipboard.writeText(text).catch(() => {}); };

  const handleClear = async () => {
    if (!confirm('Clear this conversation?')) return;
    await clearCompanionHistory(selectedGame ?? undefined);
    setMessages([]);
  };

  const handleSelectGame = (game: string | null) => {
    setSelectedGame(game);
    setGamePickerOpen(false);
    setMessages([]);
  };

  const isEmpty = messages.length === 0 && !historyLoading;

  const gameLabel = selectedGame
    ? (selectedGame.length > 16 ? selectedGame.slice(0, 14) + '…' : selectedGame)
    : 'All games';

  return (
    <>
      <style>{`
        @keyframes companion-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
        .companion-input:focus { outline: 2px solid var(--accent); outline-offset: 2px; }
        .companion-quick-btn:hover { background: var(--paper) !important; border-color: var(--accent) !important; color: var(--accent) !important; }
        .game-picker-item:hover { background: var(--paper-2); }
      `}</style>

      <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: open ? '1px solid var(--line)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }} onClick={() => setOpen(v => !v)}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #6a1b9a, #1565c0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>🤖</div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>AI Gaming Companion</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                {selectedGame ? `Focused on ${selectedGame}` : 'Your personal coach & strategist'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={e => e.stopPropagation()}>
            {/* Game selector */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setGamePickerOpen(v => !v)}
                style={{
                  background: selectedGame ? 'rgba(106,27,154,0.08)' : 'var(--paper-2)',
                  border: `1px solid ${selectedGame ? '#6a1b9a' : 'var(--line)'}`,
                  borderRadius: '20px', padding: '4px 10px', cursor: 'pointer',
                  fontSize: '11px', fontWeight: 600, fontFamily: 'inherit',
                  color: selectedGame ? '#6a1b9a' : 'var(--muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                🎮 {gameLabel} {gamePickerOpen ? '▲' : '▼'}
              </button>
              {gamePickerOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 50,
                  background: 'var(--paper)', border: '1px solid var(--line)',
                  borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  minWidth: '200px', padding: '6px 0', maxHeight: '260px', overflowY: 'auto',
                }}>
                  <div
                    className="game-picker-item"
                    onClick={() => handleSelectGame(null)}
                    style={{ padding: '8px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: selectedGame === null ? 700 : 400, color: selectedGame === null ? 'var(--accent)' : 'var(--text)' }}
                  >
                    🌐 All games
                  </div>
                  <div style={{ height: '1px', background: 'var(--line)', margin: '4px 0' }} />
                  {games.map(g => (
                    <div
                      key={g}
                      className="game-picker-item"
                      onClick={() => handleSelectGame(g)}
                      style={{ padding: '8px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: selectedGame === g ? 700 : 400, color: selectedGame === g ? 'var(--accent)' : 'var(--text)' }}
                    >
                      🎮 {g}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {messages.length > 0 && (
              <button onClick={handleClear} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--muted)', padding: '3px 6px' }}>Clear</button>
            )}
            <span onClick={() => setOpen(v => !v)} style={{ fontSize: '16px', color: 'var(--muted)', fontWeight: 300, cursor: 'pointer' }}>{open ? '▲' : '▼'}</span>
          </div>
        </div>

        {open && (
          <>
            {/* Messages */}
            <div ref={messagesRef} style={{ maxHeight: '420px', overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--paper-2)' }}>
              {historyLoading && (
                <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '13px', padding: '16px 0' }}>Loading conversation…</div>
              )}

              {isEmpty && (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>👾</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>
                    {selectedGame ? `${selectedGame} coach ready` : 'Hey, ready to level up?'}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
                    {selectedGame ? `I'll focus all my analysis on ${selectedGame}.` : 'Ask me anything — stats, strategy, what to play next.'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', justifyContent: 'center' }}>
                    {QUICK_ACTIONS.map(a => (
                      <button key={a.label} className="companion-quick-btn" onClick={() => handleSend(a.message)} style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: '20px', padding: '6px 13px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: 'inherit', color: 'var(--muted)', transition: 'all 0.15s' }}>{a.label}</button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id}>
                  <MessageBubble msg={msg} onCopy={handleCopy} />
                </div>
              ))}

              {loading && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #6a1b9a, #1565c0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>🤖</div>
                  <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: '18px 18px 18px 4px' }}>
                    <TypingIndicator />
                  </div>
                </div>
              )}

              {error && <div style={{ fontSize: '12px', color: '#c62828', textAlign: 'center', padding: '4px 0' }}>{error}</div>}

              {!isEmpty && !loading && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingTop: '4px' }}>
                  {QUICK_ACTIONS.map(a => (
                    <button key={a.label} className="companion-quick-btn" onClick={() => handleSend(a.message)} style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: '20px', padding: '4px 11px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, fontFamily: 'inherit', color: 'var(--muted)', transition: 'all 0.15s' }}>{a.label}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Input */}
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line)', display: 'flex', gap: '8px', alignItems: 'flex-end', background: 'var(--paper)' }}>
              <textarea
                ref={inputRef}
                className="companion-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={selectedGame ? `Ask about ${selectedGame}… (Enter to send)` : 'Ask anything… (Enter to send, Shift+Enter for new line)'}
                rows={1}
                style={{ flex: 1, resize: 'none', border: '1px solid var(--line)', borderRadius: '20px', padding: '8px 14px', fontSize: '14px', fontFamily: 'inherit', background: 'var(--paper-2)', lineHeight: 1.5, maxHeight: '120px', overflowY: 'auto', scrollbarWidth: 'thin' }}
                onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }}
                disabled={loading}
              />
              <button
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                style={{ background: loading || !input.trim() ? 'var(--line)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', fontSize: '16px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
              >↑</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
