// netlify/functions/process-upload-background.mts
import { getStore } from "@netlify/blobs";
import { prisma } from "../../lib/db.js";
import { runLlmBatch } from "../../lib/llm.js";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";

const UPLOADS = "uploads";
const OUTPUTS = "outputs";

// ---------- utils ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function safeStr(s: unknown, max: number): string {
  if (s == null) return "";
  const v = String(s);
  return v.length > max ? v.slice(0, max) : v;
}

function toInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toFloat(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// CSV schema (headers expected from your earlier spec)
const CsvRow = z.object({
  "Concept A": z.string().optional(),
  "Code A": z.string().optional(),
  "System A": z.string().optional(),
  "Type A": z.string().optional(),
  "Concept B": z.string().optional(),
  "Code B": z.string().optional(),
  "System B": z.string().optional(),
  "Type B": z.string().optional(),
  "counts_AB": z.union([z.string(), z.number()]).optional(),
  "Lift": z.union([z.string(), z.number()]).optional(),
  "Relationship Type": z.string().optional(),
  "Relationship Code": z.union([z.string(), z.number()]).optional(),
  "Rational": z.string().optional(),
  "Source Count": z.union([z.string(), z.number()]).optional(),
  "Status": z.union([z.string(), z.number()]).optional(),
  "Pair ID": z.string(),
});

export default async function handler(req: Request) {
  if (req.method !== "POST")
    return new Response("Use POST", { status: 405 });

  const startedAt = new Date();

  const { jobId, userId, uploadBlobKey, originalName } = (await req.json()) as {
    jobId: string;
    userId: string;
    uploadBlobKey: string;
    originalName?: string;
  };

  // Mark job running
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "running", startedAt, error: null },
  });

  try {
    // 1) Load uploaded CSV
    const up = getStore(UPLOADS);
    const raw = await up.get(uploadBlobKey);
    if (raw == null) throw new Error(`Upload not found: ${uploadBlobKey}`);
    const csv = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8");

    // 2) Parse and validate rows
    const rows: unknown[] = parse(csv, { columns: true, skip_empty_lines: true });
    const valid: z.infer<typeof CsvRow>[] = [];
    const bad: { index: number; error: string }[] = [];
    rows.forEach((r, i) => {
      const v = CsvRow.safeParse(r);
      if (v.success) valid.push(v.data);
      else bad.push({ index: i, error: v.error.message });
    });

    // If many invalid rows, fail fast to save costs
    if (bad.length > 0 && bad.length > Math.ceil(rows.length * 0.25)) {
      throw new Error(`CSV validation failed for ${bad.length} of ${rows.length} rows`);
    }

    // 3) Upsert MasterRecord shells & collect LLM inputs
    const inputs: {
      pairId: string;
      conceptA?: string;
      conceptB?: string;
      typeA?: string;
      typeB?: string;
    }[] = [];

    for (const r of valid) {
      const pairId = safeStr(r["Pair ID"], 255);
      const conceptA = safeStr(r["Concept A"] ?? "", 255);
      const codeA = safeStr(r["Code A"] ?? "", 20);
      const systemA = safeStr(r["System A"] ?? "", 12);
      const typeA = safeStr(r["Type A"] ?? "", 20);

      const conceptB = safeStr(r["Concept B"] ?? "", 255);
      const codeB = safeStr(r["Code B"] ?? "", 20);
      const systemB = safeStr(r["System B"] ?? "", 12);
      const typeB = safeStr(r["Type B"] ?? "", 20);

      const countsAB = toInt(r["counts_AB"] ?? 0) ?? 0;
      const lift = toFloat(r["Lift"] ?? null);

      await prisma.masterRecord.upsert({
        where: { pairId },
        update: {
          conceptA, codeA, systemA, typeA,
          conceptB, codeB, systemB, typeB,
          countsAB, lift: lift ?? undefined,
        },
        create: {
          pairId,
          conceptA, codeA, systemA, typeA,
          conceptB, codeB, systemB, typeB,
          countsAB, lift: lift ?? undefined,
          // placeholders for enrichment
          relationshipType: "",
          relationshipCode: 0,
          rational: "",
        },
      });

      // decide if this row needs LLM enrichment (no rational yet)
      const m = await prisma.masterRecord.findUnique({
        where: { pairId },
        select: { rational: true },
      });
      if (!m?.rational) {
        inputs.push({ pairId, conceptA, conceptB, typeA, typeB });
      }
    }

    // 4) Batch LLM calls with retries; accumulate token usage to Job
    const BATCH = Number(process.env.LLM_BATCH ?? 20);
    let totalIn = 0;
    let totalOut = 0;

    for (const slice of chunk(inputs, BATCH)) {
      let attempts = 0;
      while (true) {
        try {
          const out = await runLlmBatch(slice); // uses env OPENAI_MODEL
          for (const o of out) {
            totalIn += o.usage?.promptTokens ?? 0;
            totalOut += o.usage?.completionTokens ?? 0;

            await prisma.masterRecord.update({
              where: { pairId: o.pairId },
              data: {
                rational: safeStr(o.rational ?? "", 255),
                relationshipType: safeStr(o.relationshipType ?? "", 12),
                relationshipCode:
                  typeof o.relationshipCode === "number" ? o.relationshipCode : undefined,
                llmDate: new Date(),
                llmName: process.env.OPENAI_MODEL?.trim(),
                llmVersion: process.env.OPENAI_MODEL?.trim(),
              },
            });
          }

          // progress
          const processed = Math.min(
            (await prisma.job.findUnique({ where: { id: jobId }, select: { rowsProcessed: true } }))?.rowsProcessed ?? 0
              + slice.length,
            inputs.length
          );
          await prisma.job.update({
            where: { id: jobId },
            data: { rowsProcessed: processed, rowsTotal: inputs.length, tokensIn: totalIn, tokensOut: totalOut },
          });

          // next slice
          break;
        } catch (e: any) {
          attempts++;
          if (attempts >= 5) throw e;
          await sleep(200 * attempts); // simple backoff
        }
      }
    }

    // 5) Join back and emit enriched CSV
    const enriched = [];
    for (const r of valid) {
      const pairId = String(r["Pair ID"]);
      const m = await prisma.masterRecord.findUnique({ where: { pairId } });

      enriched.push({
        ...r,
        "Relationship Type": m?.relationshipType ?? r["Relationship Type"] ?? "",
        "Relationship Code": m?.relationshipCode ?? r["Relationship Code"] ?? "",
        Rational: m?.rational ?? r["Rational"] ?? "",
        "LLM Date": m?.llmDate ? new Date(m.llmDate).toISOString() : "",
        "LLM Name": m?.llmName ?? "",
        "LLM Version": m?.llmVersion ?? "",
      });
    }

    const outCsv = stringify(enriched, { header: true });
    const outputBlobKey = `${userId}/${jobId}.csv`;
    await getStore(OUTPUTS).set(outputBlobKey, outCsv, {
      metadata: { jobId, userId, source: uploadBlobKey, originalName },
    });

    // 6) Finalize job
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "completed",
        finishedAt: new Date(),
        outputBlobKey,
        rowsTotal: valid.length,
        rowsProcessed: valid.length,
        tokensIn: totalIn || null,
        tokensOut: totalOut || null,
        // costCents: you can compute here if you wish
      },
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err: any) {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error: String(err?.message ?? err),
        finishedAt: new Date(),
      },
    });
    return new Response(String(err?.message ?? err), { status: 500 });
  }
}
