// components/AdminMaintenance.tsx
'use client';

import { useState } from 'react';

export default function AdminMaintenance() {
  const [token, setToken] = useState('');
  const [clearJobs, setClearJobs] = useState(false);
  const [jobMode, setJobMode] = useState<'queuedRunning' | 'all'>('queuedRunning');
  const [clearBlobs, setClearBlobs] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const canRun = (clearJobs || clearBlobs) && confirm === 'NUKE';

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/.netlify/functions/admin-maintenance', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ clearJobs, jobMode, clearBlobs }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setResult(data);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4 rounded-2xl shadow border">
      <h2 className="text-xl font-semibold">Admin Maintenance</h2>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Admin Token</label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="w-full border rounded px-3 py-2"
          placeholder="Paste ADMIN_TOKEN"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Actions</label>
        <div className="flex items-center gap-3">
          <input id="jobs" type="checkbox" checked={clearJobs} onChange={(e) => setClearJobs(e.target.checked)} />
          <label htmlFor="jobs">Clear job queue</label>
        </div>
        {clearJobs && (
          <div className="ml-6 flex items-center gap-2 text-sm">
            <span>Mode:</span>
            <select
              className="border rounded px-2 py-1"
              value={jobMode}
              onChange={(e) => setJobMode(e.target.value as 'queuedRunning' | 'all')}
            >
              <option value="queuedRunning">Queued + Running only</option>
              <option value="all">All jobs</option>
            </select>
          </div>
        )}
        <div className="flex items-center gap-3">
          <input id="blobs" type="checkbox" checked={clearBlobs} onChange={(e) => setClearBlobs(e.target.checked)} />
          <label htmlFor="blobs">Delete all Uploads and Outputs files</label>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">
          Type <code>NUKE</code> to confirm
        </label>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full border rounded px-3 py-2"
          placeholder="NUKE"
        />
      </div>

      <button
        disabled={!canRun || busy}
        onClick={run}
        className="px-4 py-2 rounded bg-black text-white disabled:opacity-40"
      >
        {busy ? 'Working…' : 'Run maintenance'}
      </button>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      {result && (
        <pre className="bg-gray-50 border rounded p-3 text-sm overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      <p className="text-xs text-gray-500">⚠️ These operations are destructive. There is no undo.</p>
    </div>
  );
}
