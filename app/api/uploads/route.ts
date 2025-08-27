import { prisma } from '@/lib/db';
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const UPLOADS_STORE = 'uploads'; // not secret
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

    // TODO: replace with your real user id after you add auth
    const userId = 'demo-user';
    const jobId = crypto.randomUUID();

    // 1) Save to Blobs (uploads store)
    const uploads = getStore(UPLOADS_STORE);
    const uploadBlobKey = `${userId}/${jobId}.csv`;
    await uploads.set(uploadBlobKey, Buffer.from(arrayBuf), {
      contentType: file.type || 'text/csv',
      metadata: { originalName, userId, jobId }
    });

    // 2) Create Job row (status queued)
    await prisma.job.create({
      data: {
        id: jobId,
        userId,
        status: 'queued',
        rowsTotal: 0,
        rowsProcessed: 0
      }
    });

    // 3) Kick off background worker
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    const host = req.headers.get('x-forwarded-host');
    const origin = host ? `${proto}://${host}` : '';
    const url = origin + BACKGROUND_FN_PATH;

    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId, userId, uploadBlobKey, originalName })
    });

    return Response.json({ ok: true, jobId });
  } catch (err: any) {
    console.error('Upload failed', err);
    return new Response(String(err?.message ?? err), { status: 500 });
  }
}
