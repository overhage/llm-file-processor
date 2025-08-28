// File: netlify/functions/admin-maintenance.mts
// Purpose: Admin-only maintenance endpoint to (a) clear the job queue and/or (b) delete all upload/output blobs.
// Auth: Requires Authorization: Bearer <ADMIN_TOKEN>
// Body:
//   {
//     "clearJobs": true|false,             // delete job rows (see mode below)
//     "jobMode": "queuedRunning"|"all", // optional; default "queuedRunning"
//     "clearBlobs": true|false            // delete all blobs in 'uploads' and 'outputs'
//   }
// Returns: { ok: true, deleted: { jobs: number, uploads: number, outputs: number } }

import { getStore } from '@netlify/blobs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const ADMIN_TOKEN = process.env.ADMIN_TOKEN

const UPLOADS_STORE = 'uploads'
const OUTPUTS_STORE = 'outputs'

async function deleteAllBlobs(storeName: string): Promise<number> {
  const store = getStore(storeName)
  let cursor: string | undefined
  let total = 0
  do {
    // @netlify/blobs list API is cursor-based; each page returns { blobs, cursor? }
    const page = await store.list({ cursor }) as any
    const blobs = (page?.blobs ?? []) as Array<{ key: string }>
    for (const b of blobs) {
      await store.delete(b.key)
      total++
    }
    cursor = page?.cursor
  } while (cursor)
  return total
}

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // Basic bearer-token auth
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({} as any))
    const clearJobs: boolean = !!body.clearJobs
    const clearBlobs: boolean = !!body.clearBlobs
    const jobMode: 'queuedRunning' | 'all' = body.jobMode === 'all' ? 'all' : 'queuedRunning'

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

