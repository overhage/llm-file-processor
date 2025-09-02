// netlify/functions/store-upload.ts — compat with JSON+base64 or raw body
// - Accepts JSON { filename, contentType, data (base64), key? } from Next route
// - Also accepts legacy raw body with query/header-provided key
// - Uses Netlify Blobs with env-aware configuration

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

  return siteID && token ? getStore({ name, siteID, token }) : getStore(name)
}

function sanitizeFilename(name: string) {
  return (name || 'upload.csv').replace(/[^A-Za-z0-9._-]/g, '_')
}

export const handler = async (event: any) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' }
    }

    const headers = event.headers || {}
    const contentType = String(headers['content-type'] || headers['Content-Type'] || '')
    const storeName = String(headers['x-uploads-store'] || DEFAULT_STORE)
    const userId = String(headers['x-user-id'] || 'anonymous')

    const store = getEnvAwareStore(storeName)

    // Path A: JSON payload from Next route { filename, contentType, data, key? }
    if (contentType.startsWith('application/json')) {
      const body = JSON.parse(event.body || '{}')
      const filename = sanitizeFilename(String(body.filename || 'upload.csv'))
      const mime = String(body.contentType || 'text/csv')
      let key = String(body.key || '')
      if (!key) key = `uploads/${Date.now()}_${filename}`

      const base64 = String(body.data || '')
      if (!base64) {
        return { statusCode: 400, body: 'Missing data (base64) in JSON body' }
      }
      const buf = Buffer.from(base64, 'base64')
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)

      await store.set(key, ab, {
        metadata: { userId, originalName: filename, length: String(buf.byteLength), contentType: mime },
      })

      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true, key, size: buf.byteLength, contentType: mime }),
      }
    }

    // Path B: legacy/raw body with explicit key (query or header)
    const key = event.queryStringParameters?.key || headers['x-key']
    if (!key || typeof key !== 'string') {
      return { statusCode: 400, body: 'Missing blob key' }
    }

    // Netlify may base64-encode body depending on content. Support both.
    const raw = event.body || ''
    const isB64 = !!event.isBase64Encoded || /^[-A-Za-z0-9+/=]+$/.test(raw)
    const buf = Buffer.from(raw, isB64 ? 'base64' : 'utf8')
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)

    const originalName = sanitizeFilename(String(headers['x-original-name'] || 'upload.csv'))
    const mime = String(headers['content-type'] || 'text/plain')

    await store.set(key, ab, {
      metadata: { userId, originalName, length: String(buf.byteLength), contentType: mime },
    })

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, key, size: buf.byteLength, contentType: mime }),
    }
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'text/plain' },
      body: String(err?.message ?? err),
    }
  }
}
