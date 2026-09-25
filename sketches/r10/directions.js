/* Round 10: the icons Jasper liked in round 9's Tile Sheet and Fine Print,
   at mixed scales with some overlap, on white. Two sheets: one on a grid of
   blocks, one packed freely. */
(function () {
  const { TAU } = window.GL;
  const { CLOSE, drawIcon, motif, frame, vocabulary, tileScale } = window.TILES;

  // On white the light colours drop out and black joins the set.
  const PALETTES = {
    mix: { ground: '#ffffff', big: ['#fbcd3a', '#f43b3b', '#1a6bff', '#15a4a6', '#141414'], small: ['#fbcd3a', '#f43b3b', '#1a6bff', '#15a4a6', '#ff6ec3', '#141414'] },
    primary: { ground: '#ffffff', big: ['#ff2b1c', '#ffd60a', '#1d4dff', '#141414'], small: ['#ff2b1c', '#ffd60a', '#1d4dff', '#141414'] },
  };
  const palette = (env) => PALETTES[env.mode] || PALETTES.mix;
  const KINDS = CLOSE.concat(['burst', 'plus', 'target']);
  function colours(r, P) {
    const c0 = r.pick(P.big), c1 = r.pick(P.small.filter((c) => c !== c0)), c2 = r.pick(P.big.filter((c) => c !== c0)), c3 = r.pick(P.small.filter((c) => c !== c2 && c !== c0));
    return [c0, c1, c2, c3];
  }
  // A motif's reach from its centre, in half-sizes: corner pieces stick out further.
  // How far each shape reaches at its widest, as a multiple of its size.
  const EXTENT = { quad: 1.22, xdiam: 1.12, squircle: 1.21, square: 1.3, hexagon: 1, octagon: 1 };
  const reach = (m) => Math.max(...m.layers.map((L) => {
    const e = L.R * (EXTENT[L.shape] || 1);
    return L.at === 'diag' ? L.d * Math.SQRT2 + e : L.at ? (L.d ?? 0.6) + e : e;
  }));

  window.SETS = {};
  window.DIRECTIONS = [
    {
      name: 'Mixed Grid', from: 'r9 · 1 + 3 + 4',
      rule: 'Fine Print’s grid, with icons taking one to four cells. About one in eight grows past its block and overlaps its neighbours, drawn on top.',
      draw(ctx, r, nz, env) {
        const P = palette(env), cols = 24, rows = 14, F = frame(cols, rows), used = new Uint8Array(cols * rows), V = vocabulary(r, KINDS, 30), items = [];
        ctx.fillStyle = P.ground; ctx.fillRect(0, 0, GL.W, GL.H);
        const free = (i, j, k) => { if (i + k > cols || j + k > rows) return false; for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) if (used[(j + b) * cols + i + a]) return false; return true; };
        // Big blocks first, at random spots, then single cells fill the rest.
        for (const [k, want] of [[4, r.int(1, 3)], [3, r.int(3, 6)], [2, r.int(10, 18)]]) {
          let n = want;
          for (let t = 0; t < want * 8 && n > 0; t++) {
            const i = r.int(0, cols - k), j = r.int(0, rows - k);
            if (!free(i, j, k)) continue;
            for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) used[(j + b) * cols + i + a] = 1;
            items.push({ i, j, k }); n--;
          }
        }
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (!used[j * cols + i]) items.push({ i, j, k: 1 });
        for (const it of items) {
          it.m = r.pick(V); it.c = colours(r, P);
          it.grow = r.chance(0.13);
          it.half = it.k * F.s * 0.46 * (it.grow ? r.range(1.3, 1.75) : it.k > 1 ? r.range(0.9, 1) : tileScale(r));
        }
        // Overlapping icons go last so they sit over their neighbours.
        items.sort((a, b) => a.grow - b.grow);
        for (const it of items) drawIcon(ctx, it.m, F.x0 + (it.i + it.k / 2) * F.s, F.y0 + (it.j + it.k / 2) * F.s, it.half, it.c, P.ground);
      },
    },
    {
      name: 'Free Scale', from: 'r9 · 1 + 3 + 13',
      rule: 'No grid: icons of every size packed into the rectangle, largest first, small ones filling the gaps with a little air around each. Now and then a small icon sits across the edge of a big one.',
      draw(ctx, r, nz, env) {
        const P = palette(env), F = frame(16, 9), X0 = F.x0, Y0 = F.y0, W = F.cols * F.s, H = F.rows * F.s, V = vocabulary(r, KINDS, 30), placed = [];
        ctx.fillStyle = P.ground; ctx.fillRect(0, 0, GL.W, GL.H);
        const big = H * r.range(0.14, 0.2), small = F.s * 0.26, steps = 60, gap = F.s * 0.1;
        for (let s = 0; s < steps; s++) {
          // Sizes fall off steeply: a few giants, many middles, lots of small.
          const half = small + (big - small) * (1 - s / steps) ** 2.4, tries = 30 + s * 8;
          for (let t = 0; t < tries; t++) {
            const m = r.pick(V), R = half * Math.min(1.6, reach(m)), x = r.range(X0 + R, X0 + W - R), y = r.range(Y0 + R, Y0 + H - R);
            // An overlapper is small and sits across the edge of one bigger icon,
            // never on its middle and never on another overlapper.
            const over = r.chance(0.06);
            const clash = (p) => {
              const d = Math.hypot(p.x - x, p.y - y);
              if (over && !p.over && R < p.R * 0.45) return d < p.R * 0.6;
              return d < p.R + R + gap;
            };
            if (placed.some(clash)) continue;
            placed.push({ x, y, R, half, m, over, c: colours(r, P) });
          }
        }
        // Larger first, so the small ones read on top where they overlap.
        placed.sort((a, b) => b.half - a.half);
        for (const p of placed) drawIcon(ctx, p.m, p.x, p.y, p.half, p.c, P.ground);
      },
    },
  ];
})();
