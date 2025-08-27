import { prisma } from '@/lib/db';
import { getStore } from '@netlify/blobs';

const OUTPUTS_STORE = 'outputs';

export async function GET(
  _req: Request,
  { params }: { params: { jobId: string } }
) {
  const jobId = params.jobId;
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || !job.outputBlobKey) {
    return new Response('Not ready', { status: 404 });
  }

  const outputs = getStore(OUTPUTS_STORE);
  const data = await outputs.get(job.outputBlobKey);
  if (data == null) {
    return new Response('Output missing', { status: 404 });
  }

  // outputs.get() returns a string or Uint8Array depending on what was stored
  const body = typeof data === 'string' ? data : Buffer.from(data);
  const filename = `job-${jobId}.csv`;

  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`
    }
  });
}
