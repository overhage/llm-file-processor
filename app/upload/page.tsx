'use client';

import { useState } from 'react';

export default function UploadPage() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setJobId(null);

    const fd = new FormData(e.currentTarget);
    const res = await fetch('/api/uploads', {
      method: 'POST',
      body: fd
    });

    if (!res.ok) {
      const t = await res.text();
      setError(t || `Upload failed with ${res.status}`);
    } else {
      const j = await res.json();
      setJobId(j.jobId);
    }

    setBusy(false);
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Upload a CSV</h1>
      <form onSubmit={onSubmit}>
        <input type="file" name="file" accept=".csv,text/csv" required />
        <button type="submit" disabled={busy} style={{ marginLeft: 12 }}>
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </form>

      {jobId && (
        <p style={{ marginTop: 16 }}>
          Job created: <code>{jobId}</code>. Check <a href="/jobs">Jobs</a> to view status.
        </p>
      )}
      {error && <p style={{ color: 'crimson', marginTop: 16 }}>{error}</p>}

      <hr style={{ margin: '24px 0' }} />
      <p>Sample CSV headers your worker expects:</p>
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
        "Concept A","Code A","System A","Type A","Concept B","Code B","System B","Type B","counts_AB","Lift","Relationship Type","Relationship Code","Rational","Source Count","Status","Pair ID"
      </pre>
    </main>
  );
}
