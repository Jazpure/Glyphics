/* Round 8: Heavy Tail, Fractal Vacuoles and Maximal Collage, made scannable.
   - black ground; red, yellow and blue only; white and black are structure
   - sizes vary continuously (a smooth field times a little jitter), not
     small-or-giant
   - every shape touching a data ring takes its sector's colour (see code.js);
     everything else stays free and generative
   - spokes start outside the hub, and giants live only in the free zones */
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
  // Free zones between and inside the data rings, where giants may sit.
  const FREE = [[0.16, 0.405], [0.515, 0.795]];
  const MIN_DATA = 12, MIN_ANY = 2.4;

  function open8(ctx, r) {
    paper(ctx, WHITE);
    ovalPath(ctx); ctx.fillStyle = BLACK; ctx.fill();
    ctx.save(); ovalPath(ctx); ctx.clip();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    return { field: BLACK, ink: WHITE, fills: C.COLORS, mono: false, pick: () => r.pick(C.COLORS), other: (c) => r.pick(C.COLORS.filter((f) => f !== c)) };
  }
  function close8(ctx, env, slots) {
    ctx.restore();
    C.structure(ctx);
    if (env.overlay) C.overlay(ctx, slots);
  }

  // Wide, continuous sizes: a smooth field across the oval times a strong
  // per-shape jitter (log-normal), so pinpricks, every middle size and large
  // shapes all turn up, neighbours included.
  function smoothSizes(r, nz, items, s1, s2) {
    const off = r.range(0, 99), f = r.range(0.008, 0.016);
    for (const it of items) {
      const m = Math.min(6, Math.max(0.2, Math.exp(s1 * nz(it.x * f + off, it.y * f + off) * 1.3 + s2 * r.gauss())));
      it.l *= m; it.w *= m;
      if (it.w < MIN_ANY) { const k = MIN_ANY / it.w; it.l *= k; it.w *= k; }
      it.size = it.w;
    }
    return items.sort((a, b) => a.size - b.size);
  }
  // Every shape that touches a data ring takes its sector's colour, with only
  // black and white inside it.
  function applyCode(items, slots) {
    for (const it of items) {
      const [q, th] = C.polar(it.x, it.y), ext = it.size / 2 / O.ry, b = C.bandHit(q - ext, q + ext);
      if (b < 0) { it.data = false; continue; }
      it.fill = C.COLORS[slots[b * C.SECTORS + C.sectorOf(th)]]; it.fill2 = BLACK; it.fill3 = WHITE; it.data = true;
      // Shapes that carry data are never tiny (they must survive blur and
      // distance) and never wider than their sector (their colour must not
      // spill into the next one). Big shapes belong to the free zones.
      const cap = 0.72 * C.sectorWidth(b, th), s = Math.max(it.l, it.w);
      if (s > cap) { const k = cap / s; it.l *= k; it.w *= k; }
      it.size = Math.max(it.l, it.w);
      if (it.size < MIN_DATA) { const k = MIN_DATA / it.size; it.l *= k; it.w *= k; it.size = MIN_DATA; }
    }
    return items.sort((a, b) => a.size - b.size);
  }
  function spokes(r, nz, kind) {
    const t0 = kind === 'bloom' ? r.range(11, 16) : r.range(10, 14);
    return radiant(r, nz, {
      start: 0.15, end: 0.955,
      target: kind === 'bloom' ? (rho) => t0 * (0.15 + 1.9 * Math.pow(rho, 1.6)) : (rho) => t0 * (0.4 + 1.1 * rho),
      swirl: kind === 'swirl' ? r.range(1.0, 2.0) * r.sign() : 0,
      size: sizing(r, nz), gap: r.range(1.5, 3), lenOf: (w, r) => w * r.range(0.8, 1.3),
    });
  }
  const itemsFor = (r, nz, P, lines, o = {}) => toItems(r, P, lines, { alphabet: ALL, kinds: [2, 4], spec: 16, specKinds: HOSTS, designs: DESIGNS_ALL, nodes: 0.03, nodeK: [1.3, 3], ...o });
  function shadowPass(ctx, r, nz, items, d = r.range(2, 3.5)) {
    const a = r.range(0, TAU), sx = Math.cos(a) * d, sy = Math.sin(a) * d;
    ctx.fillStyle = WHITE;
    for (const it of items) { itemPath(ctx, nz, moved(it, sx, sy)); ctx.fill('evenodd'); }
  }
  // Giants: bold landmark shapes, sized continuously, only in the free zones.
  function giants(r, n) {
    return pack(r, {
      n, maxR: 50, gap: 14, tries: 2500, point: (r) => inOval(r, 0.82), rad: (x, y, r) => Math.exp(r.range(Math.log(12), Math.log(48))),
      inside: (x, y, R) => { const q = ovalR(x, y), e = R / O.ry; return FREE.some(([a, b]) => q - e > a && q + e < b); },
    }).map(([x, y, R]) => {
      const fill = r.pick(C.COLORS), rest = C.COLORS.filter((c) => c !== fill).concat(BLACK, WHITE);
      return { x, y, a: r.range(0, TAU), l: 2 * R, w: 2 * R * r.range(0.82, 1), kind: 'circle', specBead: r.pick(HOSTS), spec: r.pick(BOLD.concat(['rings', 'dots', 'spokes'])), fill, fill2: r.pick(rest), fill3: r.pick(rest), size: 2 * R, g: 0 };
    });
  }

  // ---------------------------------------------------------- Heavy Tail
  function heavyTail(kind) {
    return (ctx, r, nz, env) => {
      const P = open8(ctx, r), slots = C.encode(env.id ?? 0);
      const lines = spokes(r, nz, kind), items = applyCode(smoothSizes(r, nz, itemsFor(r, nz, P, lines, { nodes: 0.05, nodeK: [1.3, 4] }), 0.75, 0.5), slots);
      if (r.chance(0.5)) { ctx.strokeStyle = WHITE; ctx.lineWidth = HAIR; ctx.beginPath(); for (const ln of lines) ln.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y))); ctx.stroke(); }
      shadowPass(ctx, r, nz, items);
      for (const it of items) STYLE.flat.item(ctx, r, nz, P, it);
      const G = giants(r, r.int(4, 9));
      shadowPass(ctx, r, nz, G, 4);
      for (const g of G) STYLE.flat.item(ctx, r, nz, P, g);
      close8(ctx, env, slots);
    };
  }

  // ---------------------------------------------------- Fractal Vacuoles
  function vacuoles(kind) {
    return (ctx, r, nz, env) => {
      const P = open8(ctx, r), slots = C.encode(env.id ?? 0);
      const lines = spokes(r, nz, kind);
      const items = applyCode(smoothSizes(r, nz, itemsFor(r, nz, P, lines, { spec: 999, nodes: 0.06, nodeK: [1.3, 4] }), 0.75, 0.5), slots)
        .concat(giants(r, r.int(3, 7)).map((g) => ({ ...g, data: false })));
      const inner = r.shuffle(['circle', 'dot', 'star', 'ring', 'diamond', 'hex', 'lens', 'star4']).slice(0, 3);
      for (const it of items) {
        if (it.size < 24) { STYLE.flat.item(ctx, r, nz, P, it); continue; }
        const host = { ...it, specBead: r.pick(HOSTS), spec: 'host' };
        itemPath(ctx, nz, host); ctx.fillStyle = it.fill; ctx.fill('evenodd');
        ctx.save(); itemPath(ctx, nz, host); ctx.clip('evenodd');
        // Inside a data host only black and white may appear, so the host's colour stays the vote.
        const Q = { ...P, ink: on(it.fill), field: it.fill, fills: it.data ? [BLACK, WHITE] : C.COLORS.filter((c) => c !== it.fill).concat(WHITE, BLACK) };
        for (const sp of spokeCells(r, nz, it.x, it.y, it.size / 2, { lenK: 0.8, gap: 1.2, target: r.range(2.5, 4) })) {
          const seq = sequence(r, Q, sp.length, { alphabet: inner, kinds: [1, 2] });
          sp.forEach((c, i) => bead(ctx, seq[i][0], c, seq[i][1], Q.ink, 0.8));
        }
        ctx.restore();
        itemPath(ctx, nz, host); ctx.strokeStyle = WHITE; ctx.lineWidth = 1.6; ctx.stroke();
      }
      close8(ctx, env, slots);
    };
  }

  // ----------------------------------------------------- Maximal Collage
  function maximal(kind) {
    return (ctx, r, nz, env) => {
      const P = open8(ctx, r), slots = C.encode(env.id ?? 0);
      const lines = spokes(r, nz, kind), items = applyCode(smoothSizes(r, nz, itemsFor(r, nz, P, lines, { spec: 14, nodes: 0.05, nodeK: [1.3, 4] }), 0.75, 0.5), slots);
      shadowPass(ctx, r, nz, items, r.range(1.2, 1.8));
      const styles = ['flat', 'flat', 'line', 'pen', 'halftone', 'stipple', 'hatch'], pick = lines.map(() => r.pick(styles)), S = { ...P };
      for (const it of items) STYLE[pick[it.g] || 'flat'].item(ctx, r, nz, S, it);
      const G = giants(r, r.int(4, 8));
      shadowPass(ctx, r, nz, G, 4);
      for (const g of G) STYLE[r.pick(['flat', 'flat', 'halftone', 'hatch'])].item(ctx, r, nz, S, g);
      close8(ctx, env, slots);
    };
  }

  window.SETS = {
    'Heavy Tail': 'Spokes into the centre, with shapes of every size, from pinpricks through the middle range to large.',
    'Fractal Vacuoles': 'Large shapes each hold their own inner radiant. Inside a data ring, the inner beads are black and white only, so the host\'s colour carries the vote.',
    'Maximal Collage': 'A style per spoke, shared white shadows, and bold giants kept to the free zones between the rings.',
  };

  const DIRECTIONS = [
    { set: 'Heavy Tail', name: 'Heavy Tail', from: 'r7 · 8', rule: 'Continuous sizes along straight spokes. Shapes that touch a data ring take their sector\'s colour, and everything else is free.', data: 'two rings × 24 sectors of red, yellow or blue.', draw: heavyTail('tide') },
    { set: 'Heavy Tail', name: 'Heavy Tail Bloom', from: 'r7 · 8 + Bloom', rule: 'Tiny at the hub, growing steeply toward the rim, so the outer ring is carried by the biggest shapes.', data: 'the same rings; the outer ring reads most easily.', draw: heavyTail('bloom') },
    { set: 'Fractal Vacuoles', name: 'Fractal Vacuoles', from: 'r7 · 10', rule: 'Hosts of every size, each with an inner radiant. The rings are coloured by the hosts, and the inner beads stay black and white there.', data: 'host colour per sector.', draw: vacuoles('tide') },
    { set: 'Fractal Vacuoles', name: 'Vacuole Swirl', from: 'r7 · 10 + Swirl', rule: 'The same, with the spokes twisted into arms. The sectors stay fixed while the arms sweep through them.', data: 'host colour per sector.', draw: vacuoles('swirl') },
    { set: 'Maximal Collage', name: 'Maximal Collage', from: 'r7 · 12', rule: 'Every style per spoke, with bold giants floating between the rings. The data rings still read, because line, halftone and hatch all keep the sector\'s colour.', data: 'the rings, read through the collage.', draw: maximal('tide') },
    { set: 'Maximal Collage', name: 'Maximal Bloom', from: 'r7 · 12 + Bloom', rule: 'Maximal Collage on bloom growth: fine at the hub and bold at the rim, with giants in the gap between the rings.', data: 'the rings, read through the collage.', draw: maximal('bloom') },
  ];

  window.DIRECTIONS = DIRECTIONS;
})();
