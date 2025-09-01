// netlify/functions/donwnload.ts  (but please rename to download.ts)
import { getStore } from "@netlify/blobs";

const OUTPUTS_STORE = process.env.OUTPUTS_STORE || "outputs";

function safeBase(name?: string | null) {
  const base = (name || "").replace(/\.[^./\\]+$/, "");
  return base || "job";
}

// Netlify will run this as a function if it's exported as `handler`.
export async function handler(event: any): Promise<any> {
  try {
    const jobId = event?.queryStringParameters?.jobId;
    if (!jobId) {
      return { statusCode: 400, headers: { "Content-Type": "text/plain" }, body: "missing job id" };
    }

    const store = getStore(OUTPUTS_STORE);
    const keys = [`${jobId}.csv`, jobId];

    let body: string | null = null;
    let hitKey: string | undefined;

    for (const k of keys) {
      try {
        const v = await store.get(k); // string | null in Node
        if (v) { body = v as string; hitKey = k; break; }
      } catch {}
    }

    if (!body) {
      return { statusCode: 404, headers: { "Content-Type": "text/plain" }, body: "file not found for job" };
    }

    const filename = `${safeBase(`job-${jobId}`)}-results.csv`;
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
        ...(hitKey ? { "X-Blob-Key": hitKey } : {}),
      },
      body,
    };
  } catch (err: any) {
    const msg = (err?.message || String(err || "unknown error")).slice(0, 500);
    return { statusCode: 500, headers: { "Content-Type": "text/plain" }, body: `download failed: ${msg}` };
  }
}
