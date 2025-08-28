// netlify/functions/process-upload-background.mts
// Background worker: enrich upload with LLM, merge counts into MasterRecord, bump source_count,
// and snapshot MasterRecord for the touched pairs. Keeps all original columns in output and
// appends relationship fields named like MasterRecord: relationshipCode, relationshipType, rational.

import type { Handler } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { parse as parseCsv } from 'csv-parse/sync';
import { prisma } from '@/lib/db';
import { runLlmBatch } from '@/lib/llm';

const UPLOADS_STORE = 'uploads';
const OUTPUTS_STORE = 'outputs';
const LLM_BATCH = Number(process.env.LLM_BATCH || 20);

// CSV row based on your input structure. All values are parsed as strings first.
// We'll coerce counts to integers using toInt().
type CsvRow = {
  concept_a: string;
  ca_concept_name?: string;
  concept_b: string;
  cb_concept_name?: string;
  type_a?: string;
  type_b?: string;
  code_a?: string;
  code_b?: string;
  system_a?: string;
  system_b?: string;
  // counts (string in CSV; convert to number)
  cooc_obs?: string | number;
  nA?: string | number;
  nB?: string | number;
  total_persons?: string | number;
  cooc_event_count?: string | number;
  a_before_b?: string | number;
  b_before_a?: string | number;
  // other statistical columns may be present but are not merged into MasterRecord by this worker
  [k: string]: any;
};

const COUNT_FIELDS = [
  'cooc_obs',
  'nA',
  'nB',
  'total_persons',
  'cooc_event_count',
  'a_before_b',
  'b_before_a',
] as const;

type CountKey = typeof COUNT_FIELDS[number];

type Counts = Record<CountKey, number>;

function toInt(v: unknown): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function emptyCounts(): Counts {
  return COUNT_FIELDS.reduce((acc, k) => {
    acc[k] = 0; return acc;
  }, {} as Counts);
}

// Stable pair id: prefer code/system; otherwise concept ids
function buildPairId(r: CsvRow) {
  const a = r.code_a && r.system_a ? `${r.code_a}:${r.system_a}` : String(r.concept_a);
  const b = r.code_b && r.system_b ? `${r.code_b}:${r.system_b}` : String(r.concept_b);
  return `${a}__${b}`;
}

// Basic CSV escape
function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export const handler: Handler = async (event) => {
  try {
    const { jobId, userId, uploadBlobKey, originalName } =
      JSON.parse(event.body || '{}') as {
        jobId: string;
        userId: string;
        uploadBlobKey: string;
        originalName?: string;
      };

    // Claim the job (avoid double-processing)
    const claimed = await prisma.job.updateMany({
      where: { id: jobId, status: 'queued' },
      data: { status: 'running', startedAt: new Date() },
    });
    if (claimed.count === 0) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true }) };
    }

    // Pull upload CSV
    const uploads = getStore(UPLOADS_STORE);
    const csvText = await uploads.get(uploadBlobKey, { type: 'text' });
    if (!csvText) throw new Error(`Missing upload blob: ${uploadBlobKey}`);

    const rows = parseCsv(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as CsvRow[];

    // Aggregate counts per pair and collect LLM inputs
    type LlmInput = { pairId: string; conceptA: string; conceptB: string; typeA?: string; typeB?: string };
    const byPair = new Map<string, {
      info: LlmInput;
      counts: Counts;
    }>();

    for (const r of rows) {
      const pairId = buildPairId(r);
      const cur = byPair.get(pairId) ?? {
        info: {
          pairId,
          conceptA: (r.ca_concept_name?.trim() || String(r.concept_a)).slice(0, 255),
          conceptB: (r.cb_concept_name?.trim() || String(r.concept_b)).slice(0, 255),
          typeA: r.type_a?.trim(),
          typeB: r.type_b?.trim(),
        },
        counts: emptyCounts(),
      };
      // accumulate counts
      for (const k of COUNT_FIELDS) cur.counts[k] += toInt((r as any)[k]);
      byPair.set(pairId, cur);
    }

    const llmInputs = Array.from(byPair.values()).map(v => v.info);

    // Run LLM in batches (model from env)
    const llmOutputs: Awaited<ReturnType<typeof runLlmBatch>> = [];
    for (let i = 0; i < llmInputs.length; i += LLM_BATCH) {
      const chunk = llmInputs.slice(i, i + LLM_BATCH);
      const out = await runLlmBatch(chunk);
      llmOutputs.push(...out);
    }
    const llmByPair = new Map(llmOutputs.map(o => [o.pairId, o]));

    const llmDate = new Date();
    const llmName = 'openai';
    const llmVersion = process.env.OPENAI_MODEL || undefined;

    // Upsert into MasterRecord: merge counts (increment), set relationship fields, bump source_count
    const touchedPairs = Array.from(byPair.keys());

    for (const pairId of touchedPairs) {
      const { info, counts } = byPair.get(pairId)!;
      const rel = llmByPair.get(pairId);

      // We use create with baseline values; update increments only the counts and source_count,
      // and sets relationship fields & LLM metadata. We do NOT overwrite statistical columns.
      await prisma.masterRecord.upsert({
        where: { pairId },
        create: {
          pairId,
          // concepts/codes/types from CSV (best-effort)
          concept_a: info.conceptA,
          code_a: llmSafe(rFromPair(rows, pairId)?.code_a),
          concept_b: info.conceptB,
          code_b: llmSafe(rFromPair(rows, pairId)?.code_b),
          system_a: llmSafe(rFromPair(rows, pairId)?.system_a),
          system_b: llmSafe(rFromPair(rows, pairId)?.system_b),
          type_a: info.typeA ?? '',
          type_b: info.typeB ?? '',

          // counts from this upload
          cooc_obs: counts.cooc_obs,
          nA: counts.nA,
          nB: counts.nB,
          total_persons: counts.total_persons,
          cooc_event_count: counts.cooc_event_count,
          a_before_b: counts.a_before_b,
          b_before_a: counts.b_before_a,

          // relationship fields from LLM
          relationshipType: rel?.relationshipType ?? '',
          relationshipCode: rel?.relationshipCode ?? 0,
          rational: rel?.rational ?? '',

          // metadata
          source_count: 1,
          llm_date: llmDate,
          llm_name: llmName,
          llm_version: llmVersion,
          status: 'active', // or your preferred default
        },
        update: {
          // increment counts only
          cooc_obs: { increment: counts.cooc_obs },
          nA: { increment: counts.nA },
          nB: { increment: counts.nB },
          total_persons: { increment: counts.total_persons },
          cooc_event_count: { increment: counts.cooc_event_count },
          a_before_b: { increment: counts.a_before_b },
          b_before_a: { increment: counts.b_before_a },

          // set/refresh relationship fields & LLM metadata
          relationshipType: rel?.relationshipType ?? undefined,
          relationshipCode: rel?.relationshipCode ?? undefined,
          rational: rel?.rational ?? undefined,
          llm_date: llmDate,
          llm_name: llmName,
          llm_version: llmVersion,

          // bump source count once per upload per pair
          source_count: { increment: 1 },
        },
      });
    }

    // Build enriched output CSV: keep ALL original columns + add relationship fields (MasterRecord names)
    const outputs = getStore(OUTPUTS_STORE);
    const addCols = ['relationshipCode', 'relationshipType', 'rational'] as const;

    // Determine final header order: original headers + 3 new fields
    const parserPreview = parseCsv(csvText, { columns: false, to_line: 1 }) as string[][];
    const originalHeaders = (parserPreview[0] || []).map(String);
    const finalHeaders = [...originalHeaders, ...addCols];

    const enrichedLines: string[] = [];
    enrichedLines.push(finalHeaders.join(','));

    for (const r of rows) {
      const pairId = buildPairId(r);
      const rel = llmByPair.get(pairId);
      const rowOut: Record<string, any> = { ...r };
      rowOut.relationshipCode = rel?.relationshipCode ?? '';
      rowOut.relationshipType = rel?.relationshipType ?? '';
      rowOut.rational = rel?.rational ?? '';

      enrichedLines.push(finalHeaders.map(h => esc((rowOut as any)[h])).join(','));
    }

    const enrichedKey = `${jobId}.csv`;
    await outputs.set(enrichedKey, enrichedLines.join('\n'), {
      metadata: { source: uploadBlobKey, userId, originalName: originalName ?? '' },
    });

    // Snapshot MasterRecord for touched pairs and retain it
    const masters = await prisma.masterRecord.findMany({
      where: { pairId: { in: touchedPairs } },
      orderBy: { pairId: 'asc' },
    });

    const masterHeaders: (keyof typeof masters[number])[] = [
      'pairId',
      'concept_a','code_a','concept_b','code_b','system_a','system_b','type_a','type_b',
      'cooc_obs','nA','nB','total_persons','cooc_event_count','a_before_b','b_before_a',
      'expected_obs','lift','lift_lower_95','lift_upper_95','z_score','ab_h','a_only_h','b_only_h','neither_h',
      'odds_ratio','or_lower_95','or_upper_95','directionality_ratio','dir_prop_a_before_b','dir_lower_95','dir_upper_95',
      'confidence_a_to_b','confidence_b_to_a',
      'relationshipType','relationshipCode','rational',
      'source_count','llm_date','llm_name','llm_version','human_date','human_reviewer','human_comment','status','createdAt','updatedAt',
    ] as any;

    const masterCsv = [
      (masterHeaders as string[]).join(','),
      ...masters.map(m => (masterHeaders as string[]).map(h => esc((m as any)[h] ?? '')).join(','))
    ].join('\n');

    const snapshotKey = `master-snapshot/${jobId}.csv`;
    await outputs.set(snapshotKey, masterCsv, {
      metadata: { scope: 'master-snapshot', userId },
    });

    // finalize job
    await prisma.job.update({
      where: { id: jobId },
      data: {
        outputBlobKey: enrichedKey,
        rowsTotal: rows.length,
        rowsProcessed: rows.length,
        status: 'completed',
        finishedAt: new Date(),
      },
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true, jobId, outputKey: enrichedKey, masterSnapshot: snapshotKey }) };
  } catch (err: any) {
    try {
      const { jobId } = JSON.parse(event.body || '{}');
      if (jobId) {
        await prisma.job.update({
          where: { id: jobId },
          data: { status: 'failed', error: String(err?.message ?? err), finishedAt: new Date() },
        });
      }
    } catch {}
    console.error('process-upload-background error:', err);
    return { statusCode: 500, body: String(err?.message ?? err) };
  }
};

// Helper to get first CSV row for a pairId (used to populate create fields when missing)
function rFromPair(rows: CsvRow[], pairId: string): CsvRow | undefined {
  return rows.find(r => buildPairId(r) === pairId);
}

function llmSafe(v: unknown): string {
  return (v == null ? '' : String(v)).slice(0, 255);
}
