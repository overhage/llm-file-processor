// app/api/master/download/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import type { MasterRecord } from '@prisma/client';


function csvCell(v: unknown) {
  if (v == null) return '""';
  // Prisma Decimal, Date, etc.
  const s =
    typeof v === 'object' && v !== null && 'toString' in v
      ? (v as any).toString()
      : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

const COLUMNS = [
  'pairId',
  'concept_a',
  'code_a',
  'system_a',
  'type_a',
  'concept_b',
  'code_b',
  'system_b',
  'type_b',
  'cooc_obs',
  'nA',
  'nB',
  'total_persons',
  'cooc_event_count',
  'a_before_b',
  'b_before_a',
  'expected_obs',
  'lift',
  'lift_lower_95',
  'lift_upper_95',
  'z_score',
  'ab_h',
  'a_only_h',
  'b_only_h',
  'neither_h',
  'odds_ratio',
  'or_lower_95',
  'or_upper_95',
  'directionality_ratio',
  'dir_prop_a_before_b',
  'dir_lower_95',
  'dir_upper_95',
  'confidence_a_to_b',
  'confidence_b_to_a',
  'relationshipType',
  'relationshipCode',
  'rational',
  'source_count',
  'llm_date',
  'llm_name',
  'llm_version',
  'human_date',
  'human_reviewer',
  'human_comment',
  'status',
  'createdAt',
  'updatedAt',
] as const;

export async function GET() {
  const file = `master-records-${new Date().toISOString().slice(0, 10)}.csv`;
  const headers = new Headers({
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${file}"`,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const push = (s: string) => controller.enqueue(encoder.encode(s));

      // header
      push(COLUMNS.join(',') + '\n');

  // stream in batches with a stable cursor
const take = 1000;
let cursor: string | null = null;

for (;;) {
  const records: MasterRecord[] = await prisma.masterRecord.findMany({
    ...(cursor ? { cursor: { pairId: cursor }, skip: 1 } : {}),
    orderBy: { pairId: 'asc' },
    take,
  });

  if (records.length === 0) break;

  for (const r of records) {
    const row = COLUMNS.map((k) => csvCell((r as any)[k])).join(',');
    push(row + '\n');
  }

  cursor = records[records.length - 1]!.pairId; // safe: we just checked length > 0
  if (records.length < take) break;
}

      controller.close();
    },
  });

  return new Response(stream, { headers });
}
