export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { prisma } from '@/lib/db';

export async function GET() {
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      status: true,
      rowsTotal: true,
      rowsProcessed: true,
      error: true,
      createdAt: true,
      finishedAt: true
    }
  });
  return Response.json({ jobs });
}
