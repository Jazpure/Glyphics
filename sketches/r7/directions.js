/* Round 7: built on round 6's Tide Radiant, Woodcut Radiant, Collage Radiant,
   Shadow Bloom and Halftone Bloom, with a much wider range of shapes (hexagons,
   flowers, cogs, bursts, crosses, crescents, drops, arches, trefoils, targets…),
   a wider range of sizes, and bold multicolour designs inside the big ones.
   Three sets run from conservative, through fusions, to radical. */
(function () {
  const { TAU, O, E, ovalR, ovalPath, inOval, pack } = window.GL;
  const { HAIR, on, open, close, circle, typePart, PARTS } = window.KIT;
  const { bead, sequence, spokeCells } = window.STRANDS;
  const { BOLD, STARRY, DESIGNS, toItems, itemPath, moved, specDesign, STYLE, render, COMP } = window.RADIANT;

  const ALL = STARRY.concat(['tri3', 'pent', 'hex', 'oct', 'flower', 'cog', 'burst', 'asterisk', 'blobby', 'cross', 'crescent', 'drop', 'semi', 'arch', 'trefoil', 'quatrefoil', 'target', 'bowtie', 'chevron', 'kite']);
  const HOSTS = ['circle', 'circle', 'hex', 'oct', 'flower', 'cog', 'squircle', 'trefoil', 'quatrefoil', 'blobby', 'pent', 'burst'];
  const DESIGNS_ALL = DESIGNS.concat(BOLD, BOLD);
  const bySize = (items) => items.sort((a, b) => a.size - b.size);

  function spineOf(ctx, color, lines) {
    ctx.strokeStyle = color; ctx.lineWidth = HAIR; ctx.beginPath();
    for (const ln of lines) ln.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
    ctx.stroke();
  }
  function shadowPass(ctx, r, nz, P, items, d = r.range(2.5, 4.5)) {
    const a = r.range(0, TAU), sx = Math.cos(a) * d, sy = Math.sin(a) * d;
    ctx.fillStyle = P.mono ? '#111111' : P.ink;
    for (const it of items) { itemPath(ctx, nz, moved(it, sx, sy)); ctx.fill('evenodd'); }
    return [sx, sy];
  }
  // A different drawing style for each spoke (or any grouping).
  function collage(ctx, r, nz, P, items, groups, styles) {
    const S = { ...P }, pick = Array.from({ length: groups }, () => r.pick(styles));
    for (const it of items) STYLE[pick[it.g % groups]].item(ctx, r, nz, S, it);
  }
  // Landmark shapes, large and bold, laid over the composition.
  function giants(r, P, n, rmin, rmax) {
    const pool = P.mono ? [P.ink, P.field] : P.fills.concat(P.field);
    return pack(r, { n, maxR: rmax, gap: 24, tries: 1500, point: (r) => inOval(r, 0.85), rad: (x, y, r) => r.range(rmin, rmax), inside: (x, y, R) => { const q = ovalR(x, y); return q > 0.22 && q + R / 360 < 0.95; } })
      .map(([x, y, R]) => {
        const fill = r.pick(pool), rest = pool.filter((f) => f !== fill);
        return { x, y, a: r.range(0, TAU), l: 2 * R, w: 2 * R * r.range(0.8, 1), kind: 'circle', specBead: r.pick(HOSTS), spec: r.pick(BOLD.concat(['rings', 'dots', 'spokes', 'hatch'])), fill, fill2: r.pick(rest), fill3: r.pick(rest), size: 2 * R, g: 0 };
      });
  }
  const base = (o = {}) => ({ alphabet: ALL, kinds: [2, 4], spec: 15, specKinds: HOSTS, designs: DESIGNS_ALL, nodes: 0.035, nodeK: [1.6, 3], ...o });

  // A style applied to one composition, optionally with giants on top.
  function make(comp, style, o = {}) {
    return (ctx, r, nz, env) => {
      const P = open(ctx, r, env);
      const lines = COMP[comp](r, nz), items = toItems(r, P, lines, base(o.items));
      if (o.sort) bySize(items);
      const S = render(ctx, r, nz, P, items, lines, style);
      close(ctx, { ...P, field: S.ground ?? S.field, ink: S.ink });
    };
  }

  window.SETS = {
    Conservative: 'Round 6’s favourites with a much wider alphabet of shapes, bigger size ranges, and bold multicolour designs in the large ones. Tidy and close to what worked.',
    'In between': 'Fusions: two styles braided together, shared shadows, landmark giants, and shapes whose sizes jump wildly along a spoke.',
    Radical: 'The system pushed hard: blown apart, recursive, full of type, maximal, or shattered into sectors.',
  };

  const DIRECTIONS = [
    // ======================================================== CONSERVATIVE
    {
      set: 'Conservative', name: 'Tide Radiant+', from: 'r6 · 1',
      rule: 'Tide Radiant with about thirty shape kinds: hexagons, flowers, cogs, bursts, crosses, crescents, drops, arches, trefoils, targets and more. Large beads carry bold designs: halves, quarters, bullseyes, stripes, checks, pinwheels.',
      data: 'shape and size per bead along each spoke.',
      draw: make('tide', 'flat'),
    },
    {
      set: 'Conservative', name: 'Woodcut+', from: 'r6 · 3',
      rule: 'Woodcut Radiant with the full alphabet. Every shape is hatched, and the angle turns from spoke to spoke, so the texture carries the structure.',
      data: 'hatch angle per spoke, shape per bead.',
      draw: make('tide', 'hatch'),
    },
    {
      set: 'Conservative', name: 'Shadow Bloom+', from: 'r6 · 9',
      rule: 'Shadow Bloom with the full alphabet. Specimens at the rim are larger and carry bold designs, and every shape stands off the page on the same shadow.',
      data: 'rim specimens as the main track.',
      draw: make('bloom', 'shadow', { items: { spec: 18, nodes: 0.05, nodeK: [1.6, 3.2] } }),
    },
    {
      set: 'Conservative', name: 'Halftone Bloom+', from: 'r6 · 10',
      rule: 'Halftone Bloom with the full alphabet, the dot screen scaled to every shape from pinprick to rim.',
      data: 'dot density as a tone channel.',
      draw: make('bloom', 'halftone'),
    },

    // ========================================================== IN BETWEEN
    {
      set: 'In between', name: 'Woodcut × Halftone', from: 'r6 · 3 + 10',
      rule: 'Spokes alternate between woodcut and halftone, so two print techniques braid into the centre. Now and then a bead jumps to twice its neighbours\' size.',
      data: 'technique per spoke as a binary channel.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const lines = COMP.tide(r, nz), items = bySize(toItems(r, P, lines, base({ tail: [0.06, 1.4, 2.2] })));
        if (r.chance(0.5)) spineOf(ctx, P.ink, lines);
        for (const it of items) STYLE[it.g % 2 ? 'hatch' : 'halftone'].item(ctx, r, nz, { ...P }, it);
        close(ctx, P);
      },
    },
    {
      set: 'In between', name: 'Shadowed Collage', from: 'r6 · 4 + 9',
      rule: 'Collage Radiant (a different style per spoke) unified by one shared shadow under everything, so the mix reads as one object.',
      data: 'style per spoke.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const lines = COMP.tide(r, nz), items = bySize(toItems(r, P, lines, base({ tail: [0.05, 1.3, 2] })));
        shadowPass(ctx, r, nz, P, items);
        collage(ctx, r, nz, P, items, lines.length, ['flat', 'line', 'halftone', 'stipple', 'hatch']);
        close(ctx, P);
      },
    },
    {
      set: 'In between', name: 'Giants', from: 'r6 · 1 + 9',
      rule: 'Tide Radiant with four to seven giant specimens (hexagons, cogs, flowers, trefoils) laid over the spokes as landmarks. Each giant holds a bold design and casts a shadow.',
      data: 'the giants as finder and orientation, the spokes as data.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const lines = COMP.tide(r, nz), items = toItems(r, P, lines, base());
        render(ctx, r, nz, P, items, lines, 'flat');
        const G = giants(r, P, r.int(4, 7), 42, 105);
        shadowPass(ctx, r, nz, P, G, 5);
        for (const g of G) STYLE.flat.item(ctx, r, nz, P, g);
        close(ctx, P);
      },
    },
    {
      set: 'In between', name: 'Heavy Tail', from: 'r6 · 1 + 9',
      rule: 'Along every spoke, most beads are modest but about one in eight is two to three times the size, so shapes of wildly different scales crowd and overlap. Everything casts a shadow.',
      data: 'the rhythm of big beads along each spoke.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const lines = COMP.tide(r, nz), items = bySize(toItems(r, P, lines, base({ tail: [0.12, 1.6, 3.2], spec: 14 })));
        if (r.chance(0.5)) spineOf(ctx, P.ink, lines);
        shadowPass(ctx, r, nz, P, items);
        for (const it of items) STYLE.flat.item(ctx, r, nz, P, it);
        close(ctx, P);
      },
    },

    // ============================================================= RADICAL
    {
      set: 'Radical', name: 'Exploded', from: 'r6 · 1 + 9',
      rule: 'The radiant blown apart. Every shape is flung outward along its own ray, further near the rim, and spun loose, so the order of the spokes survives only as a direction of travel.',
      data: 'the ray each shape travels on.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const lines = COMP.tide(r, nz), items = toItems(r, P, lines, base({ tail: [0.1, 1.5, 3], nodes: 0.05 }));
        const K = r.range(18, 55), J = r.range(2, 8);
        for (const it of items) {
          const q = ovalR(it.x, it.y), a = Math.atan2(it.y - O.cy, it.x - O.cx), push = K * Math.pow(q, 1.3) * r.range(0.4, 1.6);
          it.x += Math.cos(a) * push + r.gauss() * J; it.y += Math.sin(a) * push + r.gauss() * J; it.a += r.gauss() * 0.9;
        }
        bySize(items);
        shadowPass(ctx, r, nz, P, items);
        for (const it of items) STYLE.flat.item(ctx, r, nz, P, it);
        close(ctx, P);
      },
    },
    {
      set: 'Radical', name: 'Fractal Vacuoles', from: 'r5 Bead Colonies + r6 · 1',
      rule: 'Every large shape is itself a vacuole: inside it, a miniature radiant of beads runs into its own centre. It is the same pattern at two scales, a code within a code.',
      data: 'the inner radiants, many small codes in one.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const lines = COMP.tide(r, nz), items = bySize(toItems(r, P, lines, base({ tail: [0.1, 1.6, 2.8], nodes: 0.07, nodeK: [2.6, 5], spec: 999 })));
        if (r.chance(0.5)) spineOf(ctx, P.ink, lines);
        const inner = r.shuffle(['circle', 'dot', 'star', 'ring', 'diamond', 'hex', 'lens', 'star4']).slice(0, 3);
        for (const it of items) {
          if (it.size < 22) { STYLE.flat.item(ctx, r, nz, P, it); continue; }
          const host = { ...it, specBead: r.pick(HOSTS), spec: 'host' };
          itemPath(ctx, nz, host); ctx.fillStyle = it.fill; ctx.fill('evenodd');
          ctx.save(); itemPath(ctx, nz, host); ctx.clip('evenodd');
          const Q = { ...P, ink: on(it.fill), field: it.fill, fills: P.mono ? [on(it.fill), it.fill] : P.fills.filter((c) => c !== it.fill) };
          for (const sp of spokeCells(r, nz, it.x, it.y, it.size / 2, { lenK: 0.8, gap: 1.2, target: r.range(2.5, 4) })) {
            const seq = sequence(r, Q, sp.length, { alphabet: inner, kinds: [1, 2] });
            sp.forEach((c, i) => bead(ctx, seq[i][0], c, seq[i][1], Q.ink, 0.8));
          }
          ctx.restore();
          itemPath(ctx, nz, host); ctx.strokeStyle = P.ink; ctx.lineWidth = 1.6; ctx.stroke();
        }
        close(ctx, P);
      },
    },
    {
      set: 'Radical', name: 'Type Radiant', from: 'r3 Type + r6 · 3 + 10',
      rule: 'Letter fragments (serifs, bowls, ball terminals) are shuffled into the spokes among the stars and hexagons. A few giant lenses magnify type. Woodcut and halftone alternate by spoke.',
      data: 'type fragments as a rare, distinctive symbol class.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const lines = COMP.tide(r, nz), items = bySize(toItems(r, P, lines, base({ tail: [0.06, 1.4, 2.2] })));
        for (const it of items) {
          if (r.chance(0.12)) { typePart(ctx, r, r.pick(PARTS), it.x, it.y + it.size * 0.6, it.size * 1.6, it.a + Math.PI / 2, P.mono ? P.ink : it.fill === P.field ? P.ink : it.fill, [0.4, 0.8]); continue; }
          STYLE[it.g % 3 === 0 ? 'hatch' : it.g % 3 === 1 ? 'halftone' : 'flat'].item(ctx, r, nz, { ...P }, it);
        }
        for (const [x, y, R] of pack(r, { n: r.int(2, 4), maxR: 90, gap: 40, tries: 800, point: (r) => inOval(r, 0.8), rad: (x, y, r) => r.range(45, 90), inside: (x, y, R) => { const q = ovalR(x, y); return q > 0.25 && q + R / 360 < 0.95; } })) {
          const fill = P.mono ? P.field : P.pick();
          ctx.beginPath(); circle(ctx, x, y, R); ctx.fillStyle = fill; ctx.fill();
          ctx.save(); ctx.beginPath(); circle(ctx, x, y, R); ctx.clip();
          const sz = R * r.range(1.8, 3.2);
          typePart(ctx, r, r.pick(PARTS), x + r.range(-0.3, 0.3) * sz, y + sz * r.range(0.3, 0.7), sz, r.range(-0.2, 0.2), on(fill));
          ctx.restore();
          ctx.beginPath(); circle(ctx, x, y, R); ctx.strokeStyle = P.ink; ctx.lineWidth = 2.4; ctx.stroke();
        }
        close(ctx, P);
      },
    },
    {
      set: 'Radical', name: 'Maximal Collage', from: 'r6 · 1 + 3 + 4 + 9 + 10',
      rule: 'Everything at once: every style assigned spoke by spoke (flat, line, pen, halftone, stipple, woodcut), the full alphabet, heavy-tailed sizes, bold designs, shared shadows and landmark giants.',
      data: 'too much to read, on purpose. A ceiling for the system.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const lines = COMP[r.pick(['tide', 'swirl', 'bloom'])](r, nz), items = bySize(toItems(r, P, lines, base({ tail: [0.1, 1.5, 3], nodes: 0.05, spec: 13 })));
        shadowPass(ctx, r, nz, P, items);
        collage(ctx, r, nz, P, items, lines.length, ['flat', 'flat', 'line', 'pen', 'halftone', 'stipple', 'hatch']);
        const G = giants(r, P, r.int(3, 6), 38, 95);
        shadowPass(ctx, r, nz, P, G, 5);
        for (const g of G) STYLE[r.pick(['flat', 'flat', 'halftone', 'hatch'])].item(ctx, r, nz, P, g);
        close(ctx, P);
      },
    },
    {
      set: 'Radical', name: 'Shattered', from: 'r6 · 1 + 3 + 4 + 10',
      rule: 'The radiant broken into wedges like a dropped plate. Each shard is knocked slightly out of place and turned, and each has its own ground colour and drawing style. The spokes still line up across the cracks, almost.',
      data: 'the shards as sectors of a ring code, each with its own key.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const lines = COMP.tide(r, nz), items = toItems(r, P, lines, base({ tail: [0.05, 1.3, 2] }));
        const K = r.int(5, 8), cuts = Array.from({ length: K }, () => r.range(0, TAU)).sort((a, b) => a - b);
        const grounds = P.mono ? ['#ffffff', '#111111'] : r.shuffle(P.fills.concat(P.field, P.ink));
        const angOf = (it) => Math.atan2((it.y - O.cy) / O.ry, (it.x - O.cx) / O.rx);
        const within = (a, a0, a1) => { const d = ((a - a0) % TAU + TAU) % TAU; return d <= ((a1 - a0) % TAU + TAU) % TAU; };
        ctx.fillStyle = P.mono ? '#111111' : P.ink; ovalPath(ctx); ctx.fill();
        for (let k = 0; k < K; k++) {
          const a0 = cuts[k], a1 = cuts[(k + 1) % K] + (k === K - 1 ? TAU : 0), mid = (a0 + a1) / 2, push = r.range(4, 12), turn = r.range(-0.05, 0.05);
          const ground = grounds[k % grounds.length], swap = (c) => (c === ground ? (P.mono ? (ground === '#111111' ? '#ffffff' : '#111111') : P.ink) : c);
          const S = { ...P, field: ground, ink: P.mono ? (ground === '#111111' ? '#ffffff' : '#111111') : on(ground) };
          const style = r.pick(['flat', 'flat', 'line', 'halftone', 'hatch', 'stipple']);
          ctx.save();
          ctx.translate(O.cx + Math.cos(mid) * push, O.cy + Math.sin(mid) * push); ctx.rotate(turn); ctx.translate(-O.cx, -O.cy);
          ctx.beginPath(); ctx.moveTo(O.cx, O.cy);
          for (let i = 0; i <= 40; i++) { const t = a0 + ((a1 - a0) * i) / 40; ctx.lineTo(O.cx + Math.cos(t) * O.rx * 1.1, O.cy + Math.sin(t) * O.ry * 1.1); }
          ctx.closePath(); ctx.fillStyle = ground; ctx.fill(); ctx.clip();
          for (const it of items) if (within(angOf(it), a0 - 0.15, a1 + 0.15)) {
            const m = P.mono ? { ...it, fill: ground === '#111111' ? (it.fill === '#111111' ? '#ffffff' : '#111111') : it.fill } : { ...it, fill: swap(it.fill), fill2: swap(it.fill2) };
            STYLE[style].item(ctx, r, nz, S, m);
          }
          ctx.restore();
        }
        close(ctx, { ...P, field: P.mono ? '#111111' : P.ink, ink: '#111111' });
      },
    },
  ];

  window.DIRECTIONS = DIRECTIONS;
})();
