// app/api/uploads/route.ts

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import crypto from 'node:crypto'

// Keep store name consistent across writer/reader
const UPLOADS_STORE = process.env.UPLOADS_STORE ?? 'uploads'
// the invoke URL is /.netlify/functions/process-upload-background
const BACKGROUND_FN_PATH = '/.netlify/functions/process-upload-background'

// ---- robust dynamic import for Netlify Blobs (ESM safe) ----
let _getStoreCached: any
async function loadGetStore() {
  if (_getStoreCached) return _getStoreCached
  const mod: any = await import('@netlify/blobs')
  const fn = mod.getStore ?? mod.default?.getStore
  if (!fn) throw new Error('Netlify Blobs getStore not found')
  _getStoreCached = fn
  return fn
}

export async function POST(req: Request) {
  try {
    // --- auth ---
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return new Response('Unauthorized', { status: 401 })

    const me = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    if (!me) return new Response('Unauthorized', { status: 401 })
    const userId = me.id

    // --- read form ---
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return new Response('No file provided', { status: 400 })

    const originalName = file.name || 'upload.csv'
    const jobId = crypto.randomUUID()

    // choose blob keys (worker expects these names)
    const uploadKey = `${userId}/${jobId}.csv`
    const outputKey = `${userId}/${jobId}.out.csv`

    // --- create Upload row ---
    const upload = await prisma.upload.create({
      data: { userId, blobKey: uploadKey, originalName },
      select: { id: true },
    })

    // --- save file to Netlify Blobs (robust) ---
    try {
      const getStore = await loadGetStore()
      // support both signatures depending on library version
      let uploadStore: any
      try { uploadStore = getStore(UPLOADS_STORE) } catch { uploadStore = getStore({ name: UPLOADS_STORE }) }

      // Convert File -> Buffer (avoids streaming quirks)
      const buf = Buffer.from(await (file as File).arrayBuffer())

      await uploadStore.set(uploadKey, buf, {
        access: 'private',
        contentType: 'text/csv; charset=utf-8',
        metadata: { originalName, userId, jobId },
      })

      // Verify write immediately so we fail fast if not visible
      const verify = await uploadStore.get(uploadKey)
      $1
console.log('upload: saved', { uploadKey, exists, UPLOADS_STORE })if (!exists) throw new Error(`Upload blob not visible after set: ${uploadKey}`)
    } catch (e) {
      console.error('upload: blob write failed', e)
      throw e
    }

    // --- create Job (queued) ---
    await prisma.job.create({
      data: {
        id: jobId,
        userId,
        uploadId: upload.id,
        status: 'queued',
        rowsTotal: 0,
        rowsProcessed: 0,
        // If you track output location in DB, set it here (adjust field name):
        // output_blob_key: outputKey,
      },
    })

    // --- kick background worker (best-effort) ---
    try {
      const proto = req.headers.get('x-forwarded-proto') ?? 'https'
      const host = req.headers.get('x-forwarded-host')
      const base =
        (host ? `${proto}://${host}` : '') ||
        process.env.URL ||
        process.env.DEPLOY_PRIME_URL ||
        ''

      console.log('upload: invoking worker', {
        base,
        DEPLOY_CONTEXT: process.env.DEPLOY_CONTEXT,
        jobId,
        uploadKey,
        outputKey,
      })

      const payload = { jobId, uploadKey, outputKey, classify: true }

      const resp = await fetch(base + BACKGROUND_FN_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const text = await resp.text().catch(() => '')
      console.log('process-upload trigger', resp.status, text)
    } catch (e) {
      console.error('process-upload trigger failed', e)
    }

    // --- respond: JSON or redirect ---
    const wantsJson = (req.headers.get('accept') || '').includes('application/json')
    if (wantsJson) return Response.json({ ok: true, jobId, outputKey })

    const url = new URL(req.url)
    const redirectTo = url.searchParams.get('redirect') || '/jobs'
    return NextResponse.redirect(new URL(redirectTo, url), 303)
  } catch (err: any) {
    console.error('Upload failed', err)

    const wantsJson = (req.headers.get('accept') || '').includes('application/json')
    if (!wantsJson) {
      const url = new URL(req.url)
      const back = new URL('/upload', url)
      back.searchParams.set('error', String(err?.message ?? 'Upload failed'))
      return NextResponse.redirect(back, 303)
    }
    return new Response(String(err?.message ?? err), { status: 500 })
  }
}
