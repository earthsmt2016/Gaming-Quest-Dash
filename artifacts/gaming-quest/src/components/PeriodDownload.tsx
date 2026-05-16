import React, { useState } from 'react';

interface PeriodDownloadProps {
  onDownload: (from: string, to: string) => void;
  pdfGenerating?: boolean;
}

export default function PeriodDownload({ onDownload, pdfGenerating }: PeriodDownloadProps) {
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
      <h3 style={{ margin: '0 0 10px', fontSize: '16px' }}>Save custom period report as PDF</h3>
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
            disabled={pdfGenerating}
            style={{ borderRadius: 'var(--radius-sm)', width: '100%', opacity: pdfGenerating ? 0.6 : 1, cursor: pdfGenerating ? 'not-allowed' : 'pointer' }}
          >
            {pdfGenerating ? '⏳ Generating…' : '⎙ Save as PDF'}
          </button>
        </label>
      </div>
      <p className="mini">Opens a print dialog — choose "Save as PDF" to export a clean, week-by-week report for the selected period.</p>
    </section>
  );
}
