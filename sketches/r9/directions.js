/* Round 9: from the oval to a rectangle of small geometric icons, after
   Jasper's reference sheet. Three sets run from close to the reference,
   through variations, to surprises. */
(function () {
  const { TAU } = window.GL;
  const { palette, T, CLOSE, WIDE, drawIcon, motif, colours, frame, ground, vocabulary, pickFrom, tileScale } = window.TILES;
  const lerp = (a, b, t) => a + (b - a) * t;

  // Fill a cols × rows sheet; `make` can swap in its own motif per tile.
  function sheet(ctx, r, env, { cols, rows, kinds = CLOSE, vocab = 24, scale = tileScale, make, after }) {
    const P = palette(env), F = frame(cols, rows), V = vocabulary(r, kinds, vocab), grid = [];
    ground(ctx, P, F);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const m = make ? make(r, i, j) : pickFrom(r, V, i ? grid[j * cols + i - 1] : null, j ? grid[(j - 1) * cols + i] : null);
      grid[j * cols + i] = m;
      const x = F.x0 + (i + 0.5) * F.s, y = F.y0 + (j + 0.5) * F.s;
      drawIcon(ctx, m, x, y, F.s * 0.46 * scale(r), colours(r, P), P.tile);
    }
    if (after) after(P, F);
    return { P, F };
  }
  // One motif with a second, smaller one set into its middle.
  function compound(r, kinds) {
    const a = motif(r, kinds), b = motif(r, kinds.filter((k) => k !== a.kind && k !== 'lone'));
    const outer = a.layers.filter((L) => L.at || L.R > 0.55);
    const inner = b.layers.map((L) => ({ ...L, R: L.R * 0.44, d: (L.d ?? 0.6) * 0.44, col: typeof L.col === 'number' ? (L.col + 1) % 4 : L.col }));
    const gap = r.chance(0.5) ? [{ shape: r.pick(['circle', 'diamond', 'octagon']), R: 0.5, col: 'cut' }] : [];
    return { kind: a.kind + '+' + b.kind, layers: [...outer, ...gap, ...inner] };
  }
  const withCuts = (r, m) => {
    const cuts = [];
    const opts = [
      () => ({ shape: 'circle', at: r.pick(['orth', 'diag']), d: r.range(0.85, 1), R: r.range(0.22, 0.34), col: 'cut' }),
      () => ({ shape: r.pick(['circle', 'diamond', 'star', 'plus']), R: r.range(0.2, 0.34), col: 'cut', o: { n: 4, k: 0.4, w: 0.3 } }),
      () => ({ shape: 'plus', R: 1.05, col: 'cut', o: { w: r.range(0.05, 0.1) }, rot: r.chance(0.5) ? TAU / 8 : 0 }),
      () => ({ shape: 'semi', R: 1.05, col: 'cut', rot: r.pick([0, TAU / 4, TAU / 2, (3 * TAU) / 4]) + TAU / 2, _half: true }),
      () => ({ shape: 'circle', at: 'ring', n: r.pick([6, 8, 12]), d: r.range(0.5, 0.7), R: r.range(0.06, 0.1), col: 'cut' }),
    ];
    for (let k = r.int(1, 2); k > 0; k--) cuts.push(r.pick(opts)());
    return { ...m, layers: [...m.layers, ...cuts] };
  };

  window.SETS = {
    'Close to the reference': 'One icon per square cell, mirror-symmetric, one to three flat layers: circles, diamonds, clovers, lobed flowers, crosses of diamonds, dot constellations. Most fill their cell; a few are tiny.',
    'Variations': 'The same vocabulary pushed one way at a time: scale, sparseness, rotation, families, and tiles that join their neighbours.',
    'Surprises': 'Rule-breaking: bites and holes, deep medallions, misfit tiles, inverted tiles and patterned fills.',
  };

  window.DIRECTIONS = [
    {
      set: 'Close to the reference', name: 'Tile Sheet', from: 'ref',
      rule: 'Sixteen by nine cells, each one icon from a vocabulary of about twenty-four motifs, recoloured tile by tile so no two neighbours match.',
      draw(ctx, r, nz, env) { sheet(ctx, r, env, { cols: 16, rows: 9 }); },
    },
    {
      set: 'Close to the reference', name: 'Big Tiles', from: 'ref',
      rule: 'Fewer, larger cells, so each icon can carry more: a motif with a second one set into its middle, often behind a black spacer.',
      draw(ctx, r, nz, env) { sheet(ctx, r, env, { cols: 8, rows: 5, make: (rr) => (rr.chance(0.75) ? compound(rr, WIDE) : motif(rr, CLOSE)), scale: (rr) => (rr.chance(0.85) ? rr.range(0.92, 1) : rr.range(0.5, 0.7)) }); },
    },
    {
      set: 'Close to the reference', name: 'Fine Print', from: 'ref',
      rule: 'A dense sheet of small icons, twenty-six by fifteen, simple enough to read as a texture from afar and as icons up close.',
      draw(ctx, r, nz, env) { sheet(ctx, r, env, { cols: 26, rows: 15, kinds: CLOSE.concat(['burst', 'plus', 'target']), vocab: 30 }); },
    },
    {
      set: 'Variations', name: 'Mixed Scale', from: 'Tile Sheet',
      rule: 'Most cells hold one icon; some icons take a two-by-two or three-by-three block, and those carry compound designs.',
      draw(ctx, r, nz, env) {
        const P = palette(env), cols = 18, rows = 10, F = frame(cols, rows), used = new Uint8Array(cols * rows), V = vocabulary(r, WIDE, 28);
        ctx.fillStyle = P.ground; ctx.fillRect(0, 0, GL.W, GL.H);
        const free = (i, j, k) => { if (i + k > cols || j + k > rows) return false; for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) if (used[(j + b) * cols + i + a]) return false; return true; };
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          if (used[j * cols + i]) continue;
          let k = 1;
          if (r.chance(0.05) && free(i, j, 3)) k = 3; else if (r.chance(0.13) && free(i, j, 2)) k = 2;
          for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) used[(j + b) * cols + i + a] = 1;
          ctx.fillStyle = P.tile; ctx.fillRect(F.x0 + i * F.s + 0.5, F.y0 + j * F.s + 0.5, k * F.s - 1, k * F.s - 1);
          const m = k > 1 ? compound(r, WIDE) : r.pick(V);
          drawIcon(ctx, m, F.x0 + (i + k / 2) * F.s, F.y0 + (j + k / 2) * F.s, k * F.s * 0.46 * (k > 1 ? 1 : tileScale(r)), colours(r, P), P.tile);
        }
      },
    },
    {
      set: 'Variations', name: 'Constellations', from: 'Tile Sheet',
      rule: 'Mostly dots and diamonds arranged in rings, crosses and three-by-three grids, with the odd solid icon. More black, more air.',
      draw(ctx, r, nz, env) {
        const V = vocabulary(r, ['constellation', 'constellation', 'constellation', 'grid3', 'lone', 'petals'], 20), solid = vocabulary(r, CLOSE, 8);
        sheet(ctx, r, env, { cols: 16, rows: 9, make: (rr) => (rr.chance(0.8) ? rr.pick(V) : rr.pick(solid)) });
      },
    },
    {
      set: 'Variations', name: 'Pinwheels', from: 'Tile Sheet',
      rule: 'Icons that turn instead of mirror: blades, drops, half-moons and petals, each tile set at its own angle, alternate tiles spinning the other way.',
      draw(ctx, r, nz, env) {
        const V = vocabulary(r, ['pinwheel', 'pinwheel', 'drops', 'semis', 'petals', 'split', 'burst'], 22);
        sheet(ctx, r, env, { cols: 16, rows: 9, make: (rr, i, j) => { const m = rr.pick(V); return { ...m, rot: ((i + j) % 2 ? -1 : 1) * rr.range(0, TAU / 4), layers: m.layers.map((L) => (L.spin ? { ...L, spinOff: (L.spinOff || 0) * ((i + j) % 2 ? -1 : 1) } : L)) }; } });
      },
    },
    {
      set: 'Variations', name: 'Families', from: 'Tile Sheet',
      rule: 'Each row is one motif that changes across the sheet: the middle grows, the ring widens, the icon turns and the colours step along.',
      draw(ctx, r, nz, env) {
        const P = palette(env), cols = 14, rows = 8, F = frame(cols, rows), kinds = r.shuffle(WIDE.filter((k) => k !== 'lone'));
        ground(ctx, P, F);
        for (let j = 0; j < rows; j++) {
          const seed = r.int(1, 1e9), kind = kinds[j % kinds.length], ramp = r.shuffle(P.small), dir = r.sign();
          for (let i = 0; i < cols; i++) {
            const t = i / (cols - 1), rr = GL.rng(seed), m = { kind, layers: T[kind](rr).map((L, k) => (k ? { ...L, R: Math.min(0.95, L.R * lerp(0.55, 1.5, t)), d: L.d !== undefined ? L.d * lerp(0.8, 1.15, t) : undefined } : L)), rot: dir * t * TAU / 8 };
            const s = Math.floor(i / 2), cols4 = [ramp[s % ramp.length], ramp[(s + 2) % ramp.length], ramp[(s + 3) % ramp.length], ramp[(s + 4) % ramp.length]];
            drawIcon(ctx, m, F.x0 + (i + 0.5) * F.s, F.y0 + (j + 0.5) * F.s, F.s * 0.46, cols4, P.tile);
          }
        }
      },
    },
    {
      set: 'Variations', name: 'Interlock', from: 'Tile Sheet',
      rule: 'Icons reach the edges of their cells so neighbours touch, and colour drifts in patches, so tiles join into larger lattices and floor-like patterns.',
      draw(ctx, r, nz, env) {
        const P = palette(env), cols = 16, rows = 9, F = frame(cols, rows, 44), fz = r.range(0.12, 0.3);
        ctx.fillStyle = P.ground; ctx.fillRect(0, 0, GL.W, GL.H);
        const joiners = [
          () => [{ shape: 'xdiam', R: 1, col: 0 }], () => [{ shape: 'quad', R: 1, col: 0 }], () => [{ shape: 'lobes', R: 1, col: 0 }],
          () => [{ shape: 'plus', R: 1, col: 0, o: { w: 0.3 } }, { shape: 'diamond', R: 0.3, col: 1 }], () => [{ shape: 'diamond', R: 1, col: 0 }, { shape: 'circle', R: 0.4, col: 1 }],
          () => [{ shape: 'semi', at: 'orth', d: 1, R: 0.5, col: 0, spin: true, spinOff: TAU / 4 }, { shape: 'circle', R: 0.3, col: 1 }],
          () => [{ shape: 'quarter', at: 'diag', d: 1, R: 0.95, col: 0, spin: true, spinOff: (3 * TAU) / 8 + Math.PI }, { shape: 'circle', R: 0.35, col: 1 }],
        ];
        const picks = r.shuffle(joiners).slice(0, r.int(2, 4));
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          const field = (a) => Math.floor(((nz(i * fz + a, j * fz) + 1) / 2) * P.big.length * 1.3) % P.big.length;
          const c0 = P.big[field(0)], c1 = P.small[(field(9) + 2) % P.small.length];
          const make = picks[Math.floor(((nz(i * fz * 0.7 + 30, j * fz * 0.7) + 1) / 2) * picks.length * 1.2) % picks.length];
          drawIcon(ctx, { layers: make() }, F.x0 + (i + 0.5) * F.s, F.y0 + (j + 0.5) * F.s, F.s / 2, [c0, c1 === c0 ? P.small[0] : c1, c0, c1], P.ground);
        }
      },
    },
    {
      set: 'Surprises', name: 'Bites', from: 'Tile Sheet',
      rule: 'Every icon loses something: a bite from its edge, a hole in its middle, a hairline slit or a whole half. A quarter of the tiles are inverted, black icons on coloured squares.',
      draw(ctx, r, nz, env) {
        const P = palette(env), cols = 16, rows = 9, F = frame(cols, rows), V = vocabulary(r, WIDE, 24);
        ground(ctx, P, F);
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          const x = F.x0 + (i + 0.5) * F.s, y = F.y0 + (j + 0.5) * F.s, m = withCuts(r, r.pick(V)), cols4 = colours(r, P);
          if (r.chance(0.25)) {
            ctx.fillStyle = cols4[0]; ctx.fillRect(x - F.s / 2 + 0.5, y - F.s / 2 + 0.5, F.s - 1, F.s - 1);
            drawIcon(ctx, m, x, y, F.s * 0.44 * tileScale(r), ['#000', cols4[1], '#000', cols4[3]], cols4[0]);
          } else drawIcon(ctx, m, x, y, F.s * 0.46 * tileScale(r), cols4, P.tile);
        }
      },
    },
    {
      set: 'Surprises', name: 'Medallions', from: 'Big Tiles',
      rule: 'Deep stacks: three motifs nested inside one another with black spacers between, so each tile reads like a small badge or seal.',
      draw(ctx, r, nz, env) {
        sheet(ctx, r, env, { cols: 10, rows: 6, scale: () => 1, make: (rr) => {
          const a = compound(rr, WIDE), b = motif(rr, ['lone', 'constellation', 'inset', 'burst']);
          return { layers: [...a.layers, { shape: rr.pick(['circle', 'diamond']), R: 0.22, col: 'cut' }, ...b.layers.map((L) => ({ ...L, R: L.R * 0.2, d: (L.d ?? 0.6) * 0.2, col: typeof L.col === 'number' ? (L.col + 2) % 4 : L.col }))] };
        } });
      },
    },
    {
      set: 'Surprises', name: 'Misfits', from: 'Tile Sheet',
      rule: 'A regular sheet where about one tile in seven breaks the rule: turned, off-centre, oversized over its neighbours. A few giant shapes sit behind the grid.',
      draw(ctx, r, nz, env) {
        const P = palette(env), cols = 16, rows = 9, F = frame(cols, rows), V = vocabulary(r, WIDE, 26), late = [];
        ground(ctx, P, F);
        for (let g = r.int(2, 3); g > 0; g--) {
          const k = r.int(3, 5), i = r.int(0, cols - k), j = r.int(0, rows - k);
          drawIcon(ctx, { layers: [{ shape: r.pick(['circle', 'quad', 'xdiam', 'lobes', 'diamond', 'blossom']), R: 1, col: 0, o: { n: 8 } }] }, F.x0 + (i + k / 2) * F.s, F.y0 + (j + k / 2) * F.s, (k * F.s) / 2, [r.pick(P.big)], P.tile);
        }
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          let x = F.x0 + (i + 0.5) * F.s, y = F.y0 + (j + 0.5) * F.s, m = r.pick(V), half = F.s * 0.46 * tileScale(r);
          if (r.chance(0.14)) {
            const how = r.int(0, 2);
            if (how === 0) m = { ...m, rot: r.pick([TAU / 16, TAU / 8, -TAU / 16]) };
            else if (how === 1) { x += r.range(-0.3, 0.3) * F.s; y += r.range(-0.3, 0.3) * F.s; }
            else { late.push([m, x, y, F.s * 0.46 * r.range(1.4, 1.9), colours(r, P)]); continue; }
          }
          drawIcon(ctx, m, x, y, half, colours(r, P), P.tile);
        }
        for (const [m, x, y, h, c] of late) drawIcon(ctx, m, x, y, h, c, P.tile);
      },
    },
    {
      set: 'Surprises', name: 'Pattern Fill', from: 'Tile Sheet',
      rule: 'Flat icons mixed with ones filled with stripes, dots or checks in a second colour, like printed ornaments.',
      draw(ctx, r, nz, env) {
        const V = vocabulary(r, WIDE, 24).map((m) => (r.chance(0.5) && !m.layers[0].at ? { ...m, layers: [{ ...m.layers[0], pattern: { kind: r.pick(['stripes', 'stripes', 'dots', 'checks']), step: r.range(0.16, 0.3), col: r.chance(0.3) ? 'cut' : 1, angle: r.pick([0, TAU / 8, TAU / 4, -TAU / 8]) } }, ...m.layers.slice(1).map((L) => ({ ...L, col: typeof L.col === 'number' ? (L.col === 1 ? 2 : L.col) : L.col }))] } : m));
        sheet(ctx, r, env, { cols: 14, rows: 8, make: (rr) => rr.pick(V) });
      },
    },
    {
      set: 'Surprises', name: 'Everything', from: 'all',
      rule: 'All of the above in one sheet: mixed sizes, bites, stacks, patterns and turns, drawn from the whole vocabulary.',
      draw(ctx, r, nz, env) {
        const P = palette(env), cols = 18, rows = 10, F = frame(cols, rows), used = new Uint8Array(cols * rows);
        ctx.fillStyle = P.ground; ctx.fillRect(0, 0, GL.W, GL.H);
        const free = (i, j, k) => { if (i + k > cols || j + k > rows) return false; for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) if (used[(j + b) * cols + i + a]) return false; return true; };
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          if (used[j * cols + i]) continue;
          const k = r.chance(0.08) && free(i, j, 2) ? 2 : 1;
          for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) used[(j + b) * cols + i + a] = 1;
          ctx.fillStyle = P.tile; ctx.fillRect(F.x0 + i * F.s + 0.5, F.y0 + j * F.s + 0.5, k * F.s - 1, k * F.s - 1);
          let m = r.chance(0.3) ? compound(r, WIDE) : motif(r, WIDE);
          if (r.chance(0.25)) m = withCuts(r, m);
          if (r.chance(0.2) && !m.layers[0].at) m = { ...m, layers: [{ ...m.layers[0], pattern: { kind: r.pick(['stripes', 'dots', 'checks']), step: r.range(0.16, 0.3), col: 1, angle: r.pick([0, TAU / 8]) } }, ...m.layers.slice(1)] };
          if (r.chance(0.12)) m = { ...m, rot: r.range(-0.4, 0.4) };
          drawIcon(ctx, m, F.x0 + (i + k / 2) * F.s, F.y0 + (j + k / 2) * F.s, k * F.s * 0.46 * (k > 1 ? 1 : tileScale(r)), colours(r, P), P.tile);
        }
      },
    },
  ];
})();
