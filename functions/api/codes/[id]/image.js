// GET /api/codes/:id/image: the stored picture itself.
import { json, store, ID } from '../../_store.js';

export async function onRequestGet({ params, env }) {
  const kv = store(env);
  if (!kv) return json({ error: 'storage not set up' }, 503);
  const id = String(params.id || '').toLowerCase();
  if (!ID.test(id)) return json({ error: 'not found' }, 404);
  const { value, metadata } = await kv.getWithMetadata(`i:${id}`, { type: 'arrayBuffer' });
  if (!value || !metadata || !metadata.mime) return json({ error: 'not found' }, 404);
  return new Response(value, {
    headers: {
      'Content-Type': metadata.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="glyphics-${id}"`,
    },
  });
}
