// netlify/functions/process-upload-background.ts

// Netlify Blobs
const UPLOADS_STORE = process.env.UPLOADS_STORE ?? 'uploads'
const OUTPUTS_STORE = process.env.OUTPUTS_STORE ?? 'outputs'
let uploads: any
let outputs: any
async function ensureStores() {
  if (!uploads || !outputs) {
    const mod: any = await import('@netlify/blobs')
    const getStore = mod.getStore ?? mod.default?.getStore
    if (!getStore) throw new Error('Netlify Blobs getStore not found')
    uploads = getStore(UPLOADS_STORE)
    outputs = getStore(OUTPUTS_STORE)
  }
}

// Prisma + OpenAI
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'

const prisma = new PrismaClient()
const db: any = prisma // loosen types at the boundary to avoid schema-name friction
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const config = { path: '/.netlify/functions/process-upload-background' }

// ===== Types =====
export type MasterRecord = {
  concept_a: number
  code_a: string
  system_a: string
  concept_b: number
  code_b: string
  system_b: string
  // input counts
  cooc_obs: number
  nA: number
  nB: number
  total_persons: number
  cooc_event_count: number
  a_before_b: number
  // derived stats
  expected_obs?: number | null
  lift?: number | null
  lift_lower_95?: number | null
  lift_upper_95?: number | null
  z_score?: number | null
  directionality_ratio?: number | null
  // relationship
  REL_TYPE?: string | null
  REL_TYPE_T?: string | null
  RATIONALE?: string | null
}

export type UploadRow = {
  concept_a: number | string
  code_a: string
  concept_b: number | string
  code_b: string
  system_a: string
  system_b: string
  type_a?: string
  type_b?: string
  cooc_obs: number | string
  nA: number | string
  nB: number | string
  total_persons: number | string
  cooc_event_count: number | string
  a_before_b: number | string
}

// ===== Small helpers =====
const NL = String.fromCharCode(10)
function num(v: unknown): number { const x = typeof v === 'string' ? Number(v) : (v as number); return Number.isFinite(x) ? x : 0 }
function s(v: unknown): string { return v == null ? '' : String(v) }
function round(value: number | null | undefined, digits: number): number { if (value == null || !Number.isFinite(value)) return 0; const p = 10 ** digits; return Math.round((value as number) * p) / p }
function trimLen(v: unknown, max: number): string { const t = s(v); return t.length > max ? t.slice(0, max) : t }

function wilson95(p: number, n: number) { const z = 1.96; const denom = 1 + (z*z)/n; const center = (p + (z*z)/(2*n)) / denom; const half = (z * Math.sqrt((p*(1-p))/n + (z*z)/(4*n*n))) / denom; return { lo: center - half, hi: center + half } }

// ===== CSV parser (no regex/escapes) =====
async function parseCsv(text: string): Promise<UploadRow[]> {
  const COMMA=44, QUOTE=34, CR=13, LF=10
  const rows: string[][] = []
  let row: string[] = [], field: string[] = []
  let i = 0, inQ = false
  if (text && text.charCodeAt(0) === 65279) text = text.slice(1)
  while (i < text.length) {
    const c = text.charCodeAt(i)
    if (inQ) {
      if (c === QUOTE) {
        if (text.charCodeAt(i+1) === QUOTE) { field.push('"'); i+=2; continue }
        inQ = false; i++; continue
      }
      field.push(text[i]); i++; continue
    }
    if (c === QUOTE) { inQ = true; i++; continue }
    if (c === COMMA) { row.push(field.join('')); field.length = 0; i++; continue }
    if (c === CR) { row.push(field.join('')); field.length=0; rows.push(row); row=[]; i++; if (text.charCodeAt(i)===LF) i++; continue }
    if (c === LF) { row.push(field.join('')); field.length=0; rows.push(row); row=[]; i++; continue }
    field.push(text[i]); i++
  }
  row.push(field.join('')); rows.push(row)
  const cleaned = rows.filter(r => r.some(c => c && c.trim().length>0))
  if (!cleaned.length) return []
  const header = cleaned[0].map(h => h.trim())
  const required = ['concept_a','code_a','concept_b','code_b','system_a','system_b','type_a','type_b','cooc_obs','nA','nB','total_persons','cooc_event_count','a_before_b']
  for (const r of required) if (!header.includes(r)) throw new Error(`Missing required column: ${r}`)
  const idx: Record<string, number> = Object.fromEntries(header.map((h,i2)=>[h,i2]))
  const out: UploadRow[] = []
  for (let r=1; r<cleaned.length; r++) {
    const cols = cleaned[r]
    while (cols.length < header.length) cols.push('')
    out.push({
      concept_a: cols[idx['concept_a']], code_a: cols[idx['code_a']],
      concept_b: cols[idx['concept_b']], code_b: cols[idx['code_b']],
      system_a: cols[idx['system_a']], system_b: cols[idx['system_b']],
      type_a: cols[idx['type_a']], type_b: cols[idx['type_b']],
      cooc_obs: cols[idx['cooc_obs']], nA: cols[idx['nA']], nB: cols[idx['nB']],
      total_persons: cols[idx['total_persons']], cooc_event_count: cols[idx['cooc_event_count']], a_before_b: cols[idx['a_before_b']],
    })
  }
  return out
}

// ===== Stats & transforms =====
function computeStats(row: MasterRecord): MasterRecord {
  const cooc_obs = num(row.cooc_obs), nA = num(row.nA), nB = num(row.nB), total = num(row.total_persons)
  const a_before_b = num(row.a_before_b), b_before_a = Math.max(0, num(row.cooc_event_count) - a_before_b)
  const expected = nA && nB && total ? (nA*nB)/total : 0
  const lift = expected>0 ? cooc_obs/expected : 0
  const z = expected>0 ? (cooc_obs - expected)/Math.sqrt(expected) : 0
  const dirDen = a_before_b + b_before_a, dir = dirDen>0 ? a_before_b/dirDen : 0
  const { lo, hi } = dirDen>0 ? wilson95(dir, dirDen) : { lo:0, hi:0 }
  return {
    ...row,
    expected_obs: round(expected,2), lift: round(lift,4), z_score: round(z,4), directionality_ratio: round(dir,4),
    lift_lower_95: lift>0 && cooc_obs>0 && expected>0 ? round(Math.exp(Math.log(lift) - 1.96*Math.sqrt(1/cooc_obs + 1/expected)),4) : 0,
    lift_upper_95: lift>0 && cooc_obs>0 && expected>0 ? round(Math.exp(Math.log(lift) + 1.96*Math.sqrt(1/cooc_obs + 1/expected)),4) : 0,
    RATIONALE: row.RATIONALE ?? `Wilson95 A→B proportion=${round(dir,4)} N=${dirDen} [${round(lo,4)}, ${round(hi,4)}]`,
  }
}

function mergeCountsAndCompute(row: UploadRow): MasterRecord {
  const m: MasterRecord = {
    concept_a: num(row.concept_a), code_a: s(row.code_a), system_a: s(row.system_a),
    concept_b: num(row.concept_b), code_b: s(row.code_b), system_b: s(row.system_b),
    cooc_obs: num(row.cooc_obs), nA: num(row.nA), nB: num(row.nB), total_persons: num(row.total_persons), cooc_event_count: num(row.cooc_event_count), a_before_b: num(row.a_before_b),
    REL_TYPE: null, REL_TYPE_T: null, RATIONALE: null,
  }
  return computeStats(m)
}

function masterKeySnake(m: MasterRecord) {
  return { concept_a: m.concept_a, concept_b: m.concept_b, code_a: trimLen(m.code_a,64), code_b: trimLen(m.code_b,64), system_a: trimLen(m.system_a,32), system_b: trimLen(m.system_b,32) }
}

// ===== LLM classifier (optional) =====
const OPENAI_MODEL = process.env.OPENAI_MODEL
async function classifyRelationship(m: MasterRecord): Promise<Pick<MasterRecord,'REL_TYPE'|'REL_TYPE_T'|'RATIONALE'>> {
  try {
    const rsp = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: 'You are a concise clinical reviewer. Return JSON only.' },
        { role: 'user', content: `Return JSON with REL_TYPE, REL_TYPE_T, RATIONALE for {concept_a:${m.concept_a}, code_a:"${m.code_a}", concept_b:${m.concept_b}, code_b:"${m.code_b}"}` },
      ],
      temperature: 0,
    })
    const txt = rsp.choices?.[0]?.message?.content ?? '{}'
    const j = JSON.parse(txt)
    return { REL_TYPE: trimLen(j.REL_TYPE,32), REL_TYPE_T: trimLen(j.REL_TYPE_T,64), RATIONALE: trimLen(j.RATIONALE,500) }
  } catch {
    return { REL_TYPE: null, REL_TYPE_T: null, RATIONALE: 'LLM unavailable' }
  }
}

// ===== Prisma writes (snake_case schema) =====
async function incrementSourceCount(m: MasterRecord) {
  const where = masterKeySnake(m)
  const res = await db.masterRecord.updateMany({ where, data: { source_count: { increment: 1 } } })
  if (res.count === 0) { await db.masterRecord.create({ data: { ...where, source_count: 1 } }) }
}

async function upsertMaster(m: MasterRecord) {
  const where = masterKeySnake(m)
  const data = {
    cooc_obs: m.cooc_obs,
    n_a: m.nA,
    n_b: m.nB,
    total_persons: m.total_persons,
    cooc_event_count: m.cooc_event_count,
    a_before_b: m.a_before_b,
    expected_obs: m.expected_obs,
    lift: m.lift,
    lift_lower_95: m.lift_lower_95,
    lift_upper_95: m.lift_upper_95,
    z_score: m.z_score,
    directionality_ratio: m.directionality_ratio,
    rel_type: m.REL_TYPE,
    rel_type_t: m.REL_TYPE_T,
    rationale: m.RATIONALE,
  }
  const res = await db.masterRecord.updateMany({ where, data })
  if (res.count === 0) { await db.masterRecord.create({ data: { ...where, ...data, source_count: 1 } }) }
}

async function finalizeMasterSnapshot() { /* no-op */ }

// ===== Netlify Blobs helpers =====
async function readBlobText(store: any, key: string): Promise<string> { const res = await store.get(key); if (!res) throw new Error(`Blob not found: ${key}`); return await res.text() }
async function writeBlobText(store: any, key: string, text: string): Promise<void> { await store.set(key, text, { access: 'public', contentType: 'text/csv' }) }

// ===== Handler =====
export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
    const { jobId, uploadKey, outputKey, classify = true } = await req.json()
    if (!uploadKey || !outputKey) throw new Error('uploadKey and outputKey required')

    // job mark running (best-effort)
    try { await db.job.update({ where: { id: jobId }, data: { status: 'running', started_at: new Date() } }) } catch {}

    await ensureStores()
    const csv = await readBlobText(uploads, uploadKey)
    const rows = await parseCsv(csv)

    const out: MasterRecord[] = []
    let calls = 0
    for (const r of rows) {
      const m = mergeCountsAndCompute(r)
      if (classify && calls < Number(process.env.LLM_MAX_CALLS_PER_JOB ?? '50')) {
        const rel = await classifyRelationship(m)
        Object.assign(m, rel)
        calls++
      }
      await incrementSourceCount(m)
      await upsertMaster(m)
      out.push(m)
    }

    await finalizeMasterSnapshot()

    // Output CSV
    const header = [
      'concept_a','code_a','system_a','concept_b','code_b','system_b',
      'cooc_obs','nA','nB','total_persons','cooc_event_count','a_before_b',
      'expected_obs','lift','lift_lower_95','lift_upper_95','z_score','directionality_ratio',
      'REL_TYPE','REL_TYPE_T','RATIONALE'
    ]
    const lines = [header.join(',')]
    for (const m of out) {
      lines.push([
        m.concept_a, m.code_a, m.system_a, m.concept_b, m.code_b, m.system_b,
        m.cooc_obs, m.nA, m.nB, m.total_persons, m.cooc_event_count, m.a_before_b,
        round(m.expected_obs,2), round(m.lift,4), round(m.lift_lower_95,4), round(m.lift_upper_95,4), round(m.z_score,4), round(m.directionality_ratio,4),
        trimLen(m.REL_TYPE,32), trimLen(m.REL_TYPE_T,64), trimLen(m.RATIONALE,500)
      ].join(','))
    }
    await writeBlobText(outputs, outputKey, lines.join(NL))

    try { await db.job.update({ where: { id: jobId }, data: { status: 'succeeded', finished_at: new Date() } }) } catch {}

    return new Response(JSON.stringify({ ok: true, records: out.length }), { status: 200 })
  } catch (err: any) {
    try { const body = await req.json(); if (body?.jobId) { await db.job.update({ where: { id: body.jobId }, data: { status: 'failed', error: String(err?.message ?? err) } }) } } catch {}
    return new Response('ERROR', { status: 500 })
  }
}
