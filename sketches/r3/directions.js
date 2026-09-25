/* Round 3: built mostly from Bubble Reef and Branching Spokes, with sets
   for type anatomy and trees entering from the rim.
   - no radial organisation, no centre anchor: placement is random but
     evenly weighted, and the rim is the only frame
   - colour is either pure black and white or fully saturated (never beige);
     the page's switch picks mono, colour or a mix */
(function () {
  const { TAU, O, bez, E, ovalR, frameAt, idMap, press, addNib, ovalPath, paper, inOval, colonize, pack } = window.GL;
  const { HAIR, MONO, VIVID, lum, on, palette, open, close, rAdj, inside, circle, handCircle, KINDS, shapePath, makeShape, PARTS, typePart, DESIGNS, branch, design, cellQuad, specimen, growTracks, growTree, entries, drawSegs } = window.KIT;

  window.SETS = {
    Reef: 'From Bubble Reef and your sketch: loose collections of circles and other shapes, each holding its own design.',
    Genome: 'From Branching Spokes, read like a genome: chromosomes, reads, gels and colonies, with random placement and nothing radial.',
    Type: 'Anatomy of type (stems, serifs, bowls, ball terminals, ink traps) without ever forming a letter.',
    Canopy: 'Recursive trees entering from random points on the rim, combined with the reef and the genome.',
  };

  const DIRECTIONS = [
    // ================================================================ REEF
    {
      set: 'Reef', name: 'Petri', from: 'your sketch',
      rule: 'Pen circles of every size, scattered and overlapping, a few with a nucleus. Specks and dots drift between them. In colour, some circles are flooded, and the outlines always sit on top so the overlaps stay readable.',
      data: 'which circles hold a nucleus and where it sits.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env, false);
        const cs = [];
        for (let i = 0, n = r.int(60, 85); i < n; i++) {
          let [x, y] = inOval(r, 0.93);
          const R = r.chance(0.3) ? r.range(5, 12) : r.range(16, 60);
          if (cs.length && r.chance(0.4)) { const [px, py, pr] = r.pick(cs), a = r.range(0, TAU), d = pr * r.range(0.5, 1.1) + R * 0.5; x = px + Math.cos(a) * d; y = py + Math.sin(a) * d; }
          if (ovalR(x, y) + rAdj(R) * 0.6 > 1.02) continue;
          cs.push([x, y, R, r.range(0, 99)]);
        }
        if (!P.mono) for (const [x, y, R] of cs) if (r.chance(0.45)) { ctx.fillStyle = P.pick(); ctx.beginPath(); circle(ctx, x, y, R); ctx.fill(); }
        ctx.strokeStyle = P.ink; ctx.lineWidth = r.range(1.7, 2.3);
        for (const [x, y, R, k] of cs) {
          ctx.beginPath(); handCircle(ctx, nz, x, y, R, k); ctx.stroke();
          if (R > 14 && r.chance(0.3)) { ctx.beginPath(); handCircle(ctx, nz, x + r.range(-0.4, 0.4) * R, y + r.range(-0.4, 0.4) * R, R * r.range(0.1, 0.2), k + 5); ctx.stroke(); }
        }
        for (let i = 0; i < r.int(25, 40); i++) {
          const [x, y] = inOval(r, 0.9);
          ctx.beginPath();
          if (r.chance(0.5)) { handCircle(ctx, nz, x, y, r.range(2.5, 5), i); ctx.stroke(); } else { circle(ctx, x, y, r.range(1.6, 2.6)); ctx.fillStyle = P.ink; ctx.fill(); }
        }
        ctx.restore();
        ctx.strokeStyle = lum(P.field) > 0.45 ? P.ink : '#111111'; ctx.lineWidth = 2.2;
        for (let pass = 0; pass < 2; pass++) {
          ctx.beginPath();
          const t0 = r.range(0, TAU), span = pass ? r.range(0.8, 1.6) : TAU * 1.02;
          for (let i = 0; i <= 240; i++) {
            const t = t0 + (span * i) / 240, [x, y] = E(t, 1 + 0.006 * nz(Math.cos(t) * 2 + pass * 5, Math.sin(t) * 2) + pass * 0.012);
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.stroke();
        }
      },
    },
    {
      set: 'Reef', name: 'Specimen Reef', from: 'Bubble Reef',
      rule: 'Circles, ellipses, pills, squircles, lenses and blobs, loosely packed and sometimes overlapping. Each holds its own design: rings, hatching, dot grids, genome bands, spokes, a serif, a tiny tree, a nucleus, or waves.',
      data: 'shape and design per position, a two-part symbol.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const shapes = pack(r, { n: 120, maxR: 70, gap: r.range(-6, 6), tries: 5000, point: (r) => inOval(r, 0.98), rad: () => 8 + Math.pow(r.next(), 1.8) * 62, inside: inside(0, 1.04) });
        for (const [x, y, R] of r.shuffle(shapes)) specimen(ctx, r, nz, P, makeShape(r, x, y, R));
        close(ctx, P);
      },
    },
    {
      set: 'Reef', name: 'Nested Cells', from: 'Bubble Reef',
      rule: 'Cells inside cells inside cells, up to four deep. Each membrane is a soft blob, and colour or black and white alternates with depth, so the nesting reads at a glance.',
      data: 'nesting depth and child count per cell.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const cols = P.mono ? [P.ink, P.field] : r.shuffle(P.fills.concat(P.field));
        function cell(x, y, R, d) {
          const s = makeShape(r, x, y, R, d ? ['circle', 'blob', 'ellipse'] : ['blob', 'circle']);
          const fill = cols[d % cols.length];
          shapePath(ctx, nz, s); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5; ctx.stroke();
          if (d >= 3 || R < 12) { ctx.beginPath(); circle(ctx, x + r.range(-0.3, 0.3) * R, y + r.range(-0.3, 0.3) * R, Math.max(1.5, R * 0.18)); ctx.fillStyle = on(fill); ctx.fill(); return; }
          const kids = pack(r, { n: r.int(2, 7), maxR: R * 0.45, gap: 3, tries: 300, point: (r) => { const a = r.range(0, TAU), q = Math.sqrt(r.next()) * R * 0.7; return [x + Math.cos(a) * q, y + Math.sin(a) * q]; }, rad: (px, py, r) => r.range(R * 0.12, R * 0.45), inside: (px, py, rr) => Math.hypot(px - x, py - y) + rr < R * 0.82 });
          for (const [kx, ky, kr] of kids) cell(kx, ky, kr, d + 1);
        }
        let big = 0;
        for (const [x, y, R] of pack(r, { n: 40, maxR: 150, gap: 6, tries: 4000, point: (r) => inOval(r, 0.96), rad: () => (big++ < 900 ? 60 + r.next() * 90 : 16 + r.next() * 50), inside: inside(0, 1.0) })) cell(x, y, R, 0);
        close(ctx, P);
      },
    },
    {
      set: 'Reef', name: 'Foam', from: 'Bubble Reef',
      rule: 'A tight foam of circles whose interstices are solid, so the gaps between bubbles become a second drawing. A few bubbles carry a mark.',
      data: 'which bubbles carry a mark, a sparse codebook on a busy ground.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const ground = P.mono ? '#111111' : r.pick([P.ink, P.field]);
        ctx.fillStyle = ground; ovalPath(ctx); ctx.fill();
        let tick = 0; const T = 16000, gapF = r.range(2, 3.5);
        const bubs = pack(r, { n: 1400, maxR: 62, gap: gapF, tries: T, point: (r) => inOval(r, 1.0), rad: () => 3.5 + 58 * Math.pow(1 - tick++ / T, 3) * r.range(0.6, 1), inside: inside(0, 1.08) });
        for (const [x, y, R] of bubs) {
          const fill = P.mono ? '#ffffff' : P.other(ground);
          ctx.beginPath(); circle(ctx, x, y, R); ctx.fillStyle = fill; ctx.fill();
          if (R > 10 && r.chance(0.28)) {
            ctx.save(); ctx.beginPath(); circle(ctx, x, y, R); ctx.clip();
            design(ctx, r, nz, { x, y, R }, r.pick(['nucleus', 'rings', 'dots', 'bands', 'type']), on(fill));
            ctx.restore();
          }
        }
        close(ctx, P);
      },
    },

    // ============================================================== GENOME
    {
      set: 'Genome', name: 'Karyotype', from: 'Branching Spokes',
      rule: 'Twenty-three banded chromosome pairs, largest to smallest, scattered at random angles. Homologous pairs share their banding, some in metaphase as an X. In colour, each pair is painted a different colour, as in FISH imaging.',
      data: 'the band pattern on each chromosome. It is literally a barcode.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const placed = [], scale = r.range(1.1, 1.3);
        function chromo(L, w, c, bands) {
          const N = 44, top = [], bot = [];
          for (let i = 0; i <= N; i++) {
            const u = i / N, xx = -L / 2 + u * L, e = (Math.min(u, 1 - u) * L) / (w / 2);
            const cap = e < 1 ? Math.sqrt(Math.max(0, 1 - (1 - e) ** 2)) : 1;
            const hw = (w / 2) * cap * (1 - 0.45 * Math.exp(-((((u - c) * L) / (w * 0.5)) ** 2)));
            top.push([xx, -hw]); bot.push([xx, hw]);
          }
          const path = () => { ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]); for (const p of top) ctx.lineTo(p[0], p[1]); for (let i = N; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]); ctx.closePath(); };
          return { path, bands, L, w };
        }
        function drawChromo(k, fill) {
          k.path(); ctx.fillStyle = fill; ctx.fill();
          ctx.save(); k.path(); ctx.clip(); ctx.fillStyle = on(fill) === '#111111' ? '#111111' : P.ink;
          if (P.mono) ctx.fillStyle = fill === '#111111' ? '#ffffff' : '#111111';
          for (const [u, t] of k.bands) ctx.fillRect(-k.L / 2 + u * k.L, -k.w, t * k.L, k.w * 2);
          ctx.restore();
          k.path(); ctx.strokeStyle = P.ink; ctx.lineWidth = HAIR; ctx.stroke();
        }
        for (let i = 0; i < 23; i++) {
          const L = (150 - i * 4.4) * scale * r.range(0.9, 1.1), w = r.range(13, 18) * scale, c = r.range(0.22, 0.5);
          const bands = [];
          for (let u = 0.04; u < 0.96;) { const t = r.range(0.015, 0.07); if (r.chance(0.5)) bands.push([u, t]); u += t + r.range(0.01, 0.06); }
          const xs = r.chance(0.35), gapW = xs ? w * 1.2 : w * 0.75;
          for (let tries = 0; tries < 600; tries++) {
            const [x, y] = inOval(r, 0.92), a = r.range(0, TAU), ca = Math.cos(a), sa = Math.sin(a);
            const circles = [];
            for (let s = -L / 2; s <= L / 2; s += w * 0.9) for (const o of [-gapW, gapW]) circles.push([x + ca * s - sa * o, y + sa * s + ca * o, w * 0.75]);
            if (!circles.every(([cx, cy]) => ovalR(cx, cy) < 0.95)) continue;
            if (!circles.every(([cx, cy, cr]) => placed.every(([px, py, pr]) => Math.hypot(px - cx, py - cy) > pr + cr + 2))) continue;
            placed.push(...circles);
            const fill = P.mono ? (r.chance(0.8) ? P.field : P.ink) : P.pick();
            const k = chromo(L, xs ? w * 0.62 : w, c, bands);
            ctx.save(); ctx.translate(x, y); ctx.rotate(a);
            for (const o of [-gapW, gapW]) {
              ctx.save(); ctx.translate(0, o);
              if (xs) for (const tw of [-0.14, 0.14]) { ctx.save(); ctx.translate(-L / 2 + c * L, 0); ctx.rotate(tw); ctx.translate(L / 2 - c * L, 0); drawChromo(k, fill); ctx.restore(); }
              else drawChromo(k, fill);
              ctx.restore();
            }
            ctx.restore();
            break;
          }
        }
        close(ctx, P);
      },
    },
    {
      set: 'Genome', name: 'Sequence Drift', from: 'Branching Spokes',
      rule: 'The spokes, set loose. Tracks of cells follow a random flow field from random seeds, fork, and stop wherever another track already runs. The result reads like a genome browser with no axis.',
      data: 'cell states along each track. Longest reads first.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const tracks = growTracks(r, nz, { w: [6, 14], len: [5, 14], gap: 2.6, fork: 0.06, seeds: 600, freq: r.range(0.002, 0.005), curl: r.range(0.8, 1.8) });
        const solid = new Path2D(), openP = new Path2D(), spine = new Path2D(), acc = P.mono ? null : P.fills.map(() => new Path2D());
        for (const t of tracks) {
          spine.moveTo(t[0].x, t[0].y); for (const c of t) spine.lineTo(c.x, c.y);
          const tint = acc ? r.int(0, acc.length - 1) : 0;
          for (const c of t) {
            const k = r.next();
            if (k < 0.45) cellQuad(solid, c.x, c.y, c.a, c.l, c.w);
            else if (k < 0.72) cellQuad(openP, c.x, c.y, c.a, c.l, c.w);
            else if (acc && k < 0.9) cellQuad(acc[tint], c.x, c.y, c.a, c.l, c.w);
          }
        }
        ctx.strokeStyle = P.ink; ctx.lineWidth = HAIR; ctx.stroke(spine);
        ctx.fillStyle = P.field; ctx.fill(openP); ctx.stroke(openP);
        if (acc) acc.forEach((p, i) => { ctx.fillStyle = P.fills[i]; ctx.fill(p); ctx.stroke(p); });
        ctx.fillStyle = P.ink; ctx.fill(solid);
        close(ctx, P);
      },
    },
    {
      set: 'Genome', name: 'Gel', from: 'Branching Spokes',
      rule: 'Electrophoresis lanes at a random angle across the oval, each carrying bands, doublets and smears at its own positions. In colour it glows the way a gel does under UV.',
      data: 'band positions per lane. Each lane is a column of bits.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const ang = r.range(0, Math.PI);
        ctx.save(); ctx.translate(O.cx, O.cy); ctx.rotate(ang);
        for (let x = -620; x < 620;) {
          const lw = r.range(14, 30), dy = r.range(-30, 30), col = P.mono ? P.ink : P.pick();
          ctx.fillStyle = col; ctx.strokeStyle = col;
          ctx.lineWidth = HAIR; ctx.strokeRect(x, -520 + dy, lw, 1040);
          for (let y = -500 + dy; y < 500;) {
            const k = r.next();
            if (k < 0.55) { const th = r.chance(0.75) ? r.range(1.6, 4) : r.range(5, 11); ctx.fillRect(x, y, lw, th); y += th + r.range(3, 16); }
            else if (k < 0.7) { ctx.fillRect(x, y, lw, 2.2); ctx.fillRect(x, y + 4.6, lw, 2.2); y += 14; }
            else if (k < 0.8) { for (let j = 0; j < r.int(3, 7); j++) ctx.fillRect(x + lw * 0.1, y + j * 3.4, lw * 0.8, 1.4); y += 30; }
            else y += r.range(8, 40);
          }
          x += lw + r.range(5, 16);
        }
        ctx.restore();
        close(ctx, P);
      },
    },
    {
      set: 'Genome', name: 'Colonies', from: 'Branching Spokes + Bubble Reef',
      rule: 'Branching Spokes shrunk into colonies. Discs of every size scattered across the oval, each growing its own forking spokes of cells from an off-centre core.',
      data: 'spoke patterns inside each colony, many small codes in one.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const cols = pack(r, { n: 60, maxR: 110, gap: 6, tries: 4000, point: (r) => inOval(r, 0.96), rad: () => 14 + Math.pow(r.next(), 1.7) * 96, inside: inside(0, 1.0) });
        for (const [cx, cy, R] of cols) {
          const fill = P.mono ? (r.chance(0.25) ? P.ink : P.field) : r.chance(0.15) ? P.field : P.pick(), fg = on(fill);
          ctx.beginPath(); circle(ctx, cx, cy, R); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = 1.4; ctx.stroke();
          const ox = cx + r.range(-0.25, 0.25) * R, oy = cy + r.range(-0.25, 0.25) * R, target = r.range(4, 7) * Math.max(1, R / 60);
          const solid = new Path2D(), openP = new Path2D();
          (function spoke(th, rho, aw, depth) {
            while (true) {
              const ex = cx + Math.cos(th) * R, ey = cy + Math.sin(th) * R, len = Math.hypot(ex - ox, ey - oy);
              if (rho * len > len - 3) break;
              const width = aw * rho * len;
              if (width > 2 * target && depth < 7) { spoke(th - aw / 4, rho, aw / 2, depth + 1); spoke(th + aw / 4, rho, aw / 2, depth + 1); return; }
              const cl = Math.min(r.range(3, 8) * Math.max(1, R / 70), len * (1 - rho) - 2), a = Math.atan2(ey - oy, ex - ox);
              if (cl < 2) break;
              const d = rho * len + cl / 2;
              const k = r.next();
              if (k < 0.45) cellQuad(solid, ox + Math.cos(a) * d, oy + Math.sin(a) * d, a, cl, Math.max(1.4, width * 0.65));
              else if (k < 0.7) cellQuad(openP, ox + Math.cos(a) * d, oy + Math.sin(a) * d, a, cl, Math.max(1.4, width * 0.65));
              rho += (cl + 2) / len;
              th += nz(th * 3 + cx, rho * 4) * 0.02;
            }
          })(r.range(0, TAU), 0.12, TAU, 0);
          ctx.fillStyle = fg; ctx.fill(solid); ctx.strokeStyle = fg; ctx.lineWidth = 1; ctx.stroke(openP);
        }
        close(ctx, P);
      },
    },

    // ================================================================ TYPE
    {
      set: 'Type', name: 'Loupe', from: 'Bubble Reef + type',
      rule: 'Each circle is a magnifier held over an unseen page of type, showing only a crop: the corner of a bracketed serif, the stress of a bowl, a ball terminal, an ink trap. Never a whole letter.',
      data: 'which anatomy each lens shows. Serif or bowl is a natural binary.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const lenses = pack(r, { n: 70, maxR: 90, gap: r.range(4, 12), tries: 4000, point: (r) => inOval(r, 0.96), rad: () => 10 + Math.pow(r.next(), 1.6) * 80, inside: inside(0, 1.0) });
        for (const [x, y, R] of lenses) {
          const fill = P.mono ? (r.chance(0.2) ? P.ink : P.field) : P.pick(), fg = on(fill);
          ctx.beginPath(); circle(ctx, x, y, R); ctx.fillStyle = fill; ctx.fill();
          ctx.save(); ctx.beginPath(); circle(ctx, x, y, R); ctx.clip();
          const sz = R * r.range(3, 6.5);
          typePart(ctx, r, r.pick(PARTS), x + r.range(-0.3, 0.3) * sz, y + sz * r.range(0.25, 0.75), sz, r.chance(0.7) ? r.range(-0.15, 0.15) : r.range(0, TAU), fg);
          ctx.restore();
          ctx.beginPath(); circle(ctx, x, y, R); ctx.strokeStyle = P.ink; ctx.lineWidth = 2; ctx.stroke();
          if (R > 30 && r.chance(0.4)) { ctx.beginPath(); circle(ctx, x, y, R - 4); ctx.lineWidth = HAIR; ctx.stroke(); }
        }
        close(ctx, P);
      },
    },
    {
      set: 'Type', name: 'Anatomy Field', from: 'type + Grafts',
      rule: 'Fragments of letter parts, each seen through its own crop, collide at many scales and angles. Some are laid down in ink and others cut back out of it, so they interrupt each other the way the distortion reference interrupts its type.',
      data: 'part type and orientation at each anchor.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const anchors = pack(r, { n: 150, maxR: 110, gap: -r.range(20, 40), tries: 4000, point: (r) => inOval(r, 0.98), rad: () => 16 + Math.pow(r.next(), 1.6) * 94, inside: inside(0, 1.05) });
        for (const [x, y, R] of anchors) {
          const fill = P.mono ? (r.chance(0.7) ? P.ink : P.field) : r.chance(0.2) ? P.field : P.pick();
          const rot = r.chance(0.6) ? r.pick([0, Math.PI / 2, -Math.PI / 2]) + r.range(-0.08, 0.08) : r.range(0, TAU);
          typePart(ctx, r, r.pick(PARTS), x, y + R * 1.4, R * 2.8, rot, fill, [0.4, 0.8]);
        }
        close(ctx, P);
      },
    },
    {
      set: 'Type', name: 'Serif Genome', from: 'Branching Spokes + type',
      rule: 'Sequence Drift, but every cell fuses two cropped letter fragments standing on its track, so the tracks read like lines of an unknown text on curved baselines. They suggest writing and spell nothing.',
      data: 'the sequence of parts along each track, an alphabet of about 8 parts.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const tracks = growTracks(r, nz, { w: [12, 22], len: [9, 18], gap: 3, fork: 0.03, seeds: 500, freq: r.range(0.0015, 0.0035), curl: r.range(0.6, 1.3) });
        const parts = r.shuffle(PARTS).slice(0, r.int(4, 7));
        for (const t of tracks) {
          const col = P.mono ? P.ink : r.chance(0.6) ? P.ink : P.pick();
          const bx = (c) => [c.x - Math.sin(c.a) * c.w * 0.5, c.y + Math.cos(c.a) * c.w * 0.5];
          ctx.strokeStyle = P.ink; ctx.lineWidth = HAIR; ctx.beginPath();
          t.forEach((c, i) => { const [x, y] = bx(c); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
          if (r.chance(0.5)) ctx.stroke();
          for (const c of t) { const [x, y] = bx(c); for (let k = 0; k < 2; k++) typePart(ctx, r, r.pick(parts), x + r.range(-2, 2), y, c.w * 1.3, c.a, col, true); }
        }
        close(ctx, P);
      },
    },

    // ============================================================== CANOPY
    {
      set: 'Canopy', name: 'Incursion', from: '12 + Bubble Reef',
      rule: 'Three to five recursive trees break in from random points on the rim, each at its own angle, and grow until they meet. Their tips carry reef bubbles, and faint outline circles float behind.',
      data: 'the entry angles and which tips bear bubbles.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        ctx.strokeStyle = P.ink; ctx.lineWidth = HAIR;
        for (const [x, y, R] of pack(r, { n: 16, maxR: 90, gap: 20, point: (r) => inOval(r, 0.9), rad: (x, y, r) => r.range(30, 90), inside: inside(0, 1.0) })) { ctx.beginPath(); circle(ctx, x, y, R); ctx.stroke(); }
        const maxD = r.int(6, 8);
        for (const e of entries(r, r.int(3, 5))) {
          const out = { segs: [], tips: [] }, col = P.mono ? P.ink : r.chance(0.5) ? P.ink : P.pick();
          growTree(r, e.x, e.y, e.a, r.range(95, 130), 0, maxD, r.range(0.42, 0.62), out);
          drawSegs(ctx, out.segs, maxD, P.field, 3, 0.75);
          drawSegs(ctx, out.segs, maxD, col, 0, 0.75);
          for (const [x, y] of out.tips) {
            if (ovalR(x, y) > 0.97 || !r.chance(0.3)) continue;
            const R = r.range(3, 12), fill = P.mono ? (r.chance(0.5) ? P.ink : P.field) : P.pick();
            ctx.beginPath(); circle(ctx, x, y, R); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = HAIR; ctx.stroke();
          }
        }
        close(ctx, P);
      },
    },
    {
      set: 'Canopy', name: 'Vein Invasion', from: '12 + Branching Spokes',
      rule: 'Veins grow in from a few random points on the rim and colonise the oval until they meet. They are drawn as chains of genome cells that thicken where branches merge, with each vein system in its own colour.',
      data: 'cell states along the veins, and which system owns which ground.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const seeds = entries(r, r.int(3, 5)).map((e) => [e.x + Math.cos(e.a) * 20, e.y + Math.sin(e.a) * 20]);
        const att = []; while (att.length < 1200) att.push(inOval(r, 0.95));
        const nodes = colonize(r, { seeds, attractors: att, influence: 60, kill: 10, step: 8, inside: (x, y) => ovalR(x, y) < 0.97 });
        const root = nodes.map((n, i) => i);
        nodes.forEach((n, i) => { if (n.p >= 0) root[i] = root[n.p]; });
        const cols = P.mono ? [P.ink] : r.shuffle(P.fills.concat(P.ink));
        const paths = cols.map(() => ({ solid: new Path2D(), open: new Path2D() }));
        nodes.forEach((n, i) => {
          if (n.p < 0) return;
          const p = nodes[n.p], a = Math.atan2(n.y - p.y, n.x - p.x), w = 2 + 12 * Math.pow(n.w / nodes.maxW, 0.45);
          const pp = paths[root[i] % cols.length];
          cellQuad(r.chance(0.7) ? pp.solid : pp.open, (p.x + n.x) / 2, (p.y + n.y) / 2, a, 6, w);
        });
        ctx.lineWidth = HAIR;
        paths.forEach((pp, i) => { ctx.fillStyle = cols[i]; ctx.fill(pp.solid); ctx.strokeStyle = cols[i]; ctx.stroke(pp.open); });
        close(ctx, P);
      },
    },
    {
      set: 'Canopy', name: 'Thicket & Foam', from: '12 + Bubble Reef',
      rule: 'A colourful foam of bubbles, crossed by trees growing in from three or four angles. Each branch cuts a clean channel through the foam, so the trees read as drawn over it.',
      data: 'bubble colours in the foam, with the trees as the finder structure.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        for (const [x, y, R] of pack(r, { n: 260, maxR: 50, gap: 3, tries: 6000, point: (r) => inOval(r, 1.0), rad: () => 5 + Math.pow(r.next(), 2) * 45, inside: inside(0, 1.06) })) {
          const fill = P.mono ? (r.chance(0.3) ? P.ink : P.field) : P.pick();
          ctx.beginPath(); circle(ctx, x, y, R); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = HAIR; ctx.stroke();
        }
        const maxD = r.int(6, 8);
        for (const e of entries(r, r.int(3, 4))) {
          const out = { segs: [], tips: [] };
          growTree(r, e.x, e.y, e.a, r.range(85, 120), 0, maxD, r.range(0.42, 0.62), out);
          drawSegs(ctx, out.segs, maxD, P.field, 5, 0.9);
          drawSegs(ctx, out.segs, maxD, P.ink, 0, 0.9);
        }
        close(ctx, P);
      },
    },
  ];

  window.DIRECTIONS = DIRECTIONS;
})();
