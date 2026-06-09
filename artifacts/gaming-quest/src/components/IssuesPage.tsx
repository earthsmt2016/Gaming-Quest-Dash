import React, { useEffect, useState } from 'react';
import { fetchIssues, resolveIssue, deleteIssue, Issue } from '../lib/api';

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  const load = () => {
    setLoading(true);
    fetchIssues()
      .then(setIssues)
      .catch(() => setError('Failed to load issues'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleResolve = async (id: number, status: 'resolved' | 'open') => {
    try {
      await resolveIssue(id, status);
      setIssues(prev => prev.map(i => i.id === id ? { ...i, status } : i));
      setFlash(status === 'resolved' ? 'Issue marked as resolved' : 'Issue reopened');
      setTimeout(() => setFlash(''), 2000);
    } catch {
      setError('Failed to update issue');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this issue?')) return;
    try {
      await deleteIssue(id);
      setIssues(prev => prev.filter(i => i.id !== id));
      setFlash('Issue deleted');
      setTimeout(() => setFlash(''), 2000);
    } catch {
      setError('Failed to delete issue');
    }
  };

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Loading issues…</div>;
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>
          Issues
        </div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>Reported Issues</h2>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          {issues.length === 0 ? 'No issues reported yet.' : `${issues.length} issue${issues.length === 1 ? '' : 's'} total.`}
        </p>
      </div>

      {flash && (
        <div style={{ padding: '10px 14px', background: '#f0fdf4', borderRadius: 'var(--radius)', color: 'var(--success)', fontSize: 13 }}>{flash}</div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', background: '#fff0f0', borderRadius: 'var(--radius)', color: 'var(--danger)', fontSize: 13 }}>{error}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {issues.map(issue => (
          <div key={issue.id} style={{
            background: 'var(--paper)', border: '1px solid var(--line)',
            borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '14px 16px',
            opacity: issue.status === 'resolved' ? 0.7 : 1,
            transition: 'opacity 0.2s',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {issue.page} {issue.element && `· ${issue.element}`}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  background: issue.status === 'open' ? '#fffbeb' : '#f0fdf4',
                  color: issue.status === 'open' ? 'var(--warning)' : 'var(--success)',
                  borderRadius: 4, padding: '2px 8px',
                }}>
                  {issue.status}
                </span>
                <button
                  className="btn"
                  onClick={() => handleResolve(issue.id, issue.status === 'open' ? 'resolved' : 'open')}
                  style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }}
                  title={issue.status === 'open' ? 'Mark as resolved' : 'Reopen issue'}
                >
                  {issue.status === 'open' ? '✓ Resolve' : '↺ Reopen'}
                </button>
                <button
                  className="btn"
                  onClick={() => handleDelete(issue.id)}
                  style={{ fontSize: 11, padding: '4px 10px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                  title="Delete issue"
                >
                  🗑 Delete
                </button>
              </div>
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.5, marginBottom: 6 }}>{issue.description}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {new Date(issue.created_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
