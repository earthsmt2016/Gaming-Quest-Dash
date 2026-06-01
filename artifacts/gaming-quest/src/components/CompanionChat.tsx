import React, { useState, useEffect, useRef, useCallback } from 'react';
import { sendCompanionMessage, fetchCompanionHistory, clearCompanionHistory, CompanionMessage } from '../lib/api';

const QUICK_ACTIONS = [
  { label: '📊 Analyze my last session', message: 'Can you analyze my most recent gaming session and tell me what you notice?' },
  { label: '🎮 What should I play today?', message: 'Based on my history and active quests, what should I play today and for how long?' },
  { label: '⚔️ Help with my active quest', message: 'What\'s the best strategy to make progress on my current active quests?' },
  { label: '📈 How am I improving?', message: 'Looking at my overall history, where am I improving and what should I focus on next?' },
];

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

function MessageBubble({ msg, onCopy }: { msg: CompanionMessage; onCopy: (text: string) => void }) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // Simple markdown-ish rendering: bold, code blocks, bullet lists
  function renderContent(text: string) {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Code block
      if (line.trim().startsWith('```')) {
        const lang = line.trim().slice(3).trim();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        elements.push(
          <pre key={i} style={{
            background: '#1e1e2e', color: '#cdd6f4', borderRadius: '6px',
            padding: '10px 12px', fontSize: '12px', overflowX: 'auto',
            margin: '6px 0', fontFamily: 'monospace', lineHeight: 1.5,
          }}>
            {lang && <div style={{ fontSize: '10px', color: '#6c7086', marginBottom: '6px', textTransform: 'uppercase' }}>{lang}</div>}
            {codeLines.join('\n')}
          </pre>
        );
        i++;
        continue;
      }

      // Inline formatting helper
      function formatInline(text: string): React.ReactNode[] {
        const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
        return parts.map((part, pi) => {
          if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={pi} style={{ background: 'rgba(0,0,0,0.08)', borderRadius: '3px', padding: '1px 4px', fontSize: '12px', fontFamily: 'monospace' }}>{part.slice(1, -1)}</code>;
          }
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={pi}>{part.slice(2, -2)}</strong>;
          }
          return part;
        });
      }

      // Bullet list item
      if (line.match(/^[-*•]\s/)) {
        const items: string[] = [];
        while (i < lines.length && lines[i].match(/^[-*•]\s/)) {
          items.push(lines[i].replace(/^[-*•]\s/, ''));
          i++;
        }
        elements.push(
          <ul key={i} style={{ margin: '4px 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {items.map((item, ii) => <li key={ii} style={{ fontSize: '14px', lineHeight: 1.5 }}>{formatInline(item)}</li>)}
          </ul>
        );
        continue;
      }

      // Numbered list
      if (line.match(/^\d+\.\s/)) {
        const items: string[] = [];
        while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
          items.push(lines[i].replace(/^\d+\.\s/, ''));
          i++;
        }
        elements.push(
          <ol key={i} style={{ margin: '4px 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {items.map((item, ii) => <li key={ii} style={{ fontSize: '14px', lineHeight: 1.5 }}>{formatInline(item)}</li>)}
          </ol>
        );
        continue;
      }

      // Empty line → spacer
      if (!line.trim()) {
        elements.push(<div key={i} style={{ height: '6px' }} />);
        i++;
        continue;
      }

      // Normal paragraph
      elements.push(
        <p key={i} style={{ margin: 0, fontSize: '14px', lineHeight: 1.6 }}>{formatInline(line)}</p>
      );
      i++;
    }

    return elements;
  }

  return (
    <div style={{
      display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row',
      gap: '8px', alignItems: 'flex-end',
    }}>
      {/* Avatar */}
      {!isUser && (
        <div style={{
          width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #6a1b9a, #1565c0)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '14px', marginBottom: '2px',
        }}>🤖</div>
      )}

      <div style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
        <div style={{
          background: isUser ? 'var(--accent)' : 'var(--paper)',
          color: isUser ? '#fff' : 'var(--text)',
          borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          padding: '10px 14px',
          border: isUser ? 'none' : '1px solid var(--line)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          {isUser
            ? <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5 }}>{msg.content}</p>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>{renderContent(msg.content)}</div>
          }
        </div>

        {/* Copy button for AI messages */}
        {!isUser && (
          <button
            onClick={handleCopy}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px',
              fontSize: '11px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '3px',
              borderRadius: '4px', transition: 'color 0.15s',
            }}
          >
            {copied ? '✓ Copied' : '⎘ Copy'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function CompanionChat() {
  const [messages, setMessages] = useState<CompanionMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(true);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchCompanionHistory()
      .then(h => setMessages(h))
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    if (open && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, open]);

  const handleSend = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const userMsg: CompanionMessage = { id: Date.now(), role: 'user', content, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const { reply } = await sendCompanionMessage(content);
      const aiMsg: CompanionMessage = { id: Date.now() + 1, role: 'assistant', content: reply, created_at: new Date().toISOString() };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      setError('Failed to get a response. Try again.');
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const handleClear = async () => {
    if (!confirm('Clear conversation history?')) return;
    await clearCompanionHistory();
    setMessages([]);
  };

  const isEmpty = messages.length === 0 && !historyLoading;

  return (
    <>
      <style>{`
        @keyframes companion-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
        .companion-input:focus { outline: 2px solid var(--accent); outline-offset: 2px; }
        .companion-quick-btn:hover { background: var(--paper) !important; border-color: var(--accent) !important; color: var(--accent) !important; }
      `}</style>

      <div style={{
        background: 'var(--paper)', border: '1px solid var(--line)',
        borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: open ? '1px solid var(--line)' : 'none',
          cursor: 'pointer',
        }} onClick={() => setOpen(v => !v)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #6a1b9a, #1565c0)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0,
            }}>🤖</div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>AI Gaming Companion</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Your personal coach & strategist</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {messages.length > 0 && (
              <button
                onClick={e => { e.stopPropagation(); handleClear(); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--muted)', padding: '3px 6px' }}
              >Clear</button>
            )}
            <span style={{ fontSize: '16px', color: 'var(--muted)', fontWeight: 300 }}>{open ? '▲' : '▼'}</span>
          </div>
        </div>

        {open && (
          <>
            {/* Messages */}
            <div ref={messagesRef} style={{
              height: isEmpty ? 'auto' : '360px', overflowY: 'auto', padding: '14px 16px',
              display: 'flex', flexDirection: 'column', gap: '12px',
              background: 'var(--paper-2)',
            }}>
              {historyLoading && (
                <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '13px', padding: '16px 0' }}>
                  Loading conversation…
                </div>
              )}

              {isEmpty && (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>👾</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Hey, ready to level up?</div>
                  <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
                    Ask me anything — strategy, analysis, what to play next.
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', justifyContent: 'center' }}>
                    {QUICK_ACTIONS.map(a => (
                      <button
                        key={a.label}
                        className="companion-quick-btn"
                        onClick={() => handleSend(a.message)}
                        style={{
                          background: 'var(--paper-2)', border: '1px solid var(--line)',
                          borderRadius: '20px', padding: '6px 13px', cursor: 'pointer',
                          fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
                          color: 'var(--muted)', transition: 'all 0.15s',
                        }}
                      >{a.label}</button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} onCopy={handleCopy} />
              ))}

              {loading && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, #6a1b9a, #1565c0)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
                  }}>🤖</div>
                  <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: '18px 18px 18px 4px' }}>
                    <TypingIndicator />
                  </div>
                </div>
              )}

              {error && (
                <div style={{ fontSize: '12px', color: '#c62828', textAlign: 'center', padding: '4px 0' }}>
                  {error}
                </div>
              )}

              {/* Quick actions when conversation is active */}
              {!isEmpty && !loading && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingTop: '4px' }}>
                  {QUICK_ACTIONS.map(a => (
                    <button
                      key={a.label}
                      className="companion-quick-btn"
                      onClick={() => handleSend(a.message)}
                      style={{
                        background: 'var(--paper-2)', border: '1px solid var(--line)',
                        borderRadius: '20px', padding: '4px 11px', cursor: 'pointer',
                        fontSize: '11px', fontWeight: 600, fontFamily: 'inherit',
                        color: 'var(--muted)', transition: 'all 0.15s',
                      }}
                    >{a.label}</button>
                  ))}
                </div>
              )}

            </div>

            {/* Input */}
            <div style={{
              padding: '10px 14px', borderTop: '1px solid var(--line)',
              display: 'flex', gap: '8px', alignItems: 'flex-end',
              background: 'var(--paper)',
            }}>
              <textarea
                ref={inputRef}
                className="companion-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything… (Enter to send, Shift+Enter for new line)"
                rows={1}
                style={{
                  flex: 1, resize: 'none', border: '1px solid var(--line)',
                  borderRadius: '20px', padding: '8px 14px', fontSize: '14px',
                  fontFamily: 'inherit', background: 'var(--paper-2)',
                  lineHeight: 1.5, maxHeight: '120px', overflowY: 'auto',
                  scrollbarWidth: 'thin',
                }}
                onInput={e => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                }}
                disabled={loading}
              />
              <button
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                style={{
                  background: loading || !input.trim() ? 'var(--line)' : 'var(--accent)',
                  color: '#fff', border: 'none', borderRadius: '50%',
                  width: '36px', height: '36px', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '16px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
              >↑</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
