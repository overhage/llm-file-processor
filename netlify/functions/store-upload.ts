// netlify/functions/store-upload.ts — Buffer→ArrayBuffer fix (env-aware)
// Keeps this as a Netlify Function (uses Netlify env); avoids '@netlify/functions' types.

import { getStore } from '@netlify/blobs'

const DEFAULT_STORE = process.env.UPLOADS_STORE ?? 'uploads'

function getEnvAwareStore(name = DEFAULT_STORE) {
  const siteID =
    process.env.NETLIFY_SITE_ID ||
    (process.env as any).NF_SITE_ID ||
    process.env.SITE_ID ||
    undefined
  const token =
    process.env.NETLIFY_BLOBS_TOKEN ||
    process.env.NETLIFY_AUTH_TOKEN ||
    process.env.BLOBS_TOKEN ||
    undefined

  // If siteID/token provided (e.g., local dev), pass them explicitly
  if (siteID && token) {
    return getStore({ name, siteID, token })
  }
  // Otherwise rely on Netlify environment
  return getStore(name)
}

export const handler = async (event: any) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' }
    }

    const key = event.queryStringParameters?.key || event.headers?.['x-key']
    if (!key || typeof key !== 'string') {
      return { statusCode: 400, body: 'Missing blob key' }
    }

    const originalName = String(event.headers?.['x-original-name'] || 'upload.csv')
    const userId = String(event.headers?.['x-user-id'] || 'anonymous')
    const contentType = String(event.headers?.['content-type'] || 'text/plain')
    const storeName = String(event.headers?.['x-uploads-store'] || DEFAULT_STORE)

    // Netlify passes request body as string; may be base64-encoded.
    const raw = event.body || ''
    const buf = event.isBase64Encoded ? Buffer.from(raw, 'base64') : Buffer.from(raw, 'utf8')

    // Convert Buffer -> exact ArrayBuffer slice (BlobInput without DOM Blob)
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)

    const store = getEnvAwareStore(storeName)
    await store.set(key, ab, {
      // SetOptions has no contentType field; keep MIME in metadata if you care downstream
      metadata: {
        userId,
        originalName,
        length: String(buf.byteLength),
        contentType,
      },
    })

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, key }),
    }
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'text/plain' },
      body: String(err?.message ?? err),
    }
  }
}
