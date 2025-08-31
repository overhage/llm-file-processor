// netlify/functions/admin-maintenance.ts

// Dynamically load Netlify Blobs to avoid CJS->ESM require() issues.
let cachedGetStore: any
async function loadGetStore() {
  if (!cachedGetStore) {
    const mod: any = await import('@netlify/blobs')
    cachedGetStore = mod.getStore ?? mod.default?.getStore
    if (!cachedGetStore) throw new Error('Netlify Blobs getStore not found')
  }
  return cachedGetStore
}

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const ADMIN_TOKEN = process.env.ADMIN_TOKEN

const UPLOADS_STORE = process.env.UPLOADS_STORE ?? 'uploads'
const OUTPUTS_STORE = process.env.OUTPUTS_STORE ?? 'outputs'

// Delete every blob in a store using typed async-iterator pagination
async function deleteAllBlobs(storeName: string): Promise<number> {
  const getStore = await loadGetStore()
  const store = getStore(storeName)
  let total = 0

  for await (const page of store.list({ paginate: true })) {
    for (const b of page.blobs) {
      await store.delete(b.key)
      total++
    }
  }
  return total
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // Bearer auth
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({} as any))
    const clearJobs: boolean = !!body.clearJobs
    const jobMode: 'queuedRunning' | 'all' = body.jobMode === 'all' ? 'all' : 'queuedRunning'
    const clearBlobs: boolean = !!body.clearBlobs

    let jobsDeleted = 0
    let uploadsDeleted = 0
    let outputsDeleted = 0

    if (clearJobs) {
      if (jobMode === 'queuedRunning') {
        const res = await prisma.job.deleteMany({ where: { status: { in: ['queued', 'running'] } } })
        jobsDeleted = res.count
      } else {
        const res = await prisma.job.deleteMany({})
        jobsDeleted = res.count
      }
    }

    if (clearBlobs) {
      uploadsDeleted = await deleteAllBlobs(UPLOADS_STORE)
      outputsDeleted = await deleteAllBlobs(OUTPUTS_STORE)
    }

    return new Response(
      JSON.stringify({ ok: true, deleted: { jobs: jobsDeleted, uploads: uploadsDeleted, outputs: outputsDeleted } }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('ADMIN_MAINTENANCE_ERROR', err)
    return new Response(JSON.stringify({ ok: false, error: String(err?.message ?? err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
