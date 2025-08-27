export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const BACKGROUND_FN_PATH = '/.netlify/functions/process-upload-background';

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role ?? 'user';
  if (!session || role !== 'manager') return new Response('Forbidden', { status: 403 });

  const form = await req.formData();
  const jobId = String(form.get('jobId') || '').trim();
  if (!jobId) return new Response('Missing jobId', { status: 400 });

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, userId: true, upload: { select: { blobKey: true, originalName: true } } },
  });
  if (!job || !job.upload) return new Response('Job not found', { status: 404 });

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'queued',
      error: null,
      rowsProcessed: 0,
      outputBlobKey: null,
      startedAt: null,
      finishedAt: null,
      tokensIn: null,
      tokensOut: null,
      costCents: null,
    },
  });

  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('x-forwarded-host');
  const origin = host ? `${proto}://${host}` : '';
  await fetch(origin + BACKGROUND_FN_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jobId,
      userId: job.userId ?? 'unknown',
      uploadBlobKey: job.upload.blobKey,
      originalName: job.upload.originalName,
    }),
  });

  return new Response(null, { status: 303, headers: { Location: '/admin' } });
}
