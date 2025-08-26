// =============================================
// Background Function — process-upload-background
// =============================================
// Reads CSV from Netlify Blobs, joins with Postgres master table, calls OpenAI in batches,
// writes output CSV back to Blobs, and updates the Job record.
//
// Invoke via POST to "/.netlify/functions/process-upload-background" with JSON body:
// { jobId, userId, uploadBlobKey, originalName }
//
// NOTE: This sample assumes CSV input. For XLSX, read ArrayBuffer and parse with "xlsx".
// =============================================
// --- file: netlify/functions/process-upload-background.mts ---
import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { prisma } from "../../lib/db";
import { parseCsvText, toCsv } from "../../lib/csv";
import { runLlmBatch } from "../../lib/llm";

function computePairId(row: Record<string, any>) {
  if (row.pairId || row.PAIR_ID || row["Pair ID"]) return String(row.pairId ?? row.PAIR_ID ?? row["Pair ID"]).trim();
  const a = String(row.codeA ?? row["Code A"] ?? "").trim();
  const sa = String(row.systemA ?? row["System A"] ?? "").trim();
  const b = String(row.codeB ?? row["Code B"] ?? "").trim();
  const sb = String(row.systemB ?? row["System B"] ?? "").trim();
  if (a && sa && b && sb) return `${sa}:${a}__${sb}:${b}`;
  return "";
}

export default async (req: Request, _context: Context) => {
  const started = Date.now();
  let jobId = "";

  try {
    const { jobId: id, userId, uploadBlobKey, originalName } = (await req.json()) as {
      jobId: string; userId: string; uploadBlobKey: string; originalName: string;
    };
    jobId = id;

    await prisma.job.update({ where: { id: jobId }, data: { status: "running", startedAt: new Date() } });

    const uploads = getStore(process.env.BLOB_STORE_UPLOADS ?? "uploads");
    const csvText = await uploads.get(uploadBlobKey);
    if (csvText == null) throw new Error("Upload not found in Blobs");

    const rows = parseCsvText(csvText);

    const inputs: { pairId: string; conceptA?: string; conceptB?: string; typeA?: string; typeB?: string }[] = [];

    for (const row of rows) {
      const pairId = computePairId(row);
      if (!pairId) continue;

      const conceptA = String(row.conceptA ?? row["Concept A"] ?? "").trim();
      const conceptB = String(row.conceptB ?? row["Concept B"] ?? "").trim();
      const codeA    = String(row.codeA ?? row["Code A"] ?? "").trim();
      const codeB    = String(row.codeB ?? row["Code B"] ?? "").trim();
      const systemA  = String(row.systemA ?? row["System A"] ?? "").trim();
      const systemB  = String(row.systemB ?? row["System B"] ?? "").trim();
      const typeA    = String(row.typeA ?? row["Type A"] ?? "").trim();
      const typeB    = String(row.typeB ?? row["Type B"] ?? "").trim();

      let master = await prisma.masterRecord.findUnique({ where: { pairId } });
      if (!master) {
        master = await prisma.masterRecord.create({
          data: {
            pairId,
            conceptA, codeA, conceptB, codeB,
            systemA, systemB, typeA, typeB,
            countsAB: Number(row.countsAB ?? row["counts_AB"] ?? 0) || 0,
            lift: row.lift ? Number(row.lift) : null,
            relationshipType: String(row.relationshipType ?? row["Relationship Type"] ?? "") || "",
            relationshipCode: Number(row.relationshipCode ?? row["Relationship Code"] ?? 0) || 0,
            rational: String(row.rational ?? row["Rational"] ?? "") || "",
            sourceCount: Number(row.sourceCount ?? row["Source Count"] ?? 0) || 0,
            status: Number(row.status ?? row["Status"] ?? 0) || 0
          }
        });
      }

      if (!master.rational) {
        inputs.push({ pairId, conceptA, conceptB, typeA, typeB });
      }
    }

    const BATCH = Number(process.env.LLM_BATCH ?? 20);
    let tokensIn = 0, tokensOut = 0;

    for (let i = 0; i < inputs.length; i += BATCH) {
      const slice = inputs.slice(i, i + BATCH);
      const out = await runLlmBatch(slice);

      for (const o of out) {
        await prisma.masterRecord.update({
          where: { pairId: o.pairId },
          data: {
            rational: o.rational,
            relationshipType: o.relationshipType ?? undefined,
            relationshipCode: o.relationshipCode ?? undefined,
            llmDate: new Date(),
            llmName: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
            llmVersion: process.env.OPENAI_MODEL ?? "gpt-4o-mini"
          }
        });
        tokensIn += o.usage?.promptTokens ?? 0;
        tokensOut += o.usage?.completionTokens ?? 0;
      }
    }

    const finalRows: Record<string, any>[] = [];
    for (const row of rows) {
      const pairId = computePairId(row);
      if (!pairId) { finalRows.push(row); continue; }
      const m = await prisma.masterRecord.findUnique({ where: { pairId } });
      finalRows.push({
        ...row,
        pairId,
        relationshipType: m?.relationshipType ?? null,
        relationshipCode: m?.relationshipCode ?? null,
        rational: m?.rational ?? null,
        llmDate: m?.llmDate ?? null,
        llmName: m?.llmName ?? null,
        llmVersion: m?.llmVersion ?? null
      });
    }

    const csvOut = toCsv(finalRows);

    const outputs = getStore(process.env.BLOB_STORE_OUTPUTS ?? "outputs");
    const outKey = `${userId}/${jobId}.csv`;
    await outputs.set(outKey, csvOut, { metadata: { originalName, jobId } });

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "completed",
        finishedAt: new Date(),
        rowsTotal: rows.length,
        rowsProcessed: finalRows.length,
        outputBlobKey: outKey,
        tokensIn, tokensOut
      }
    });

    return new Response(null, { status: 202 });
  } catch (err: any) {
    if (jobId) {
      await prisma.job.update({ where: { id: jobId }, data: { status: "failed", error: String(err?.message ?? err), finishedAt: new Date() } }).catch(() => {});
    }
    console.error("Worker failed:", err);
    return new Response(null, { status: 202 });
  } finally {
    const ms = Date.now() - started;
    console.log(`process-upload-background finished in ${ms}ms`);
  }
};

