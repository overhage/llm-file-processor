// netlify/functions/cleanup.ts
// Scheduled Function — runs daily via netlify.toml
// Prunes LLM cache entries older than N days (default 30)

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const DAYS = Number(process.env.CACHE_MAX_AGE_DAYS ?? '30')

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

export const config = { schedule: '@daily' } as const

export default async function handler(_req: Request) {
  const cutoff = daysAgo(DAYS)
  try {
    const client: any = prisma
    let pruned = 0

    // Prefer snake_case schema if present; otherwise fall back to camelCase
    try {
      const res = await client.llmCache.deleteMany({ where: { created_at: { lt: cutoff } } })
      pruned = res.count
    } catch {
      const res = await client.llmCache.deleteMany({ where: { createdAt: { lt: cutoff } } })
      pruned = res.count
    }

    console.log(`cleanup: pruned ${pruned} llmCache rows older than ${DAYS} day(s) (cutoff=${cutoff.toISOString()})`)
    return new Response(JSON.stringify({ ok: true, pruned, cutoff: cutoff.toISOString() }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err: any) {
    console.error('CLEANUP_ERROR', err)
    return new Response(JSON.stringify({ ok: false, error: String(err?.message ?? err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
