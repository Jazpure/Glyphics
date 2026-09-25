/* Tile codes: the Free Scale sheet (sketches round 10) carrying a 64-bit ID.

   The icons are free decoration, different on every draw. The data is in the
   dot grid laid over them: 33 × 19 small white dots with black outlines. The
   grid is split into 2 × 2 groups (16 × 9 of them, leaving the last column and
   row plain), and in each group exactly one dot is filled black. Which one is
   2 bits, so the sheet holds 36 bytes: a version byte, the 8-byte ID, and 27
   Reed–Solomon parity bytes, enough to repair 13 damaged bytes.

   The dots sit on top of everything and are opaque, so a dot reads the same
   over any icon: black in the middle, or white. Reading only has to decide
   which dot in each group is darkest, which does not depend on the lighting. */
(function () {
  // Canonical layout, in units: a 16 × 9 rectangle of cells with a white margin.
  const S = 69.5, COLS = 16, ROWS = 9, M = 44, RW = COLS * S, RH = ROWS * S, CW = RW + 2 * M, CH = RH + 2 * M;
  const STEP = S / 2, NX = COLS * 2 + 1, NY = ROWS * 2 + 1, DOT_R = 3, DOT_LINE = 1.1;
  const BX = COLS, BY = ROWS, TOTAL = (BX * BY) / 4, DATA = 9, VERSION = 1;
  const dotXY = (i, j) => [M + i * STEP, M + j * STEP];
  const MASK = (() => { const r = GL.rng(0x71e5c0de); return Array.from({ length: BX * BY }, () => r.int(0, 3)); })();
  const hexToBytes = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));
  const bytesToHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

  // Which dots are black (NX × NY, row by row) for an ID of 16 hex digits.
  function dotsFor(id) {
    const block = RS.encode(Uint8Array.from([VERSION, ...hexToBytes(id)]), TOTAL - DATA), fill = new Uint8Array(NX * NY);
    for (let b = 0; b < BX * BY; b++) {
      const sym = ((block[b >> 2] >> (6 - 2 * (b & 3))) & 3) ^ MASK[b], bx = b % BX, by = (b / BX) | 0;
      fill[(by * 2 + (sym >> 1)) * NX + bx * 2 + (sym & 1)] = 1;
    }
    return fill;
  }
  // From each dot's darkness (NX × NY, row by row), the ID; tries both ways up.
  function readDots(dark) {
    for (const flip of [false, true]) {
      const d = (i, j) => (flip ? dark[(NY - 1 - j) * NX + (NX - 1 - i)] : dark[j * NX + i]), bytes = new Uint8Array(TOTAL);
      for (let b = 0; b < BX * BY; b++) {
        const bx = b % BX, by = (b / BX) | 0;
        let best = 0, bd = -Infinity;
        for (let s = 0; s < 4; s++) { const v = d(bx * 2 + (s & 1), by * 2 + (s >> 1)); if (v > bd) { bd = v; best = s; } }
        bytes[b >> 2] |= (best ^ MASK[b]) << (6 - 2 * (b & 3));
      }
      const msg = RS.decode(bytes, TOTAL - DATA);
      if (msg && msg[0] === VERSION) return { id: bytesToHex(msg.slice(1)), flip };
    }
    return null;
  }

  // ---------- drawing ----------
  // On white the light colours drop out and black joins the set.
  const PALETTES = {
    mix: { ground: '#ffffff', big: ['#fbcd3a', '#f43b3b', '#1a6bff', '#15a4a6', '#141414'], small: ['#fbcd3a', '#f43b3b', '#1a6bff', '#15a4a6', '#ff6ec3', '#141414'] },
    primary: { ground: '#ffffff', big: ['#ff2b1c', '#ffd60a', '#1d4dff', '#141414'], small: ['#ff2b1c', '#ffd60a', '#1d4dff', '#141414'] },
  };
  function colours(r, P) {
    const c0 = r.pick(P.big), c1 = r.pick(P.small.filter((c) => c !== c0)), c2 = r.pick(P.big.filter((c) => c !== c0)), c3 = r.pick(P.small.filter((c) => c !== c2 && c !== c0));
    return [c0, c1, c2, c3];
  }
  // How far each shape reaches at its widest, as a multiple of its size.
  const EXTENT = { quad: 1.22, xdiam: 1.12, squircle: 1.21, square: 1.3 };
  const reach = (m) => Math.max(...m.layers.map((L) => {
    const e = L.R * (EXTENT[L.shape] || 1);
    return L.at === 'diag' ? L.d * Math.SQRT2 + e : L.at ? (L.d ?? 0.6) + e : e;
  }));
  // Free Scale: icons of every size packed into the rectangle, largest first,
  // with a little air around each; now and then a small one sits across the
  // edge of a big one.
  function sheet(ctx, r, P) {
    const T = window.TILES, V = T.vocabulary(r, T.CLOSE.concat(['burst', 'plus', 'target']), 30), placed = [];
    const big = RH * r.range(0.14, 0.2), small = S * 0.26, steps = 60, gap = S * 0.1;
    for (let s = 0; s < steps; s++) {
      const half = small + (big - small) * (1 - s / steps) ** 2.4, tries = 30 + s * 8;
      for (let t = 0; t < tries; t++) {
        const m = r.pick(V), R = half * Math.min(1.6, reach(m)), x = r.range(M + R, M + RW - R), y = r.range(M + R, M + RH - R), over = r.chance(0.06);
        const clash = (p) => { const d = Math.hypot(p.x - x, p.y - y); return over && !p.over && R < p.R * 0.45 ? d < p.R * 0.6 : d < p.R + R + gap; };
        if (placed.some(clash)) continue;
        placed.push({ x, y, R, half, m, over, c: colours(r, P) });
      }
    }
    placed.sort((a, b) => b.half - a.half);
    for (const p of placed) T.drawIcon(ctx, p.m, p.x, p.y, p.half, p.c, P.ground);
  }
  // The whole code, in canonical units (CW × CH): white ground, icons, dots.
  function draw(ctx, { id, seed = 1, mode = 'mix' }) {
    const P = PALETTES[mode] || PALETTES.mix, fill = dotsFor(id);
    ctx.fillStyle = P.ground; ctx.fillRect(0, 0, CW, CH);
    sheet(ctx, GL.rng(seed), P);
    for (const black of [0, 1]) {
      ctx.beginPath();
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        if (fill[j * NX + i] !== black) continue;
        const [x, y] = dotXY(i, j); ctx.moveTo(x + DOT_R, y); ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
      }
      ctx.fillStyle = black ? '#141414' : '#ffffff'; ctx.fill();
      ctx.strokeStyle = '#141414'; ctx.lineWidth = DOT_LINE; ctx.stroke();
    }
  }

  window.TILECODE = { S, M, RW, RH, CW, CH, STEP, NX, NY, DOT_R, dotXY, dotsFor, readDots, draw, PALETTES };
})();
