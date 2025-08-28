// app/api/uploads/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStore } from '@netlify/blobs';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import crypto from 'node:crypto';

const UPLOADS_STORE = 'uploads';
const BACKGROUND_FN_PATH = '/.netlify/functions/process-upload-background';

export async function POST(req: Request) {
  try {
    // auth
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return new Response('Unauthorized', { status: 401 });

    const me = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!me) return new Response('Unauthorized', { status: 401 });
    const userId = me.id;

    // read form
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return new Response('No file provided', { status: 400 });

    const originalName = file.name || 'upload.csv';
    const jobId = crypto.randomUUID();
    const uploadBlobKey = `${userId}/${jobId}.csv`;

    // create Upload row
    const upload = await prisma.upload.create({
      data: { userId, blobKey: uploadBlobKey, originalName },
      select: { id: true },
    });

    // save file to Netlify Blobs
    await getStore(UPLOADS_STORE).set(uploadBlobKey, file, {
      metadata: { originalName, userId, jobId },
    });

    // create Job (queued)
    await prisma.job.create({
      data: {
        id: jobId,
        userId,
        uploadId: upload.id,
        status: 'queued',
        rowsTotal: 0,
        rowsProcessed: 0,
      },
    });

    // kick background worker (best-effort)
    try {
      const proto = req.headers.get('x-forwarded-proto') ?? 'https';
      const host = req.headers.get('x-forwarded-host');
      const origin = host ? `${proto}://${host}` : '';
      await fetch(origin + BACKGROUND_FN_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId, userId, uploadBlobKey, originalName }),
      });
    } catch (e) {
      console.error('process-upload trigger failed', e);
    }

    // If the caller wants JSON, return JSON; otherwise redirect to /jobs (or ?redirect=)
    const wantsJson = (req.headers.get('accept') || '').includes('application/json');
    if (wantsJson) {
      return Response.json({ ok: true, jobId });
    }

    const url = new URL(req.url);
    const redirectTo = url.searchParams.get('redirect') || '/jobs';
    return NextResponse.redirect(new URL(redirectTo, url), 303); // 303 = GET /jobs
  } catch (err: any) {
    console.error('Upload failed', err);

    // For browser form posts, bounce back to /upload with an error
    const wantsJson = (req.headers.get('accept') || '').includes('application/json');
    if (!wantsJson) {
      const url = new URL(req.url);
      const back = new URL('/upload', url);
      back.searchParams.set('error', String(err?.message ?? 'Upload failed'));
      return NextResponse.redirect(back, 303);
    }

    return new Response(String(err?.message ?? err), { status: 500 });
  }
}
