// app/api/downloads/[id]/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

const OUTPUTS_STORE = process.env.OUTPUTS_STORE ?? 'outputs'

export async function GET(_req: Request, ctx: { params: { jobId: string } }) {
  const jobId = ctx?.params?.jobId
  if (!jobId) return new Response('Missing job id', { status: 400 })

  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return new Response('Unauthorized', { status: 401 })

  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!me) return new Response('Unauthorized', { status: 401 })

  // Look up the job and ensure it belongs to the caller
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { userId: true, status: true, outputBlobKey: true, upload: { select: { originalName: true } } },
  })

  if (!job || job.userId !== me.id) return new Response('Not found', { status: 404 })
  if (job.status !== 'completed') return new Response('Not ready', { status: 409 })
  if (!job.outputBlobKey) return new Response('No output for this job', { status: 404 })

  // Read the CSV from Netlify Blobs
  const mod: any = await import('@netlify/blobs')
  const getStore = mod.getStore ?? mod.default?.getStore
  if (!getStore) return new Response('Storage unavailable', { status: 500 })

  const outputs = getStore({ name: OUTPUTS_STORE, consistency: 'strong' })
  const ab: ArrayBuffer | null = await outputs.get(job.outputBlobKey, { type: 'arrayBuffer', consistency: 'strong' })
  if (!ab) return new Response('Output not found', { status: 404 })

  const body = new Uint8Array(ab)

  // Nice filename: use original upload base + ".processed.csv"
  const base = job.upload?.originalName?.replace(/\.[^./]+$/, '') || 'output'
  const filename = `${base}.processed.csv`

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
