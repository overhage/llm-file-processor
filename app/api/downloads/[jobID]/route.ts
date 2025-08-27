// app/api/downloads/[jobId]/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { getStore } from '@netlify/blobs';
import { prisma } from '@/lib/db';

const OUTPUTS_STORE = 'outputs';

export async function GET(
  _req: Request,
  // tolerate either [jobId] or [jobID] folder names
  { params }: { params: Record<string, string> }
) {
  const jobId = params.jobId ?? params.jobID;
  if (!jobId) return new Response('Missing jobId', { status: 400 });

  const outputs = getStore(OUTPUTS_STORE);
  let outputBlobKey: string | null = null;

  // 1) Preferred: read the key from DB
  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { outputBlobKey: true },
    });
    outputBlobKey = job?.outputBlobKey ?? null;
  } catch (e) {
    console.error('Download: Prisma lookup failed; will try blob scan', e);
  }

  // 2) Fallback: scan outputs store with pagination
  if (!outputBlobKey) {
    try {
      let cursor: string | undefined = undefined;
      do {
        const page = await outputs.list({ cursor });
        const match = page.blobs.find(
          (b) => b.key === `${jobId}.csv` || b.key.endsWith(`/${jobId}.csv`)
        );
        if (match) {
          outputBlobKey = match.key;
          break;
        }
        cursor = page.cursor;
      } while (cursor);
    } catch (e) {
      console.error('Download: blob list failed', e);
    }
  }

  if (!outputBlobKey) {
    return new Response('Not ready', { status: 404 });
  }

  // 3) Fetch the CSV and return it
  const data = await outputs.get(outputBlobKey); // string | Uint8Array | null
  if (data == null) return new Response('Output missing', { status: 404 });

  return new Response(data as any, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="job-${jobId}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
