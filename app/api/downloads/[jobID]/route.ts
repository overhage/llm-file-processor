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
  try {
    const jobId = params?.jobId;
    if (!jobId) {
      return new Response("missing job id", { status: 400, headers: { "Content-Type": "text/plain" } });
    }

    // Auth (best effort). If auth fails unexpectedly, return a clean error instead of crashing.
    let userId: string | null = null;
    try {
      const session = await getServerSession(authOptions);
      if (session?.user?.email) {
        const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
        userId = user?.id ?? null;
      }
    } catch (e) {
      // ignore, will handle as unauthorized below
    }

    if (!userId) {
      return new Response("unauthorized", { status: 401, headers: { "Content-Type": "text/plain" } });
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        userId: true,
        upload: { select: { originalName: true } },
        // outputBlobKey: true, // uncomment if you add this to your schema
      },
    });

    if (!job || job.userId !== userId) {
      return new Response("not found", { status: 404, headers: { "Content-Type": "text/plain" } });
    }

    if (job.status !== "completed") {
      return new Response("job not completed", { status: 409, headers: { "Content-Type": "text/plain" } });
    }

    // Read from Netlify Blobs — harden against runtime errors
    const outputs = getStore(OUTPUTS_STORE);

    const keys: string[] = [];
    // if ((job as any).outputBlobKey) keys.push((job as any).outputBlobKey as string);
    keys.push(`${jobId}.csv`, jobId);

    let body: string | ArrayBuffer | ReadableStream | null = null;
    let hitKey: string | undefined;

    for (const k of keys) {
      try {
        const value = await outputs.get(k); // string | null in Node runtime
        if (value) {
          body = value as unknown as string;
          hitKey = k;
          break;
        }
      } catch (e) {
        // try next key
      }
    }

    if (!body) {
      return new Response("file not found for job", { status: 404, headers: { "Content-Type": "text/plain" } });
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
  } catch (err: any) {
    const msg = (err?.message || String(err || "unknown error")).slice(0, 500);
    return new Response(`download failed: ${msg}` , { status: 500, headers: { "Content-Type": "text/plain" } });
  }
}
