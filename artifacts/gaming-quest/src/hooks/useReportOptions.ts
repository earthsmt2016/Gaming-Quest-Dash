import { useState, useEffect } from 'react';
import { ReportOptions, DEFAULT_OPTIONS } from '../lib/reportBuilder';

const KEY = 'gq_report_options_v1';

export function useReportOptions(): [ReportOptions, (patch: Partial<ReportOptions>) => void] {
  const [options, setOptions] = useState<ReportOptions>(() => {
    try {
      const saved = localStorage.getItem(KEY);
      return saved ? { ...DEFAULT_OPTIONS, ...JSON.parse(saved) } : DEFAULT_OPTIONS;
    } catch { return DEFAULT_OPTIONS; }
  });

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(options));
  }, [options]);

  const patchOptions = (patch: Partial<ReportOptions>) =>
    setOptions(prev => ({ ...prev, ...patch }));

  return [options, patchOptions];
}
