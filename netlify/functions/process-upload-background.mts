// netlify/process-upload-background.mts
// Background worker: merges counts into MasterRecord, computes statistical columns
// - Keeps uploaded columns in output
// - Appends relationship fields (relationshipCode, relationshipType, rational)
// - Increments only count fields in MasterRecord, NOT statistical fields directly
// - Recomputes statistical fields after counts are updated, based on the
//   formulas from concept_ab_step_5 (Wilson CI, Haldane correction, etc.)
// - Writes enriched output `${jobId}.csv` and a master snapshot `master-snapshot/${jobId}.csv`

import { getStore } from '@netlify/blobs'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import crypto from 'node:crypto'
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// TEMP: verify Prisma payload exists at runtime
console.log("Prisma resolved to:", require.resolve("@prisma/client"));
console.log("Has .prisma client?",
  require("fs").existsSync(require("path").join(process.cwd(), "node_modules/.prisma/client")));


const UPLOADS_STORE = 'uploads'
const OUTPUTS_STORE = 'outputs'

// ----------------------
// Utility helpers
// ----------------------
function n(v: unknown): number {
  const x = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(x) ? x : 0
}
function s(v: unknown): string {
  return v == null ? '' : String(v)
}
function round(value: number | null, digits: number): number | null {
  if (value == null || !Number.isFinite(value)) return null
  const p = Math.pow(10, digits)
  return Math.round(value * p) / p
}
function safeDiv(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null
  return a / b
}

// Wilson interval (two-sided 95%) for proportion p with n trials
function wilson95(p: number, n: number): { lo: number | null; hi: number | null } {
  if (!Number.isFinite(p) || !Number.isFinite(n) || n <= 0) return { lo: null, hi: null }
  const z = 1.96
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = p + z2 / (2 * n)
  const rad = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))
  return { lo: (center - rad) / denom, hi: (center + rad) / denom }
}

// Compute statistical fields from counts (concept_ab_step_5 logic)
function computeStats(input: {
  cooc_obs: number
  nA: number
  nB: number
  total_persons: number
  a_before_b: number
  b_before_a: number
  cooc_event_count: number
}) {
  const cooc_obs = n(input.cooc_obs)
  const nA = n(input.nA)
  const nB = n(input.nB)
  const total_persons = n(input.total_persons)
  const a_before_b = n(input.a_before_b)
  const b_before_a = n(input.b_before_a)

  // expected_obs
  const expected_obs = safeDiv(nA * nB, total_persons)

  // lift and CI
  const lift = expected_obs && cooc_obs > 0 ? cooc_obs / expected_obs : (expected_obs ? 0 : null)
  let lift_lower_95: number | null = null
  let lift_upper_95: number | null = null
  if (expected_obs && cooc_obs > 0) {
    const se = Math.sqrt(1 / cooc_obs + 1 / expected_obs)
    lift_lower_95 = Math.exp(Math.log(cooc_obs / expected_obs) - 1.96 * se)
    lift_upper_95 = Math.exp(Math.log(cooc_obs / expected_obs) + 1.96 * se)
  }

  // z_score
  const z_score = expected_obs && expected_obs > 0 ? (cooc_obs - expected_obs) / Math.sqrt(expected_obs) : null

  // Haldane-Anscombe smoothed 2x2 table
  const ab = cooc_obs
  const a_only = Math.max(nA - cooc_obs, 0)
  const b_only = Math.max(nB - cooc_obs, 0)
  const neither = Math.max(total_persons - nA - nB + cooc_obs, 0)

  const ab_h = ab + 0.5
  const a_only_h = a_only + 0.5
  const b_only_h = b_only + 0.5
  const neither_h = neither + 0.5

  // odds ratio and CI
  let odds_ratio: number | null = null
  let or_lower_95: number | null = null
  let or_upper_95: number | null = null
  if (a_only_h > 0 && b_only_h > 0) {
    odds_ratio = (ab_h * neither_h) / (a_only_h * b_only_h)
    const seLogOR = Math.sqrt(1 / ab_h + 1 / a_only_h + 1 / b_only_h + 1 / neither_h)
    or_lower_95 = Math.exp(Math.log(odds_ratio) - 1.96 * seLogOR)
    or_upper_95 = Math.exp(Math.log(odds_ratio) + 1.96 * seLogOR)
  }

  // directionality
  const dirDen = a_before_b + b_before_a
  const directionality_ratio = dirDen > 0 ? a_before_b / dirDen : null
  const dirCI = directionality_ratio != null ? wilson95(directionality_ratio, dirDen) : { lo: null, hi: null }

  // confidences
  const confidence_a_to_b = nA > 0 ? cooc_obs / nA : null
  const confidence_b_to_a = nB > 0 ? cooc_obs / nB : null

  return {
    expected_obs: expected_obs == null ? null : round(expected_obs, 2),
    lift: lift == null ? null : round(lift, 4),
    lift_lower_95: lift_lower_95 == null ? null : round(lift_lower_95, 4),
    lift_upper_95: lift_upper_95 == null ? null : round(lift_upper_95, 4),
    z_score: z_score == null ? null : round(z_score, 4),
    ab_h: round(ab_h, 2),
    a_only_h: round(a_only_h, 2),
    b_only_h: round(b_only_h, 2),
    neither_h: round(neither_h, 2),
    odds_ratio: odds_ratio == null ? null : round(odds_ratio, 4),
    or_lower_95: or_lower_95 == null ? null : round(or_lower_95, 4),
    or_upper_95: or_upper_95 == null ? null : round(or_upper_95, 4),
    directionality_ratio: directionality_ratio == null ? null : round(directionality_ratio, 4),
    dir_prop_a_before_b: directionality_ratio == null ? null : round(directionality_ratio, 4), // same as ratio per SQL
    dir_lower_95: dirCI.lo == null ? null : round(dirCI.lo, 4),
    dir_upper_95: dirCI.hi == null ? null : round(dirCI.hi, 4),
    confidence_a_to_b: confidence_a_to_b == null ? null : round(confidence_a_to_b, 4),
    confidence_b_to_a: confidence_b_to_a == null ? null : round(confidence_b_to_a, 4),
  }
}

function toDecimal(v: number | null, digits: number): Prisma.Decimal | null {
  if (v == null || !Number.isFinite(v)) return null
  return new Prisma.Decimal(v.toFixed(digits))
}

// ----------------------
// Netlify Function handler
// ----------------------
export default async (req: Request) => {
  try {
    const body = await req.json().catch(() => ({}))
    const jobId: string = body.jobId
    const userId: string = body.userId
    const uploadBlobKey: string = body.uploadBlobKey
    const originalName: string = body.originalName

    if (!jobId || !userId || !uploadBlobKey) {
      throw new Error('Missing jobId/userId/uploadBlobKey')
    }

    // Claim job (prevent double-processing)
    const claimed = await prisma.job.updateMany({
      where: { id: jobId, status: 'queued' },
      data: { status: 'running', startedAt: new Date() },
    })
    if (claimed.count === 0) return new Response('Already claimed', { status: 200 })

    const uploads = getStore(UPLOADS_STORE)
    const outputs = getStore(OUTPUTS_STORE)

    const file = await uploads.get(uploadBlobKey)
    if (!file) throw new Error('Upload blob not found: ' + uploadBlobKey)

    const text = typeof file === 'string' ? file : await (file as Blob).text()
    const rows = text.split(/\r?\n/)
    const header = rows.shift() || ''
    const hdr = header.split(',').map((h) => h.trim())

    // Expect these columns (already validated on upload page)
    const idx = Object.fromEntries(hdr.map((name, i) => [name, i])) as Record<string, number>

    // Prepare output: keep all original columns + relationship fields
    const REL_FIELDS = ['relationshipCode', 'relationshipType', 'rational'] as const
    const outHeader = header + ',' + REL_FIELDS.join(',')
    const outLines: string[] = [outHeader]

    // Track which pairs we touched to snapshot + to increment source_count once
    const touchedPairIds = new Set<string>()

    let processed = 0

    for (const line of rows) {
      const cols = line.split(',')
      if (cols.length === 1 && cols[0].trim() === '') continue

      // read required values
      const concept_a = s(cols[idx['concept_a']])
      const concept_b = s(cols[idx['concept_b']])
      const code_a = s(cols[idx['code_a']])
      const code_b = s(cols[idx['code_b']])
      const system_a = s(cols[idx['system_a']])
      const system_b = s(cols[idx['system_b']])
      const type_a = s(cols[idx['type_a']])
      const type_b = s(cols[idx['type_b']])

      const cooc_obs = n(cols[idx['cooc_obs']])
      const nA = n(cols[idx['nA']])
      const nB = n(cols[idx['nB']])
      const total_persons = n(cols[idx['total_persons']])
      const cooc_event_count = n(cols[idx['cooc_event_count']])
      const a_before_b = n(cols[idx['a_before_b']])
      const b_before_a = n(cols[idx['b_before_a']])

      const nANum = Number(nA);
      const nBNum = Number(nB);
      const totalNum = Number(total_persons);

      const pairId = `${code_a}|${system_a}__${code_b}|${system_b}`
      touchedPairIds.add(pairId)

      const expectedObs = totalNum > 0
        ? new Prisma.Decimal(nANum).mul(nBNum).div(totalNum)
        : new Prisma.Decimal(0);

      // Upsert master (create if needed with identity fields, then increment counts)
     await prisma.masterRecord.upsert({
        where: { pairId },
        create: {
          pairId,
          concept_a,
          code_a,
          concept_b,
          code_b,
          system_a,
          system_b,
          type_a,
          type_b,
          cooc_obs,
          nA: nANum,
          nB: nBNum,
          total_persons: totalNum,
          cooc_event_count,
          a_before_b,
          b_before_a,
          relationshipType,
          relationshipCode,
          rational,                 // keep your existing field names
          source_count: 1,
          expected_obs: expectedObs // <-- REQUIRED on create
        },
        update: {
          concept_a,
          concept_b,
          nA: { increment: nANum },
          nB: { increment: nBNum },
          cooc_obs: { increment: cooc_obs },
          total_persons: { increment: totalNum },
          cooc_event_count: { increment: cooc_event_count },
          a_before_b: { increment: a_before_b },
          b_before_a: { increment: b_before_a },
          source_count: { increment: 1 }
          // we'll recompute expected_obs after the update (see below)
        }
      });

      // Fetch updated counters for this pair and recompute statistical fields
      const mr = await prisma.masterRecord.findUnique({
        where: { pairId },
        select: {
          cooc_obs: true, nA: true, nB: true, total_persons: true,
          cooc_event_count: true, a_before_b: true, b_before_a: true,
        },
      })

      if (mr) {
        const stats = computeStats({
          cooc_obs: mr.cooc_obs,
          nA: mr.nA,
          nB: mr.nB,
          total_persons: mr.total_persons,
          a_before_b: mr.a_before_b,
          b_before_a: mr.b_before_a,
          cooc_event_count: mr.cooc_event_count,
        })

      // Recompute expected_obs using the persisted, updated counts
      const mr = await prisma.masterRecord.findUnique({ where: { pairId } });
      if (mr) {
        const exp = mr.total_persons > 0
          ? new Prisma.Decimal(mr.nA).mul(mr.nB).div(mr.total_persons)
          : new Prisma.Decimal(0);
        await prisma.masterRecord.update({
          where: { pairId },
          data: { expected_obs: exp }
        });
      }


        await prisma.masterRecord.update({
          where: { pairId },
          data: {
            expected_obs: toDecimal(stats.expected_obs, 2),
            lift: toDecimal(stats.lift, 4),
            lift_lower_95: toDecimal(stats.lift_lower_95, 4),
            lift_upper_95: toDecimal(stats.lift_upper_95, 4),
            z_score: toDecimal(stats.z_score, 4),
            ab_h: toDecimal(stats.ab_h, 2),
            a_only_h: toDecimal(stats.a_only_h, 2),
            b_only_h: toDecimal(stats.b_only_h, 2),
            neither_h: toDecimal(stats.neither_h, 2),
            odds_ratio: toDecimal(stats.odds_ratio, 4),
            or_lower_95: toDecimal(stats.or_lower_95, 4),
            or_upper_95: toDecimal(stats.or_upper_95, 4),
            directionality_ratio: toDecimal(stats.directionality_ratio, 4),
            dir_prop_a_before_b: toDecimal(stats.dir_prop_a_before_b, 4),
            dir_lower_95: toDecimal(stats.dir_lower_95, 4),
            dir_upper_95: toDecimal(stats.dir_upper_95, 4),
            confidence_a_to_b: toDecimal(stats.confidence_a_to_b, 4),
            confidence_b_to_a: toDecimal(stats.confidence_b_to_a, 4),
          },
        })
      }

      // Enrich row output – keep input columns and append empty relationship fields for now
      const rel = ['', '', '']
      outLines.push(line + ',' + rel.join(','))
      processed++
    }

    // Write enriched output
    await outputs.set(`${jobId}.csv`, outLines.join('\n'), {
      metadata: { jobId, userId, originalName, kind: 'enriched' },
    })

    // Snapshot all touched master rows
    const snapshot = await prisma.masterRecord.findMany({
      where: { pairId: { in: Array.from(touchedPairIds) } },
      orderBy: { pairId: 'asc' },
    })
    const snapHeader = Object.keys(snapshot[0] ?? { pairId: '' }).join(',')
    const snapLines = [snapHeader]
    for (const r of snapshot) {
      const vals = Object.values(r).map((v) => (v instanceof Prisma.Decimal ? v.toString() : v == null ? '' : String(v)))
      snapLines.push(vals.join(','))
    }
    await outputs.set(`master-snapshot/${jobId}.csv`, snapLines.join('\n'), {
      metadata: { jobId, userId, count: snapshot.length },
    })

    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'completed', finishedAt: new Date(), rowsProcessed: processed },
    })

    return new Response('OK', { status: 200 })
  } catch (err: any) {
    console.error('WORKER_ERROR', err)
    // Try mark job failed if we have an id in payload
    try {
      const { jobId } = await (async () => {
        try { return await (req as any).json() } catch { return {} } })()
      if (jobId) {
        await prisma.job.update({ where: { id: jobId }, data: { status: 'failed', error: String(err?.message ?? err) } })
      }
    } catch {}
    return new Response('ERROR', { status: 500 })
  }
}
