export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { prisma } from '@/lib/db';
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const UPLOADS_STORE = 'uploads';
const BACKGROUND_FN_PATH = '/.netlify/functions/process-upload-background';

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return new Response('No file provided', { status: 400 });
    }

    const arrayBuf = await file.arrayBuffer();
    const originalName = file.name || 'upload.csv';

    // Ensure a user exists (temporary bootstrap until you add auth)
    const user = await prisma.user.upsert({
      where: { email: 'demo@example.com' },
      update: {},
      create: { email: 'demo@example.com', role: 'user' },
      select: { id: true },
    });

const userId = user.id; // use this instead of 'demo-user'

    const jobId = crypto.randomUUID();

    const uploadBlobKey = `${userId}/${jobId}.csv`; // <-- declare BEFORE using it

    // 1) Save to Blobs (don't pass Node Buffer; ArrayBuffer or File is fine)
    const uploads = getStore(UPLOADS_STORE);
    await uploads.set(uploadBlobKey, arrayBuf, {
      // no contentType option in blobs.set() options; use metadata only
      metadata: { originalName, userId, jobId },
    });

    // 2) Create Upload row FIRST, so Job FK is valid
    const upload = await prisma.upload.create({
      data: {
        userId,
        blobKey: uploadBlobKey,
        originalName,
        store: 'uploads', // adjust to match your schema; remove if not present
        contentType: (file as File).type || 'text/csv', // remove if your model doesn't have it
        size:
          typeof (file as any).size === 'number'
            ? (file as any).size
            : arrayBuf.byteLength,
      },
      select: { id: true },
    });

    // 3) Create Job row referencing the Upload
    await prisma.job.create({
      data: {
        id: jobId,
        userId,
        uploadId: upload.id, // FK to Upload.id
        status: 'queued',
        rowsTotal: 0,
        rowsProcessed: 0,
      },
    });

    // 4) Kick off background worker
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    const host = req.headers.get('x-forwarded-host');
    const origin = host ? `${proto}://${host}` : '';
    await fetch(origin + BACKGROUND_FN_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId, userId, uploadBlobKey, originalName }),
    });

    return Response.json({ ok: true, jobId });
  } catch (err: any) {
    console.error('Upload failed', err);
    return new Response(String(err?.message ?? err), { status: 500 });
  }
}
