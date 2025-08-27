export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { redirect } from 'next/navigation';

function fmt(d?: Date | null) {
  return d ? new Date(d).toLocaleString() : '';
}

export default async function JobsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');

  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true },
  });
  if (!me) redirect('/login');

  const jobs = await prisma.job.findMany({
    where: { userId: me.id },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      status: true,
      rowsTotal: true,
      rowsProcessed: true,
      tokensIn: true,
      tokensOut: true,
      costCents: true,
      createdAt: true,
      finishedAt: true,
      outputBlobKey: true,
      upload: { select: { originalName: true, createdAt: true } },
    },
  });

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1>Your Jobs</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            <th align="left">Job</th>
            <th align="left">File</th>
            <th align="left">Uploaded</th>
            <th align="left">Status</th>
            <th align="right">Rows</th>
            <th align="left">Created</th>
            <th align="left">Finished</th>
            <th align="left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} style={{ borderTop: '1px solid #eee' }}>
              <td><code>{j.id}</code></td>
              <td title={j.upload?.originalName}>{j.upload?.originalName ?? '—'}</td>
              <td>{fmt(j.upload?.createdAt)}</td>
              <td>{j.status}</td>
              <td align="right">
                {(j.rowsProcessed ?? 0).toLocaleString()}/
                {(j.rowsTotal ?? 0).toLocaleString()}
              </td>
              <td>{fmt(j.createdAt)}</td>
              <td>{fmt(j.finishedAt)}</td>
              <td>
                {j.status === 'completed' ? (
                  <a href={`/api/downloads/${j.id}`}>Download</a>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
          {jobs.length === 0 && (
            <tr><td colSpan={8}>No jobs yet.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
