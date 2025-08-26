import { prisma } from "@/lib/db";
import type { CreateJobBody } from "@/lib/types";

export async function POST(req: Request) {
  // TODO: validate/auth — ensure the caller is the owner (or a manager)
  const body = (await req.json()) as CreateJobBody;

  const upload = await prisma.upload.findUnique({ where: { id: body.uploadId } });
  if (!upload) return new Response(JSON.stringify({ error: "Upload not found" }), { status: 404 });

  const job = await prisma.job.create({ data: { uploadId: upload.id, status: "queued" } });

  // Trigger background worker by POSTing to its endpoint
  const payload = { jobId: job.id, userId: body.userId, uploadBlobKey: body.uploadBlobKey, originalName: body.originalName };

  // In production on Netlify, this relative path is fine.
  await fetch("/.netlify/functions/process-upload-background", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });

  return Response.json({ jobId: job.id });
}
