/* Round 9 icon engine: a rectangle of small geometric icons. Each icon is a
   stack of flat layers (a shape, placed once in the middle or repeated at the
   corners, the sides or around a ring), recoloured per tile. */
(function () {
  const { TAU } = window.GL;

  const PALETTES = {
    // From Jasper's reference sheet.
    mix: { ground: '#000000', tile: '#08070d', big: ['#fbcd3a', '#f43b3b', '#1a6bff', '#15a4a6', '#f4ebd3', '#fde8e9'], small: ['#fbcd3a', '#f43b3b', '#1a6bff', '#15a4a6', '#ff6ec3', '#f4ebd3', '#fde8e9'] },
    // The earlier rule: primaries and white only.
    primary: { ground: '#000000', tile: '#070707', big: ['#ff2b1c', '#ffd60a', '#1d4dff', '#ffffff'], small: ['#ff2b1c', '#ffd60a', '#1d4dff', '#ffffff'] },
  };
  const palette = (env) => PALETTES[env.mode] || PALETTES.mix;

  // ---------- shapes: each adds sub-paths around (0, 0) with half-size R ----------
  function poly(c, n, R, a0 = 0) { for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU; i ? c.lineTo(Math.cos(a) * R, Math.sin(a) * R) : c.moveTo(Math.cos(a) * R, Math.sin(a) * R); } c.closePath(); }
  function disc(c, x, y, r) { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
  const SHAPES = {
    circle: (c, R) => disc(c, 0, 0, R),
    diamond: (c, R) => poly(c, 4, R, -TAU / 4),
    square: (c, R, o) => { const k = Math.min(R, (o.round || 0) * R); c.moveTo(-R + k, -R); c.arcTo(R, -R, R, R, k); c.arcTo(R, R, -R, R, k); c.arcTo(-R, R, -R, -R, k); c.arcTo(-R, -R, R, -R, k); c.closePath(); },
    squircle: (c, R) => { for (let i = 0; i <= 72; i++) { const a = (i / 72) * TAU, co = Math.cos(a), si = Math.sin(a), x = Math.sign(co) * Math.abs(co) ** 0.45 * R, y = Math.sign(si) * Math.abs(si) ** 0.45 * R; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); },
    octagon: (c, R) => poly(c, 8, R, TAU / 16),
    hexagon: (c, R) => poly(c, 6, R, 0),
    triangle: (c, R) => poly(c, 3, R, -TAU / 4),
    star: (c, R, o) => { const n = o.n || 8, k = o.k || 0.5; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * TAU - TAU / 4, rr = i % 2 ? R * k : R; i ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); },
    // Four circles in a 2×2, overlapping: a clover with a small hole in the middle.
    quad: (c, R) => { const a = R * 0.5; for (const [x, y] of [[-a, -a], [a, -a], [a, a], [-a, a]]) disc(c, x, y, a * 1.02); },
    // Four lobes on the axes around a filled middle.
    lobes: (c, R) => { const d = R * 0.5; for (const [x, y] of [[0, -d], [d, 0], [0, d], [-d, 0]]) disc(c, x, y, R * 0.5); disc(c, 0, 0, R * 0.55); },
    // Four diamonds on the diagonals, meeting at points, leaving a diamond hole.
    xdiam: (c, R) => { const h = R / 2; for (const [x, y] of [[-h, -h], [h, -h], [h, h], [-h, h]]) { c.moveTo(x, y - h); c.lineTo(x + h, y); c.lineTo(x, y + h); c.lineTo(x - h, y); c.closePath(); } },
    plus: (c, R, o) => { const w = R * (o.w || 0.38); c.moveTo(-w, -R); c.lineTo(w, -R); c.lineTo(w, -w); c.lineTo(R, -w); c.lineTo(R, w); c.lineTo(w, w); c.lineTo(w, R); c.lineTo(-w, R); c.lineTo(-w, w); c.lineTo(-R, w); c.lineTo(-R, -w); c.lineTo(-w, -w); c.closePath(); },
    semi: (c, R) => { c.moveTo(-R, 0); c.arc(0, 0, R, Math.PI, TAU); c.closePath(); },
    quarter: (c, R) => { c.moveTo(0, 0); c.lineTo(R, 0); c.arc(0, 0, R, 0, TAU / 4); c.closePath(); },
    leaf: (c, R) => { const w = R * 0.62; c.moveTo(0, -R); c.quadraticCurveTo(w * 1.6, 0, 0, R); c.quadraticCurveTo(-w * 1.6, 0, 0, -R); c.closePath(); },
    blossom: (c, R, o) => { const n = o.n || 6, rr = R * Math.sin(Math.PI / n) / (1 + Math.sin(Math.PI / n)) * 1.08; for (let i = 0; i < n; i++) { const a = (i / n) * TAU; disc(c, Math.cos(a) * (R - rr), Math.sin(a) * (R - rr), rr); } disc(c, 0, 0, R - rr * 1.2); },
    gear: (c, R, o) => { const n = o.n || 10; for (let i = 0; i < n * 4; i++) { const a = (i / (n * 4)) * TAU, rr = (i >> 1) % 2 ? R * 0.8 : R; i ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); },
    arch: (c, R) => { c.moveTo(-R, R); c.lineTo(-R, 0); c.arc(0, 0, R, Math.PI, TAU); c.lineTo(R, R); c.closePath(); },
    drop: (c, R) => { c.moveTo(0, -R); c.bezierCurveTo(R * 0.9, -R * 0.1, R * 0.8, R, 0, R); c.bezierCurveTo(-R * 0.8, R, -R * 0.9, -R * 0.1, 0, -R); c.closePath(); },
  };

  // Where a layer's copies sit, in units of the icon's half-size.
  function spots(L) {
    const d = L.d ?? 0.6;
    if (L.at === 'diag') return [[-d, -d], [d, -d], [d, d], [-d, d]].map(([x, y]) => [x, y, Math.atan2(y, x)]);
    if (L.at === 'orth') return [[0, -d], [d, 0], [0, d], [-d, 0]].map(([x, y]) => [x, y, Math.atan2(y, x)]);
    if (L.at === 'ring') return Array.from({ length: L.n }, (_, i) => { const a = (i / L.n) * TAU + (L.a0 || 0); return [Math.cos(a) * d, Math.sin(a) * d, a]; });
    if (L.at === 'grid') { const out = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if ((i + j + 2) % 2 === (L.odd ? 1 : 0)) out.push([i * d, j * d, 0]); return out; }
    return [[0, 0, 0]];
  }

  // Draw one icon: layers in order, each in its colour slot ('cut' = the tile ground).
  function drawIcon(ctx, icon, x, y, half, cols, ground) {
    ctx.save(); ctx.translate(x, y); if (icon.rot) ctx.rotate(icon.rot);
    for (const L of icon.layers) {
      const col = L.col === 'cut' ? ground : cols[L.col % cols.length];
      if (L.pattern) { patternLayer(ctx, L, half, col, cols, ground); continue; }
      ctx.fillStyle = col; ctx.beginPath();
      for (const [sx, sy, a] of spots(L)) {
        ctx.save(); ctx.translate(sx * half, sy * half);
        ctx.rotate((L.spin ? a + (L.spinOff || 0) : 0) + (L.rot || 0));
        SHAPES[L.shape](ctx, L.R * half, L.o || {});
        ctx.restore();
      }
      ctx.fill();
    }
    ctx.restore();
  }
  // A shape filled with stripes, dots or checks in a second colour.
  function patternLayer(ctx, L, half, col, cols, ground) {
    ctx.save(); ctx.beginPath(); SHAPES[L.shape](ctx, L.R * half, L.o || {}); ctx.fillStyle = col; ctx.fill(); ctx.clip();
    const ink = L.pattern.col === 'cut' ? ground : cols[L.pattern.col % cols.length], s = half * L.pattern.step, R = L.R * half;
    ctx.fillStyle = ink; ctx.beginPath();
    if (L.pattern.kind === 'stripes') { ctx.rotate(L.pattern.angle || 0); for (let v = -R * 1.5; v < R * 1.5; v += s) ctx.rect(-R * 1.5, v, R * 3, s * 0.5); }
    else if (L.pattern.kind === 'dots') { for (let i = -R; i <= R; i += s) for (let j = -R; j <= R; j += s) disc(ctx, i, j, s * 0.28); }
    else { for (let i = -R; i < R; i += s) for (let j = -R; j < R; j += s) if (((Math.round((i + R) / s) + Math.round((j + R) / s)) & 1) === 0) ctx.rect(i, j, s, s); }
    ctx.fill(); ctx.restore();
  }

  // ---------- motifs: recipes for icons, in colour slots 0-3 ----------
  const ANY = ['circle', 'diamond', 'square', 'star'];
  const T = {
    inset: (r) => [{ shape: r.pick(['circle', 'circle', 'squircle', 'octagon', 'hexagon']), R: r.range(0.8, 0.96), col: 0 },
      { shape: r.pick(['diamond', 'diamond', 'circle', 'star', 'square', 'lobes']), R: r.range(0.3, 0.5), col: 1, o: { n: r.pick([4, 5, 6, 8]), k: 0.45 } }],
    notched: (r) => { const acc = r.pick(['diamond', 'diamond', 'square', 'circle', 'triangle']), two = r.chance(0.5), d = r.range(0.62, 0.7), L = [];
      if (two) L.push({ shape: acc, at: 'diag', d: d + 0.05, R: 0.26, col: 3, spin: true, spinOff: TAU / 4 });
      L.push({ shape: acc, at: 'diag', d, R: 0.25, col: 2, spin: true, spinOff: TAU / 4 }, { shape: r.pick(['circle', 'circle', 'lobes', 'squircle']), R: r.range(0.74, 0.86), col: 0 });
      if (r.chance(0.45)) L.push({ shape: r.pick(['diamond', 'circle']), R: r.range(0.26, 0.38), col: 1 });
      return L; },
    quad: (r) => { const L = [{ shape: 'quad', R: r.range(0.86, 1), col: 0 }]; if (r.chance(0.6)) L.push({ shape: r.pick(['diamond', 'circle', 'square']), R: r.range(0.16, 0.34), col: r.chance(0.4) ? 'cut' : 1 }); return L; },
    flower: (r) => [{ shape: 'lobes', R: r.range(0.8, 0.96), col: 0 }, { shape: r.pick(['circle', 'circle', 'diamond', 'star', 'square']), R: r.range(0.34, 0.5), col: 1, o: { n: 8, k: 0.55 } }],
    xdiam: (r) => { const L = [{ shape: 'xdiam', R: r.range(0.86, 1), col: 0 }]; if (r.chance(0.55)) L.push({ shape: 'circle', at: 'orth', d: 0.5, R: r.range(0.14, 0.2), col: 2 }); if (r.chance(0.55)) L.push({ shape: 'diamond', R: 0.24, col: 1 }); return L; },
    constellation: (r) => { const n = r.pick([4, 4, 8, 8, 12]), sh = r.pick(['circle', 'diamond', 'circle']), d = r.range(0.55, 0.8), L = [{ shape: sh, at: 'ring', n, d, R: r.range(0.1, 0.2) * (n > 8 ? 0.7 : 1), col: 0, a0: r.chance(0.5) ? TAU / (n * 2) : -TAU / 4, spin: true }];
      if (r.chance(0.5)) L.push({ shape: sh === 'circle' ? 'diamond' : 'circle', at: 'ring', n, d: d * 0.55, R: r.range(0.08, 0.14), col: 2, a0: TAU / (n * 2) });
      if (r.chance(0.6)) L.push({ shape: r.pick(['circle', 'diamond', 'square', 'star']), R: r.range(0.18, 0.4), col: 1, o: { n: 4, k: 0.45 } });
      return L; },
    lone: (r) => [{ shape: r.pick(['diamond', 'circle', 'square', 'star', 'diamond']), R: r.range(0.25, 0.45), col: 0, o: { n: 4, k: 0.42, round: 0.3 } }],
    grid3: (r) => [{ shape: r.pick(['diamond', 'square']), at: 'grid', d: 0.62, R: r.range(0.2, 0.26), col: 0 }, { shape: 'circle', at: 'grid', odd: true, d: 0.62, R: r.range(0.14, 0.2), col: 1 }],
    burst: (r) => [{ shape: 'star', R: r.range(0.85, 1), col: 0, o: { n: r.pick([8, 10, 12, 16]), k: r.range(0.55, 0.78) } }, { shape: r.pick(['circle', 'diamond']), R: r.range(0.3, 0.45), col: 1 }],
    target: (r) => { const L = [], sh = r.pick(['circle', 'circle', 'diamond', 'square', 'octagon']), k = r.int(3, 5); for (let i = 0; i < k; i++) L.push({ shape: sh, R: 0.95 * (1 - i / k), col: i % 2 ? (r.chance(0.5) ? 'cut' : 1) : i ? 2 : 0, o: { round: 0.25 } }); return L; },
    semis: (r) => { const L = [{ shape: 'semi', at: 'orth', d: r.range(0.45, 0.6), R: r.range(0.36, 0.46), col: 0, spin: true, spinOff: r.chance(0.5) ? TAU / 4 : -TAU / 4 }]; if (r.chance(0.7)) L.push({ shape: r.pick(ANY), R: r.range(0.18, 0.3), col: 1, o: { n: 4, k: 0.4 } }); return L; },
    pinwheel: (r) => [{ shape: r.pick(['quarter', 'triangle', 'leaf', 'semi']), at: 'diag', d: r.range(0.3, 0.42), R: r.range(0.42, 0.55), col: 0, spin: true, spinOff: r.range(0, TAU) }, ...(r.chance(0.5) ? [{ shape: 'circle', R: r.range(0.12, 0.22), col: 1 }] : [])],
    plus: (r) => [{ shape: 'plus', R: r.range(0.8, 0.96), col: 0, o: { w: r.range(0.26, 0.42) } }, { shape: r.pick(['diamond', 'circle', 'square']), R: r.range(0.2, 0.34), col: 1 }],
    petals: (r) => { const n = r.pick([4, 6, 8, 8, 12]); return [{ shape: 'leaf', at: 'ring', n, d: 0.52, R: 0.44, col: 0, spin: true, spinOff: TAU / 4, a0: -TAU / 4 }, { shape: 'circle', R: r.range(0.18, 0.3), col: 1 }]; },
    blossom: (r) => [{ shape: 'blossom', R: r.range(0.84, 0.98), col: 0, o: { n: r.pick([6, 8, 10, 12]) } }, { shape: r.pick(['circle', 'diamond', 'star']), R: r.range(0.26, 0.4), col: 1, o: { n: 6, k: 0.5 } }],
    split: (r) => [{ shape: r.pick(['semi', 'semi', 'arch']), R: r.range(0.8, 0.94), col: 0, rot: TAU / 8 }, { shape: 'semi', R: r.range(0.8, 0.94), col: 1, rot: TAU / 8 + Math.PI }, ...(r.chance(0.4) ? [{ shape: 'diamond', R: 0.25, col: 2 }] : [])],
    gear: (r) => [{ shape: 'gear', R: r.range(0.84, 0.98), col: 0, o: { n: r.int(7, 12) } }, { shape: 'circle', R: r.range(0.34, 0.5), col: r.chance(0.5) ? 'cut' : 1 }],
    drops: (r) => [{ shape: 'drop', at: 'orth', d: r.range(0.4, 0.5), R: r.range(0.38, 0.48), col: 0, spin: true, spinOff: -TAU / 4 }, { shape: r.pick(['diamond', 'circle']), R: r.range(0.14, 0.24), col: 1 }],
  };
  const CLOSE = ['inset', 'inset', 'notched', 'notched', 'quad', 'quad', 'flower', 'flower', 'xdiam', 'xdiam', 'constellation', 'lone', 'grid3', 'quad', 'inset'];
  const WIDE = Object.keys(T);

  // A motif: layers plus an occasional quarter-turn feel, and a size for the tile.
  function motif(r, kinds) {
    const kind = r.pick(kinds);
    return { kind, layers: T[kind](r), rot: 0 };
  }
  // Colours for one tile: slot 0 big, slot 1 a contrast for the middle, 2-3 accents.
  function colours(r, P) {
    const c0 = r.pick(P.big), c1 = r.pick(P.small.filter((c) => c !== c0)), c2 = r.pick(P.big.filter((c) => c !== c0)), c3 = r.pick(P.small.filter((c) => c !== c2 && c !== c0));
    return [c0, c1, c2, c3];
  }

  // The rectangle: cols × rows square cells, centred in the card.
  function frame(cols, rows, margin = 44) {
    const s = Math.min((GL.W - 2 * margin) / cols, (GL.H - 2 * margin) / rows);
    return { s, x0: (GL.W - cols * s) / 2, y0: (GL.H - rows * s) / 2, cols, rows };
  }
  function ground(ctx, P, F, tiles = true) {
    ctx.fillStyle = P.ground; ctx.fillRect(0, 0, GL.W, GL.H);
    if (!tiles) return;
    ctx.fillStyle = P.tile;
    for (let i = 0; i < F.cols; i++) for (let j = 0; j < F.rows; j++) ctx.fillRect(F.x0 + i * F.s + 0.5, F.y0 + j * F.s + 0.5, F.s - 1, F.s - 1);
  }
  // A vocabulary of motifs for one card, reused with new colours, never the
  // same motif twice side by side.
  function vocabulary(r, kinds, n) { return Array.from({ length: n }, () => motif(r, kinds)); }
  function pickFrom(r, vocab, left, up) {
    for (let k = 0; k < 8; k++) { const m = r.pick(vocab); if (m !== left && m !== up) return m; }
    return r.pick(vocab);
  }
  // Most tiles fill their cell; some are small, a few tiny.
  const tileScale = (r) => (r.chance(0.72) ? r.range(0.9, 1) : r.chance(0.6) ? r.range(0.55, 0.8) : r.range(0.32, 0.5));

  window.TILES = { PALETTES, palette, SHAPES, T, CLOSE, WIDE, drawIcon, motif, colours, frame, ground, vocabulary, pickFrom, tileScale, spots };
})();
