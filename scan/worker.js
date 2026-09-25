// Reads codes off the page's main thread, so the camera view never stutters.
// Messages in: { id, px (RGBA buffer), W, H } or { reset }.
// Messages out: { id, r } with r = { found, id?, dbg }.
self.window = self;
const v = self.location.search;
importScripts(`../sketches/lib.js${v}`, `../app/rs.js${v}`, `../app/tilecode.js${v}`, `scan.js${v}`);

const live = SCAN.session();
self.onmessage = ({ data: m }) => {
  if (m.reset) { live.reset(); return; }
  const dbg = {};
  let r;
  try { r = live.frame(new Uint8ClampedArray(m.px), m.W, m.H, dbg); } catch (err) { r = { found: false }; dbg.error = String(err && err.message); }
  self.postMessage({ id: m.id, r: { ...r, dbg } });
};
