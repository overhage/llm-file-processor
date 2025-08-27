export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { prisma } from '@/lib/db';
import { getStore } from '@netlify/blobs';

const OUTPUTS_STORE = 'outputs';

export async function GET(
  _req: Request,
  { params }: { params: { jobId: string } }
) {
  const jobId = params.jobId;

  // 1) Look up the output key that the worker wrote
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { outputBlobKey: true },
  });
  if (!job?.outputBlobKey) {
    return new Response('Not ready', { status: 404 });
  }

  // 2) Read from the outputs store
  const outputs = getStore(OUTPUTS_STORE);
  const data = await outputs.get(job.outputBlobKey); // string | Uint8Array | null
  if (data == null) {
    return new Response('Output missing', { status: 404 });
  }

  // 3) Return CSV with download headers (Uint8Array or string are both fine)
  const body = typeof data === 'string' ? data : data; // Response accepts Uint8Array
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="job-${jobId}.csv"`,
    },
  });
}
