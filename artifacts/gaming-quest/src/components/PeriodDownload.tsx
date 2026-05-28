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
    minWidth: 0,
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    fontSize: '13px',
    minWidth: 0,
  };

  function fmtDate(s: string) {
    return new Date(s + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

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
        gridTemplateColumns: 'minmax(0, 160px) minmax(0, 160px)',
        columnGap: '40px',
        rowGap: '12px',
        marginBottom: '12px',
      }}>
        <label style={labelStyle}>
          <span>From</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          <span>To</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
        </label>
      </div>
      {(from || to) && (
        <p style={{ margin: '0 0 10px', fontSize: '13px', color: from && to && from <= to ? 'var(--accent)' : 'var(--muted)', fontWeight: 500 }}>
          {from && to && from <= to
            ? `Report will cover: ${fmtDate(from)} – ${fmtDate(to)}`
            : from && !to
            ? `From: ${fmtDate(from)} — select a To date`
            : !from && to
            ? `To: ${fmtDate(to)} — select a From date`
            : 'From date must be before To date'}
        </p>
      )}
      <button
        className="btn primary"
        onClick={handleDownload}
        disabled={pdfGenerating}
        style={{ borderRadius: 'var(--radius-sm)', width: '100%', minHeight: '44px', marginBottom: '10px', opacity: pdfGenerating ? 0.6 : 1, cursor: pdfGenerating ? 'not-allowed' : 'pointer' }}
      >
        {pdfGenerating ? '⏳ Generating…' : '⎙ Save as PDF'}
      </button>
      <p className="mini">Opens a print dialog — choose "Save as PDF" to export a clean, week-by-week report for the selected period.</p>
    </section>
  );
}
