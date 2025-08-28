'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const REQUIRED_COLS = [
  'concept_a','code_a','concept_b','code_b','system_a','system_b','type_a','type_b',
  'cooc_obs','nA','nB','total_persons','cooc_event_count','a_before_b','b_before_a',
  'expected_obs','lift','lift_lower_95','lift_upper_95','z_score','ab_h','a_only_h',
  'b_only_h','neither_h','odds_ratio','or_lower_95','or_upper_95','directionality_ratio',
  'dir_prop_a_before_b','dir_lower_95','dir_upper_95','confidence_a_to_b','confidence_b_to_a'
];

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function parseCSVHeader(line: string): string[] {
    // Minimal CSV header parser (handles quotes and commas within quotes)
    const cols: string[] = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"'; i++;               // escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        cols.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    cols.push(cur.trim());
    // strip wrapping quotes
    return cols.map(h => h.replace(/^"(.*)"$/, '$1').trim());
  }

  async function validateSelectedFile(f: File): Promise<string[]> {
    const errs: string[] = [];

    // 1) CSV check
    const nameOk = f.name.toLowerCase().endsWith('.csv');
    const typeOk = (f.type || '').toLowerCase() === 'text/csv';
    if (!nameOk && !typeOk) {
      errs.push('File must be a CSV (.csv).');
    }

    // 2) Read text & check headers + at least one data row
    const text = await f.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) {
      errs.push('The file is empty.');
      return errs;
    }

    const headerLine = lines[0];
    const headerCols = parseCSVHeader(headerLine).map(s => s.toLowerCase().trim());
    const required = REQUIRED_COLS.map(s => s.toLowerCase());
    const missing = required.filter(col => !headerCols.includes(col));

    if (missing.length > 0) {
      errs.push(
        `Missing required columns: ${missing.join(', ')}`
      );
    }

    // Count non-empty data rows
    const dataLines = lines.slice(1).filter(l => l.replace(/,/g, '').trim().length > 0);
    if (dataLines.length < 1) {
      errs.push('CSV must contain at least one data row (in addition to the header).');
    }

    return errs;
    }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);

    if (!file) {
      setErrors(['Please choose a CSV file.']);
      return;
    }

    setBusy(true);
    try {
      const v = await validateSelectedFile(file);
      if (v.length > 0) {
        setErrors(v);
        setBusy(false);
        return;
      }

      const body = new FormData();
      body.set('file', file);

      const res = await fetch('/api/uploads', { method: 'POST', body });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Upload failed with ${res.status}`);
      }

      // Success → back to jobs
      router.push('/jobs?uploaded=1');
    } catch (err: any) {
      setErrors([String(err?.message ?? err)]);
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1>Upload CSV</h1>

      <p style={{ marginTop: 8 }}>
        The CSV must contain these columns (case-insensitive):<br />
        <code style={{ fontSize: 12 }}>
          {REQUIRED_COLS.join(', ')}
        </code>
      </p>

      <form onSubmit={onSubmit} style={{ marginTop: 16 }}>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        <div style={{ marginTop: 12 }}>
          <button type="submit" disabled={busy}>
            {busy ? 'Uploading…' : 'Upload'}
          </button>
          <a href="/jobs" style={{ marginLeft: 12 }}>Back to Jobs</a>
          <a href="/api/auth/signout" style={{ marginLeft: 12 }}>Log out</a>
        </div>
      </form>

      {errors.length > 0 && (
        <div
          role="alert"
          aria-live="polite"
          style={{
            marginTop: 16,
            padding: 12,
            background: '#ffe8e8',
            border: '1px solid #f5bcbc',
            borderRadius: 6,
            color: '#7a1f1f'
          }}
        >
          <strong>Upload blocked:</strong>
          <ul style={{ marginTop: 8 }}>
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
    </main>
  );
}
