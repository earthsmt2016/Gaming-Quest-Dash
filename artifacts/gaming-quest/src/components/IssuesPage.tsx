import React, { useEffect, useState } from 'react';
import { fetchIssues, Issue } from '../lib/api';

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchIssues().then(setIssues).catch(() => setError('Failed to load issues')).finally(() => setLoading(false));
  }, []);

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

      {error && (
        <div style={{ padding: '12px 16px', background: '#fff0f0', borderRadius: 'var(--radius)', color: 'var(--danger)', fontSize: 13 }}>{error}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {issues.map(issue => (
          <div key={issue.id} style={{
            background: 'var(--paper)', border: '1px solid var(--line)',
            borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {issue.page} {issue.element && `· ${issue.element}`}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700,
                background: issue.status === 'open' ? '#fffbeb' : '#f0fdf4',
                color: issue.status === 'open' ? 'var(--warning)' : 'var(--success)',
                borderRadius: 4, padding: '2px 8px',
              }}>
                {issue.status}
              </span>
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
