// GET /api/codes/:id: what a code points to, as { type: 'url', url } or
// { type: 'image', src }.
import { json, store, ID } from '../../_store.js';

export async function onRequestGet({ params, env }) {
  const kv = store(env);
  if (!kv) return json({ error: 'storage not set up' }, 503);
  const id = String(params.id || '').toLowerCase();
  if (!ID.test(id)) return json({ error: 'not found' }, 404);
  const rec = await kv.get(`m:${id}`, { type: 'json' });
  if (!rec) return json({ error: 'not found' }, 404);
  const cache = { 'Cache-Control': 'public, max-age=3600' };
  if (rec.type === 'image') return json({ type: 'image', src: `/api/codes/${id}/image` }, 200, cache);
  return json({ type: 'url', url: rec.url }, 200, cache);
}
