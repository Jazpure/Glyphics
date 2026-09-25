// POST /api/codes: store a picture (raw JPEG, PNG or WebP body) or a link
// (JSON { url }). Returns { id } for the code to carry.
import { json, store, newId, imageType, MAX_IMAGE } from '../_store.js';

export async function onRequestPost({ request, env }) {
  const kv = store(env);
  if (!kv) return json({ error: 'storage not set up' }, 503);
  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim();
  const id = newId(), created = Date.now();

  if (type === 'application/json') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
    let url;
    try { url = new URL(String(body.url || '')); } catch { return json({ error: 'invalid link' }, 400); }
    if (!/^https?:$/.test(url.protocol) || url.href.length > 2048) return json({ error: 'invalid link' }, 400);
    await kv.put(`m:${id}`, JSON.stringify({ type: 'url', url: url.href, created }));
    return json({ id }, 201);
  }

  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_IMAGE) return json({ error: 'too large' }, 413);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE) return json({ error: 'too large' }, 413);
  const mime = imageType(bytes);
  if (!mime) return json({ error: 'not an image' }, 415);
  await kv.put(`i:${id}`, bytes, { metadata: { mime } });
  await kv.put(`m:${id}`, JSON.stringify({ type: 'image', mime, created }));
  return json({ id }, 201);
}
