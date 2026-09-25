/* Round 4: iterating on round 3's Petri, Specimen Reef, Nested Cells, Sequence
   Drift and Colonies, with Foam's density.
   The strand of multicoloured shapes from Sequence Drift is the thread through
   everything: each strand has its own small alphabet of bead shapes and its own
   colour logic (random, a repeating codon, runs, or one accent). */
(function () {
  const { TAU, ovalR, E, ovalPath, inOval, pack } = window.GL;
  const { HAIR, lum, on, open, close, rAdj, inside, circle, handCircle, KINDS, shapePath, makeShape, design, cellQuad, specimen, growTracks } = window.KIT;

  const { BEADS, beadPath, bead, sequence, spine, drawStrands, within, disc, inDisc, localTracks, spokeCells, penCircles, penRim, flowOpts } = window.STRANDS;


  window.SETS = {
    Strands: 'Sequence Drift pushed further. Every strand spells with its own small alphabet of shapes and colours.',
    'Reef × Strands': 'The strands crossed with Petri, Specimen Reef and Nested Cells.',
    Dense: 'Foam’s density, made less uniform: sizes follow a noise field and shapes follow a flow.',
    Colonies: 'Colonies crossed with the strands, the specimens and the pen.',
  };

  const DIRECTIONS = [
    // ============================================================= STRANDS
    {
      set: 'Strands', name: 'Bead Drift', from: '6',
      rule: 'Strands of beads (circles, pills, diamonds, triangles, rings, ruled bars) follow a random flow and fork. Each strand has its own alphabet and colour logic: random, a repeating codon, runs, or one accent. Bead size, roundness, spacing and flow change with every draw.',
      data: 'the bead sequence along each strand. Alphabets of 2–4 shapes × 4 colours.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const w0 = r.range(5, 10), w1 = w0 + r.range(3, 12), round = r.range(0.8, 1.7);
        const tracks = growTracks(r, nz, { w: [w0, w1], lenOf: (w, r) => w * round * r.range(0.8, 1.2), gap: r.range(1.5, 4.5), fork: r.range(0.02, 0.08), seeds: 700, cell: 6, ...flowOpts(r) });
        drawStrands(ctx, r, P, tracks, { spine: r.chance(0.75), outline: r.chance(0.7) });
        close(ctx, P);
      },
    },
    {
      set: 'Strands', name: 'Double Helix', from: '6',
      rule: 'Each strand is a pair of bead chains twisting around a shared axis, joined by rungs. Paired chains take complementary colours, and the bead turning toward you is drawn larger and on top.',
      data: 'base pairs: which colour pair sits on each rung.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const tracks = growTracks(r, nz, { w: [18, 32], lenOf: (w) => w * 0.5, gap: 1.2, fork: 0.015, seeds: 500, max: 140, cell: 7, ...flowOpts(r) });
        const f = r.shuffle(P.fills), pairs = P.mono ? [[P.ink, P.field]] : [[f[0], f[1]], [f[2], f[3]]];
        for (const t of tracks) {
          const ph = r.range(0, TAU), k = r.range(0.3, 0.6), kind = r.pick(['circle', 'circle', 'pill', 'diamond', 'squircle']);
          const A = [], B = [];
          t.forEach((c, i) => {
            const th = ph + i * k, off = Math.sin(th) * c.w * 0.38, px = -Math.sin(c.a), py = Math.cos(c.a);
            const p = r.pick(pairs), flip = r.chance(0.5);
            const sz = c.w * 0.44;
            A.push({ x: c.x + px * off, y: c.y + py * off, a: c.a, l: sz * (0.75 + 0.25 * Math.cos(th)), w: sz * (0.75 + 0.25 * Math.cos(th)), col: flip ? p[0] : p[1], z: Math.cos(th) });
            B.push({ x: c.x - px * off, y: c.y - py * off, a: c.a, l: sz * (0.75 - 0.25 * Math.cos(th)), w: sz * (0.75 - 0.25 * Math.cos(th)), col: flip ? p[1] : p[0], z: -Math.cos(th) });
          });
          ctx.strokeStyle = P.ink; ctx.lineWidth = HAIR; ctx.beginPath();
          A.forEach((a, i) => { if (i % 2 === 0) { ctx.moveTo(a.x, a.y); ctx.lineTo(B[i].x, B[i].y); } });
          for (const S of [A, B]) S.forEach((a, i) => (i ? ctx.lineTo(a.x, a.y) : ctx.moveTo(a.x, a.y)));
          ctx.stroke();
          for (const b of [...A, ...B].sort((u, v) => u.z - v.z)) bead(ctx, kind, b, b.col, P.ink);
        }
        close(ctx, P);
      },
    },
    {
      set: 'Strands', name: 'Swell', from: '6',
      rule: 'Strands whose beads swell and shrink in slow waves, large to tiny and back, so each strand has its own rhythm. The beads are mostly round, and the rhythm carries the variation.',
      data: 'the swell rhythm: the period and phase of each strand.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const fr = r.range(0.12, 0.4), sharp = r.range(1, 2.4);
        const tracks = growTracks(r, nz, { w: [9, 20], swell: (i, ph) => 0.3 + 1.3 * Math.pow(Math.abs(Math.sin(i * fr + ph)), sharp), lenOf: (w) => w, gap: r.range(1.5, 3), fork: 0.03, seeds: 600, cell: 6, ...flowOpts(r) });
        drawStrands(ctx, r, P, tracks, { alphabet: ['circle', 'circle', 'ring', 'dot', 'lens', 'squircle'], kinds: [1, 2], spine: r.chance(0.6) });
        close(ctx, P);
      },
    },
    {
      set: 'Strands', name: 'Weave', from: '6',
      rule: 'Two populations of strands following two different flows, one laid over the other. The upper strands cut a clean channel through the lower, so they read as woven.',
      data: 'two layers, each carrying its own sequence.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const base = r.range(0, TAU);
        const lower = growTracks(r, nz, { w: [3.5, 7], lenOf: (w, r) => w * r.range(1, 1.6), gap: 2, fork: 0.04, seeds: 900, cell: 5, base, freq: r.range(0.002, 0.005), curl: r.range(0.5, 1.2) });
        drawStrands(ctx, r, P, lower, { outline: true });
        const upper = growTracks(r, nz, { w: [10, 16], lenOf: (w, r) => w * r.range(0.9, 1.3), gap: 3, fork: 0.02, seeds: 90, cell: 7, base: base + Math.PI / 2 + r.range(-0.4, 0.4), freq: r.range(0.002, 0.005), curl: r.range(0.5, 1.2), noiseOff: 40 });
        for (const t of upper) for (const c of t) bead(ctx, 'pill', { ...c, l: c.l + 8, w: c.w + 8 }, P.field, null);
        drawStrands(ctx, r, P, upper, { spine: false, outline: true });
        close(ctx, P);
      },
    },

    // ====================================================== REEF × STRANDS
    {
      set: 'Reef × Strands', name: 'Beaded Petri', from: '1 + 6',
      rule: 'Your sketch with strands running under it. Pen circles float over a field of small bead strands, like lenses laid on a sample. The strands show through each lens.',
      data: 'strand sequences, with the circles as a second layer.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const cs = penCircles(r, r.int(45, 70));
        if (!P.mono) for (const [x, y, R] of cs) if (r.chance(0.4)) { ctx.fillStyle = P.pick(); ctx.beginPath(); circle(ctx, x, y, R); ctx.fill(); }
        const tracks = growTracks(r, nz, { w: [3.5, 7], lenOf: (w, r) => w * r.range(0.9, 1.5), gap: 2, fork: 0.05, seeds: 900, cell: 5, ...flowOpts(r) });
        drawStrands(ctx, r, P, tracks, { spine: r.chance(0.5) });
        ctx.restore(); // drop the oval clip: pen circles may cross the rim, as in the sketch
        ctx.strokeStyle = P.ink; ctx.lineWidth = r.range(1.8, 2.4);
        for (const [x, y, R, k] of cs) {
          ctx.beginPath(); handCircle(ctx, nz, x, y, R, k); ctx.stroke();
          if (R > 14 && r.chance(0.3)) { ctx.beginPath(); handCircle(ctx, nz, x + r.range(-0.4, 0.4) * R, y + r.range(-0.4, 0.4) * R, R * r.range(0.1, 0.2), k + 5); ctx.stroke(); }
        }
        penRim(ctx, r, nz, P);
      },
    },
    {
      set: 'Reef × Strands', name: 'Specimen Strands', from: '2 + 6',
      rule: 'Strands whose beads are specimens: each bead is a shape holding its own design. A strand repeats a small set of shapes and designs, like a sentence in a pictographic script.',
      data: 'shape × design × colour per bead. The richest alphabet here.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const tracks = growTracks(r, nz, { w: [16, 32], lenOf: (w, r) => w * r.range(0.9, 1.3), gap: r.range(2, 5), fork: 0.03, seeds: 350, cell: 8, ...flowOpts(r) });
        if (r.chance(0.6)) spine(ctx, P, tracks);
        for (const t of tracks) {
          const kinds = r.shuffle(['circle', 'ellipse', 'pill', 'squircle', 'lens', 'blob']).slice(0, r.int(1, 3));
          const designs = r.shuffle(['rings', 'hatch', 'dots', 'bands', 'nucleus', 'stipple', 'spokes', 'type', 'waves']).slice(0, r.int(1, 3));
          const cols = sequence(r, P, t.length);
          t.forEach((c, i) => {
            const long = c.l >= c.w, s = { x: c.x, y: c.y, R: Math.max(c.l, c.w) / 2, asp: Math.min(c.l, c.w) / Math.max(c.l, c.w), rot: long ? c.a : c.a + Math.PI / 2, kind: kinds[i % kinds.length], k: i };
            const fill = cols[i][1];
            shapePath(ctx, nz, s); ctx.fillStyle = fill; ctx.fill();
            ctx.save(); shapePath(ctx, nz, s); ctx.clip(); design(ctx, r, nz, s, designs[i % designs.length], on(fill)); ctx.restore();
            shapePath(ctx, nz, s); ctx.strokeStyle = P.ink; ctx.lineWidth = HAIR; ctx.stroke();
          });
        }
        close(ctx, P);
      },
    },
    {
      set: 'Reef × Strands', name: 'Strands & Specimens', from: '2 + 6',
      rule: 'A handful of large specimens are placed first, and then strands fill every gap between them, flowing around each one like current around stones.',
      data: 'the specimens as landmarks (finder and orientation), with data in the strands.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const big = pack(r, { n: r.int(10, 24), maxR: 95, gap: 34, tries: 2000, point: (r) => inOval(r, 0.9), rad: (x, y, r) => r.range(26, 95), inside: inside(0, 0.93) });
        const tracks = growTracks(r, nz, { obstacles: big.map(([x, y, R]) => [x, y, R + 7]), w: [5, 12], lenOf: (w, r) => w * r.range(0.9, 1.5), gap: 2.2, fork: 0.05, seeds: 800, cell: 6, ...flowOpts(r) });
        drawStrands(ctx, r, P, tracks);
        for (const [x, y, R] of big) specimen(ctx, r, nz, P, makeShape(r, x, y, R, ['circle', 'circle', 'ellipse', 'squircle', 'blob']), undefined, 1.8);
        close(ctx, P);
      },
    },
    {
      set: 'Reef × Strands', name: 'Halo Reef', from: '2 + 6',
      rule: 'Specimens ringed by orbits of beads. Each shape wears one to three halos, each halo spelling its own sequence around it.',
      data: 'the halo sequences. Each specimen is a self-contained ring code.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const items = pack(r, { n: 60, maxR: 90, gap: r.range(3, 9), tries: 4000, point: (r) => inOval(r, 0.95), rad: () => 16 + Math.pow(r.next(), 1.4) * 74, inside: inside(0, 0.99) });
        for (const [x, y, T] of items) {
          const bw = r.range(4, 8), core = T * r.range(0.45, 0.7), k = Math.max(1, Math.min(3, Math.floor((T - core - 4) / (bw + 3))));
          ctx.strokeStyle = P.ink; ctx.lineWidth = HAIR;
          for (let j = 0; j < k; j++) { ctx.beginPath(); circle(ctx, x, y, core + 5 + j * (bw + 3) + bw / 2); ctx.stroke(); }
          specimen(ctx, r, nz, P, makeShape(r, x, y, core, ['circle']));
          for (let j = 0; j < k; j++) {
            const Ro = core + 5 + j * (bw + 3) + bw / 2, n = Math.max(6, Math.floor((TAU * Ro) / (bw * r.range(1.2, 1.8)))), a0 = r.range(0, TAU);
            const seq = sequence(r, P, n, { kinds: [1, 3] });
            for (let i = 0; i < n; i++) {
              const a = a0 + (i / n) * TAU;
              bead(ctx, seq[i][0], { x: x + Math.cos(a) * Ro, y: y + Math.sin(a) * Ro, a: a + Math.PI / 2, l: bw * r.range(0.8, 1.15), w: bw }, seq[i][1], P.ink);
            }
          }
        }
        close(ctx, P);
      },
    },
    {
      set: 'Reef × Strands', name: 'Cell Threads', from: '3 + 6',
      rule: 'Nested cells whose cytoplasm is threaded with strands. Each cell grows its own local drift of tiny beads, with a nucleus floating among them.',
      data: 'strands inside each cell, so each cell is its own small code.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        let big = 0;
        const cells = pack(r, { n: 30, maxR: 160, gap: 6, tries: 4000, point: (r) => inOval(r, 0.96), rad: () => (big++ < 900 ? 60 + r.next() * 100 : 18 + r.next() * 50), inside: inside(0, 1.0) });
        for (const [x, y, R] of cells) {
          const fill = P.mono ? (r.chance(0.3) ? P.ink : P.field) : r.chance(0.15) ? P.field : P.pick(), Q = within(P, fill);
          const s = makeShape(r, x, y, R, ['circle', 'circle', 'blob']);
          shapePath(ctx, nz, s); ctx.fillStyle = fill; ctx.fill();
          ctx.save(); shapePath(ctx, nz, s); ctx.clip();
          const nx = x + r.range(-0.35, 0.35) * R, ny = y + r.range(-0.35, 0.35) * R, nr = R * r.range(0.14, 0.24), nf = Q.fills.length ? r.pick(Q.fills) : Q.ink;
          drawStrands(ctx, r, Q, localTracks(r, nz, x, y, R), { spine: r.chance(0.5) });
          ctx.beginPath(); circle(ctx, nx, ny, nr); ctx.fillStyle = nf; ctx.fill(); ctx.strokeStyle = Q.ink; ctx.lineWidth = 1.4; ctx.stroke();
          ctx.beginPath(); circle(ctx, nx + r.range(-0.3, 0.3) * nr, ny + r.range(-0.3, 0.3) * nr, nr * 0.3); ctx.fillStyle = on(nf); ctx.fill();
          ctx.restore();
          shapePath(ctx, nz, s); ctx.strokeStyle = P.ink; ctx.lineWidth = 1.6; ctx.stroke();
        }
        close(ctx, P);
      },
    },

    // =============================================================== DENSE
    {
      set: 'Dense', name: 'Flow Foam', from: '4 + 6',
      rule: 'Foam at full density, but bubble size follows a noise field, so fine froth and big cells come in patches. Every bubble stretches along a shared flow. A few carry a short strand of beads.',
      data: 'which bubbles carry strands. The flow gives the scanner an orientation.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const ground = P.mono ? '#111111' : r.pick([P.ink, P.field]);
        ctx.fillStyle = ground; ovalPath(ctx); ctx.fill();
        const fq = r.range(0.004, 0.009), rmin = r.range(3, 5), rmax = r.range(40, 70), base = r.range(0, TAU);
        const size = (x, y) => rmin + (rmax - rmin) * Math.pow(Math.max(0, (nz(x * fq + 30, y * fq + 30) + 1) / 2), 1.8);
        let tick = 0; const T = 18000;
        const bubs = pack(r, { n: 1800, maxR: rmax, gap: r.range(1.5, 3), tries: T, point: (r) => inOval(r, 1.0), rad: (x, y) => size(x, y) * r.range(0.75, 1) * (0.5 + 0.5 * Math.pow(1 - tick++ / T, 2)), inside: inside(0, 1.08) });
        for (const [x, y, R] of bubs) {
          const rot = base + nz(x * 0.003, y * 0.003) * Math.PI, asp = r.range(0.55, 0.92), fill = P.mono ? '#ffffff' : P.other(ground);
          ctx.beginPath(); ctx.ellipse(x, y, R, R * asp, rot, 0, TAU); ctx.fillStyle = fill; ctx.fill();
          if (R > 12 && r.chance(0.22)) {
            const n = r.int(2, 5), bw = R * asp * 0.5, Q = within(P, fill), seq = sequence(r, Q, n);
            for (let i = 0; i < n; i++) { const u = (i - (n - 1) / 2) * bw * 1.15; bead(ctx, seq[i][0], { x: x + Math.cos(rot) * u, y: y + Math.sin(rot) * u, a: rot, l: bw, w: bw }, seq[i][1], Q.ink); }
          }
        }
        close(ctx, P);
      },
    },
    {
      set: 'Dense', name: 'Patch Foam', from: '4 + 2',
      rule: 'Dense packing of every shape kind. Size and spacing both follow noise, so it clots in some places and opens in others. A few large specimens float over the top, breaking the grid-like evenness.',
      data: 'shape kinds across the foam, with the floaters as landmarks.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const fq = r.range(0.004, 0.009), fg2 = r.range(0.006, 0.012);
        const size = (x, y) => 4 + 44 * Math.pow(Math.max(0, (nz(x * fq + 11, y * fq + 11) + 1) / 2), 1.6);
        let tick = 0; const T = 14000;
        const bubs = pack(r, { n: 1300, maxR: 48, gap: 2, tries: T, point: (r) => inOval(r, 1.0), rad: (x, y) => size(x, y) * r.range(0.7, 1) * (0.55 + 0.45 * Math.pow(1 - tick++ / T, 2)) - 2 * Math.max(0, nz(x * fg2, y * fg2)) * 3, inside: (x, y, rad) => rad > 2.5 && inside(0, 1.06)(x, y, rad) });
        for (const [x, y, R] of bubs) {
          const s = makeShape(r, x, y, R), fill = P.mono ? (r.chance(0.2) ? P.ink : P.field) : r.chance(0.3) ? P.field : P.pick();
          shapePath(ctx, nz, s); ctx.fillStyle = fill; ctx.fill();
          if (R > 10 && r.chance(0.25)) { ctx.save(); shapePath(ctx, nz, s); ctx.clip(); design(ctx, r, nz, s, r.pick(['rings', 'dots', 'nucleus', 'bands', 'hatch']), on(fill)); ctx.restore(); }
          shapePath(ctx, nz, s); ctx.strokeStyle = P.ink; ctx.lineWidth = HAIR; ctx.stroke();
        }
        for (let i = 0, n = r.int(5, 12); i < n; i++) { const [x, y] = inOval(r, 0.8); specimen(ctx, r, nz, P, makeShape(r, x, y, r.range(30, 70)), undefined, 2); }
        close(ctx, P);
      },
    },

    // ============================================================ COLONIES
    {
      set: 'Colonies', name: 'Drift Colonies', from: '8 + 6',
      rule: 'Colonies of every size, each growing its own small drift of multicoloured bead strands instead of spokes, so each one looks like its own culture.',
      data: 'strands per colony, so each colony is a small code.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const cols = pack(r, { n: 55, maxR: 115, gap: r.range(3, 8), tries: 4000, point: (r) => inOval(r, 0.96), rad: () => 14 + Math.pow(r.next(), 1.6) * 100, inside: inside(0, 1.0) });
        for (const [x, y, R] of cols) {
          const fill = P.mono ? (r.chance(0.25) ? P.ink : P.field) : r.chance(0.15) ? P.field : P.pick(), Q = within(P, fill);
          ctx.beginPath(); circle(ctx, x, y, R); ctx.fillStyle = fill; ctx.fill();
          ctx.save(); ctx.beginPath(); circle(ctx, x, y, R); ctx.clip();
          drawStrands(ctx, r, Q, localTracks(r, nz, x, y, R, { seedK: 1.3 }), { spine: r.chance(0.4) });
          ctx.restore();
          ctx.beginPath(); circle(ctx, x, y, R); ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5; ctx.stroke();
        }
        close(ctx, P);
      },
    },
    {
      set: 'Colonies', name: 'Specimen Colonies', from: '8 + 2',
      rule: 'Colonies take every specimen shape (blobs, pills, squircles, lenses) and pack densely. Branching spokes grow inside each, clipped to its outline, and now and then a smaller colony grows inside a larger one.',
      data: 'spoke patterns per colony, plus shape kind.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        function colony(x, y, R, depth) {
          const s = makeShape(r, x, y, R), fill = P.mono ? (r.chance(0.25) ? P.ink : P.field) : r.chance(0.12) ? P.field : P.pick(), fg = on(fill);
          shapePath(ctx, nz, s); ctx.fillStyle = fill; ctx.fill();
          ctx.save(); shapePath(ctx, nz, s); ctx.clip();
          const solid = new Path2D(), openP = new Path2D();
          for (const sp of spokeCells(r, nz, x, y, R * 1.05)) for (const c of sp) { const k = r.next(); if (k < 0.45) cellQuad(solid, c.x, c.y, c.a, c.l, c.w); else if (k < 0.7) cellQuad(openP, c.x, c.y, c.a, c.l, c.w); }
          ctx.fillStyle = fg; ctx.fill(solid); ctx.strokeStyle = fg; ctx.lineWidth = 1; ctx.stroke(openP);
          if (depth === 0 && R > 50 && r.chance(0.35)) colony(x + r.range(-0.3, 0.3) * R, y + r.range(-0.3, 0.3) * R, R * r.range(0.3, 0.45), 1);
          ctx.restore();
          shapePath(ctx, nz, s); ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5; ctx.stroke();
        }
        for (const [x, y, R] of pack(r, { n: 70, maxR: 110, gap: r.range(2, 6), tries: 4000, point: (r) => inOval(r, 0.97), rad: () => 12 + Math.pow(r.next(), 1.6) * 98, inside: inside(0, 1.02) })) colony(x, y, R, 0);
        close(ctx, P);
      },
    },
    {
      set: 'Colonies', name: 'Bead Colonies', from: '8 + 6 + 1',
      rule: 'Branching spokes whose cells are multicoloured beads, each spoke spelling its own sequence, inside colonies outlined with a pen line like your sketch.',
      data: 'bead sequences along the spokes of each colony.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const cols = pack(r, { n: 45, maxR: 120, gap: r.range(6, 14), tries: 4000, point: (r) => inOval(r, 0.96), rad: () => 16 + Math.pow(r.next(), 1.5) * 104, inside: inside(0, 0.99) });
        for (const [x, y, R] of cols) {
          const fill = P.mono ? (r.chance(0.2) ? P.ink : P.field) : r.chance(0.35) ? P.field : P.pick(), Q = within(P, fill);
          ctx.beginPath(); circle(ctx, x, y, R); ctx.fillStyle = fill; ctx.fill();
          ctx.save(); ctx.beginPath(); circle(ctx, x, y, R); ctx.clip();
          const alphabet = r.shuffle(['circle', 'pill', 'diamond', 'squircle', 'ring', 'dot']).slice(0, r.int(2, 4));
          for (const sp of spokeCells(r, nz, x, y, R, { lenK: 1.3, gap: 1.5 })) {
            const seq = sequence(r, Q, sp.length, { alphabet, kinds: [1, 3] });
            sp.forEach((c, i) => bead(ctx, seq[i][0], c, seq[i][1], Q.ink, 0.9));
          }
          ctx.restore();
          ctx.strokeStyle = P.ink; ctx.lineWidth = 2; ctx.beginPath(); handCircle(ctx, nz, x, y, R, x * 0.01); ctx.stroke();
        }
        close(ctx, P);
      },
    },
  ];

  window.DIRECTIONS = DIRECTIONS;
})();
