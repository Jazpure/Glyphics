/* Round 2: twelve hybrids of round-1 directions 1, 4, 7, 8, 10, 11 and 12.
   Shared by all of them:
   - growth and layered depth (what worked in 12)
   - three solid colours: an oval field, one ink, one accent; paper may show
     through as a free fourth; no overprinting, no tints
   - even density: growth starts from the centre or evenly around the rim
   - the nib turns with the radial direction, so no side reads heavier
   - a clear centre with a thin ring and a crisp rim: the candidate anchor
   - nothing thinner than ~1.2 units (≈0.13 mm at 10 cm wide) */
(function () {
  const {
    TAU, O, bez, frameAt, E, ovalR, flatMap, idMap, press, flat, addNib, addNibOutline, G, ovalPath, paper,
    inOval, colonize, pack,
  } = window.GL;

  const PALS = [
    { field: '#d5d9bf', ink: '#2c2a23', accent: '#e07b2c', paper: '#fbf9f1' },
    { field: '#e7dcc1', ink: '#1f2b36', accent: '#cf442c', paper: '#fdfaf2' },
    { field: '#cbd3cf', ink: '#222a26', accent: '#d9a21f', paper: '#f9faf6' },
    { field: '#e3d6cb', ink: '#2b2322', accent: '#3a78ad', paper: '#fcf9f5' },
  ];
  const VOID = 0.12, HAIR = 1.2;
  const IN = (x, y) => { const q = ovalR(x, y); return q < 0.965 && q > VOID + 0.005; };

  function open(ctx, r) {
    const pal = r.pick(PALS);
    paper(ctx, '#f3efe6');
    ovalPath(ctx); ctx.fillStyle = pal.field; ctx.fill();
    ctx.save(); ovalPath(ctx); ctx.clip();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    return pal;
  }
  // The shared anchor: a clear centre with a thin ring, and a crisp rim.
  function close(ctx, pal) {
    ctx.restore();
    ovalPath(ctx, VOID); ctx.fillStyle = pal.field; ctx.fill();
    ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.lineWidth = 2.8; ovalPath(ctx); ctx.stroke();
  }

  const ringNoise = (nz, t, f, off = 0) => nz(Math.cos(t) * f + off, Math.sin(t) * f + off * 1.7);
  const radA = (x, y) => Math.atan2(y - O.cy, x - O.cx);
  // A mapper whose baseline follows the radial direction at each point, so a
  // fixed nib angle reads the same all the way around.
  const radialMap = (x, y) => { const a = radA(x, y); return [x, y, Math.cos(a), Math.sin(a), Math.sin(a), -Math.cos(a)]; };
  const scatter = (r, n, s0 = VOID + 0.04, s1 = 0.95) => {
    const out = [];
    while (out.length < n) { const p = inOval(r, s1); if (ovalR(p[0], p[1]) > s0) out.push(p); }
    return out;
  };
  const ringSeeds = (r, n, s) => Array.from({ length: n }, (_, i) => E(((i + r.range(-0.25, 0.25)) / n) * TAU, s));
  const inBand = (s0, s1) => (x, y, rad) => { const q = ovalR(x, y), d = rad / 360; return q - d > s0 && q + d < s1; };

  function disc(ctx, x, y, rad, fill, line, lw = HAIR) {
    ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (line) { ctx.strokeStyle = line; ctx.lineWidth = lw; ctx.stroke(); }
  }
  function pod(ctx, x, y, a, s, fill, line) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.ellipse(s * 0.9, 0, s, s * 0.48, 0, 0, TAU);
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = HAIR; ctx.stroke();
    ctx.restore();
  }
  // A radial burst of nib petals, added to the current path.
  function bloom(ctx, x, y, R, P, a0, w, phi) {
    for (let k = 0; k < P; k++) {
      const bend = R * 0.12 * Math.sin(k * 2.3);
      addNib(ctx, bez([0, 0], [R * 0.3, bend], [R * 0.7, bend], [R, 0], 10), flatMap(x, y, a0 + (k / P) * TAU), w, phi,
        (u) => Math.sin(Math.PI * Math.min(1, u * 1.05 + 0.04)), HAIR);
    }
  }
  // Pipe-model width: thick where many branches have joined.
  const pipe = (nodes, lo, hi, k = 0.45) => (n) => lo + (hi - lo) * Math.pow(n.w / nodes.maxW, k);
  // Branch segments in the nib, turned with the radial direction.
  function treeNib(ctx, nodes, wFn, phi, shiftOf) {
    ctx.beginPath();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]; if (n.p < 0 || n.cut) continue;
      const p = nodes[n.p], [sx, sy] = shiftOf ? shiftOf(i) : [0, 0];
      addNib(ctx, [[p.x + sx, p.y + sy], [n.x + sx, n.y + sy]], radialMap, wFn(n), phi, flat, HAIR);
    }
    ctx.fill();
  }
  // Branch segments as round-capped lines, bucketed by width for speed.
  function treeLines(ctx, nodes, wFn, color, extra = 0, minW = 0) {
    const buckets = new Map();
    for (const n of nodes) {
      if (n.p < 0) continue;
      const w0 = wFn(n); if (w0 < minW) continue;
      const w = Math.round((w0 + extra) * 4) / 4, p = nodes[n.p];
      let path = buckets.get(w); if (!path) buckets.set(w, (path = new Path2D()));
      path.moveTo(p.x, p.y); path.lineTo(n.x, n.y);
    }
    ctx.strokeStyle = color;
    for (const [w, path] of buckets) { ctx.lineWidth = w; ctx.stroke(path); }
  }
  const leafAngle = (nodes, n) => { const p = nodes[n.p]; return Math.atan2(n.y - p.y, n.x - p.x); };

  // A looping pen path around the whole ring (from Storm), returning points
  // along the way for things to sprout from.
  function loopRing(ctx, r, nz, s0, rho0, seed, lw) {
    const u01 = (v) => (v + 1) / 2, out = [];
    let t = r.range(0, TAU), ph = 0, i = 0;
    const end = t + TAU + 0.05;
    ctx.lineWidth = lw; ctx.beginPath();
    while (t < end) {
      t += 0.0012 + 0.0022 * Math.pow(u01(nz(i * 0.004, seed)), 2);
      ph += 0.16 + 0.22 * u01(nz(i * 0.006, seed + 3));
      const rho = rho0 * (0.35 + 0.65 * u01(nz(i * 0.005, seed + 7)));
      const ecc = 0.45 + 0.55 * u01(nz(i * 0.003, seed + 11)), tilt = nz(i * 0.0015, seed + 13) * 2.5;
      const [cx, cy] = E(t, s0);
      const lx = rho * Math.cos(ph), ly = rho * ecc * Math.sin(ph);
      const x = cx + lx * Math.cos(tilt) - ly * Math.sin(tilt), y = cy + lx * Math.sin(tilt) + ly * Math.cos(tilt);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      if (i % 12 === 0) out.push([x, y, t]);
      i++;
    }
    ctx.stroke();
    return out;
  }

  // Small recursive sprig in the nib; tips are collected for pods.
  function sprig(ctx, r, x, y, a, L, d, o, tips) {
    const b = a + r.range(-0.2, 0.2) + (o.curl || 0), ex = x + Math.cos(b) * L, ey = y + Math.sin(b) * L;
    addNib(ctx, bez([x, y], [x + Math.cos(a) * L * 0.5, y + Math.sin(a) * L * 0.5], [ex - Math.cos(b) * L * 0.25, ey - Math.sin(b) * L * 0.25], [ex, ey], 8),
      radialMap, o.w0 + d * o.dw, o.phi, press, HAIR);
    if (d === 0) { tips.push([ex, ey, b]); return; }
    const n = r.chance(0.3) ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const s = n === 2 ? (i ? 1 : -1) : i - 1;
      sprig(ctx, r, ex, ey, b + s * o.spread * r.range(0.7, 1.2), L * r.range(0.6, 0.75), d - 1, o, tips);
    }
  }

  // Dry-brush slab along an arc (from Grafts).
  function slab(ctx, r, nz, tS, span, s0, s1, color) {
    ctx.strokeStyle = color; ctx.lineCap = 'butt';
    for (let k = 0; k < 110; k++) {
      const s = r.range(s0, s1);
      ctx.lineWidth = r.range(1.2, 2.8); ctx.beginPath();
      let on = false;
      const a = r.range(0, 16), b = 120 - r.range(0, 26);
      for (let i = 0; i <= 120; i++) {
        const [x, y] = E(tS + (span * i) / 120, s + nz(i * 0.05, k) * 0.004);
        const ink = nz(i * 0.05, k * 0.35) > -0.25 && i > a && i < b;
        if (ink && !on) ctx.moveTo(x, y); else if (ink) ctx.lineTo(x, y);
        on = ink;
      }
      ctx.stroke();
    }
    ctx.lineCap = 'round';
  }

  const DIRECTIONS = [
    // ------------------------------------------------------------------ 01
    {
      name: 'Colonized Oval',
      from: '12 + 1',
      rule: 'Branches grow out from the centre toward evenly scattered points until the oval is full. They are drawn in the broad nib, with thickness where branches merge. Paper bubbles sit behind; pods and dashes sit at the tips.',
      data: 'which tips carry accent pods, at which angles.',
      draw(ctx, r) {
        const pal = open(ctx, r), phi = r.range(0.35, 1.2);
        for (const [x, y, rad] of pack(r, { n: 60, maxR: 34, gap: 16, point: (r) => inOval(r, 0.95), rad: (x, y, r) => r.range(6, 34), inside: inBand(VOID + 0.03, 0.96) }))
          disc(ctx, x, y, rad, pal.paper, pal.ink);
        const nodes = colonize(r, { seeds: ringSeeds(r, r.int(5, 8), VOID + 0.01), attractors: scatter(r, 1500), influence: 60, kill: 9, step: 6, inside: IN });
        ctx.fillStyle = pal.ink;
        treeNib(ctx, nodes, pipe(nodes, 1.4, r.range(11, 16)), phi);
        ctx.beginPath();
        const pods = [];
        for (const n of nodes) {
          if (!n.leaf || n.p < 0) continue;
          const a = leafAngle(nodes, n);
          if (r.chance(0.1)) pods.push([n.x, n.y, a]);
          else if (r.chance(0.45)) addNib(ctx, [[n.x, n.y], [n.x + Math.cos(a) * 7, n.y + Math.sin(a) * 7]], radialMap, 6, phi + 1.3, flat, HAIR);
        }
        ctx.fill();
        for (const [x, y, a] of pods) pod(ctx, x, y, a, r.range(5, 8), pal.accent, pal.ink);
        close(ctx, pal);
      },
    },

    // ------------------------------------------------------------------ 02
    {
      name: 'Rim Roots',
      from: '12 + 10 + 1',
      rule: 'Roots start at even intervals on the rim and grow inward, drawn as outlined tubes that thicken where they merge. A looping pen path runs behind them, and root tips end in pins and small loops.',
      data: 'the number and spacing of roots on the rim; accent pin heads.',
      draw(ctx, r, nz) {
        const pal = open(ctx, r);
        ctx.strokeStyle = pal.ink;
        loopRing(ctx, r, nz, r.range(0.45, 0.6), r.range(18, 30), r.range(0, 99), HAIR);
        const nodes = colonize(r, { seeds: ringSeeds(r, r.int(14, 22), 0.96), attractors: scatter(r, 1100, VOID + 0.06, 0.93), influence: 55, kill: 9, step: 6, inside: IN });
        const wf = pipe(nodes, HAIR, r.range(8, 12), 0.5);
        treeLines(ctx, nodes, wf, pal.ink, 2.6);
        treeLines(ctx, nodes, wf, pal.paper, 0, 1.8);
        const heads = [];
        ctx.strokeStyle = pal.ink; ctx.lineWidth = HAIR; ctx.beginPath();
        for (const n of nodes) {
          if (!n.leaf || n.p < 0) continue;
          const a = leafAngle(nodes, n), k = r.next();
          if (k < 0.25) { const l = r.range(8, 18); ctx.moveTo(n.x, n.y); ctx.lineTo(n.x + Math.cos(a) * l, n.y + Math.sin(a) * l); heads.push([n.x + Math.cos(a) * l, n.y + Math.sin(a) * l]); }
          else if (k < 0.45) { const rr = r.range(3, 6); ctx.moveTo(n.x + Math.cos(a) * rr * 2, n.y + Math.sin(a) * rr * 2); ctx.arc(n.x + Math.cos(a) * rr, n.y + Math.sin(a) * rr, rr, a, a + TAU); }
        }
        ctx.stroke();
        for (const [x, y] of heads) disc(ctx, x, y, r.range(2.4, 3.8), pal.accent, pal.ink);
        close(ctx, pal);
      },
    },

    // ------------------------------------------------------------------ 03
    {
      name: 'Branching Spokes',
      from: '8 + 12',
      rule: 'Spokes of cells leave the centre and fork whenever they grow too wide, so they fill the oval evenly as it widens. Cells are solid, open or ruled. Growth rings sit behind them.',
      data: 'the cell pattern along each spoke. This is the closest to a real bit layout.',
      draw(ctx, r, nz) {
        const pal = open(ctx, r);
        ctx.strokeStyle = pal.ink; ctx.lineWidth = HAIR;
        for (let i = 0, n = r.int(3, 5); i < n; i++) { ovalPath(ctx, VOID + (0.95 - VOID) * ((i + r.range(0.3, 0.9)) / n)); ctx.stroke(); }
        const target = r.range(12, 18), ends = [], spines = new Path2D();
        const cells = { solid: new Path2D(), open: new Path2D(), ruled: new Path2D(), accent: new Path2D() };
        function cell(th, rho, clR, wPx, ang, dist) {
          const len = dist * clR, [x, y] = E(th, rho + clR / 2);
          const c = Math.cos(ang), s = Math.sin(ang), hx = (c * len) / 2, hy = (s * len) / 2, wx = (-s * wPx) / 2, wy = (c * wPx) / 2;
          const k = r.next(), solid = 0.25 + 0.3 * (1 - rho);
          const quad = (p) => { p.moveTo(x - hx - wx, y - hy - wy); p.lineTo(x + hx - wx, y + hy - wy); p.lineTo(x + hx + wx, y + hy + wy); p.lineTo(x - hx + wx, y - hy + wy); p.closePath(); };
          if (k < solid) quad(cells.solid);
          else if (k < solid + 0.04) quad(cells.accent);
          else if (k < solid + 0.26) quad(cells.open);
          else if (k < solid + 0.46) for (let u = -0.4; u <= 0.41; u += 0.8 / Math.max(1, Math.floor(len / 3.2))) {
            cells.ruled.moveTo(x + c * len * u - wx, y + s * len * u - wy); cells.ruled.lineTo(x + c * len * u + wx, y + s * len * u + wy);
          }
        }
        (function spoke(th, rho, aw, depth) {
          let [px, py] = E(th, rho);
          while (rho < 0.955) {
            const [ex, ey] = E(th, 1), dist = Math.hypot(ex - O.cx, ey - O.cy), ang = Math.atan2(ey - O.cy, ex - O.cx);
            const width = aw * rho * frameAt(th).speed;
            if (width > 2 * target && depth < 8) { spoke(th - aw / 4, rho, aw / 2, depth + 1); spoke(th + aw / 4, rho, aw / 2, depth + 1); return; }
            const clPx = (5 + r.next() * 11) * (0.7 + 0.6 * rho), clR = Math.min(clPx / dist, 0.96 - rho);
            if (clR <= 0.002) break;
            cell(th, rho, clR, Math.max(2, width * 0.66), ang, dist);
            rho += clR + 3.6 / dist;
            th += nz(th * 2, rho * 3) * 0.014;
            const [qx, qy] = E(th, rho); spines.moveTo(px, py); spines.lineTo(qx, qy); px = qx; py = qy;
          }
          ends.push([th, rho]);
        })(0, VOID + 0.02, TAU, 0);
        ctx.lineWidth = HAIR; ctx.strokeStyle = pal.ink; ctx.stroke(spines);
        ctx.fillStyle = pal.field; ctx.fill(cells.open); ctx.fill(cells.ruled);
        ctx.fillStyle = pal.ink; ctx.fill(cells.solid);
        ctx.fillStyle = pal.accent; ctx.fill(cells.accent);
        ctx.lineWidth = HAIR; ctx.strokeStyle = pal.ink; ctx.stroke(cells.open); ctx.stroke(cells.ruled);
        close(ctx, pal);
      },
    },

    // ------------------------------------------------------------------ 04
    {
      name: 'Spiral Sprigs',
      from: '7 + 12',
      rule: 'Small branching sprigs sit on a phyllotaxis spiral, turned to follow its flow and growing toward the rim. Paper discs behind give them depth, and a few tips flower in the accent.',
      data: 'sprig orientation along the spiral arms.',
      draw(ctx, r) {
        const pal = open(ctx, r), N = r.int(150, 210), swirl = r.range(0.5, 1.0) * r.sign(), phi = r.range(0.4, 1.1);
        const pos = [];
        for (let i = 0; i < N; i++) {
          const a = i * 2.39996323, s = VOID + 0.07 + (0.9 - VOID - 0.07) * Math.sqrt((i + 0.5) / N), f = frameAt(a, s);
          pos.push([f.x, f.y, Math.atan2(f.uy, f.ux) + swirl, s]);
        }
        pos.forEach(([x, y, , s], i) => { if (i % 4 === 0) disc(ctx, x, y, 8 + 18 * s, pal.paper, pal.ink); });
        const tips = [];
        ctx.fillStyle = pal.ink; ctx.beginPath();
        for (const [x, y, a, s] of pos) sprig(ctx, r, x, y, a, 8 + 18 * s, r.int(1, 2), { w0: 2.2, dw: 2.2, phi, spread: r.range(0.4, 0.7), curl: swirl * 0.12 }, tips);
        ctx.fill();
        for (const [x, y, a] of tips) { if (r.chance(0.08)) pod(ctx, x, y, a, r.range(3.5, 6), pal.accent, pal.ink); else if (r.chance(0.3)) disc(ctx, x, y, 1.8, pal.ink); }
        close(ctx, pal);
      },
    },

    // ------------------------------------------------------------------ 05
    {
      name: 'Petal Network',
      from: '11 + 12',
      rule: 'A sparse branching network grows from the centre. Its junctions bloom into nib-petal bursts: large paper blooms behind the network, and smaller ink or accent blooms in front.',
      data: 'petal count at each junction.',
      draw(ctx, r) {
        const pal = open(ctx, r), phi = r.range(0.3, 1.2);
        const nodes = colonize(r, { seeds: ringSeeds(r, 6, VOID + 0.01), attractors: scatter(r, 480), influence: 90, kill: 14, step: 9, inside: IN });
        const joins = pack(r, { n: 60, maxR: 30, gap: 10, point: (r) => { const n = r.pick(nodes); return [n.x, n.y]; }, rad: (x, y, r) => r.range(10, 28), inside: inBand(VOID + 0.02, 0.97) });
        ctx.fillStyle = pal.paper; ctx.strokeStyle = pal.ink; ctx.lineWidth = HAIR;
        for (const j of joins) {
          if (!(j.back = r.chance(0.35))) continue;
          const [x, y, R] = j, P = r.int(6, 9), a0 = r.range(0, TAU), L = R * 1.6;
          for (let k = 0; k < P; k++) {
            ctx.beginPath();
            addNibOutline(ctx, bez([0, 0], [L * 0.3, L * 0.16], [L * 0.7, L * 0.16], [L, 0], 12), flatMap(x, y, a0 + (k / P) * TAU), R * 0.8, phi, (u) => Math.sin(Math.PI * u), 0);
            ctx.fill(); ctx.stroke();
          }
        }
        treeLines(ctx, nodes, pipe(nodes, HAIR, r.range(4, 6), 0.5), pal.ink);
        for (const j of joins) {
          const [x, y, R] = j;
          if (j.back && r.chance(0.6)) continue;
          ctx.fillStyle = r.chance(0.22) ? pal.accent : pal.ink;
          ctx.beginPath(); bloom(ctx, x, y, R, r.int(6, 12), r.range(0, TAU), R * 0.32, phi); ctx.fill();
        }
        close(ctx, pal);
      },
    },

    // ------------------------------------------------------------------ 06
    {
      name: 'Grafted Canopy',
      from: '4 + 12',
      rule: 'A nib canopy grows from the centre and is then distorted. Joins are cut open, whole subtrees slip off register, and foreign parts at the wrong scale, marked in the accent, graft onto tips. Two dry-brush slabs balance each other.',
      data: 'where subtrees slip, and by how much.',
      draw(ctx, r, nz) {
        const pal = open(ctx, r), phi = r.range(0.35, 1.2);
        const t0 = r.range(0, TAU), span = r.range(0.8, 1.3);
        slab(ctx, r, nz, t0, span, 0.9, 0.97, pal.ink);
        slab(ctx, r, nz, t0 + Math.PI, span, 0.9, 0.97, pal.ink);
        const nodes = colonize(r, { seeds: ringSeeds(r, r.int(5, 7), VOID + 0.01), attractors: scatter(r, 1300), influence: 60, kill: 9, step: 6, inside: IN });
        const sh = nodes.map(() => [0, 0]);
        nodes.forEach((n, i) => {
          if (n.p < 0) return;
          const p = sh[n.p];
          sh[i] = r.chance(0.006) ? [p[0] + r.range(-10, 10), p[1] + r.range(-10, 10)] : p;
          if (n.kids !== 1 || r.chance(0.97)) return;
          n.cut = true;
        });
        ctx.fillStyle = pal.ink;
        treeNib(ctx, nodes, pipe(nodes, 1.4, r.range(10, 14)), phi, (i) => sh[i]);
        const balls = [], grafts = [];
        nodes.forEach((n, i) => {
          if (!n.leaf || n.p < 0) return;
          const x = n.x + sh[i][0], y = n.y + sh[i][1];
          if (r.chance(0.3)) balls.push([x, y, r.range(2.5, 5)]);
          else if (r.chance(0.035)) grafts.push([x, y, leafAngle(nodes, n)]);
        });
        ctx.beginPath(); for (const [x, y, rad] of balls) { ctx.moveTo(x + rad, y); ctx.arc(x, y, rad, 0, TAU); } ctx.fill();
        ctx.fillStyle = pal.accent; ctx.beginPath();
        for (const [x, y, a] of grafts) {
          const k = r.range(1.4, 2.2), part = r.chance(0.5) ? G.hook(r, 26 * k) : G.loop(r, 22 * k);
          addNib(ctx, part, flatMap(x, y, a + Math.PI / 2), 5 * k, phi + 1.3, press, HAIR);
        }
        ctx.fill();
        close(ctx, pal);
      },
    },

    // ------------------------------------------------------------------ 07
    {
      name: 'Loop Vines',
      from: '10 + 12',
      rule: 'Four looping pen paths circle the oval at different depths, sprouting sprigs and pins as they go. Paper strips set at equal angles lie across the middle layers.',
      data: 'the angles of the accent pins around each ring.',
      draw(ctx, r, nz) {
        const pal = open(ctx, r), phi = r.range(0.4, 1.1);
        const rings = [0.38, 0.55, 0.71, 0.86].map((s) => s + r.range(-0.02, 0.02));
        const strips = r.int(6, 10), a0 = r.range(0, TAU);
        rings.forEach((s, k) => {
          if (k === 2) {
            for (let i = 0; i < strips; i++) {
              const t = a0 + (i / strips) * TAU, f = frameAt(t, 0.62);
              ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(Math.atan2(f.ny, f.nx) + r.range(-0.25, 0.25));
              ctx.fillStyle = pal.paper; ctx.strokeStyle = pal.ink; ctx.lineWidth = HAIR;
              const w = r.range(90, 150), h = r.range(12, 18);
              ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeRect(-w / 2, -h / 2, w, h);
              ctx.restore();
            }
          }
          ctx.strokeStyle = pal.ink;
          const pts = loopRing(ctx, r, nz, s, 10 + 16 * s, k * 17 + r.range(0, 50), k % 2 ? HAIR : 1.6);
          const tips = [], heads = [];
          ctx.fillStyle = pal.ink; ctx.beginPath();
          pts.forEach(([x, y, t], i) => {
            const f = frameAt(t), dir = r.chance(0.5) ? 1 : -1, a = Math.atan2(f.ny * dir, f.nx * dir);
            if (i % 5 === 0 && r.chance(0.6)) sprig(ctx, r, x, y, a, r.range(8, 16), r.int(0, 1), { w0: 2.4, dw: 2, phi, spread: 0.6 }, tips);
            else if (i % 9 === 0 && r.chance(0.5)) heads.push([x, y, a]);
          });
          ctx.fill();
          ctx.lineWidth = HAIR; ctx.beginPath();
          for (const [x, y, a] of heads) { ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14); }
          ctx.stroke();
          for (const [x, y, a] of heads) disc(ctx, x + Math.cos(a) * 14, y + Math.sin(a) * 14, 2.8, pal.accent, pal.ink);
        });
        close(ctx, pal);
      },
    },

    // ------------------------------------------------------------------ 08
    {
      name: 'Nib Crown',
      from: '1 + 12',
      rule: 'Nib strokes rise at even intervals around the oval, keeping the calligraphy\'s thick–thin rhythm but not its letters. Each fork curls at the tip like a fern. A shorter counter-crown points inward, with paper bubbles caught between.',
      data: 'stem length at each angle, read like the bars of a radial barcode.',
      draw(ctx, r, nz) {
        const pal = open(ctx, r), M = r.int(70, 110), phi = r.range(0.35, 0.9), curlDir = r.sign();
        for (const [x, y, rad] of pack(r, { n: 50, maxR: 16, gap: 8, point: (r) => inOval(r, 0.92), rad: (x, y, r) => r.range(5, 16), inside: inBand(0.5, 0.92) }))
          disc(ctx, x, y, rad, pal.paper, pal.ink);
        const tips = [];
        ctx.fillStyle = pal.ink; ctx.beginPath();
        for (let i = 0; i < M; i++) {
          const t = ((i + r.range(-0.2, 0.2)) / M) * TAU, sB = r.range(0.4, 0.47);
          const sT = 0.72 + 0.14 * (ringNoise(nz, t, 4, 3) + 1) / 2 + r.range(-0.03, 0.03);
          const [x0, y0] = E(t, sB), [x1, y1] = E(t + curlDir * r.range(0.01, 0.04), sT);
          const mx = (x0 + x1) / 2 + r.range(-6, 6), my = (y0 + y1) / 2 + r.range(-6, 6);
          const stem = bez([x0, y0], [mx, my], [mx, my], [x1, y1], 16);
          addNib(ctx, stem, radialMap, r.range(7, 10), phi, press, HAIR);
          const a = Math.atan2(y1 - my, x1 - mx);
          for (let k = 0, n = r.int(1, 3); k < n; k++) {
            const L = r.range(12, 26), b = a + (k - (n - 1) / 2) * 0.7 + curlDir * 0.3;
            const ex = x1 + Math.cos(b) * L, ey = y1 + Math.sin(b) * L;
            addNib(ctx, bez([x1, y1], [x1 + Math.cos(a) * L * 0.5, y1 + Math.sin(a) * L * 0.5], [ex + Math.cos(b + curlDir * 1.6) * L * 0.3, ey + Math.sin(b + curlDir * 1.6) * L * 0.3], [ex, ey], 10), radialMap, r.range(4, 6), phi, press, HAIR);
            tips.push([ex, ey, b]);
          }
        }
        for (let i = 0, m = Math.floor(M / 2); i < m; i++) {
          const t = ((i + 0.5) / m) * TAU, [x0, y0] = E(t, r.range(0.36, 0.39)), [x1, y1] = E(t, VOID + 0.05 + r.range(0, 0.04));
          addNib(ctx, bez([x0, y0], [x0, y0], [x1, y1], [x1, y1], 8), radialMap, r.range(4, 6), phi, press, HAIR);
        }
        ctx.fill();
        for (const [x, y, a] of tips) if (r.chance(0.12)) pod(ctx, x, y, a, r.range(3.5, 6), pal.accent, pal.ink);
        close(ctx, pal);
      },
    },

    // ------------------------------------------------------------------ 09
    {
      name: 'Bubble Reef',
      from: '12 + 7 + 8',
      rule: 'The oval is packed evenly with bubbles, each a different organism: rings, spoke bursts, nib curls, solid ink or accent. A hairline web ties neighbours together behind them.',
      data: 'the bubble type at each position. This is the most bit-like option and is ready for a codebook.',
      draw(ctx, r) {
        const pal = open(ctx, r), phi = r.range(0.4, 1.1);
        const bubs = pack(r, { n: 280, maxR: 40, gap: 3, tries: 6000, point: (r) => inOval(r, 0.96), rad: (x, y, r) => 7 + Math.pow(r.next(), 1.6) * 33, inside: inBand(VOID + 0.02, 0.975) });
        ctx.strokeStyle = pal.ink; ctx.lineWidth = HAIR; ctx.beginPath();
        for (const b of bubs) {
          const near = bubs.map((q) => [q, (q[0] - b[0]) ** 2 + (q[1] - b[1]) ** 2]).sort((a, c) => a[1] - c[1]).slice(1, 3);
          for (const [q] of near) { ctx.moveTo(b[0], b[1]); ctx.lineTo(q[0], q[1]); }
        }
        ctx.stroke();
        for (const [x, y, R] of bubs) {
          const k = r.next();
          if (k < 0.13) disc(ctx, x, y, R, pal.ink);
          else if (k < 0.21) disc(ctx, x, y, R, pal.accent, pal.ink);
          else {
            disc(ctx, x, y, R, pal.paper, pal.ink);
            if (k < 0.38) for (let j = 2; j > 0; j--) disc(ctx, x, y, (R * j) / 3, null, pal.ink);
            else if (k < 0.55) {
              ctx.beginPath(); const n = r.int(8, 16), a0 = r.range(0, TAU);
              for (let j = 0; j < n; j++) { const a = a0 + (j / n) * TAU; ctx.moveTo(x + Math.cos(a) * R * 0.25, y + Math.sin(a) * R * 0.25); ctx.lineTo(x + Math.cos(a) * R * 0.85, y + Math.sin(a) * R * 0.85); }
              ctx.stroke();
            } else if (k < 0.68 && R > 12) {
              ctx.fillStyle = pal.ink; ctx.beginPath();
              addNib(ctx, G.loop(r, R * 0.9).map((p) => [p[0] * 0.9, p[1] * 0.9 - R * 0.35]), flatMap(x, y, r.range(0, TAU)), R * 0.22, phi, press, HAIR);
              ctx.fill();
            } else if (k < 0.78) disc(ctx, x, y, Math.max(2, R * 0.22), pal.ink);
          }
        }
        close(ctx, pal);
      },
    },

    // ------------------------------------------------------------------ 10
    {
      name: 'Swarm Vines',
      from: '7 + 12 + 11',
      rule: 'Vines grow out from the centre, pulled sideways by a spiral flow, and drop nib leaves in alternating pairs. They branch toward open ground until the oval is evenly full.',
      data: 'leaf rhythm along each vine: long gap, short gap.',
      draw(ctx, r) {
        const pal = open(ctx, r), phi = r.range(0.4, 1.1), swirl = r.range(0.45, 0.8) * r.sign();
        for (const [x, y, rad] of pack(r, { n: 26, maxR: 46, gap: 30, point: (r) => inOval(r, 0.9), rad: (x, y, r) => r.range(18, 46), inside: inBand(VOID + 0.04, 0.95) }))
          disc(ctx, x, y, rad, pal.paper, pal.ink);
        const bias = (x, y) => { const a = radA(x, y); return [-Math.sin(a) * swirl, Math.cos(a) * swirl]; };
        const nodes = colonize(r, { seeds: ringSeeds(r, r.int(8, 11), VOID + 0.01), attractors: scatter(r, 700), influence: 70, kill: 12, step: 5, jitter: 0.1, bias, inside: IN });
        const leaves = [];
        for (const n of nodes) {
          if (n.p < 0 || n.d % 6 !== 0) continue;
          leaves.push([n.x, n.y, leafAngle(nodes, n) + (Math.floor(n.d / 6) % 2 ? 1 : -1) * r.range(0.6, 1.0), 8 + 12 * ovalR(n.x, n.y)]);
        }
        treeLines(ctx, nodes, pipe(nodes, 1.4, 4, 0.5), pal.ink);
        const accentLeaves = [];
        ctx.fillStyle = pal.ink; ctx.beginPath();
        for (const [x, y, a, L] of leaves) {
          if (r.chance(0.07)) { accentLeaves.push([x, y, a, L]); continue; }
          addNib(ctx, bez([0, 0], [L * 0.3, L * 0.18], [L * 0.7, L * 0.18], [L, 0], 8), flatMap(x, y, a), L * 0.42, phi, (u) => Math.sin(Math.PI * u), HAIR);
        }
        ctx.fill();
        for (const [x, y, a, L] of accentLeaves) pod(ctx, x, y, a, L * 0.5, pal.accent, pal.ink);
        close(ctx, pal);
      },
    },

    // ------------------------------------------------------------------ 11
    {
      name: 'Seed Head',
      from: '11 + 8 + 12',
      rule: 'Hairline stems radiate from the centre at even angles, each ending in a nib-petal bloom, some with smaller blooms along the way. Large paper rosettes sit evenly behind.',
      data: 'stem length at each angle, a radial barcode read in blooms.',
      draw(ctx, r, nz) {
        const pal = open(ctx, r), phi = r.range(0.3, 1.2), M = r.int(100, 150);
        const Rn = r.int(5, 8), ra0 = r.range(0, TAU);
        ctx.fillStyle = pal.paper; ctx.strokeStyle = pal.ink; ctx.lineWidth = HAIR;
        for (let i = 0; i < Rn; i++) {
          const [x, y] = E(ra0 + (i / Rn) * TAU, r.range(0.55, 0.65)), P = r.int(6, 9), a0 = r.range(0, TAU);
          for (let k = 0; k < P; k++) {
            ctx.beginPath(); addNibOutline(ctx, bez([0, 0], [18, 10], [50, 10], [66, 0], 12), flatMap(x, y, a0 + (k / P) * TAU), 30, phi, (u) => Math.sin(Math.PI * u), 0);
            ctx.fill(); ctx.stroke();
          }
        }
        const heads = [];
        ctx.lineWidth = 1.4; ctx.beginPath();
        for (let i = 0; i < M; i++) {
          const t = ((i + r.range(-0.3, 0.3)) / M) * TAU;
          const sE = 0.62 + 0.28 * (ringNoise(nz, t, 5, 1) + 1) / 2 + r.range(-0.03, 0.03);
          const [x0, y0] = E(t, VOID + 0.01), [x1, y1] = E(t + r.range(-0.03, 0.03), sE);
          const bend = r.range(-14, 14), mx = (x0 + x1) / 2 - Math.sin(t) * bend, my = (y0 + y1) / 2 + Math.cos(t) * bend;
          ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1);
          heads.push([x1, y1, r.range(8, 18)]);
          if (r.chance(0.25)) { const u = r.range(0.45, 0.75); heads.push([(1 - u) ** 2 * x0 + 2 * u * (1 - u) * mx + u * u * x1, (1 - u) ** 2 * y0 + 2 * u * (1 - u) * my + u * u * y1, r.range(4, 8)]); }
        }
        ctx.stroke();
        const acc = [];
        ctx.fillStyle = pal.ink; ctx.beginPath();
        for (const [x, y, R] of heads) { if (r.chance(0.1)) { acc.push([x, y, R]); continue; } bloom(ctx, x, y, R, r.int(6, 10), r.range(0, TAU), R * 0.35, phi); }
        ctx.fill();
        ctx.fillStyle = pal.accent; ctx.beginPath();
        for (const [x, y, R] of acc) bloom(ctx, x, y, R * 1.1, r.int(6, 10), r.range(0, TAU), R * 0.4, phi);
        ctx.fill();
        close(ctx, pal);
      },
    },

    // ------------------------------------------------------------------ 12
    {
      name: 'Tidal Rings',
      from: '10 + 1 + 12',
      rule: 'Concentric bands run from the centre to the rim, each with its own texture: loops, nib dashes, cells, bubbles, sprigs or pods. Hairline tendrils grow across all of them and tie the rings together.',
      data: 'each band as a track, with its marks as bits, as in a ring code.',
      draw(ctx, r, nz) {
        const pal = open(ctx, r), phi = r.range(0.4, 1.1), K = r.int(4, 6);
        const cuts = [VOID + 0.03];
        const ws = Array.from({ length: K }, () => r.range(0.7, 1.4)), sum = ws.reduce((a, b) => a + b, 0);
        ws.forEach((w) => cuts.push(cuts[cuts.length - 1] + ((0.96 - VOID - 0.03) * w) / sum));
        ctx.strokeStyle = pal.ink; ctx.lineWidth = HAIR;
        for (let i = 0; i < r.int(8, 14); i++) {
          let a = r.range(0, TAU), [x, y] = E(a, VOID + 0.01), h = radA(x, y);
          ctx.beginPath(); ctx.moveTo(x, y);
          for (let j = 0; j < 200 && IN(x, y); j++) { h += nz(x * 0.008, y * 0.008) * 0.15 + (radA(x, y) - h) * 0.05; x += Math.cos(h) * 3; y += Math.sin(h) * 3; ctx.lineTo(x, y); }
          ctx.stroke();
        }
        const kinds = r.shuffle(['loops', 'dashes', 'cells', 'bubbles', 'sprigs', 'pods']);
        for (let b = 0; b < K; b++) {
          const s0 = cuts[b], s1 = cuts[b + 1], sm = (s0 + s1) / 2, bw = (s1 - s0) * 360, kind = kinds[b % kinds.length];
          const per = (s) => 2 * Math.PI * Math.sqrt((O.rx ** 2 + O.ry ** 2) / 2) * s;
          if (kind === 'loops') { ctx.strokeStyle = pal.ink; loopRing(ctx, r, nz, sm, bw * 0.42, b * 31, HAIR); }
          else if (kind === 'dashes' || kind === 'cells') {
            const n = Math.floor(per(sm) / r.range(9, 14));
            ctx.fillStyle = pal.ink; ctx.strokeStyle = pal.ink; ctx.lineWidth = HAIR; ctx.beginPath();
            const open2 = new Path2D();
            for (let i = 0; i < n; i++) {
              const t = (i / n) * TAU, [x0, y0] = E(t, s0 + (s1 - s0) * 0.12), [x1, y1] = E(t, s1 - (s1 - s0) * 0.12);
              if (kind === 'dashes') { const L = r.range(0.5, 1); addNib(ctx, [[x0, y0], [x0 + (x1 - x0) * L, y0 + (y1 - y0) * L]], radialMap, r.range(5, 8), phi, press, HAIR); }
              else {
                const k = r.next(), a = Math.atan2(y1 - y0, x1 - x0), wv = r.range(3, 7), c = Math.cos(a), s = Math.sin(a);
                const pth = k < 0.45 ? ctx : k < 0.75 ? open2 : null;
                if (!pth) continue;
                pth.moveTo(x0 - s * wv, y0 + c * wv); pth.lineTo(x1 - s * wv, y1 + c * wv); pth.lineTo(x1 + s * wv, y1 - c * wv); pth.lineTo(x0 + s * wv, y0 - c * wv); pth.closePath();
              }
            }
            ctx.fill(); ctx.stroke(open2);
          } else if (kind === 'bubbles') {
            for (const [x, y, rad] of pack(r, { n: 200, maxR: bw * 0.42, gap: 3, point: (r) => E(r.range(0, TAU), r.range(s0, s1)), rad: (x, y, r) => r.range(3, bw * 0.42), inside: inBand(s0, s1) }))
              disc(ctx, x, y, rad, r.chance(0.2) ? pal.ink : pal.paper, pal.ink);
          } else if (kind === 'sprigs') {
            const n = Math.floor(per(s0) / r.range(22, 34)), tips = [];
            ctx.fillStyle = pal.ink; ctx.beginPath();
            for (let i = 0; i < n; i++) { const t = (i / n) * TAU, [x, y] = E(t, s0 + 0.01); sprig(ctx, r, x, y, radA(x, y), bw * 0.5, 1, { w0: 2, dw: 2, phi, spread: 0.5 }, tips); }
            ctx.fill();
          } else {
            const n = Math.floor(per(sm) / r.range(26, 40));
            for (let i = 0; i < n; i++) { const t = (i / n) * TAU, [x, y] = E(t, sm); pod(ctx, x - Math.cos(radA(x, y)) * bw * 0.28, y - Math.sin(radA(x, y)) * bw * 0.28, radA(x, y), bw * r.range(0.22, 0.32), r.chance(0.3) ? pal.accent : pal.paper, pal.ink); }
          }
          if (b < K - 1) { ctx.strokeStyle = pal.ink; ctx.lineWidth = HAIR; ovalPath(ctx, s1); ctx.stroke(); }
        }
        close(ctx, pal);
      },
    },
  ];

  window.DIRECTIONS = DIRECTIONS;
})();
