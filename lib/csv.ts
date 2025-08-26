// =============================================
// lib/csv.ts — CSV helpers
// =============================================
// --- file: lib/csv.ts ---
import { parse as parseCsv } from "csv-parse/sync";
import { stringify as stringifyCsv } from "csv-stringify/sync";

export function parseCsvText(input: string): Record<string, string>[] {
  return parseCsv(input, { columns: true, skip_empty_lines: true, trim: true });
}

export function toCsv(rows: Record<string, any>[]) {
  return stringifyCsv(rows, { header: true });
}

