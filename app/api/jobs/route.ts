// app/api/jobs/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { prisma } from '@/lib/db';

export async function GET() {
  try {
    // Minimal JSON for debugging/automation. Extend as needed.
    const jobs = await prisma.job.findMany({
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        status: true,
        error: true,
        rowsTotal: true,
        rowsProcessed: true,
        tokensIn: true,
        tokensOut: true,
        costCents: true,
        createdAt: true,
        finishedAt: true,
        userId: true,
        outputBlobKey: true,
        upload: { select: { originalName: true, createdAt: true } },
      },
    });

    return Response.json({ ok: true, jobs });
  } catch (e: any) {
    return new Response(`Error: ${e?.message ?? e}`, { status: 500 });
  }
}
