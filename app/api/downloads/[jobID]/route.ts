import { prisma } from "@/lib/db";
import { requiredEnv } from "@/lib/env";
import { getStore } from "@netlify/blobs";

export async function GET(_req: Request, { params }: { params: { jobId: string } }) {
  // TODO: check auth/roles — only owner or manager can access
  const job = await prisma.job.findUnique({ where: { id: params.jobId } });
  if (!job?.outputBlobKey) return new Response("Not ready", { status: 404 });

const OUTPUTS_STORE = "outputs";
const outputs = getStore(OUTPUTS_STORE);

  const outputs = getStore(requiredEnv("BLOB_STORE_OUTPUTS"));
  // Tip: the Blobs API supports streaming reads in modern runtimes; if not available, this returns full content.
  const stream = (await outputs.get(job.outputBlobKey, { type: "stream" } as any)) as unknown as ReadableStream | null;

  if (!stream) return new Response("Missing output", { status: 404 });
  return new Response(stream, { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="${params.jobId}.csv"` } });
}
