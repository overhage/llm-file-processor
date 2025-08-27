'use client';

import { useEffect, useState } from 'react';

type Job = {
  id: string;
  status: string;
  rowsTotal: number | null;
  rowsProcessed: number | null;
  error?: string | null;
  createdAt?: string;
  finishedAt?: string | null;
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/jobs', { cache: 'no-store' });
    const j = await res.json();
    setJobs(j.jobs || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <main style={{ padding: 24 }}>
      <h1>Jobs</h1>
      <button onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      <table style={{ marginTop: 16, width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th align="left">Job ID</th>
            <th align="left">Status</th>
            <th align="right">Rows</th>
            <th align="left">Error</th>
            <th align="left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map(j => (
            <tr key={j.id}>
              <td><code>{j.id}</code></td>
              <td>{j.status}</td>
              <td align="right">{j.rowsProcessed ?? 0}/{j.rowsTotal ?? 0}</td>
              <td style={{ color: 'crimson' }}>{j.error || ''}</td>
              <td>
                {j.status === 'completed' ? (
                  <a href={`/api/downloads/${j.id}`}>Download CSV</a>
                ) : (
                  <span>—</span>
                )}
              </td>
            </tr>
          ))}
          {jobs.length === 0 && !loading && (
            <tr><td colSpan={5}>No jobs yet — upload a file on <a href="/upload">Upload</a>.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
