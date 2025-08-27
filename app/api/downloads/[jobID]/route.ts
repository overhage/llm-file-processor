export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { getStore } from '@netlify/blobs';
import { prisma } from '@/lib/db';

const OUTPUTS_STORE = 'outputs';

// Minimal shape we need from blobs.list()
type BlobListPage = { blobs: { key: string }[] };

export async function GET(
  _req: Request,
  { params }: { params: Record<string, string> }
) {
  const jobId = params.jobId ?? params.jobID; // tolerate old folder name
  if (!jobId) return new Response('Missing jobId', { status: 400 });

  const outputs = getStore(OUTPUTS_STORE);
  let outputBlobKey: string | null = null;

  // 1) Prefer DB lookup
  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { outputBlobKey: true },
    });
    outputBlobKey = job?.outputBlobKey ?? null;
  } catch (e) {
    console.error('Download: Prisma lookup failed; falling back to blobs list()', e);
  }

  // 2) Fallback: scan blobs via async iterator (typed with our minimal shape)
  if (!outputBlobKey) {
    try {
      const iterable = outputs.list({ paginate: true }) as unknown as AsyncIterable<BlobListPage>;
      for await (const page of iterable) {
        const match = page.blobs.find(
          b => b.key === `${jobId}.csv` || b.key.endsWith(`/${jobId}.csv`)
        );
        if (match) {
          outputBlobKey = match.key;
          break;
        }
      }
    } catch (e) {
      console.error('Download: list() failed', e);
    }
  }

  if (!outputBlobKey) return new Response('Not ready', { status: 404 });

  // 3) Return CSV
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
