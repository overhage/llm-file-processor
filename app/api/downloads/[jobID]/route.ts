export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { getStore } from '@netlify/blobs';
import { prisma } from '@/lib/db';

const OUTPUTS_STORE = 'outputs';

export async function GET(
  _req: Request,
  { params }: { params: { jobId: string } }
) {
  const jobId = params.jobId;
  const outputs = getStore(OUTPUTS_STORE);

  let outputBlobKey: string | null = null;

  // 1) Try DB lookup (preferred)
  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { outputBlobKey: true },
    });
    outputBlobKey = job?.outputBlobKey ?? null;
  } catch (e) {
    // If Prisma fails (e.g., DATABASE_URL missing) we’ll fall back to blob scan.
    console.error('Download: Prisma lookup failed, falling back to blob scan', e);
  }

  // 2) Fallback: scan outputs store for */<jobId>.csv
  if (!outputBlobKey) {
    try {
      for await (const item of outputs.list()) {
        if (item.key.endsWith(`/${jobId}.csv`) || item.key === `${jobId}.csv`) {
          outputBlobKey = item.key;
          break;
        }
      }
    } catch (e) {
      console.error('Download: blob list() failed', e);
    }
  }

  if (!outputBlobKey) {
    return new Response('Not ready', { status: 404 });
  }

  // 3) Fetch the CSV and return it
  const data = await outputs.get(outputBlobKey);
  if (data == null) return new Response('Output missing', { status: 404 });

  return new Response(data as any, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="job-${jobId}.csv"`,
      // Optional: force download on some browsers:
      'cache-control': 'no-store',
    },
  });
}
