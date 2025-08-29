// netlify/functions/process-upload-background.ts

import { getStore } from '@netlify/blobs'
import { PrismaClient, Prisma } from '@prisma/client'
// OpenAI SDK (v4)
import OpenAI from 'openai'

// model + limits via env
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4-turbo'
const LLM_MAX_CALLS_PER_JOB = Number(process.env.LLM_MAX_CALLS_PER_JOB ?? '50')

// in-memory per-job cache so we don’t re-ask for the same pair in one upload
const relCache = new Map<string, { code: number; type: string; rational: string }>()

// exactly the 11 categories used by the classifier
const RELATIONSHIP_TYPES: Record<number, string> = {
  1: 'A causes B',
  2: 'B causes A',
  3: 'A indirectly causes B',
  4: 'B indirectly causes A',
  5: 'A and B share common cause',
  6: 'Treatment of A causes B',
  7: 'Treatment of B causes A',
  8: 'A and B have similar initial presentations',
  9: 'A is subset of B',
  10: 'B is subset of A',
  11: 'No clear relationship',
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const prisma = new PrismaClient()

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
function round(value: number | null, digits: number): number {
  if (value == null || !Number.isFinite(value)) return 0
  const p = Math.pow(10, digits)
  return Math.round(value * p) / p
}
function safeDiv(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0
  return a / b
}
function trimLen(sv: unknown, max: number): string {
  const t = s(sv)
  return t.length > max ? t.slice(0, max) : t
}

// Wilson interval (two-sided 95%) for proportion p with n trials
function wilson95(p: number, n: number): { lo: number; hi: number } {
  if (!Number.isFinite(p) || !Number.isFinite(n) || n <= 0) return { lo: 0, hi: 0 }
  const z = 1.96
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = p + z2 / (2 * n)
  const rad = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))
  return { lo: Math.max(0, (center - rad) / denom), hi: Math.min(1, (center + rad) / denom) }
}

// Compute statistical fields from counts (concept_ab_step_5 logic)
function computeStats(input: {
  cooc_obs: number
  nA: number
  nB: number
  total_persons: number
  a_before_b: number
  b_before_a: number
}): {
  expected_obs: number
  lift: number
  lift_lower_95: number
  lift_upper_95: number
  z_score: number
  ab_h: number
  a_only_h: number
  b_only_h: number
  neither_h: number
  odds_ratio: number
  or_lower_95: number
  or_upper_95: number
  directionality_ratio: number
  dir_prop_a_before_b: number
  dir_lower_95: number
  dir_upper_95: number
  confidence_a_to_b: number
  confidence_b_to_a: number
} {
  const cooc_obs = n(input.cooc_obs)
  const nA = n(input.nA)
  const nB = n(input.nB)
  const total_persons = n(input.total_persons)
  const a_before_b = n(input.a_before_b)
  const b_before_a = n(input.b_before_a)

  // expected_obs
  const expected_obs = round(safeDiv(nA * nB, total_persons), 2)

  // lift and CI
  const hasExp = expected_obs > 0
  const lift = hasExp ? round(cooc_obs / expected_obs, 4) : 0
  let lift_lower_95 = 0
  let lift_upper_95 = 0
  if (hasExp && cooc_obs > 0) {
    const se = Math.sqrt(1 / cooc_obs + 1 / expected_obs)
    lift_lower_95 = round(Math.exp(Math.log(cooc_obs / expected_obs) - 1.96 * se), 4)
    lift_upper_95 = round(Math.exp(Math.log(cooc_obs / expected_obs) + 1.96 * se), 4)
  }

  // z_score (Poisson approx)
  const z_score = hasExp ? round((cooc_obs - expected_obs) / Math.sqrt(expected_obs), 4) : 0

  // 2x2 table
  const ab = cooc_obs
  const a_only = Math.max(nA - cooc_obs, 0)
  const b_only = Math.max(nB - cooc_obs, 0)
  const neither = Math.max(total_persons - nA - nB + cooc_obs, 0)

  const ab_h = round(ab + 0.5, 2)
  const a_only_h = round(a_only + 0.5, 2)
  const b_only_h = round(b_only + 0.5, 2)
  const neither_h = round(neither + 0.5, 2)

  let odds_ratio = 0
  let or_lower_95 = 0
  let or_upper_95 = 0
  const aoh = a_only + 0.5
  const boh = b_only + 0.5
  const abh = ab + 0.5
  const nh = neither + 0.5
  if (aoh > 0 && boh > 0 && abh > 0 && nh > 0) {
    const or = (abh * nh) / (aoh * boh)
    const seLogOR = Math.sqrt(1 / abh + 1 / aoh + 1 / boh + 1 / nh)
    odds_ratio = round(or, 4)
    or_lower_95 = round(Math.exp(Math.log(or) - 1.96 * seLogOR), 4)
    or_upper_95 = round(Math.exp(Math.log(or) + 1.96 * seLogOR), 4)
  }

  // directionality
  const dirDen = a_before_b + b_before_a
  const directionality_ratio = dirDen > 0 ? round(a_before_b / dirDen, 4) : 0
  const dirCI = dirDen > 0 ? wilson95(a_before_b / dirDen, dirDen) : { lo: 0, hi: 0 }
  const dir_lower_95 = round(dirCI.lo, 4)
  const dir_upper_95 = round(dirCI.hi, 4)

  // confidences
  const confidence_a_to_b = nA > 0 ? round(cooc_obs / nA, 4) : 0
  const confidence_b_to_a = nB > 0 ? round(cooc_obs / nB, 4) : 0

  return {
    expected_obs,
    lift,
    lift_lower_95,
    lift_upper_95,
    z_score,
    ab_h,
    a_only_h,
    b_only_h,
    neither_h,
    odds_ratio,
    or_lower_95,
    or_upper_95,
    directionality_ratio,
    dir_prop_a_before_b: directionality_ratio,
    dir_lower_95,
    dir_upper_95,
    confidence_a_to_b,
    confidence_b_to_a,
  }
}

function toDecimalOrZero(v: number, digits: number): Prisma.Decimal {
  const vv = Number.isFinite(v) ? v : 0
  return new Prisma.Decimal(vv.toFixed(digits))
}

function buildRelPrompt(args: {
  concept_a: string
  concept_b: string
  events_ab: number
  events_ab_ae: number
}) {
  const { concept_a, concept_b, events_ab, events_ab_ae } = args
  return `
You are an expert diagnostician identifying clinical relationships between diagnosis concepts.

Statistical indicators:
- events_ab (co-occurrences): ${events_ab}
- events_ab_ae (actual/expected ratio): ${events_ab_ae.toFixed(2)}

Interpretation guidelines:
- ≥ 2.0: Strong statistical evidence
- 1.5–1.99: Moderate evidence
- 1.0–1.49: Weak evidence
- < 1.0: Minimal evidence

Rules to avoid speculation:
- Direct/indirect causation only if explicitly accepted and (for indirect) the intermediate is named.
- Common cause only with a clear third diagnosis.
- Treatment-caused only if explicitly well-documented.
- Similar presentation only if clinically documented.
- Subset only if one is explicitly broader/unspecified.
- Otherwise choose 11 (No clear relationship).

Classify the relationship between:
- Concept A: ${concept_a}
- Concept B: ${concept_b}

Categories:
1: A causes B
2: B causes A
3: A indirectly causes B (explicit intermediate)
4: B indirectly causes A (explicit intermediate)
5: A and B share common cause (explicit third condition)
6: Treatment of A causes B
7: Treatment of B causes A
8: A and B have similar initial presentations
9: A is subset of B
10: B is subset of A
11: No clear relationship

Answer EXACTLY as "<number>: <short description>: <concise rationale>".
`.trim()
}

async function classifyRelationship(args: {
  concept_a: string
  concept_b: string
  events_ab: number
  events_ab_ae: number
}): Promise<{ code: number; type: string; rational: string }> {
  if (!process.env.OPENAI_API_KEY) {
    return { code: 11, type: RELATIONSHIP_TYPES[11], rational: 'No API key configured' }
  }

  const prompt = buildRelPrompt(args)

  const resp = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = resp.choices?.[0]?.message?.content?.trim() ?? ''
  const m = text.match(/^(\d+)\s*:\s*([^:]+?)\s*:\s*([\s\S]+)$/)
  if (!m) {
    return { code: 11, type: RELATIONSHIP_TYPES[11], rational: 'Unable to parse LLM output' }
  }

  const code = Math.max(1, Math.min(11, Number(m[1]) || 11))
  const type = RELATIONSHIP_TYPES[code] || m[2].trim()
  const rational = m[3].trim()
  return { code, type, rational }
}

// ----------------------
// CSV helpers
// ----------------------
function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else { inQuotes = false }
      } else { cur += ch }
    } else {
      if (ch === '"') { inQuotes = true }
      else if (ch === ',') { out.push(cur); cur = '' }
      else { cur += ch }
    }
  }
  out.push(cur)
  return out
}

function isEmptyRow(cols: string[]): boolean {
  return cols.every(c => c.trim() === '')
}

// ----------------------
// Netlify Function handler
// ----------------------
export default async function handler(req: Request) {
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

    // Normalize newlines
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

    // header = first non-empty (non-comma-only) line
    let header = ''
    let startIdx = 0
    for (; startIdx < lines.length; startIdx++) {
      const testCols = splitCsv(lines[startIdx])
      if (!isEmptyRow(testCols)) { header = lines[startIdx]; startIdx++; break }
    }
    if (!header) throw new Error('CSV header not found')

    const hdr = splitCsv(header).map(h => h.trim())
    const hdrIndex: Record<string, number> = Object.fromEntries(hdr.map((name, i) => [name, i]))

    // Prepare output: keep all original columns + relationship fields
    const REL_FIELDS = ['relationshipCode', 'relationshipType', 'rational'] as const
    const outHeader = header + ',' + REL_FIELDS.join(',')
    const outLines: string[] = [outHeader]

    // Track which pairs we touched to snapshot
    const touchedPairIds = new Set<string>()

    let processed = 0

    for (let li = startIdx; li < lines.length; li++) {
      const raw = lines[li]

      // Skip totally blank lines or comma-only padding rows
      if (!raw || raw.trim() === '') continue

      const cols = splitCsv(raw)
      if (isEmptyRow(cols)) continue

      // Guard: ignore rows that don’t have at least header columns
      if (cols.length < hdr.length) continue

      const get = (name: string) => {
        const i = hdrIndex[name]
        return i == null ? '' : cols[i] ?? ''
      }

      // Required identifiers
      const concept_a = s(get('concept_a'))
      const concept_b = s(get('concept_b'))
      const code_a = s(get('code_a'))
      const code_b = s(get('code_b'))
      const system_a = s(get('system_a'))
      const system_b = s(get('system_b'))
      const type_a = s(get('type_a'))
      const type_b = s(get('type_b'))

      if (!concept_a && !concept_b && !code_a && !code_b) continue
      if (!code_a || !code_b || !system_a || !system_b) continue

      // Numerics
      const cooc_obs = n(get('cooc_obs'))
      const nA = n(get('nA'))
      const nB = n(get('nB'))
      const total_persons = n(get('total_persons'))
      const cooc_event_count = n(get('cooc_event_count'))
      const a_before_b = n(get('a_before_b'))
      const b_before_a = n(get('b_before_a'))

      const pairId = `${code_a}|${system_a}__${code_b}|${system_b}`
      touchedPairIds.add(pairId)

      // Any previously-annotated relationship?
      const existing = await prisma.masterRecord.findUnique({
        where: { pairId },
        select: { relationshipType: true, relationshipCode: true, rational: true },
      })

      // Defaults from DB (if present)
      let relationshipType = existing?.relationshipType ?? ''
      let relationshipCode = existing?.relationshipCode ?? 0
      let rational = existing?.rational ?? ''

      // Stats from the row
      const statsCreate = computeStats({ cooc_obs, nA, nB, total_persons, a_before_b, b_before_a })

      // Decide whether to call LLM
      const needLLM = !relationshipType && !(relationshipCode ?? 0)
      const callsSoFar = relCache.size
      if (needLLM && callsSoFar < LLM_MAX_CALLS_PER_JOB) {
        const cached = relCache.get(pairId)
        if (cached) {
          relationshipType = cached.type
          relationshipCode = cached.code
          rational = cached.rational
        } else {
          const events_ab = cooc_obs
          const events_ab_ae = statsCreate.lift || 0 // A/E ratio (lift)
          try {
            const res = await classifyRelationship({ concept_a, concept_b, events_ab, events_ab_ae })
            relationshipType = res.type
            relationshipCode = res.code
            rational = res.rational
            relCache.set(pairId, res)
          } catch (e) {
            console.error('LLM_CLASSIFY_ERROR', pairId, e)
            relationshipType = ''
            relationshipCode = 0
            rational = 'LLM error'
          }
        }
      }

      // DB-safe strings (prevent P2000 overruns)
      const concept_a_db = trimLen(concept_a, 255)
      const concept_b_db = trimLen(concept_b, 255)
      const code_a_db = trimLen(code_a, 20)
      const code_b_db = trimLen(code_b, 20)
      const system_a_db = trimLen(system_a, 12)
      const system_b_db = trimLen(system_b, 12)
      const type_a_db = trimLen(type_a, 20)
      const type_b_db = trimLen(type_b, 20)
      const relationshipType_db = trimLen(relationshipType, 12)
      const rational_db = trimLen(rational, 255)

      // Upsert master (create if needed with identity fields + stats, then increment counts on update)
      await prisma.masterRecord.upsert({
        where: { pairId },
        create: {
          pairId,
          concept_a: concept_a_db,
          code_a: code_a_db,
          concept_b: concept_b_db,
          code_b: code_b_db,
          system_a: system_a_db,
          system_b: system_b_db,
          type_a: type_a_db,
          type_b: type_b_db,
          cooc_obs,
          nA,
          nB,
          total_persons,
          cooc_event_count,
          a_before_b,
          b_before_a,
          // stats (all required in schema)
          expected_obs: toDecimalOrZero(statsCreate.expected_obs, 2),
          lift: toDecimalOrZero(statsCreate.lift, 4),
          lift_lower_95: toDecimalOrZero(statsCreate.lift_lower_95, 4),
          lift_upper_95: toDecimalOrZero(statsCreate.lift_upper_95, 4),
          z_score: toDecimalOrZero(statsCreate.z_score, 4),
          ab_h: toDecimalOrZero(statsCreate.ab_h, 2),
          a_only_h: toDecimalOrZero(statsCreate.a_only_h, 2),
          b_only_h: toDecimalOrZero(statsCreate.b_only_h, 2),
          neither_h: toDecimalOrZero(statsCreate.neither_h, 2),
          odds_ratio: toDecimalOrZero(statsCreate.odds_ratio, 4),
          or_lower_95: toDecimalOrZero(statsCreate.or_lower_95, 4),
          or_upper_95: toDecimalOrZero(statsCreate.or_upper_95, 4),
          directionality_ratio: toDecimalOrZero(statsCreate.directionality_ratio, 4),
          dir_prop_a_before_b: toDecimalOrZero(statsCreate.dir_prop_a_before_b, 4),
          dir_lower_95: toDecimalOrZero(statsCreate.dir_lower_95, 4),
          dir_upper_95: toDecimalOrZero(statsCreate.dir_upper_95, 4),
          confidence_a_to_b: toDecimalOrZero(statsCreate.confidence_a_to_b, 4),
          confidence_b_to_a: toDecimalOrZero(statsCreate.confidence_b_to_a, 4),
          // relationship + metadata
          relationshipType: relationshipType_db,
          relationshipCode,
          rational: rational_db,
          source_count: 1,
          status: 'computed',
        },
        update: {
          concept_a: concept_a_db,
          concept_b: concept_b_db,
          nA: { increment: nA },
          nB: { increment: nB },
          cooc_obs: { increment: cooc_obs },
          total_persons: { increment: total_persons },
          cooc_event_count: { increment: cooc_event_count },
          a_before_b: { increment: a_before_b },
          b_before_a: { increment: b_before_a },
          source_count: { increment: 1 },
          status: 'computed',
        },
      })

      // Fetch updated counters for this pair and recompute statistical fields from persisted totals
      const mr = await prisma.masterRecord.findUnique({
        where: { pairId },
        select: {
          cooc_obs: true,
          nA: true,
          nB: true,
          total_persons: true,
          a_before_b: true,
          b_before_a: true,
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
        })

        // Backfill relationship metadata if we just obtained it
        if ((!existing?.relationshipType && !(existing?.relationshipCode ?? 0)) && (relationshipType || relationshipCode)) {
          await prisma.masterRecord.update({
            where: { pairId },
            data: {
              relationshipType: relationshipType_db,
              relationshipCode,
              rational: rational_db,
              llm_date: new Date(),
              llm_name: 'OpenAI',
              llm_version: OPENAI_MODEL,
            },
          })
        }

        await prisma.masterRecord.update({
          where: { pairId },
          data: {
            expected_obs: toDecimalOrZero(stats.expected_obs, 2),
            lift: toDecimalOrZero(stats.lift, 4),
            lift_lower_95: toDecimalOrZero(stats.lift_lower_95, 4),
            lift_upper_95: toDecimalOrZero(stats.lift_upper_95, 4),
            z_score: toDecimalOrZero(stats.z_score, 4),
            ab_h: toDecimalOrZero(stats.ab_h, 2),
            a_only_h: toDecimalOrZero(stats.a_only_h, 2),
            b_only_h: toDecimalOrZero(stats.b_only_h, 2),
            neither_h: toDecimalOrZero(stats.neither_h, 2),
            odds_ratio: toDecimalOrZero(stats.odds_ratio, 4),
            or_lower_95: toDecimalOrZero(stats.or_lower_95, 4),
            or_upper_95: toDecimalOrZero(stats.or_upper_95, 4),
            directionality_ratio: toDecimalOrZero(stats.directionality_ratio, 4),
            dir_prop_a_before_b: toDecimalOrZero(stats.dir_prop_a_before_b, 4),
            dir_lower_95: toDecimalOrZero(stats.dir_lower_95, 4),
            dir_upper_95: toDecimalOrZero(stats.dir_upper_95, 4),
            confidence_a_to_b: toDecimalOrZero(stats.confidence_a_to_b, 4),
            confidence_b_to_a: toDecimalOrZero(stats.confidence_b_to_a, 4),
          },
        })
      }

      // Enrich row output – keep input columns and append relationship fields (use long label in CSV)
      const rel = [String(relationshipCode), relationshipType, rational]
      outLines.push(raw + ',' + rel.join(','))
      processed++
    }

    // Write enriched output
    await outputs.set(`${jobId}.csv`, outLines.join('\n'), {
      metadata: { jobId, userId, originalName, kind: 'enriched' },
    })

    // Snapshot all touched master rows
    const pairIds = Array.from(touchedPairIds)
    let snapshot: any[] = []
    if (pairIds.length > 0) {
      snapshot = await prisma.masterRecord.findMany({
        where: { pairId: { in: pairIds } },
        orderBy: { pairId: 'asc' },
      })
    }

    if (snapshot.length > 0) {
      const snapHeader = Object.keys(snapshot[0]).join(',')
      const snapLines = [snapHeader]
      for (const r of snapshot) {
        const vals = Object.values(r).map((v) =>
          v instanceof Prisma.Decimal ? v.toString() : (v == null ? '' : String(v))
        )
        snapLines.push(vals.join(','))
      }
      await outputs.set(`master-snapshot/${jobId}.csv`, snapLines.join('\n'), {
        metadata: { jobId, userId, count: snapshot.length },
      })
    } else {
      await outputs.set(`master-snapshot/${jobId}.csv`, 'pairId', {
        metadata: { jobId, userId, count: 0 },
      })
    }

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
        try { return await (req as any).json() } catch { return {} }
      })()
      if (jobId) {
        await prisma.job.update({ where: { id: jobId }, data: { status: 'failed', error: String(err?.message ?? err) } })
      }
    } catch {}
    return new Response('ERROR', { status: 500 })
  }
}
