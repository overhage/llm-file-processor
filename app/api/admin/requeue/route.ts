// app/api/admin/requeue/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import type { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

const BACKGROUND_FN_PATH = '/.netlify/functions/process-upload-background';

export async function POST(req: NextRequest) {
  // 1) Authn
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2) Authz (must be manager)
  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });
  if ((me?.role ?? 'user') !== 'manager') {
    return new Response('Forbidden', { status: 403 });
  }

  // 3) Input
  let jobId: string | null = null;
  try {
    const body = (await req.json().catch(() => ({}))) as { jobId?: string } | Record<string, never>;
    jobId = body?.jobId ?? new URL(req.url).searchParams.get('jobId');
  } catch {
    // ignore
  }
  if (!jobId) {
    return new Response('jobId required', { status: 400 });
  }

  // 4) Reset + requeue
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'queued',
      error: null,
      startedAt: null,
      finishedAt: null,
    },
  });

  // 5) Trigger background worker again (best-effort)
  try {
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    const host = req.headers.get('x-forwarded-host');
    const origin = host ? `${proto}://${host}` : '';
    await fetch(origin + BACKGROUND_FN_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId }),
    });
  } catch (e) {
    console.error('requeue trigger failed', e);
  }

  return Response.json({ ok: true, jobId });
}
