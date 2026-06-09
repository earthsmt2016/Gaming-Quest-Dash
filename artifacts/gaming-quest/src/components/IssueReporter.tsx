import React, { useState, useCallback } from 'react';
import { createIssue, Issue } from '../lib/api';

interface Props {
  page: string;
}

export default function IssueReporter({ page }: Props) {
  const [open, setOpen] = useState(false);
  const [element, setElement] = useState('');
  const [desc, setDesc] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = useCallback(async () => {
    if (!desc.trim()) return;
    setSending(true);
    try {
      await createIssue({ page, element, description: desc.trim() });
      setSent(true);
      setDesc('');
      setElement('');
      setTimeout(() => { setOpen(false); setSent(false); }, 1500);
    } catch {
      alert('Failed to send issue');
    } finally {
      setSending(false);
    }
  }, [page, element, desc]);

  if (!open) {
    return (
      <button
        title="Report an issue"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          zIndex: 999,
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          border: 'none',
          background: 'var(--danger)',
          color: 'white',
          fontSize: '22px',
          cursor: 'pointer',
          boxShadow: 'var(--shadow)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        🐛
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      zIndex: 999,
      width: '320px',
      background: 'var(--paper)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow)',
      padding: '14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>Report an Issue</span>
        <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)' }}>×</button>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>Page: {page}</div>
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
          placeholder="Describe what's wrong..."
          rows={3}
          style={{ width: '100%', marginTop: '4px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', fontSize: '13px', background: 'var(--paper-2)', resize: 'vertical' }}
        />
      </label>
      <button
        className="btn primary"
        onClick={submit}
        disabled={sending || !desc.trim()}
        style={{ width: '100%' }}
      >
        {sent ? 'Sent!' : sending ? 'Sending...' : 'Submit Issue'}
      </button>
    </div>
  );
}
