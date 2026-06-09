import React, { useState, useCallback } from 'react';
import {
  triageIssue, createIssue, fetchPaused, fetchCompletions,
  togglePaused, toggleCompletion, applyIssueFix,
  IssueTriage, IssueFix, IssueFixType, IssueDiagnosis,
} from '../lib/api';
import { trackAction } from '../lib/tracker';

interface Props {
  page: string;
  navHistory?: { page: string; timestamp: string }[];
  interactions?: { page: string; component: string; action: string; detail?: string; timestamp: string }[];
  onOpen?: () => void;
}

type Step = 'form' | 'thinking' | 'result' | 'logged';
type FixState = 'idle' | 'loading' | 'done' | 'error';

const FIX_META: Record<IssueFixType, { icon: string; color: string; label: string }> = {
  put_on_hold:   { icon: '⏸', color: '#f57c00', label: 'Put on hold' },
  remove_hold:   { icon: '▶', color: '#00897b', label: 'Resume game' },
  mark_complete: { icon: '🏆', color: '#558b2f', label: 'Mark complete' },
};

const CONFIDENCE_META: Record<IssueDiagnosis['confidence'], { label: string; color: string }> = {
  high:   { label: 'High confidence', color: '#558b2f' },
  medium: { label: 'Medium confidence', color: '#f57c00' },
  low:    { label: 'Low confidence', color: '#9b3e6f' },
};

function CodeBlock({ code, tone }: { code: string; tone: 'remove' | 'add' }) {
  const bg = tone === 'remove' ? 'rgba(198,40,40,0.07)' : 'rgba(85,139,47,0.09)';
  const border = tone === 'remove' ? 'rgba(198,40,40,0.35)' : 'rgba(85,139,47,0.45)';
  const marker = tone === 'remove' ? '#c62828' : '#558b2f';
  return (
    <pre style={{
      margin: '0 0 6px', padding: '8px 10px', background: bg, border: `1px solid ${border}`,
      borderLeft: `3px solid ${marker}`, borderRadius: '8px', overflowX: 'auto',
      fontSize: '11px', lineHeight: 1.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      color: 'var(--ink)', whiteSpace: 'pre',
    }}>
      <code>{code}</code>
    </pre>
  );
}

type ApplyState = 'idle' | 'applying' | 'applied' | 'error';

function DiagnosisPanel({ diagnosis }: { diagnosis: IssueDiagnosis }) {
  const [copied, setCopied] = useState(false);
  const [applyState, setApplyState] = useState<ApplyState>('idle');
  const [applyErr, setApplyErr] = useState('');
  const [requiresRestart, setRequiresRestart] = useState(false);
  const conf = CONFIDENCE_META[diagnosis.confidence];
  const lineLabel = diagnosis.startLine
    ? (diagnosis.endLine && diagnosis.endLine !== diagnosis.startLine
        ? `lines ${diagnosis.startLine}–${diagnosis.endLine}`
        : `line ${diagnosis.startLine}`)
    : '';
  const isBackend = diagnosis.file.includes('api-server/');

  const copy = useCallback(() => {
    navigator.clipboard?.writeText(diagnosis.proposedCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }, [diagnosis.proposedCode]);

  const apply = useCallback(() => {
    setApplyState('applying');
    setApplyErr('');
    applyIssueFix({ file: diagnosis.file, currentCode: diagnosis.currentCode, proposedCode: diagnosis.proposedCode })
      .then(r => {
        if (r.ok) { setApplyState('applied'); setRequiresRestart(Boolean(r.requiresRestart)); }
        else { setApplyState('error'); setApplyErr(r.error || 'Failed to apply'); }
      })
      .catch(e => { setApplyState('error'); setApplyErr(String(e?.message || e)); });
  }, [diagnosis.file, diagnosis.currentCode, diagnosis.proposedCode]);

  return (
    <div style={{
      textAlign: 'left', marginTop: '4px', marginBottom: '12px', padding: '11px',
      background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)' }}>🔍 Possible cause found</span>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#fff', background: conf.color, borderRadius: '999px', padding: '2px 7px', whiteSpace: 'nowrap' }}>
          {conf.label}
        </span>
      </div>

      {diagnosis.cause && (
        <div style={{ fontSize: '12px', color: 'var(--ink)', lineHeight: 1.5, marginBottom: '8px' }}>{diagnosis.cause}</div>
      )}

      <div style={{
        fontSize: '11px', color: 'var(--muted)', marginBottom: '8px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        overflowWrap: 'anywhere',
      }}>
        {diagnosis.file}{lineLabel ? ` · ${lineLabel}` : ''}
      </div>

      <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', fontWeight: 700, marginBottom: '4px' }}>
        Current
      </div>
      <CodeBlock code={diagnosis.currentCode} tone="remove" />

      <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', fontWeight: 700, margin: '4px 0' }}>
        Proposed change
      </div>
      <CodeBlock code={diagnosis.proposedCode} tone="add" />

      {diagnosis.explanation && (
        <div style={{ fontSize: '12px', color: 'var(--ink)', lineHeight: 1.5, marginTop: '6px' }}>{diagnosis.explanation}</div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '9px' }}>
        <button
          onClick={apply}
          disabled={applyState === 'applying' || applyState === 'applied'}
          style={{
            flex: 2, background: applyState === 'applied' ? '#558b2f' : applyState === 'error' ? '#c62828' : 'var(--accent)',
            color: '#fff', border: 'none', borderRadius: '8px', padding: '7px', fontSize: '12px',
            fontWeight: 700, fontFamily: 'inherit',
            cursor: applyState === 'applying' || applyState === 'applied' ? 'default' : 'pointer',
            opacity: applyState === 'applying' ? 0.7 : 1,
          }}
        >
          {applyState === 'applying' ? 'Applying…'
            : applyState === 'applied' ? '✓ Applied'
            : applyState === 'error' ? '✗ Retry apply'
            : 'Apply fix'}
        </button>
        <button
          onClick={copy}
          style={{
            flex: 1, background: 'var(--paper)', color: 'var(--accent)',
            border: '1px solid var(--accent)', borderRadius: '8px', padding: '7px', fontSize: '12px',
            fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      {applyState === 'error' && applyErr && (
        <div style={{ fontSize: '11px', color: '#c62828', lineHeight: 1.4, marginTop: '8px' }}>{applyErr}</div>
      )}

      <div style={{ fontSize: '10px', color: 'var(--muted)', lineHeight: 1.4, marginTop: '8px' }}>
        {applyState === 'applied'
          ? requiresRestart
            ? `Applied to ${diagnosis.file}. Restart the API server workflow for the change to take effect — roll back to a checkpoint to undo.`
            : `Applied to ${diagnosis.file}. The app will reload with the change — roll back to a checkpoint to undo.`
          : isBackend
            ? 'This is a backend file. Applying writes the change to disk — the API server workflow must be restarted after. Review it first.'
            : 'Applying writes this change directly to the file. Review it first — you can always roll back to a checkpoint to undo.'}
      </div>
    </div>
  );
}

function DiagnosisGroup({ diagnoses }: { diagnoses: IssueDiagnosis[] }) {
  const [allState, setAllState] = useState<'idle' | 'applying' | 'done' | 'error'>('idle');
  const [allErr, setAllErr] = useState('');
  const [needsRestart, setNeedsRestart] = useState(false);

  const applyAll = useCallback(async () => {
    setAllState('applying');
    setAllErr('');
    let restartNeeded = false;
    for (const d of diagnoses) {
      const r = await applyIssueFix({ file: d.file, currentCode: d.currentCode, proposedCode: d.proposedCode });
      if (!r.ok) {
        setAllState('error');
        setAllErr(r.error || 'One or more fixes failed — apply them individually below.');
        return;
      }
      if (r.requiresRestart) restartNeeded = true;
    }
    setNeedsRestart(restartNeeded);
    setAllState('done');
  }, [diagnoses]);

  return (
    <div>
      {diagnoses.length > 1 && (
        <div style={{ marginBottom: '10px' }}>
          <button
            onClick={applyAll}
            disabled={allState === 'applying' || allState === 'done'}
            style={{
              width: '100%', padding: '8px', borderRadius: '8px', border: 'none',
              background: allState === 'done' ? '#558b2f' : allState === 'error' ? '#c62828' : 'var(--accent)',
              color: '#fff', fontWeight: 700, fontSize: '13px', fontFamily: 'inherit',
              cursor: allState === 'applying' || allState === 'done' ? 'default' : 'pointer',
              opacity: allState === 'applying' ? 0.7 : 1,
            }}
          >
            {allState === 'applying' ? 'Applying all…'
              : allState === 'done' ? `✓ All ${diagnoses.length} fixes applied`
              : allState === 'error' ? '✗ Retry all'
              : `Apply all ${diagnoses.length} fixes`}
          </button>
          {allState === 'done' && needsRestart && (
            <div style={{ fontSize: '11px', color: '#f57c00', marginTop: '5px', lineHeight: 1.4 }}>
              ⚠ One or more backend files were changed — restart the API server workflow for them to take effect.
            </div>
          )}
          {allState === 'error' && allErr && (
            <div style={{ fontSize: '11px', color: '#c62828', marginTop: '5px', lineHeight: 1.4 }}>{allErr}</div>
          )}
        </div>
      )}
      {diagnoses.map((d, i) => (
        <DiagnosisPanel key={i} diagnosis={d} />
      ))}
    </div>
  );
}

async function applyFix(fix: IssueFix): Promise<void> {
  if (fix.type === 'put_on_hold') {
    const paused = await fetchPaused();
    if (!paused.has(fix.game)) await togglePaused(fix.game);
  } else if (fix.type === 'remove_hold') {
    const paused = await fetchPaused();
    if (paused.has(fix.game)) await togglePaused(fix.game);
  } else if (fix.type === 'mark_complete') {
    const completed = await fetchCompletions();
    if (!completed.has(fix.game)) await toggleCompletion(fix.game);
  }
}

export default function IssueReporter({ page, navHistory, interactions, onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [element, setElement] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IssueTriage | null>(null);
  const [fixStates, setFixStates] = useState<Record<number, FixState>>({});

  const reset = useCallback(() => {
    setStep('form');
    setElement('');
    setDesc('');
    setResult(null);
    setFixStates({});
    setBusy(false);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setTimeout(reset, 200);
  }, [reset]);

  const submit = useCallback(async () => {
    if (!desc.trim()) return;
    setStep('thinking');
    try {
      const r = await triageIssue({ page, element, description: desc.trim(), navHistory, interactions });
      setResult(r);
      setStep(r.category === 'log' ? 'logged' : 'result');
    } catch {
      // Fall back to plain logging so the report is never lost
      try {
        await createIssue({ page, element, description: desc.trim(), navHistory, interactions });
        setResult({ category: 'log', summary: '', steps: [], fixes: [], logged: true });
        setStep('logged');
      } catch {
        alert('Failed to send issue');
        setStep('form');
      }
    }
  }, [page, element, desc, navHistory, interactions]);

  const runFix = useCallback(async (idx: number, fix: IssueFix) => {
    setFixStates(s => ({ ...s, [idx]: 'loading' }));
    try {
      await applyFix(fix);
      setFixStates(s => ({ ...s, [idx]: 'done' }));
    } catch {
      setFixStates(s => ({ ...s, [idx]: 'error' }));
    }
  }, []);

  const logAnyway = useCallback(async () => {
    setBusy(true);
    try {
      await createIssue({ page, element, description: desc.trim(), navHistory, interactions });
      setResult(r => ({ ...(r as IssueTriage), category: 'log', logged: true }));
      setStep('logged');
    } catch {
      alert('Failed to log issue');
    } finally {
      setBusy(false);
    }
  }, [page, element, desc, navHistory, interactions]);

  if (!open) {
    return (
      <button
        title="Report an issue"
        onClick={() => {
          setOpen(true);
          onOpen?.();
          trackAction(page, 'IssueReporter', 'open', 'reported an issue');
        }}
        style={{
          position: 'fixed', bottom: '16px', right: '16px', zIndex: 999,
          width: '44px', height: '44px', borderRadius: '50%', border: 'none',
          background: 'var(--danger)', color: 'white', fontSize: '22px', cursor: 'pointer',
          boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        🐛
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: '16px', right: '16px', zIndex: 999, width: '340px',
      maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
      background: 'var(--paper)', border: '1px solid var(--line)',
      borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>
          {step === 'form' ? 'Report an Issue' : step === 'thinking' ? 'Looking into it…' : 'Issue Assistant'}
        </span>
        <button onClick={close} style={{ border: 'none', background: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)' }}>×</button>
      </div>

      {step === 'form' && (
        <>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>Page: {page}</div>
          {navHistory && navHistory.length > 1 && (
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px', padding: '6px 8px', background: 'var(--paper-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', lineHeight: 1.4 }}>
              <span style={{ fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink)' }}>Recent path: </span>
              {navHistory.slice(-5).map((h, i) => (
                <span key={i} style={{ color: i === navHistory.slice(-5).length - 1 ? 'var(--accent)' : 'var(--muted)' }}>
                  {h.page}{i < navHistory.slice(-5).length - 1 ? ' → ' : ''}
                </span>
              ))}
            </div>
          )}
          {interactions && interactions.length > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px', padding: '6px 8px', background: 'var(--paper-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', lineHeight: 1.4 }}>
              <span style={{ fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink)' }}>Recent clicks: </span>
              {interactions.slice(-5).map((h, i) => (
                <span key={i} style={{ color: i === interactions.slice(-5).length - 1 ? 'var(--accent)' : 'var(--muted)' }}>
                  {h.component}{i < interactions.slice(-5).length - 1 ? ' → ' : ''}
                </span>
              ))}
            </div>
          )}
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px' }}>
            Element (optional)
            <input
              value={element}
              onChange={e => setElement(e.target.value)}
              placeholder="e.g. Dashboard card, Weekly report"
              style={{ width: '100%', marginTop: '4px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', fontSize: '13px', background: 'var(--paper-2)' }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: '10px', fontSize: '13px' }}>
            Description
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Describe what's wrong, or what you're trying to do..."
              rows={3}
              style={{ width: '100%', marginTop: '4px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', fontSize: '13px', background: 'var(--paper-2)', resize: 'vertical' }}
            />
          </label>
          <button className="btn primary" onClick={submit} disabled={!desc.trim()} style={{ width: '100%' }}>
            Get help
          </button>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px', textAlign: 'center' }}>
            We'll try to solve it instantly, or log it for review.
          </div>
        </>
      )}

      {step === 'thinking' && (
        <div style={{ padding: '20px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '5px' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)',
                animation: `companion-bounce 1.2s ${i * 0.2}s ease-in-out infinite`,
              }} />
            ))}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Diagnosing your issue…</div>
        </div>
      )}

      {step === 'result' && result && (
        <>
          {result.summary && (
            <div style={{ fontSize: '13px', color: 'var(--ink)', lineHeight: 1.5, marginBottom: '12px' }}>
              {result.summary}
            </div>
          )}

          {result.steps.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', fontWeight: 700, marginBottom: '6px' }}>
                Try this
              </div>
              <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: 'var(--ink)', lineHeight: 1.55 }}>
                {result.steps.map((s, i) => <li key={i} style={{ marginBottom: '4px' }}>{s}</li>)}
              </ol>
            </div>
          )}

          {result.fixes.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', fontWeight: 700, marginBottom: '6px' }}>
                Quick fixes
              </div>
              {result.fixes.map((fix, i) => {
                const meta = FIX_META[fix.type];
                const fs = fixStates[i] ?? 'idle';
                const btnBg = fs === 'done' ? '#558b2f' : fs === 'error' ? '#c62828' : meta.color;
                const btnLabel = fs === 'loading' ? '…' : fs === 'done' ? '✓ Done' : fs === 'error' ? '✗ Retry' : (fix.label ?? meta.label);
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                    background: 'var(--paper-2)', border: `1px solid ${meta.color}44`, borderLeft: `3px solid ${meta.color}`,
                    borderRadius: '10px', padding: '9px 11px', marginBottom: '6px',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {meta.icon} {fix.game}
                      </div>
                      {fix.detail && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', lineHeight: 1.4 }}>{fix.detail}</div>}
                    </div>
                    <button
                      onClick={() => { if (fs === 'idle' || fs === 'error') runFix(i, fix); }}
                      disabled={fs === 'loading' || fs === 'done'}
                      style={{
                        background: btnBg, color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 12px',
                        cursor: fs === 'loading' || fs === 'done' ? 'default' : 'pointer', fontSize: '12px', fontWeight: 700,
                        fontFamily: 'inherit', minWidth: '92px', flexShrink: 0, whiteSpace: 'nowrap',
                        opacity: fs === 'loading' ? 0.7 : 1,
                      }}
                    >
                      {btnLabel}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button className="btn primary" onClick={close} style={{ flex: 1 }}>That sorted it</button>
            <button className="btn" onClick={logAnyway} disabled={busy} style={{ flex: 1 }}>
              {busy ? 'Logging…' : 'Still broken'}
            </button>
          </div>
        </>
      )}

      {step === 'logged' && (
        <div style={{ padding: '8px 0' }}>
          <div style={{ fontSize: '28px', textAlign: 'center', marginBottom: '8px' }}>✅</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', textAlign: 'center', marginBottom: '6px' }}>
            Logged for review
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5, marginBottom: '12px' }}>
            {result?.summary || "Thanks — this couldn't be fixed automatically, so it's been logged and we'll look into it."}
          </div>
          {result?.diagnoses && result.diagnoses.length > 0 && (
            <DiagnosisGroup diagnoses={result.diagnoses} />
          )}
          <button className="btn primary" onClick={close} style={{ width: '100%' }}>Close</button>
        </div>
      )}
    </div>
  );
}
