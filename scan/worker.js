// Reads codes off the page's main thread, so the camera view never stutters.
// Messages in: { frame | photo, px (RGBA buffer), W, H, opts } or { reset }.
// Messages out: the session's result for that frame.
self.window = self;
const v = self.location.search;
importScripts(`../sketches/lib.js${v}`, `../sketches/kit.js${v}`, `../sketches/r8/code.js${v}`, `../app/rs.js${v}`, `../app/imagecode.js${v}`, `scan.js${v}`);

let live = SCAN.session();
self.onmessage = ({ data: m }) => {
  if (m.reset) { live.reset(); return; }
  let r;
  try {
    const px = new Uint8ClampedArray(m.px);
    if (m.photo) {
      // A still: no motion to wait for, so try every pitch and a mirror image too.
      const one = SCAN.session();
      for (let k = 0; k < 3 && !(r && r.kind); k++) r = one.frame(px, m.W, m.H, { tryImage: k === 0, pitches: [7, 10, 8, 9], mirrors: [false, true], steady: 0 });
    } else r = live.frame(px, m.W, m.H, m.opts);
  } catch (err) {
    r = { found: false, error: String(err && err.message) };
  }
  self.postMessage({ id: m.id, r });
};
