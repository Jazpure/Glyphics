// Shared helpers for the code store: a Cloudflare KV namespace bound as CODES.
// A code's id is 16 hex digits (64 random bits). `m:<id>` holds what the code
// points to, as JSON; a picture's bytes live under `i:<id>`.

export const ID = /^[0-9a-f]{16}$/;
export const MAX_IMAGE = 4 * 1024 * 1024;

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });
}

export function store(env) {
  return env.CODES && typeof env.CODES.put === 'function' ? env.CODES : null;
}

export function newId() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

// Only JPEG, PNG and WebP are kept, recognised by their first bytes (not by
// what the upload claims), so nothing else can be served back from the site.
export function imageType(bytes) {
  const b = new Uint8Array(bytes.slice(0, 12));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}
