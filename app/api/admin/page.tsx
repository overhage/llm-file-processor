export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Prisma, JobStatus } from '@prisma/client';
import Link from 'next/link';
import { redirect } from 'next/navigation';

function fmt(d?: Date | null) {
  return d ? new Date(d).toLocaleString() : '';
}

export default async function AdminPage({
  searchParams,
}: { searchParams?: { status?: string } }) {
  // Require manager role
  const session = await auth();
  const role = (session?.user as any)?.role ?? 'user';
  if (!session || role !== 'manager') redirect('/login');

  // Optional status filter
  const statusRaw = (searchParams?.status ?? '').toLowerCase();
  const allowed: JobStatus[] = ['queued', 'running', 'completed', 'failed'];
  const where: Prisma.JobWhereInput =
    allowed.includes(statusRaw as JobStatus) ? { status: statusRaw as JobStatus } : {};

  const jobs = await prisma.job.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
    select: {
      id: true,
      status: true,
      error: true,
      rowsTotal: true,
      rowsProcessed: true,
      tokensIn: true,
      tokensOut: true,
      costCents: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
      userId: true,
      outputBlobKey: true,
      // NOTE: relation name in your schema is capitalized `User`
      User: { select: { email: true } },
      upload: { select: { id: true, originalName: true, blobKey: true, createdAt: true } },
    },
  });

  return (
    <main style={{ padding: 24, maxWidth: 1300, margin: '0 auto' }}>
      <h1>Admin — Jobs</h1>

      <div style={{ margin: '12px 0' }}>
        <strong>Filter:</strong>{' '}
        <Link href="/admin">All</Link>{' '}
        | <Link href="/admin?status=queued">Queued</Link>{' '}
        | <Link href="/admin?status=running">Running</Link>{' '}
        | <Link href="/admin?status=completed">Completed</Link>{' '}
        | <Link href="/admin?status=failed">Failed</Link>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            <th align="left">Job</th>
            <th align="left">User</th>
            <th align="left">File</th>
            <th align="left">Uploaded</th>
            <th align="left">Status</th>
            <th align="right">Rows</th>
            <th align="right">Tokens</th>
            <th align="right">Cost</th>
            <th align="left">Created</th>
            <th align="left">Finished</th>
            <th align="left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} style={{ borderTop: '1px solid #eee' }}>
              <td><code>{j.id}</code></td>
              <td title={j.userId}>
                {j.User?.email ?? <code>{j.userId ?? ''}</code>}
              </td>
              <td title={j.upload?.blobKey}>{j.upload?.originalName ?? '—'}</td>
              <td>{fmt(j.upload?.createdAt)}</td>
              <td>{j.status}</td>
              <td align="right">
                {(j.rowsProcessed ?? 0).toLocaleString()}/
                {(j.rowsTotal ?? 0).toLocaleString()}
              </td>
              <td align="right">
                {(j.tokensIn ?? 0).toLocaleString()} /
                {(j.tokensOut ?? 0).toLocaleString()}
              </td>
              <td align="right">
                {typeof j.costCents === 'number' ? `$${(j.costCents / 100).toFixed(2)}` : '—'}
              </td>
              <td>{fmt(j.createdAt)}</td>
              <td>{fmt(j.finishedAt)}</td>
              <td>
                {j.status === 'completed' && (
                  <a href={`/api/downloads/${j.id}`}>Download</a>
                )}{' '}
                {j.status !== 'running' && (
                  <form action="/api/admin/requeue" method="post" style={{ display: 'inline' }}>
                    <input type="hidden" name="jobId" value={j.id} />
                    <button type="submit">Requeue</button>
                  </form>
                )}
                {j.error ? (
                  <details>
                    <summary style={{ color: 'crimson' }}>Error</summary>
                    <pre style={{ whiteSpace: 'pre-wrap' }}>{j.error}</pre>
                  </details>
                ) : null}
              </td>
            </tr>
          ))}
          {jobs.length === 0 && (
            <tr><td colSpan={11}>No jobs found.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
