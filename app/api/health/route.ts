export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { prisma } from '@/lib/db';
import { getStore } from '@netlify/blobs';

export async function GET() {
  const out: any = { db: false, blobs: false, notes: [] };

  // DB check
  try {
    await prisma.$queryRaw`select 1`;
    out.db = true;
  } catch (e: any) {
    out.notes.push(`DB error: ${e?.message ?? e}`);
  }

  // Blobs R/W check
  try {
    const store = getStore('outputs');
    const key = `healthcheck-${Date.now()}.txt`;
    await store.set(key, 'ok');
    const got = await store.get(key);
    out.blobs = !!got;
  } catch (e: any) {
    out.notes.push(`Blobs error: ${e?.message ?? e}`);
  }

  return new Response(JSON.stringify(out), {
    headers: { 'content-type': 'application/json' },
  });
}
