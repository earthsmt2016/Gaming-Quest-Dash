import React, { useState } from 'react';

interface PeriodDownloadProps {
  onDownload: (from: string, to: string) => void;
}

export default function PeriodDownload({ onDownload }: PeriodDownloadProps) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const inputStyle: React.CSSProperties = {
    minHeight: '44px',
    border: '1px solid var(--line)',
    background: 'var(--paper-2)',
    borderRadius: 'var(--radius-sm)',
    padding: '8px 10px',
    fontSize: '14px',
    width: '100%',
  };

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    fontSize: '13px',
  };

  function handleDownload() {
    if (!from || !to) {
      alert('Please select both a From and To date for the custom period.');
      return;
    }
    if (from > to) {
      alert('From date must be before To date.');
      return;
    }
    onDownload(from, to);
  }

  return (
    <section style={{
      background: 'var(--paper)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius)',
      padding: '14px 16px',
    }}>
      <h3 style={{ margin: '0 0 10px', fontSize: '16px' }}>Download custom period report</h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '10px',
        marginBottom: '12px',
        alignItems: 'end',
      }}>
        <label style={labelStyle}>
          <span>From</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          <span>To</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          <span>&nbsp;</span>
          <button
            className="btn primary"
            onClick={handleDownload}
            style={{ borderRadius: 'var(--radius-sm)', width: '100%' }}
          >
            ↓ Download report
          </button>
        </label>
      </div>
      <p className="mini">Downloads a clean, printable HTML report file covering the selected date range with full table and summary.</p>
    </section>
  );
}
