export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStore } from "@netlify/blobs";

const OUTPUTS_STORE = process.env.OUTPUTS_STORE || "outputs";

function baseName(name?: string | null) {
  const base = (name || "").replace(/\.[^./\\]+$/, "");
  return base || "job";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId?: string } }
) {
  const jobId = params?.jobId;
  if (!jobId) {
    return new Response("missing job id", { status: 400 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new Response("unauthorized", { status: 401 });
  }

  // Confirm the caller owns the job
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return new Response("unauthorized", { status: 401 });

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      userId: true,
      upload: { select: { originalName: true } },
    },
  });

  if (!job || job.userId !== user.id) {
    return new Response("not found", { status: 404 });
  }

  if (job.status !== "completed") {
    return new Response("job not completed", { status: 409 });
  }

  // Fetch from Netlify Blobs
  const outputs = getStore(OUTPUTS_STORE);

  const keys: string[] = [];
  // Prefer an explicit key if you add one to your schema later
  // const outKey = (job as any)?.outputBlobKey as string | undefined;
  // if (outKey) keys.push(outKey);
  keys.push(`${jobId}.csv`, jobId);

  let body: string | ArrayBuffer | ReadableStream | null = null;
  let hitKey: string | undefined;
  for (const k of keys) {
    const value = await outputs.get(k); // string | null in Node
    if (value) {
      body = value as unknown as string;
      hitKey = k;
      break;
    }
  }

  if (!body) {
    return new Response("file not found for job", { status: 404 });
  }

  const filename = `${baseName(job.upload?.originalName)}-results.csv`;

  return new Response(body as any, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, max-age=0",
      ...(hitKey ? { "X-Blob-Key": hitKey } : {}),
    },
  });
}
