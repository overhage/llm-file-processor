// app/api/uploads/route.ts — offload blob save to Netlify Function

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import type { Session } from 'next-auth'
import { authOptions } from '@/lib/auth'
import crypto from 'node:crypto'

export type AppSession = Session & {
  user: NonNullable<Session['user']> & { id: string }
}

const BACKGROUND_FN_PATH = '/.netlify/functions/process-upload-background'
const STORE_UPLOAD_FN_PATH = '/.netlify/functions/store-upload'
const UPLOADS_STORE = process.env.UPLOADS_STORE ?? 'uploads'

export async function POST(req: Request) {
  try {
    // ---- Auth ----
    const session = (await getServerSession(authOptions as any)) as AppSession | null
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }
    const userId = session.user.id

    // ---- Read form ----
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      throw new Error('No file uploaded')
    }

    // ---- Basic validation (CSV) ----
    const fileName = (file as any).name || 'upload.csv'
    if (!/\.csv$/i.test(fileName)) {
      throw new Error('Please upload a CSV file')
    }

    const jobId = crypto.randomUUID()

    // choose blob keys (worker expects these names)
    const uploadKey = `${userId}/${jobId}.csv`
    const outputKey = `${userId}/${jobId}.out.csv`

    // --- create Upload row ---
    const upload = await prisma.upload.create({
      data: { userId, blobKey: uploadKey, originalName: fileName },
      select: { id: true },
    })

    // --- create Job row ---
    const job = await prisma.job.create({
      data: {
        id: jobId,
        userId,
        uploadId: upload.id,
        status: 'queued',
        outputBlobKey: outputKey,
      },
      select: { id: true },
    })

    // ---- Store in Netlify Blobs via Netlify Function (for env access) ----
    // Send the CSV as text so the function receives a UTF-8 body (no base64 needed)
    const bodyText = await file.text()
    const storeUrl = new URL(
      `${STORE_UPLOAD_FN_PATH}?key=${encodeURIComponent(uploadKey)}`,
      req.url
    ).toString()

    const storeRes = await fetch(storeUrl, {
      method: 'POST',
      headers: {
        'content-type': 'text/csv',
        'x-original-name': fileName,
        'x-user-id': userId,
        'x-uploads-store': UPLOADS_STORE,
      },
      body: bodyText,
    })

    if (!storeRes.ok) {
      const txt = await storeRes.text()
      throw new Error(`Blob store failed: ${storeRes.status} ${txt}`)
    }

    // ---- Kick off background processing ----
    const invokeUrl = new URL(BACKGROUND_FN_PATH, req.url).toString()
    await fetch(invokeUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userId,
        jobId: job.id,
        uploadId: upload.id,
        uploadKey,
        outputKey,
        originalName: fileName,
      }),
    })

    // ---- Respond (redirect HTML, JSON otherwise) ----
    const wantsJson = (req.headers.get('accept') || '').includes('application/json')
    if (wantsJson) {
      return NextResponse.json({ ok: true, jobId: job.id, uploadId: upload.id })
    }

    const url = new URL(req.url)
    const redirectTo = `/jobs?created=1&job=${encodeURIComponent(job.id)}`
    return NextResponse.redirect(new URL(redirectTo, url), 303)
  } catch (err: any) {
    console.error('Upload failed', err)

    const wantsJson = (req.headers.get('accept') || '').includes('application/json')
    if (wantsJson) {
      return new Response(String(err?.message ?? err), { status: 500 })
    }

    const url = new URL(req.url)
    const back = new URL('/upload', url)
    back.searchParams.set('error', String(err?.message ?? 'Upload failed'))
    return NextResponse.redirect(back, 303)
  }
}
