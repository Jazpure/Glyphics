/* Glyphics generator: one generative system melding round 8's Heavy Tail,
   Fractal Vacuoles and Maximal Collage, with their bloom and swirl variants.
   Each of those is a point in a small parameter space:
     bloom    0 straight growth … 1 tiny at the centre, large at the rim
     swirl    0 straight spokes, ± for spiral arms
     vacuole  share of large shapes that hold an inner radiant
     collage  share of spokes drawn in a style other than flat
     giants, shadow, density, and free-zone colour weights
   A code's parameters come from its content (a link or an image) and a seed.
   The ID always goes into the data rings (see sketches/r8/code.js). */
(function () {
  const { TAU, O, ovalR, ovalPath, paper, inOval, pack } = window.GL;
  const { HAIR, on } = window.KIT;
  const { bead, sequence, spokeCells } = window.STRANDS;
  const { BOLD, STARRY, DESIGNS, radiant, sizing, toItems, itemPath, moved, STYLE } = window.RADIANT;
  const C = window.CODE;

  const BLACK = '#0a0a0a', WHITE = '#ffffff';
  const ALL = STARRY.concat(['tri3', 'pent', 'hex', 'oct', 'flower', 'cog', 'burst', 'asterisk', 'blobby', 'cross', 'crescent', 'drop', 'semi', 'arch', 'trefoil', 'quatrefoil', 'target', 'bowtie', 'chevron', 'kite']);
  const HOSTS = ['circle', 'circle', 'hex', 'oct', 'flower', 'cog', 'squircle', 'trefoil', 'quatrefoil', 'blobby', 'pent', 'burst'];
  const DESIGNS_ALL = DESIGNS.concat(BOLD, BOLD);
  const FREE = [[0.16, 0.405], [0.515, 0.795]];
  const MIN_DATA = 12, MIN_ANY = 2.4;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const weighted = (r, w) => { let t = r.next() * (w[0] + w[1] + w[2]); for (let i = 0; i < 3; i++) { t -= w[i]; if (t <= 0) return C.COLORS[i]; } return C.COLORS[2]; };

  // ---------- drawing ----------
  // Sizes: a gentle field across the oval, a strong jitter per shape, and a
  // mixture that sends some shapes much bigger and some much smaller, so
  // neighbours differ as much as regions do.
  function smoothSizes(r, nz, items) {
    const off = r.range(0, 99), f = r.range(0.008, 0.016);
    for (const it of items) {
      let m = Math.exp(0.55 * nz(it.x * f + off, it.y * f + off) * 1.3 + 0.8 * r.gauss());
      if (r.chance(0.12)) m *= r.range(1.8, 3);
      else if (r.chance(0.16)) m *= r.range(0.3, 0.55);
      m = Math.min(7, Math.max(0.15, m));
      it.l *= m; it.w *= m;
      if (it.w < MIN_ANY) { const k = MIN_ANY / it.w; it.l *= k; it.w *= k; }
      it.size = it.w;
    }
    return items;
  }
  // Shapes touching a data ring take their sector's colour, are never tiny and
  // never wider than their sector.
  function applyCode(items, slots) {
    for (const it of items) {
      const [q, th] = C.polar(it.x, it.y), ext = it.size / 2 / O.ry, b = C.bandHit(q - ext, q + ext);
      if (b < 0) { it.data = false; continue; }
      it.fill = C.COLORS[slots[b * C.SECTORS + C.sectorOf(th)]]; it.fill2 = BLACK; it.fill3 = WHITE; it.data = true;
      const cap = 0.72 * C.sectorWidth(b, th), s = Math.max(it.l, it.w);
      if (s > cap) { const k = cap / s; it.l *= k; it.w *= k; }
      it.size = Math.max(it.l, it.w);
      if (it.size < MIN_DATA) { const k = MIN_DATA / it.size; it.l *= k; it.w *= k; it.size = MIN_DATA; }
    }
    return items.sort((a, b) => a.size - b.size);
  }
  function shadowPass(ctx, r, nz, items, d) {
    const a = r.range(0, TAU), sx = Math.cos(a) * d, sy = Math.sin(a) * d;
    ctx.fillStyle = WHITE;
    for (const it of items) { itemPath(ctx, nz, moved(it, sx, sy)); ctx.fill('evenodd'); }
  }
  function giants(r, n, w) {
    return pack(r, {
      n, maxR: 50, gap: 14, tries: 2500, point: (r) => inOval(r, 0.82), rad: (x, y, r) => Math.exp(r.range(Math.log(12), Math.log(48))),
      inside: (x, y, R) => { const q = ovalR(x, y), e = R / O.ry; return FREE.some(([a, b]) => q - e > a && q + e < b); },
    }).map(([x, y, R]) => {
      const fill = weighted(r, w), rest = C.COLORS.filter((c) => c !== fill).concat(BLACK, WHITE);
      return { x, y, a: r.range(0, TAU), l: 2 * R, w: 2 * R * r.range(0.82, 1), kind: 'circle', specBead: r.pick(HOSTS), spec: r.pick(BOLD.concat(['rings', 'dots', 'spokes'])), fill, fill2: r.pick(rest), fill3: r.pick(rest), size: 2 * R, g: 0, data: false };
    });
  }
  // A large shape holding its own inner radiant. Inside a data ring only black
  // and white may appear, so the host's colour stays the vote.
  function host(ctx, r, nz, P, it, inner) {
    const h = { ...it, specBead: r.pick(HOSTS), spec: 'host' };
    itemPath(ctx, nz, h); ctx.fillStyle = it.fill; ctx.fill('evenodd');
    ctx.save(); itemPath(ctx, nz, h); ctx.clip('evenodd');
    const Q = { ...P, ink: on(it.fill), field: it.fill, fills: it.data ? [BLACK, WHITE] : C.COLORS.filter((c) => c !== it.fill).concat(WHITE, BLACK) };
    for (const sp of spokeCells(r, nz, it.x, it.y, it.size / 2, { lenK: 0.8, gap: 1.2, target: r.range(2.5, 4) })) {
      const seq = sequence(r, Q, sp.length, { alphabet: inner, kinds: [1, 2] });
      sp.forEach((c, i) => bead(ctx, seq[i][0], c, seq[i][1], Q.ink, 0.8));
    }
    ctx.restore();
    itemPath(ctx, nz, h); ctx.strokeStyle = WHITE; ctx.lineWidth = 1.6; ctx.stroke();
  }

  // Draw one code into a context already scaled to the 1200 × 900 space.
  function draw(ctx, { id, seed, params: p, overlay = false }) {
    const r = GL.rng(seed), nz = GL.makeNoise(GL.rng(seed ^ 0x9e3779b9)), slots = C.encode(id);
    paper(ctx, WHITE);
    ovalPath(ctx); ctx.fillStyle = BLACK; ctx.fill();
    ctx.save(); ovalPath(ctx); ctx.clip(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const P = { field: BLACK, ink: WHITE, fills: C.COLORS, mono: false, pick: () => weighted(r, p.weights), other: (c) => r.pick(C.COLORS.filter((f) => f !== c)) };

    const t0 = lerp(r.range(10, 14), r.range(11, 16), p.bloom) / p.density;
    const lines = radiant(r, nz, {
      start: 0.15, end: 0.955, swirl: p.swirl, size: sizing(r, nz), gap: r.range(1.5, 3), lenOf: (w, r) => w * r.range(0.8, 1.3),
      target: (rho) => t0 * lerp(0.4 + 1.1 * rho, 0.15 + 1.9 * Math.pow(rho, 1.6), p.bloom),
    });
    const items = applyCode(smoothSizes(r, nz, toItems(r, P, lines, { alphabet: ALL, kinds: [2, 4], spec: 15, specKinds: HOSTS, designs: DESIGNS_ALL, nodes: 0.05, nodeK: [1.3, 4] })), slots);
    // Free shapes lean toward the content's colours.
    for (const it of items) if (!it.data && r.chance(p.react)) it.fill = weighted(r, p.weights);

    if (p.spine) { ctx.strokeStyle = WHITE; ctx.lineWidth = HAIR; ctx.beginPath(); for (const ln of lines) ln.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y))); ctx.stroke(); }
    if (p.shadow > 0.25) shadowPass(ctx, r, nz, items, p.shadow * 3.5);
    const styleOf = lines.map(() => (r.chance(p.collage) ? r.pick(['line', 'pen', 'halftone', 'stipple', 'hatch']) : 'flat'));
    const inner = r.shuffle(['circle', 'dot', 'star', 'ring', 'diamond', 'hex', 'lens', 'star4']).slice(0, 3);
    for (const it of items) {
      if (it.size >= 24 && r.chance(p.vacuole)) host(ctx, r, nz, P, it, inner);
      else STYLE[styleOf[it.g] || 'flat'].item(ctx, r, nz, P, it);
    }
    const G = giants(r, p.giants, p.weights);
    if (p.shadow > 0.25) shadowPass(ctx, r, nz, G, 4);
    for (const g of G) {
      if (r.chance(p.vacuole)) host(ctx, r, nz, P, g, inner);
      else STYLE[r.chance(p.collage) ? r.pick(['halftone', 'hatch']) : 'flat'].item(ctx, r, nz, P, g);
    }
    ctx.restore();
    C.structure(ctx);
    if (overlay) C.overlay(ctx, slots);
  }

  // ---------- content → parameters ----------
  function fnv(input) {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) { h ^= typeof input === 'string' ? input.charCodeAt(i) : input[i]; h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  // The defaults, before any content leans on them.
  function baseParams(r) {
    return {
      bloom: r.range(0, 1), swirl: r.chance(0.35) ? r.range(0.8, 2) * r.sign() : 0,
      vacuole: r.chance(0.4) ? r.range(0.5, 1) : r.range(0, 0.3), collage: r.chance(0.4) ? r.range(0.4, 1) : r.range(0, 0.2),
      giants: r.int(3, 8), shadow: r.range(0.2, 1), density: 1, weights: [1, 1, 1], react: 0, spine: r.chance(0.5),
    };
  }
  function normaliseUrl(text) {
    const t = text.trim();
    if (!t) return null;
    try { const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : 'https://' + t); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u : null; } catch { return null; }
  }
  // A link: the website sets a family look (so pages on one site are
  // siblings), and the page itself nudges it.
  function fromUrl(u) {
    const p = baseParams(GL.rng(fnv(u.hostname.replace(/^www\./, '')))), pr = GL.rng(fnv(u.href));
    p.bloom = clamp01(p.bloom + pr.range(-0.2, 0.2));
    p.collage = clamp01(p.collage + pr.range(-0.15, 0.15));
    p.giants = Math.max(2, p.giants + pr.int(-1, 1));
    return { key: u.href, seed: fnv(u.href), params: p };
  }
  // An image: its colours, brightness, saturation, detail and edge direction.
  function analyseImage(img) {
    const W = 64, H = 48, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true }), s = Math.max(W / img.width, H / img.height);
    x.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
    const d = x.getImageData(0, 0, W, H).data, L = new Float32Array(W * H), w = [0, 0, 0], q = [];
    let lum = 0, sat = 0;
    const HUES = [0, 55, 225], dist = (a, b) => { const e = Math.abs(a - b) % 360; return Math.min(e, 360 - e); };
    for (let i = 0; i < W * H; i++) {
      const R = d[i * 4], G = d[i * 4 + 1], B = d[i * 4 + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      const v = mx / 255, sv = mx ? (mx - mn) / mx : 0;
      L[i] = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255; lum += L[i]; sat += sv;
      q.push(R >> 4, G >> 4, B >> 4);
      if (sv > 0.2 && v > 0.2) {
        let h = mx === R ? ((G - B) / (mx - mn)) * 60 : mx === G ? (2 + (B - R) / (mx - mn)) * 60 : (4 + (R - G) / (mx - mn)) * 60;
        if (h < 0) h += 360;
        const k = HUES.map((hh) => dist(h, hh)), n = k.indexOf(Math.min(...k));
        w[n] += sv * v;
      }
    }
    let gx = 0, gy = 0;
    for (let yy = 1; yy < H - 1; yy++) for (let xx = 1; xx < W - 1; xx++) { const i = yy * W + xx; gx += Math.abs(L[i + 1] - L[i - 1]); gy += Math.abs(L[i + W] - L[i - W]); }
    const n = W * H, tot = w[0] + w[1] + w[2];
    return {
      weights: tot < 1 ? [1, 1, 1] : w.map((v) => Math.max(0.1, v / tot)),
      lum: lum / n, sat: sat / n, edges: clamp01(((gx + gy) / ((W - 2) * (H - 2))) * 4), aniso: (gx - gy) / (gx + gy + 1e-6),
      hash: fnv(q),
    };
  }
  function fromImage(img) {
    const m = analyseImage(img), p = baseParams(GL.rng(m.hash));
    p.bloom = clamp01(m.lum * 1.2 - 0.1);
    p.collage = clamp01(m.sat * 1.3 - 0.1);
    p.density = lerp(0.85, 1.35, m.edges);
    p.swirl = Math.abs(m.aniso) > 0.12 ? Math.max(-2, Math.min(2, m.aniso * 4)) : 0;
    p.weights = m.weights; p.react = 0.75;
    return { key: 'img:' + m.hash.toString(16), seed: m.hash, params: p, metrics: m };
  }

  // Content → ID, stepping past IDs another item already holds.
  function idFor(key, taken) {
    let id = fnv(key) % (C.MAX_ID + 1);
    while (taken[id] && taken[id].key !== key) id = (id + 1) % (C.MAX_ID + 1);
    return id;
  }

  window.GLYPH = { draw, fromUrl, fromImage, analyseImage, normaliseUrl, idFor, fnv, baseParams };
})();
