// app/api/uploads/route.ts (reliable blobs fix)
// Two supported implementations:
//   A) DEFAULT (recommended): proxy upload to Netlify Function `store-upload` so Blobs
//      run inside a fully configured Functions runtime.
//   B) Direct Blobs from Next.js route using explicit siteID/token (if you prefer).
// Flip the flag below to switch. Make sure to follow the setup notes at the top of the file.

const USE_FUNCTION_UPLOAD = true; // set false to use Direct Blobs in this route

// ===================== Common helpers =====================
function bad(msg: string, status = 400) {
  return new Response(msg, { status });
}

function ensureCsvOrTsv(filename?: string, contentType?: string) {
  const okType = (contentType || '').includes('csv') || (contentType || '').includes('tsv') || (contentType || '').includes('plain');
  const okName = (filename || '').toLowerCase().endsWith('.csv') || (filename || '').toLowerCase().endsWith('.tsv');
  if (!okType && !okName) throw new Error('Only CSV/TSV files are accepted');
}

// ===================== A) Recommended: upload via Netlify Function =====================
async function uploadViaFunction(file: File) {
  const filename = file.name || 'upload.csv';
  const contentType = file.type || 'text/csv';
  ensureCsvOrTsv(filename, contentType);
  const buf = Buffer.from(await file.arrayBuffer());

  const siteURL = process.env.NEXT_PUBLIC_SITE_URL || '';
  const endpoint = new URL('/.netlify/functions/store-upload', siteURL || 'http://localhost:8888');

  const res = await fetch(endpoint.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // store-upload should accept base64 body: { filename, contentType, data }
    body: JSON.stringify({ filename, contentType, data: buf.toString('base64') }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`store-upload failed: ${res.status} ${txt}`);
  }
  return res.json(); // { key, url, size, contentType }
}

// ===================== B) Direct Blobs from the route (explicit siteID/token) =====================
// Requirements:
//   • Set env vars in Netlify: NETLIFY_SITE_ID, NETLIFY_BLOBS_WRITE_TOKEN (Write scope)
//   • Keep UPLOADS_STORE to the same name used by your Functions (e.g., 'uploads')

async function uploadDirectFromRoute(file: File) {
  const filename = file.name || 'upload.csv';
  const contentType = file.type || 'text/csv';
  ensureCsvOrTsv(filename, contentType);

  const { getStore } = await import('@netlify/blobs');
  const uploads = getStore({
    name: process.env.UPLOADS_STORE || 'uploads',
    siteID: process.env.NETLIFY_SITE_ID!,
    token: process.env.NETLIFY_BLOBS_WRITE_TOKEN!,
    consistency: 'strong',
  });

  // Use a timestamped key to avoid collisions
  const key = `uploads/${Date.now()}_${filename.replace(/[^A-Za-z0-9._-]/g, '_')}`;

  const buf = Buffer.from(await file.arrayBuffer());
  await uploads.set(key, buf, { access: 'public', contentType });

  const url = await uploads.getSignedUrl(key, { mode: 'r', expiresIn: 60 * 60 }); // 1h signed URL
  return { key, url, size: buf.length, contentType };
}

// ===================== Next.js Route Handler =====================
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return bad('Missing file field');

    const result = USE_FUNCTION_UPLOAD
      ? await uploadViaFunction(file)
      : await uploadDirectFromRoute(file);

    return new Response(JSON.stringify({ ok: true, upload: result }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Upload failed', err);
    return bad(`Upload failed ${err?.message || String(err)}`, 500);
  }
}

// GET is optional: could be used to sanity-check configuration
export async function GET() {
  return new Response('OK', { status: 200 });
}
