// Netlify Function to download a processed CSV by jobId
// Path: /.netlify/functions/download?jobId=<UUID>

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

    // 1) Try common candidate keys
    const candidates = [
      `${jobId}.csv`,
      `${jobId}/results.csv`,
      `${jobId}/output.csv`,
      jobId,
    ];

    let body: string | null = null;
    let hitKey: string | undefined;

    for (const k of candidates) {
      try {
        const v = await store.get(k); // string | null in Node runtime
        if (v) { body = v as string; hitKey = k; break; }
      } catch (e) {
        // keep trying
      }
    }

    // 2) If still not found, list by prefix and pick a CSV if present, otherwise first item
    let listed: string[] = [];
    if (!body) {
      try {
        // @netlify/blobs list API returns { blobs: [{ key, size, uploadedAt, ... }], cursor? }
        const res: any = await (store as any).list?.({ prefix: jobId });
        const blobs: Array<{ key: string }> = res?.blobs ?? [];
        listed = blobs.map(b => b.key);
        const csv = blobs.find(b => b.key.toLowerCase().endsWith('.csv')) || blobs[0];
        if (csv) {
          const v = await store.get(csv.key);
          if (v) { body = v as string; hitKey = csv.key; }
        }
      } catch (e) {
        // ignore listing errors
      }
    }

    if (!body) {
      // Make the error explicit, so if the browser downloads it, you can read why
      return {
        statusCode: 404,
        headers: { "Content-Type": "text/plain" },
        body: `file not found for jobId=${jobId}. Tried: ${candidates.join(', ')}${listed.length ? `; listed: ${listed.join(', ')}` : ''}`,
      };
    }

    const filename = `${safeBase(`job-${jobId}`)}-results.csv`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
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
