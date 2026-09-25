/* Shared kit for round 3 onward: colour, shapes, type anatomy, the designs
   caught inside shapes, genome tracks and trees. */
(function () {
  const { TAU, O, bez, E, ovalR, frameAt, idMap, press, addNib, ovalPath, paper, inOval, colonize, pack } = window.GL;
  const HAIR = 1.2;

  // ---------- colour ----------
  const MONO = [
    { field: '#ffffff', ink: '#111111', fills: ['#111111', '#ffffff'] },
    { field: '#111111', ink: '#f4f4f1', fills: ['#f4f4f1', '#111111'] },
  ];
  const VIVID = [
    { field: '#2d3cf0', ink: '#ffffff', fills: ['#ff5ca8', '#ffd426', '#18d38a', '#ffffff'] },
    { field: '#ff4b1f', ink: '#140d0b', fills: ['#2d3cf0', '#ffd426', '#ffffff', '#ff9fd0'] },
    { field: '#11b36b', ink: '#0c1410', fills: ['#ff4fa3', '#ffd426', '#ffffff', '#2d3cf0'] },
    { field: '#ffd426', ink: '#111111', fills: ['#ff3d7f', '#2d3cf0', '#11b36b', '#ff6a1f'] },
    { field: '#ff8fcb', ink: '#1a1016', fills: ['#2d3cf0', '#ff4b1f', '#ffd426', '#ffffff'] },
    { field: '#0e0e12', ink: '#ffffff', fills: ['#ff4fa3', '#ffd426', '#18d38a', '#3b6bff'] },
  ];
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  // Lines drawn over a fill: black on light fills, white on dark ones.
  const on = (fill) => (lum(fill) > 0.45 ? '#111111' : '#ffffff');

  function palette(r, mode) {
    const mono = mode === 'mono' || (mode !== 'color' && r.chance(0.5));
    const p = mono ? (r.chance(0.7) ? MONO[0] : MONO[1]) : r.pick(VIVID);
    return { ...p, mono, pick: () => r.pick(p.fills), other: (c) => { let f; do f = r.pick(p.fills); while (f === c && p.fills.length > 1); return f; } };
  }
  function open(ctx, r, env, clip = true) {
    const P = palette(r, env.mode);
    paper(ctx, '#ffffff');
    ovalPath(ctx); ctx.fillStyle = P.field; ctx.fill();
    ctx.save();
    if (clip) { ovalPath(ctx); ctx.clip(); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    return P;
  }
  function close(ctx, P) {
    ctx.restore();
    ctx.strokeStyle = lum(P.field) > 0.45 ? P.ink : P.field;
    ctx.lineWidth = 2.8; ovalPath(ctx); ctx.stroke();
  }

  // ---------- shapes ----------
  const rAdj = (R) => R / 360;
  const inside = (s0 = 0, s1 = 0.96) => (x, y, rad) => { const q = ovalR(x, y); return q + rAdj(rad) < s1 && q > s0; };
  const circle = (ctx, x, y, R) => { ctx.moveTo(x + R, y); ctx.arc(x, y, R, 0, TAU); };

  // A pen circle: slightly wobbly, not quite closed, ends overshooting.
  function handCircle(ctx, nz, x, y, R, k) {
    const n = Math.max(28, Math.floor(R * 1.4)), a0 = (k * 7.13) % TAU, over = 0.03 + 0.1 * ((k * 0.618) % 1);
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = a0 + u * TAU * (1 + over);
      const rr = R * (1 + 0.04 * nz(Math.cos(a) * 0.9 + k, Math.sin(a) * 0.9 + k * 1.3) + 0.025 * (u - 0.5));
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * (1 + 0.03 * nz(k, 2));
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
  }

  const KINDS = ['circle', 'circle', 'circle', 'ellipse', 'pill', 'squircle', 'blob', 'lens'];
  function shapePath(ctx, nz, s) {
    const { x, y, R, kind, rot, asp, k } = s;
    ctx.beginPath();
    if (kind === 'circle') { ctx.arc(x, y, R, 0, TAU); return; }
    if (kind === 'ellipse') { ctx.ellipse(x, y, R, R * asp, rot, 0, TAU); return; }
    if (kind === 'pill') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.roundRect(-R, -R * asp, 2 * R, 2 * R * asp, R * asp); ctx.restore();
      return;
    }
    const c = Math.cos(rot), sn = Math.sin(rot);
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      let px, py;
      if (kind === 'squircle') { px = Math.sign(ca) * Math.pow(Math.abs(ca), 0.5) * R; py = Math.sign(sa) * Math.pow(Math.abs(sa), 0.5) * R * asp; }
      else if (kind === 'lens') { px = ca * R; py = Math.sign(sa) * sa * sa * R * asp; }
      else { const rr = R * (1 + 0.2 * nz(ca * 1.2 + k, sa * 1.2 + k)); px = ca * rr; py = sa * rr * asp; }
      const X = x + px * c - py * sn, Y = y + px * sn + py * c;
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    }
    ctx.closePath();
  }
  const makeShape = (r, x, y, R, kinds = KINDS) => ({ x, y, R, kind: r.pick(kinds), rot: r.range(0, TAU), asp: r.range(0.55, 0.9), k: r.range(0, 99) });

  // ---------- type anatomy ----------
  // Pieces of letters, never whole letters. Unit em: baseline y = 0, cap y = -1.
  const PARTS = ['stem', 'slab', 'bowl', 'arch', 'crescent', 'tail', 'wedge', 'spur'];
  function typePart(ctx, r, kind, x, y, s, rot, fill, frag = false) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s * (r.chance(0.5) ? 1 : -1), s);
    ctx.fillStyle = fill;
    // A fragment shows only a window onto the part, never the whole thing.
    if (frag) {
      const [lo, hi] = Array.isArray(frag) ? frag : [0.3, 0.7], wx = r.range(lo, hi), wy = r.range(lo, hi) * 0.9;
      ctx.beginPath(); ctx.rect(r.range(-0.6, 0.6 - wx), r.range(-1.1, 0.15 - wy), wx, wy); ctx.clip();
    }
    // Now and then a slice is cut out, the way the distortion reference cuts type.
    if (r.chance(0.3)) {
      const yy = r.range(-0.9, -0.1), hh = r.range(0.03, 0.09);
      ctx.beginPath(); ctx.rect(-3, -3, 6, 6); ctx.rect(-3, yy, 6, hh); ctx.clip('evenodd');
    }
    const piece = (fn, rule = 'nonzero') => { ctx.beginPath(); fn(); ctx.fill(rule); };
    const w = r.range(0.11, 0.2);
    const serif = (x0, y0, dir, L, t, b) => piece(() => {
      ctx.moveTo(x0 - w / 2, y0 + dir * (t + b));
      if (b) ctx.quadraticCurveTo(x0 - w / 2, y0 + dir * t, x0 - w / 2 - b, y0 + dir * t); else ctx.lineTo(x0 - w / 2, y0 + dir * t);
      ctx.lineTo(x0 - w / 2 - L, y0 + dir * t); ctx.lineTo(x0 - w / 2 - L, y0); ctx.lineTo(x0 + w / 2 + L, y0); ctx.lineTo(x0 + w / 2 + L, y0 + dir * t);
      ctx.lineTo(x0 + w / 2 + b, y0 + dir * t);
      if (b) ctx.quadraticCurveTo(x0 + w / 2, y0 + dir * t, x0 + w / 2, y0 + dir * (t + b)); else ctx.lineTo(x0 + w / 2, y0 + dir * t);
      ctx.closePath();
    });
    switch (kind) {
      case 'stem': case 'slab': {
        const slab = kind === 'slab', t = slab ? r.range(0.06, 0.1) : r.range(0.025, 0.045), b = slab ? 0 : r.range(0.06, 0.12), L = r.range(0.14, 0.26);
        piece(() => ctx.rect(-w / 2, -1, w, 1));
        if (r.chance(0.85)) serif(0, 0, -1, L, t, b);
        if (r.chance(0.6)) serif(0, -1, 1, L, t, b);
        break;
      }
      case 'bowl':
        piece(() => {
          ctx.moveTo(0.42, -0.5); ctx.ellipse(0, -0.5, 0.42, 0.52, 0, 0, TAU);
          const ir = 0.42 - w * 1.1, jr = 0.52 - w * 0.35, st = -0.3;
          ctx.moveTo(0.03 + ir * Math.cos(st), -0.5 + ir * Math.sin(st)); ctx.ellipse(0.03, -0.5, ir, jr, st, 0, TAU);
        }, 'evenodd');
        break;
      case 'arch': {
        const x0 = -0.34 + w, x1 = 0.34;
        piece(() => ctx.rect(-0.34, -0.72, w, 0.72));
        piece(() => {
          ctx.moveTo(x0, -0.5);
          ctx.bezierCurveTo(x0 + 0.08, -0.74, x1, -0.8, x1, -0.45);
          ctx.lineTo(x1, 0); ctx.lineTo(x1 - w, 0); ctx.lineTo(x1 - w, -0.45);
          ctx.bezierCurveTo(x1 - w, -0.6, x0 + 0.1, -0.62, x0, -0.36);
          ctx.closePath();
        });
        if (r.chance(0.6)) { serif(-0.34 + w / 2, 0, -1, 0.1, 0.035, 0.06); serif(x1 - w / 2, 0, -1, 0.1, 0.035, 0.06); }
        break;
      }
      case 'crescent': {
        piece(() => { ctx.arc(0, -0.5, 0.45, -1.0, 1.1, true); ctx.arc(0.07, -0.5, 0.45 - w, 1.1, -1.0, false); ctx.closePath(); });
        const br = 0.45 - w / 2;
        piece(() => ctx.arc(Math.cos(-1.0) * br, -0.5 + Math.sin(-1.0) * br, w * 0.62, 0, TAU));
        break;
      }
      case 'tail':
        piece(() => addNib(ctx, bez([-0.15, -0.2], [0.02, 0.08], [0.3, 0.26], [0.6, 0.18], 18), idMap, w * 1.3, 0.55, press, 0.012));
        piece(() => ctx.arc(0.6, 0.18, w * 0.3, 0, TAU));
        break;
      case 'wedge':
        piece(() => { ctx.moveTo(-0.45, 0); ctx.lineTo(-0.4, 0); ctx.lineTo(0.05, -1); ctx.lineTo(0, -1); ctx.closePath(); });
        piece(() => { ctx.moveTo(-0.05, -1); ctx.lineTo(0.2, -1); ctx.lineTo(0.03, -0.84); ctx.closePath(); });
        piece(() => { ctx.moveTo(-0.52, 0); ctx.lineTo(-0.28, 0); ctx.lineTo(-0.42, -0.06); ctx.closePath(); });
        break;
      default: // spur
        piece(() => ctx.rect(-w / 2, -1, w, 1));
        piece(() => { ctx.moveTo(w / 2, -0.62); ctx.lineTo(w / 2 + 0.16, -0.8); ctx.lineTo(w / 2, -0.78); ctx.closePath(); });
        piece(() => { ctx.moveTo(-w / 2, -1); ctx.lineTo(-w / 2 - 0.18, -0.93); ctx.lineTo(-w / 2, -0.86); ctx.closePath(); });
    }
    ctx.restore();
  }

  // ---------- designs caught inside shapes ----------
  const DESIGNS = ['rings', 'hatch', 'dots', 'bands', 'spokes', 'type', 'tree', 'stipple', 'nucleus', 'waves', 'cells'];
  function branch(ctx, r, x, y, a, L, d) {
    const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
    ctx.lineWidth = Math.max(HAIR, d * 0.9); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    if (d <= 0) return;
    branch(ctx, r, ex, ey, a - r.range(0.25, 0.6), L * r.range(0.62, 0.78), d - 1);
    branch(ctx, r, ex, ey, a + r.range(0.25, 0.6), L * r.range(0.62, 0.78), d - 1);
  }
  function design(ctx, r, nz, s, kind, fg) {
    const { x, y, R } = s, a = r.range(0, TAU), c = Math.cos(a), sn = Math.sin(a);
    ctx.fillStyle = fg; ctx.strokeStyle = fg; ctx.lineWidth = r.range(1.2, 2);
    ctx.beginPath();
    switch (kind) {
      case 'rings': {
        const cx = x + r.range(-0.35, 0.35) * R, cy = y + r.range(-0.35, 0.35) * R, st = R * r.range(0.12, 0.24);
        for (let q = st * 0.6; q < R * 1.7; q += st) circle(ctx, cx, cy, q);
        ctx.stroke(); break;
      }
      case 'hatch': {
        const sp = r.range(4, 8);
        for (let d = -R * 1.2; d <= R * 1.2; d += sp) { ctx.moveTo(x + c * d - sn * R * 1.3, y + sn * d + c * R * 1.3); ctx.lineTo(x + c * d + sn * R * 1.3, y + sn * d - c * R * 1.3); }
        ctx.stroke(); break;
      }
      case 'dots': {
        const sp = Math.max(6, R * r.range(0.14, 0.28)), rad = Math.max(1.2, sp * r.range(0.16, 0.36));
        for (let j = -R * 1.2, row = 0; j <= R * 1.2; j += sp * 0.866, row++)
          for (let i = -R * 1.2; i <= R * 1.2; i += sp) { const u = i + (row % 2 ? sp / 2 : 0); circle(ctx, x + u * c - j * sn, y + u * sn + j * c, rad); }
        ctx.fill(); break;
      }
      case 'bands': {
        for (let t = -R * 1.2; t < R * 1.2;) {
          const th = r.range(2, R * 0.2);
          if (r.chance(0.55)) { ctx.moveTo(x + c * t - sn * R * 1.3, y + sn * t + c * R * 1.3); ctx.lineTo(x + c * (t + th) - sn * R * 1.3, y + sn * (t + th) + c * R * 1.3); ctx.lineTo(x + c * (t + th) + sn * R * 1.3, y + sn * (t + th) - c * R * 1.3); ctx.lineTo(x + c * t + sn * R * 1.3, y + sn * t - c * R * 1.3); ctx.closePath(); }
          t += th + r.range(1.5, R * 0.12);
        }
        ctx.fill(); break;
      }
      case 'spokes': {
        const cx = x + r.range(-0.5, 0.5) * R, cy = y + r.range(-0.5, 0.5) * R, n = r.int(10, 26);
        for (let i = 0; i < n; i++) { const b = a + (i / n) * TAU; ctx.moveTo(cx + Math.cos(b) * R * 0.12, cy + Math.sin(b) * R * 0.12); ctx.lineTo(cx + Math.cos(b) * R * 1.8, cy + Math.sin(b) * R * 1.8); }
        ctx.stroke(); break;
      }
      case 'type':
        typePart(ctx, r, r.pick(PARTS), x + r.range(-0.4, 0.4) * R, y + R * r.range(0.3, 0.9), R * r.range(1.3, 2.8), r.range(-0.4, 0.4), fg);
        break;
      case 'tree':
        branch(ctx, r, x + r.range(-0.3, 0.3) * R, y + R, -Math.PI / 2 + r.range(-0.3, 0.3), R * 0.55, r.int(4, 6));
        break;
      case 'stipple':
        for (let i = 0, n = Math.floor(R * R * 0.035); i < n; i++) circle(ctx, x + r.range(-R, R), y + r.range(-R, R), r.range(0.9, 1.7));
        ctx.fill(); break;
      case 'nucleus': {
        const q = R * r.range(0.14, 0.3), cx = x + r.range(-0.4, 0.4) * R, cy = y + r.range(-0.4, 0.4) * R;
        circle(ctx, cx, cy, q); ctx.stroke();
        ctx.beginPath(); circle(ctx, cx + r.range(-0.3, 0.3) * q, cy + r.range(-0.3, 0.3) * q, Math.max(1.5, q * 0.25)); ctx.fill();
        break;
      }
      case 'waves': {
        const sp = r.range(5, 9), amp = r.range(2, 6), f = r.range(0.05, 0.12);
        for (let d = -R * 1.2; d <= R * 1.2; d += sp) for (let u = -R * 1.3; u <= R * 1.3; u += 3) {
          const px = x + c * u - sn * (d + Math.sin(u * f) * amp), py = y + sn * u + c * (d + Math.sin(u * f) * amp);
          u === -R * 1.3 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke(); break;
      }
      default: { // cells: a short run of genome cells across the shape
        const wv = r.range(5, 10);
        for (let u = -R * 1.2; u < R * 1.2;) {
          const l = r.range(4, 12);
          if (r.chance(0.6)) { const m = u + l / 2; cellQuad(ctx, x + c * m, y + sn * m, a, l, wv); }
          u += l + 2.5;
        }
        ctx.fill();
      }
    }
  }

  // A cell rectangle centred at (x, y), length l along angle a, width w.
  function cellQuad(p, x, y, a, l, w) {
    const c = Math.cos(a), s = Math.sin(a), hx = (c * l) / 2, hy = (s * l) / 2, wx = (-s * w) / 2, wy = (c * w) / 2;
    p.moveTo(x - hx - wx, y - hy - wy); p.lineTo(x + hx - wx, y + hy - wy); p.lineTo(x + hx + wx, y + hy + wy); p.lineTo(x - hx + wx, y - hy + wy); p.closePath();
  }

  // Filled shapes with a design inside, outlined. Used by several options.
  function specimen(ctx, r, nz, P, s, designs = DESIGNS, lw = 1.5) {
    let fill;
    if (P.mono) fill = r.chance(0.2) ? P.ink : P.field;
    else fill = r.chance(0.12) ? P.field : P.pick();
    shapePath(ctx, nz, s); ctx.fillStyle = fill; ctx.fill();
    ctx.save(); shapePath(ctx, nz, s); ctx.clip();
    if (!r.chance(0.12)) design(ctx, r, nz, s, r.pick(designs), on(fill));
    ctx.restore();
    shapePath(ctx, nz, s); ctx.strokeStyle = P.ink; ctx.lineWidth = lw; ctx.stroke();
  }

  // ---------- genome tracks ----------
  // Tracks follow a noise flow field from random seeds, fork now and then, and
  // stop when they reach ground another track already holds.
  function growTracks(r, nz, opt) {
    // Options (all optional except w, gap and len or lenOf):
    //   region(x, y)    where tracks may run (default: inside the oval)
    //   seedPoint(r)    where seeds are tried (default: anywhere in the oval)
    //   obstacles       [[x, y, R]] circles tracks must flow around
    //   occ             a shared occupancy map, so separate calls avoid each other
    //   swell(i, ph)    width multiplier along a track
    //   lenOf(w, r)     cell length from width (beads), instead of len [lo, hi]
    //   flow(x, y)      a custom flow angle field
    const CELL = opt.cell ?? 7, occ = opt.occ ?? new Map(), key = (x, y) => Math.floor(x / CELL) * 8192 + Math.floor(y / CELL);
    const f = opt.freq ?? 0.0035, base = opt.base ?? r.range(0, TAU), curl = opt.curl ?? 1.4, off = opt.noiseOff ?? 0;
    const flow = opt.flow ?? ((x, y) => base + nz(x * f + off, y * f + off) * Math.PI * curl);
    const region = opt.region ?? ((x, y) => ovalR(x, y) <= 0.955);
    const seedPoint = opt.seedPoint ?? ((r) => inOval(r, 0.93));
    const free = (x, y, rad, me, par) => {
      if (!region(x, y)) return false;
      for (let dx = -rad; dx <= rad; dx += CELL) for (let dy = -rad; dy <= rad; dy += CELL) {
        const o = occ.get(key(x + dx, y + dy)); if (o !== undefined && o !== me && o !== par) return false;
      }
      return true;
    };
    const mark = (x, y, rad, me) => { for (let dx = -rad; dx <= rad; dx += CELL) for (let dy = -rad; dy <= rad; dy += CELL) occ.set(key(x + dx, y + dy), me); };
    for (const [ox, oy, oR] of opt.obstacles || [])
      for (let dx = -oR; dx <= oR; dx += CELL / 2) for (let dy = -oR; dy <= oR; dy += CELL / 2) if (dx * dx + dy * dy <= oR * oR) occ.set(key(ox + dx, oy + dy), -2);
    const tracks = [];
    let id = opt.idStart ?? 0;
    for (let attempt = 0; attempt < (opt.seeds ?? 500); attempt++) {
      const [sx, sy] = seedPoint(r), queue = [];
      const flip = r.chance(0.5) ? 0 : Math.PI;
      queue.push({ x: sx, y: sy, off: flip, w: r.range(opt.w[0], opt.w[1]), par: -1, depth: 0, ph: r.range(0, TAU) });
      while (queue.length) {
        const q = queue.pop(), me = id++, cells = [];
        let { x, y } = q, a = flow(x, y) + q.off;
        for (let i = 0; i < (opt.max ?? 60); i++) {
          const target = flow(x, y) + q.off;
          a += Math.atan2(Math.sin(target - a), Math.cos(target - a)) * (opt.steer ?? 0.25);
          const w0 = q.w * (opt.swell ? opt.swell(i, q.ph) : 1) * (opt.swellAt ? opt.swellAt(x, y) : 1);
          // With squeeze, a bead that would collide shrinks to fit before the strand gives up.
          let w, cl, cx, cy, ok = false;
          for (const k of opt.squeeze ? [1, 0.65, 0.42] : [1]) {
            w = w0 * k; if (k < 1 && w < (opt.minW ?? 2.5)) break;
            cl = opt.lenOf ? opt.lenOf(w, r) : r.range(opt.len[0], opt.len[1]);
            cx = x + (Math.cos(a) * cl) / 2; cy = y + (Math.sin(a) * cl) / 2;
            if (free(cx, cy, w / 2 + (opt.margin ?? 2), me, q.par)) { ok = true; break; }
          }
          if (!ok) break;
          mark(cx, cy, w / 2 + 1, me);
          cells.push({ x: cx, y: cy, a, w, l: cl, i });
          x += Math.cos(a) * (cl + opt.gap); y += Math.sin(a) * (cl + opt.gap);
          if (q.depth < 4 && r.chance(opt.fork ?? 0.05)) queue.push({ x, y, off: q.off + r.sign() * r.range(0.35, 0.7), w: q.w * r.range(0.7, 0.9), par: me, depth: q.depth + 1, ph: q.ph + i * 0.4 });
        }
        if (cells.length >= (opt.minCells ?? 3)) { cells.depth = q.depth; tracks.push(cells); }
      }
    }
    return tracks;
  }

  // ---------- trees ----------
  function growTree(r, x, y, a, L, d, maxD, spread, out) {
    const b = a + r.range(-0.22, 0.22), ex = x + Math.cos(b) * L, ey = y + Math.sin(b) * L;
    out.segs.push([x, y, ex, ey, d]);
    if (d >= maxD || ovalR(ex, ey) > 0.99) { out.tips.push([ex, ey, b]); return; }
    const n = r.chance(0.2) ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const s = n === 2 ? (i ? 1 : -1) : i - 1;
      growTree(r, ex, ey, b + s * spread * r.range(0.7, 1.2), L * r.range(0.68, 0.8), d + 1, maxD, spread, out);
    }
  }
  // Entry points on the rim, at random but not bunched together.
  function entries(r, n) {
    const ts = [];
    for (let guard = 0; ts.length < n && guard < 500; guard++) {
      const t = r.range(0, TAU);
      if (ts.every((u) => Math.abs(((t - u + Math.PI) % TAU + TAU) % TAU - Math.PI) > TAU / (n * 2.2))) ts.push(t);
    }
    return ts.map((t) => { const f = frameAt(t, 1.02); return { x: f.x, y: f.y, a: Math.atan2(-f.ny, -f.nx) + r.range(-0.6, 0.6) }; });
  }
  function drawSegs(ctx, segs, maxD, color, extra = 0, k = 1.1) {
    ctx.strokeStyle = color;
    for (const [x0, y0, x1, y1, d] of segs) { ctx.lineWidth = HAIR + (maxD - d) * k + extra; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
  }
  window.KIT = { HAIR, MONO, VIVID, lum, on, palette, open, close, rAdj, inside, circle, handCircle, KINDS, shapePath, makeShape, PARTS, typePart, DESIGNS, branch, design, cellQuad, specimen, growTracks, growTree, entries, drawSegs };
})();

/* Strands kit (round 4 onward): beads, sequences, strands, local drifts,
   spoke cells and pen circles. */
(function () {
  const { TAU, ovalR, E, ovalPath, inOval, pack } = window.GL;
  const { HAIR, lum, on, open, close, rAdj, inside, circle, handCircle, KINDS, shapePath, makeShape, design, cellQuad, specimen, growTracks } = window.KIT;
  // ---------- beads ----------
  const BEADS = ['rect', 'circle', 'pill', 'diamond', 'squircle', 'tri', 'ring', 'ruled', 'dot', 'lens'];
  function beadPath(ctx, kind, hl, hw) {
    ctx.beginPath();
    switch (kind) {
      case 'circle': ctx.ellipse(0, 0, hl, hw, 0, 0, TAU); break;
      case 'ring': ctx.ellipse(0, 0, hl, hw, 0, 0, TAU); ctx.moveTo(hl * 0.45, 0); ctx.ellipse(0, 0, hl * 0.45, hw * 0.45, 0, 0, TAU); break;
      case 'dot': { const q = Math.min(hl, hw) * 0.6; ctx.arc(0, 0, q, 0, TAU); break; }
      case 'pill': ctx.roundRect(-hl, -hw, 2 * hl, 2 * hw, Math.min(hl, hw)); break;
      case 'squircle': ctx.roundRect(-hl, -hw, 2 * hl, 2 * hw, Math.min(hl, hw) * 0.45); break;
      case 'diamond': ctx.moveTo(-hl, 0); ctx.lineTo(0, -hw); ctx.lineTo(hl, 0); ctx.lineTo(0, hw); ctx.closePath(); break;
      case 'tri': ctx.moveTo(-hl, -hw); ctx.lineTo(hl, 0); ctx.lineTo(-hl, hw); ctx.closePath(); break;
      case 'lens': ctx.moveTo(-hl, 0); ctx.quadraticCurveTo(0, -hw * 2, hl, 0); ctx.quadraticCurveTo(0, hw * 2, -hl, 0); ctx.closePath(); break;
      case 'star': case 'star4': case 'star8': {
        const n = kind === 'star4' ? 4 : kind === 'star8' ? 8 : 5, ro = Math.max(hl, hw), ri = ro * (n === 4 ? 0.38 : 0.45);
        for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n, q = i % 2 ? ri : ro; i ? ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q) : ctx.moveTo(Math.cos(a) * q, Math.sin(a) * q); }
        ctx.closePath(); break;
      }
      case 'tri3': case 'pent': case 'hex': case 'oct': {
        const n = { tri3: 3, pent: 5, hex: 6, oct: 8 }[kind], a0 = kind === 'tri3' || kind === 'pent' ? -Math.PI / 2 : 0;
        for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU; i ? ctx.lineTo(Math.cos(a) * hl, Math.sin(a) * hw) : ctx.moveTo(Math.cos(a) * hl, Math.sin(a) * hw); }
        ctx.closePath(); break;
      }
      case 'flower': case 'cog': case 'burst': case 'asterisk': case 'blobby': {
        // Polar outlines: petals, gear teeth, a many-pointed sun, a thin asterisk, a soft lump.
        const N = 96, f = {
          flower: (t) => 0.62 + 0.38 * Math.abs(Math.cos(t * 3)),
          cog: (t) => (Math.cos(t * 10) > 0 ? 1 : 0.78),
          burst: (t) => 0.6 + 0.4 * Math.pow(Math.abs(Math.cos(t * 7)), 6),
          asterisk: (t) => 0.2 + 0.8 * Math.pow(Math.abs(Math.cos(t * 3)), 18),
          blobby: (t) => 0.85 + 0.1 * Math.sin(t * 3 + 1) + 0.05 * Math.sin(t * 5),
        }[kind];
        for (let i = 0; i < N; i++) { const t = (i / N) * TAU, q = f(t); i ? ctx.lineTo(Math.cos(t) * hl * q, Math.sin(t) * hw * q) : ctx.moveTo(Math.cos(t) * hl * q, Math.sin(t) * hw * q); }
        ctx.closePath(); break;
      }
      case 'cross': {
        const t = 0.34;
        const P = [[-t, -1], [t, -1], [t, -t], [1, -t], [1, t], [t, t], [t, 1], [-t, 1], [-t, t], [-1, t], [-1, -t], [-t, -t]];
        P.forEach(([x, y], i) => (i ? ctx.lineTo(x * hl, y * hw) : ctx.moveTo(x * hl, y * hw))); ctx.closePath(); break;
      }
      case 'crescent': ctx.ellipse(0, 0, hl, hw, 0, 0, TAU); ctx.moveTo(hl * 0.3 + hl * 0.72, 0); ctx.ellipse(hl * 0.3, 0, hl * 0.72, hw * 0.78, 0, 0, TAU); break;
      case 'drop': ctx.moveTo(hl, 0); ctx.bezierCurveTo(hl * 0.2, -hw * 0.9, -hl, -hw * 1.05, -hl, 0); ctx.bezierCurveTo(-hl, hw * 1.05, hl * 0.2, hw * 0.9, hl, 0); ctx.closePath(); break;
      case 'semi': ctx.moveTo(-hl, hw * 0.5); ctx.ellipse(0, hw * 0.5, hl, hw * 1.5, 0, Math.PI, TAU); ctx.closePath(); break;
      case 'arch': ctx.moveTo(-hl, hw); ctx.lineTo(-hl, 0); ctx.ellipse(0, 0, hl, hw, 0, Math.PI, TAU); ctx.lineTo(hl, hw); ctx.closePath(); break;
      case 'trefoil': case 'quatrefoil': {
        const n = kind === 'trefoil' ? 3 : 4, q = n === 3 ? 0.5 : 0.46;
        for (let i = 0; i < n; i++) { const a = (i / n) * TAU - Math.PI / 2, cx = Math.cos(a) * hl * (1 - q), cy = Math.sin(a) * hw * (1 - q); ctx.moveTo(cx + hl * q, cy); ctx.ellipse(cx, cy, hl * q, hw * q, 0, 0, TAU); }
        break;
      }
      case 'target': for (const q of [1, 0.7, 0.4]) { ctx.moveTo(hl * q, 0); ctx.ellipse(0, 0, hl * q, hw * q, 0, 0, TAU); } break;
      case 'bowtie': ctx.moveTo(-hl, -hw); ctx.lineTo(0, 0); ctx.lineTo(-hl, hw); ctx.closePath(); ctx.moveTo(hl, -hw); ctx.lineTo(0, 0); ctx.lineTo(hl, hw); ctx.closePath(); break;
      case 'chevron': ctx.moveTo(-hl, -hw); ctx.lineTo(0, -hw); ctx.lineTo(hl, 0); ctx.lineTo(0, hw); ctx.lineTo(-hl, hw); ctx.lineTo(0, 0); ctx.closePath(); break;
      case 'kite': ctx.moveTo(-hl, 0); ctx.lineTo(hl * 0.2, -hw); ctx.lineTo(hl, 0); ctx.lineTo(hl * 0.2, hw); ctx.closePath(); break;
      default: ctx.rect(-hl, -hw, 2 * hl, 2 * hw);
    }
  }
  function bead(ctx, kind, c, fill, line, lw = HAIR) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
    const hl = c.l / 2, hw = c.w / 2;
    beadPath(ctx, kind, hl, hw);
    if (fill) { ctx.fillStyle = fill; ctx.fill('evenodd'); }
    if (kind === 'ruled') {
      ctx.save(); ctx.clip(); ctx.strokeStyle = on(fill || '#ffffff'); ctx.lineWidth = HAIR; ctx.beginPath();
      for (let u = -hl + 2; u < hl; u += 3.2) { ctx.moveTo(u, -hw); ctx.lineTo(u, hw); }
      ctx.stroke(); ctx.restore(); beadPath(ctx, kind, hl, hw);
    }
    if (line) { ctx.strokeStyle = line; ctx.lineWidth = lw; ctx.stroke(); }
    ctx.restore();
  }

  // Each strand spells with its own small alphabet and colour logic.
  function sequence(r, P, n, o = {}) {
    const alpha = r.shuffle(o.alphabet || BEADS).slice(0, r.int(o.kinds?.[0] ?? 1, o.kinds?.[1] ?? 4));
    const pool = P.mono ? [P.ink, P.field] : P.fills.concat(r.chance(0.4) ? [P.ink] : []);
    const mode = o.mode || r.pick(['random', 'codon', 'codon', 'runs', 'accent']);
    const codon = Array.from({ length: r.int(2, 4) }, () => [r.pick(alpha), r.pick(pool)]);
    const out = [];
    let run = null, left = 0;
    for (let i = 0; i < n; i++) {
      let k, c;
      if (mode === 'codon') { [k, c] = codon[i % codon.length]; if (r.chance(0.1)) { k = r.pick(alpha); c = r.pick(pool); } }
      else if (mode === 'runs') { if (left-- <= 0) { run = [r.pick(alpha), r.pick(pool)]; left = r.int(2, 6); } [k, c] = run; }
      else if (mode === 'accent') { k = alpha[0]; c = r.chance(0.22) ? r.pick(pool) : r.chance(0.5) ? P.ink : P.field; }
      else { k = r.pick(alpha); c = r.pick(pool); }
      out.push([k, c]);
    }
    return out;
  }
  function spine(ctx, P, tracks) {
    ctx.strokeStyle = P.ink; ctx.lineWidth = HAIR; ctx.beginPath();
    for (const t of tracks) t.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
    ctx.stroke();
  }
  function drawStrands(ctx, r, P, tracks, o = {}) {
    if (o.spine ?? true) spine(ctx, P, tracks);
    const outline = o.outline ?? true;
    for (const t of tracks) {
      const seq = sequence(r, P, t.length, o);
      t.forEach((c, i) => { const [k, f] = seq[i]; bead(ctx, k, c, f, outline || f === P.field ? P.ink : null); });
    }
  }
  // A palette seen from inside a coloured shape: lines contrast with the fill.
  const within = (P, fill) => ({ ...P, ink: on(fill), field: fill, fills: P.mono ? [on(fill), fill] : P.fills.filter((c) => c !== fill) });
  const disc = (cx, cy, R) => (x, y) => Math.hypot(x - cx, y - cy) < R;
  const inDisc = (cx, cy, R) => (r) => { const a = r.range(0, TAU), q = Math.sqrt(r.next()) * R; return [cx + Math.cos(a) * q, cy + Math.sin(a) * q]; };
  const localTracks = (r, nz, cx, cy, R, o = {}) => growTracks(r, nz, {
    region: disc(cx, cy, R * 0.86), seedPoint: inDisc(cx, cy, R * 0.8), cell: 4,
    w: o.w || [2.4, 2.6 + R * 0.06], lenOf: (w, r) => w * r.range(0.9, 1.35), gap: 1.6, fork: 0.05,
    seeds: Math.floor(R * (o.seedK ?? 1.1)), freq: o.freq ?? r.range(0.006, 0.02), curl: r.range(0.8, 2), noiseOff: cx * 0.01, max: 40, minCells: 2,
  });

  // Branching spokes inside a colony, grouped into runs so each can be spelled.
  function spokeCells(r, nz, cx, cy, R, o = {}) {
    if (!(R > 2) || !Number.isFinite(cx + cy + R)) return [];
    const ox = cx + r.range(-0.25, 0.25) * R, oy = cy + r.range(-0.25, 0.25) * R, target = (o.target ?? r.range(4, 7)) * Math.max(1, R / 60);
    const spokes = [];
    (function spoke(th, rho, aw, depth, cells) {
      while (true) {
        const ex = cx + Math.cos(th) * R, ey = cy + Math.sin(th) * R, len = Math.hypot(ex - ox, ey - oy);
        if (!Number.isFinite(len) || rho * len > len - 3) break;
        const width = aw * rho * len;
        if (width > 2 * target && depth < 7) {
          if (cells.length) spokes.push(cells);
          spoke(th - aw / 4, rho, aw / 2, depth + 1, []); spoke(th + aw / 4, rho, aw / 2, depth + 1, []);
          return;
        }
        const cl = Math.min(r.range(3, 8) * Math.max(1, R / 70) * (o.lenK ?? 1), len * (1 - rho) - 2), a = Math.atan2(ey - oy, ex - ox);
        if (cl < 2) break;
        const d = rho * len + cl / 2;
        cells.push({ x: ox + Math.cos(a) * d, y: oy + Math.sin(a) * d, a, l: cl, w: Math.max(1.4, width * 0.65) });
        rho += (cl + (o.gap ?? 2)) / len;
        th += nz(th * 3 + cx, rho * 4) * 0.02;
      }
      if (cells.length) spokes.push(cells);
    })(r.range(0, TAU), 0.12, TAU, 0, []);
    return spokes;
  }

  // Pen circles, clustered the way the sketch clusters them.
  function penCircles(r, n, big = 60) {
    const cs = [];
    for (let i = 0; i < n; i++) {
      let [x, y] = inOval(r, 0.93);
      const R = r.chance(0.3) ? r.range(5, 12) : r.range(16, big);
      if (cs.length && r.chance(0.4)) { const [px, py, pr] = r.pick(cs), a = r.range(0, TAU), d = pr * r.range(0.5, 1.1) + R * 0.5; x = px + Math.cos(a) * d; y = py + Math.sin(a) * d; }
      if (ovalR(x, y) + rAdj(R) * 0.6 > 1.02) continue;
      cs.push([x, y, R, r.range(0, 99)]);
    }
    return cs;
  }
  function penRim(ctx, r, nz, P) {
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
  }
  const flowOpts = (r) => ({ freq: r.range(0.0015, 0.006), curl: r.range(0.6, 2.2) });
  window.STRANDS = { BEADS, beadPath, bead, sequence, spine, drawStrands, within, disc, inDisc, localTracks, spokeCells, penCircles, penRim, flowOpts };
})();

/* Radiant kit (round 6 onward): spokes into the centre, sizing, items, and
   the drawing styles. Geometry and style are kept separate. */
(function () {
  const { TAU, O, E, ovalR, ovalPath } = window.GL;
  const { HAIR, on, open, close, circle, shapePath, design, growTracks } = window.KIT;
  const { beadPath, sequence, penRim } = window.STRANDS;

  const STARRY = ['circle', 'circle', 'ring', 'dot', 'lens', 'star', 'star4', 'star8', 'pill', 'diamond', 'squircle'];
  const DESIGNS = ['rings', 'hatch', 'dots', 'bands', 'nucleus', 'stipple', 'spokes', 'waves'];

  // ---------- geometry ----------
  // Branching spokes from an origin (the centre unless offset) out to the rim.
  function radiant(r, nz, o) {
    const ox = o.ox ?? O.cx, oy = o.oy ?? O.cy, spokes = [];
    const swirl = o.swirl ?? 0, wig = o.wiggle ?? 0.012, gap = o.gap ?? 2, end = o.end ?? 0.965;
    (function spoke(th, rho, aw, depth, cells, ph) {
      let i = 0;
      while (rho < end) {
        const [ex, ey] = E(th, 1), dist = Math.hypot(ex - ox, ey - oy), width = aw * rho * dist;
        if (width > 2 * o.target(rho) && depth < 10) {
          if (cells.length) spokes.push(cells);
          spoke(th - aw / 4, rho, aw / 2, depth + 1, [], ph + 1.3);
          spoke(th + aw / 4, rho, aw / 2, depth + 1, [], ph + 2.1);
          return;
        }
        const px = ox + (ex - ox) * rho, py = oy + (ey - oy) * rho;
        let w = Math.max(2.2, width * (o.fill ?? 0.72) * Math.min(1.2, o.size ? o.size(i, ph, rho, px, py) : 1));
        if (!Number.isFinite(w)) w = 2.2;
        const l = o.lenOf ? o.lenOf(w, r) : w;
        const u = rho + l / 2 / dist;
        if (u > end) break;
        const x = ox + (ex - ox) * u, y = oy + (ey - oy) * u, prev = cells[cells.length - 1];
        cells.push({ x, y, a: prev ? Math.atan2(y - prev.y, x - prev.x) : Math.atan2(y - oy, x - ox), l, w });
        rho += (l + gap) / dist;
        th += (swirl * (l + gap)) / dist + nz(th * 2, rho * 3) * wig;
        i++;
      }
      if (cells.length) spokes.push(cells);
    })(r.range(0, TAU), o.start ?? 0.04, TAU, 0, [], 0);
    return spokes;
  }
  // Bead size along a spoke: steady, swelling or random, times a tide field
  // across the whole oval (Swell Tide) and an optional bloom from centre to rim.
  function sizing(r, nz, o = {}) {
    const mode = r.pick(['steady', 'swell', 'swell', 'random']), fr = r.range(0.3, 0.8), ft = r.range(0.003, 0.007), tk = o.tide ?? 1;
    const along = mode === 'steady' ? () => r.range(0.85, 1) : mode === 'swell' ? (i, ph) => 0.4 + 0.6 * Math.abs(Math.sin(i * fr + ph)) : () => r.range(0.35, 1);
    const tide = (x, y) => 1 - tk + tk * (0.35 + 1.1 * Math.pow(Math.max(0, (nz(x * ft + 50, y * ft + 50) + 1) / 2), 1.4));
    return (i, ph, rho, x, y) => along(i, ph) * tide(x, y);
  }
  const orbit = (x, y) => { const t = Math.atan2((y - O.cy) / O.ry, (x - O.cx) / O.rx); return Math.atan2(O.ry * Math.cos(t), -O.rx * Math.sin(t)); };
  const radial = (x, y) => Math.atan2(y - O.cy, x - O.cx);

  // Lines of cells → items with a shape, a colour, and a design when large.
  function toItems(r, P, lines, o = {}) {
    const items = [], nodes = [];
    lines.forEach((ln, g) => {
      const seq = sequence(r, P, ln.length, { alphabet: o.alphabet || STARRY, kinds: o.kinds || [1, 4] });
      ln.forEach((c, i) => {
        const big = o.tail && r.chance(o.tail[0]) ? r.range(o.tail[1], o.tail[2]) : 1;
        const cc = big > 1 ? { ...c, l: c.l * big, w: c.w * big } : c;
        const spec = cc.w >= (o.spec ?? 999), pool = P.mono ? [P.ink, P.field] : P.fills.concat(P.field);
        const it = { ...cc, kind: seq[i][0], fill: seq[i][1], g, spec: spec ? r.pick(o.designs || DESIGNS) : null, shape: r.pick(['circle', 'circle', 'ellipse', 'squircle']), size: cc.w };
        if (spec && o.specKinds) it.specBead = r.pick(o.specKinds);
        it.fill2 = r.pick(pool.filter((f) => f !== it.fill)) || P.ink; it.fill3 = r.pick(pool.filter((f) => f !== it.fill && f !== it.fill2)) || it.fill;
        items.push(it);
        if (r.chance(o.nodes ?? 0)) {
          const k = r.range(o.nodeK?.[0] ?? 1.4, o.nodeK?.[1] ?? 2.6), fill = r.pick(P.mono ? [P.ink, P.field] : P.fills);
          const n = { ...c, l: c.w * k, w: c.w * k * r.range(0.7, 1), kind: 'circle', fill, g, spec: r.pick(o.designs || DESIGNS), shape: r.pick(['circle', 'ellipse', 'squircle']), size: c.w * k };
          if (o.specKinds) n.specBead = r.pick(o.specKinds);
          n.fill2 = r.pick(pool.filter((f) => f !== fill)) || P.ink; n.fill3 = r.pick(pool.filter((f) => f !== fill && f !== n.fill2)) || fill;
          nodes.push(n);
        }
      });
    });
    return items.concat(nodes);
  }

  // ---------- drawing an item ----------
  const specShape = (it) => ({ x: it.x, y: it.y, R: Math.max(it.l, it.w) / 2, asp: Math.min(it.l, it.w) / Math.max(it.l, it.w), rot: it.l >= it.w ? it.a : it.a + Math.PI / 2, kind: it.shape, k: it.x });
  function itemPath(ctx, nz, it) {
    if (it.spec && !it.specBead) { shapePath(ctx, nz, specShape(it)); return; }
    ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.a); beadPath(ctx, (it.spec && it.specBead) || it.kind, it.l / 2, it.w / 2); ctx.restore();
  }
  const moved = (it, dx, dy, da = 0, ds = 0) => ({ ...it, x: it.x + dx, y: it.y + dy, a: it.a + da, l: it.l * (1 + ds), w: it.w * (1 + ds) });
  const R_of = (it) => Math.max(it.l, it.w) / 2 + 1;
  function inside(ctx, nz, it, fn) { ctx.save(); itemPath(ctx, nz, it); ctx.clip('evenodd'); fn(); ctx.restore(); }
  const BOLD = ['split', 'quarters', 'bullseye', 'stripes', 'checker', 'inner', 'pinwheel', 'bigdots'];
  // Solid, multicolour designs: halves, quarters, bullseyes, stripes, checks,
  // a smaller shape inside, pinwheels, big dots. Colours come from the item.
  function boldDesign(ctx, r, it, fg) {
    const R = Math.max(it.l, it.w) / 2 + 2, x = it.x, y = it.y, A = it.fill2, B = it.fill3, a = r.range(0, TAU);
    const c = Math.cos(a), s = Math.sin(a);
    const band = (d0, d1) => { ctx.moveTo(x + c * d0 - s * R, y + s * d0 + c * R); ctx.lineTo(x + c * d1 - s * R, y + s * d1 + c * R); ctx.lineTo(x + c * d1 + s * R, y + s * d1 - c * R); ctx.lineTo(x + c * d0 + s * R, y + s * d0 - c * R); ctx.closePath(); };
    ctx.beginPath();
    switch (it.spec) {
      case 'split': band(r.range(-0.3, 0.3) * R, R); ctx.fillStyle = A; ctx.fill(); break;
      case 'quarters': ctx.moveTo(x, y); ctx.arc(x, y, R, a, a + Math.PI / 2); ctx.closePath(); ctx.moveTo(x, y); ctx.arc(x, y, R, a + Math.PI, a + 1.5 * Math.PI); ctx.closePath(); ctx.fillStyle = A; ctx.fill(); break;
      case 'bullseye': { const n = r.int(2, 4), ox = x + r.range(-0.2, 0.2) * R, oy = y + r.range(-0.2, 0.2) * R; for (let i = n; i > 0; i--) { ctx.beginPath(); ctx.arc(ox, oy, (R * i) / (n + 0.5), 0, TAU); ctx.fillStyle = i % 2 ? A : i % 3 ? B : it.fill; ctx.fill(); } break; }
      case 'stripes': { const w = R * r.range(0.14, 0.3); for (let d = -R; d < R; d += w * 2) band(d, d + w); ctx.fillStyle = A; ctx.fill(); break; }
      case 'checker': { const w = R * r.range(0.25, 0.45); for (let i = -R; i < R; i += w) for (let j = -R; j < R; j += w) if ((Math.round((i + R) / w) + Math.round((j + R) / w)) % 2) ctx.rect(x + i, y + j, w, w); ctx.fillStyle = A; ctx.fill(); break; }
      case 'inner': ctx.save(); ctx.translate(x + r.range(-0.15, 0.15) * R, y + r.range(-0.15, 0.15) * R); ctx.rotate(a); beadPath(ctx, r.pick(['star', 'hex', 'flower', 'cross', 'circle', 'diamond', 'tri3', 'cog']), R * 0.55, R * 0.55); ctx.restore(); ctx.fillStyle = A; ctx.fill('evenodd'); ctx.beginPath(); circle(ctx, x, y, R * 0.14); ctx.fillStyle = B; ctx.fill(); break;
      case 'pinwheel': { const n = r.int(3, 6) * 2; for (let i = 0; i < n; i += 2) { ctx.moveTo(x, y); ctx.arc(x, y, R, a + (i / n) * TAU, a + ((i + 1) / n) * TAU); ctx.closePath(); } ctx.fillStyle = A; ctx.fill(); break; }
      default: { const w = R * r.range(0.35, 0.6), q = w * r.range(0.22, 0.34); for (let i = -R; i <= R; i += w) for (let j = -R; j <= R; j += w) circle(ctx, x + i, y + j, q); ctx.fillStyle = A; ctx.fill(); }
    }
    ctx.lineWidth = HAIR; ctx.strokeStyle = fg;
  }
  const specDesign = (ctx, r, nz, it, fg) => {
    if (!it.spec) return;
    inside(ctx, nz, it, () => (BOLD.includes(it.spec) ? boldDesign(ctx, r, it, fg) : design(ctx, r, nz, specShape(it), it.spec, fg)));
  };
  // Line colour for an item in a style whose own ink is S.ink.
  const lineOf = (S, it) => (S.mono || it.fill === S.field ? S.ink : it.fill);

  // ---------- styles ----------
  const STYLE = {
    flat: {
      item(ctx, r, nz, S, it) {
        itemPath(ctx, nz, it); ctx.fillStyle = it.fill; ctx.fill('evenodd');
        specDesign(ctx, r, nz, it, on(it.fill));
        itemPath(ctx, nz, it); ctx.strokeStyle = S.ink; ctx.lineWidth = HAIR; ctx.stroke();
      },
    },
    line: {
      item(ctx, r, nz, S, it) {
        const c = lineOf(S, it);
        itemPath(ctx, nz, it); ctx.fillStyle = S.field; ctx.fill('evenodd');
        specDesign(ctx, r, nz, it, c);
        itemPath(ctx, nz, it); ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.stroke();
      },
    },
    pen: {
      // Screen-print feel: the fill slips off register and the outline is drawn twice by hand.
      item(ctx, r, nz, S, it) {
        itemPath(ctx, nz, moved(it, 2.2, 1.8)); ctx.fillStyle = it.fill === S.field && !S.mono ? S.fills[0] : it.fill; ctx.fill('evenodd');
        specDesign(ctx, r, nz, moved(it, 2.2, 1.8), on(it.fill));
        ctx.strokeStyle = S.ink; ctx.lineWidth = 1.3;
        for (let k = 0; k < 2; k++) { itemPath(ctx, nz, moved(it, r.range(-0.8, 0.8), r.range(-0.8, 0.8), r.range(-0.08, 0.08), r.range(-0.05, 0.05))); ctx.stroke(); }
      },
    },
    riso: {
      // Two or three fluorescent inks overprinting, each layer a little off register.
      setup(ctx, r, P) {
        ovalPath(ctx); ctx.fillStyle = '#ffffff'; ctx.fill();
        const inks = P.mono ? ['#111111', '#8f8f8f'] : r.shuffle(['#ff48b0', '#0078bf', '#ffe800', '#00a95c', '#ff6c2f']).slice(0, r.int(2, 3));
        return { ...P, field: '#ffffff', ink: inks[0], inks, offs: inks.map((_, k) => [k * r.range(1, 2.4), -k * r.range(0.8, 2)]) };
      },
      item(ctx, r, nz, S, it) {
        const k = it.g % S.inks.length, [dx, dy] = S.offs[k], ink = S.inks[k], m = moved(it, dx, dy);
        ctx.globalCompositeOperation = 'multiply';
        itemPath(ctx, nz, m);
        if (r.chance(0.6)) { ctx.fillStyle = ink; ctx.fill('evenodd'); specDesign(ctx, r, nz, m, '#ffffff'); }
        else { ctx.strokeStyle = ink; ctx.lineWidth = 1.6; ctx.stroke(); specDesign(ctx, r, nz, m, ink); }
        ctx.globalCompositeOperation = 'source-over';
      },
      lineColor: (S) => S.inks[0],
    },
    cutout: {
      // Paper cut: solid shapes on a solid ground, no outlines, designs cut back out.
      setup(ctx, r, P) {
        const ground = P.mono ? '#111111' : r.pick([P.ink, '#111111', P.field]);
        ovalPath(ctx); ctx.fillStyle = ground; ctx.fill();
        return { ...P, ground };
      },
      item(ctx, r, nz, S, it) {
        let f = S.mono ? '#ffffff' : it.fill;
        if (f === S.ground) f = S.ground === S.field ? S.fills[0] : S.field;
        itemPath(ctx, nz, it); ctx.fillStyle = f; ctx.fill('evenodd');
        specDesign(ctx, r, nz, it, S.ground);
      },
      spine: false,
    },
    halftone: {
      item(ctx, r, nz, S, it) {
        const c = lineOf(S, it), R = R_of(it), sp = Math.max(2.6, Math.min(6, it.w * 0.22)), dr = sp * r.range(0.2, 0.46);
        itemPath(ctx, nz, it); ctx.fillStyle = S.field; ctx.fill('evenodd');
        inside(ctx, nz, it, () => {
          ctx.fillStyle = c; ctx.beginPath();
          const c45 = Math.SQRT1_2;
          for (let i = -R; i <= R; i += sp) for (let j = -R; j <= R; j += sp) circle(ctx, it.x + (i - j) * c45, it.y + (i + j) * c45, dr);
          ctx.fill();
        });
        specDesign(ctx, r, nz, it, c);
        itemPath(ctx, nz, it); ctx.strokeStyle = S.ink; ctx.lineWidth = HAIR; ctx.stroke();
      },
    },
    stipple: {
      item(ctx, r, nz, S, it) {
        const c = lineOf(S, it), R = R_of(it), n = Math.floor(Math.PI * R * R * r.range(0.05, 0.25));
        itemPath(ctx, nz, it); ctx.fillStyle = S.field; ctx.fill('evenodd');
        inside(ctx, nz, it, () => { ctx.fillStyle = c; ctx.beginPath(); for (let i = 0; i < n; i++) circle(ctx, it.x + r.range(-R, R), it.y + r.range(-R, R), r.range(0.8, 1.4)); ctx.fill(); });
        itemPath(ctx, nz, it); ctx.strokeStyle = S.ink; ctx.lineWidth = HAIR; ctx.stroke();
      },
    },
    hatch: {
      // Woodcut: every shape cut with parallel lines, the angle turning between strands.
      item(ctx, r, nz, S, it) {
        const c = lineOf(S, it), R = R_of(it), sp = r.range(2.6, 4), a = it.a + Math.PI / 2 + (it.g % 3) * 0.6, ca = Math.cos(a), sa = Math.sin(a);
        itemPath(ctx, nz, it); ctx.fillStyle = S.field; ctx.fill('evenodd');
        inside(ctx, nz, it, () => {
          ctx.strokeStyle = c; ctx.lineWidth = HAIR; ctx.beginPath();
          for (let d = -R; d <= R; d += sp) { ctx.moveTo(it.x + ca * d - sa * R, it.y + sa * d + ca * R); ctx.lineTo(it.x + ca * d + sa * R, it.y + sa * d - ca * R); }
          ctx.stroke();
        });
        itemPath(ctx, nz, it); ctx.strokeStyle = S.ink; ctx.lineWidth = 1.4; ctx.stroke();
      },
    },
    shadow: {
      // Stacked paper: every shape casts the same hard offset shadow.
      pre(ctx, r, nz, S, items) {
        ctx.fillStyle = S.mono ? '#111111' : S.ink;
        for (const it of items) { itemPath(ctx, nz, moved(it, S.sx, S.sy)); ctx.fill('evenodd'); }
      },
      setup(ctx, r, P) { const a = r.range(0, TAU), d = r.range(2.5, 4); return { ...P, sx: Math.cos(a) * d, sy: Math.sin(a) * d }; },
      item(ctx, r, nz, S, it) { STYLE.flat.item(ctx, r, nz, S, it); },
    },
    blueprint: {
      setup(ctx, r, P) {
        const ground = P.mono ? '#111111' : r.pick(['#1b3fd1', '#0e0e12', '#0b6b4a', '#c2185b']);
        ovalPath(ctx); ctx.fillStyle = ground; ctx.fill();
        return { ...P, field: ground, ink: '#ffffff', accent: P.mono ? '#ffffff' : r.pick(['#ffd426', '#ff5ca8', '#18d38a', '#ff6a1f']) };
      },
      item(ctx, r, nz, S, it) {
        const lit = it.kind.startsWith('star') || r.chance(0.06);
        itemPath(ctx, nz, it); ctx.fillStyle = lit ? S.accent : S.field; ctx.fill('evenodd');
        specDesign(ctx, r, nz, it, '#ffffff');
        itemPath(ctx, nz, it); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = HAIR; ctx.stroke();
      },
    },
  };

  function render(ctx, r, nz, P, items, lines, name, o = {}) {
    const st = STYLE[name], S = st.setup ? st.setup(ctx, r, P) : { ...P };
    if (lines && (st.spine ?? true) && (o.spine ?? r.chance(0.6))) {
      ctx.strokeStyle = st.lineColor ? st.lineColor(S) : S.ink; ctx.lineWidth = HAIR; ctx.beginPath();
      for (const ln of lines) ln.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
      ctx.stroke();
    }
    if (st.pre) st.pre(ctx, r, nz, S, items);
    for (const it of items) st.item(ctx, r, nz, S, it);
    return S;
  }

  // ---------- compositions ----------
  const COMP = {
    tide(r, nz) {
      const t0 = r.range(10, 15);
      return radiant(r, nz, { target: (rho) => t0 * (0.4 + 1.1 * rho), size: sizing(r, nz), gap: r.range(1.5, 3), lenOf: (w, r) => w * r.range(0.8, 1.35) });
    },
    swirl(r, nz) {
      const t0 = r.range(9, 13);
      return radiant(r, nz, { target: (rho) => t0 * (0.4 + 1.1 * rho), swirl: r.range(1.2, 2.6) * r.sign(), size: sizing(r, nz), gap: r.range(1.5, 2.5), lenOf: (w) => w });
    },
    bloom(r, nz) {
      const t0 = r.range(11, 16);
      return radiant(r, nz, { target: (rho) => t0 * (0.15 + 1.9 * Math.pow(rho, 1.6)), size: sizing(r, nz, { tide: 0.6 }), gap: r.range(1.5, 3), lenOf: (w, r) => w * r.range(0.8, 1.3) });
    },
    eccentric(r, nz) {
      const t0 = r.range(10, 14);
      return radiant(r, nz, { ox: O.cx + r.range(-0.4, 0.4) * O.rx, oy: O.cy + r.range(-0.35, 0.35) * O.ry, target: (rho) => t0 * (0.4 + 1.1 * rho), size: sizing(r, nz), gap: r.range(1.5, 3), lenOf: (w, r) => w * r.range(0.8, 1.3) });
    },
    // Strands (not spokes) pulled toward the centre, sized by the tide, packed tight.
    converge(r, nz) {
      const ft = r.range(0.003, 0.007), k = r.range(0.2, 0.45);
      return growTracks(r, nz, {
        w: [8, 18], flow: (x, y) => radial(x, y) + nz(x * 0.004, y * 0.004) * k,
        swellAt: (x, y) => (0.3 + 1.1 * Math.pow(Math.max(0, (nz(x * ft + 50, y * ft + 50) + 1) / 2), 1.4)) * (0.45 + 0.9 * ovalR(x, y)),
        lenOf: (w) => w, gap: r.range(0.8, 1.8), margin: 1, squeeze: true, minW: 2.4, fork: 0.04, seeds: 1500, cell: 4, max: 90, minCells: 2, steer: 0.35,
        region: (x, y) => { const q = ovalR(x, y); return q < 0.955 && q > 0.04; },
      });
    },
    // Radial spokes crossed by orbiting strands.
    rays(r, nz) {
      const t0 = r.range(5, 8);
      const spokes = radiant(r, nz, { target: (rho) => t0 * (0.5 + 0.9 * rho), size: sizing(r, nz, { tide: 0.7 }), gap: r.range(3, 7), lenOf: (w) => w });
      const ft = r.range(0.003, 0.007);
      const rings = growTracks(r, nz, { w: [6, 12], flow: (x, y) => orbit(x, y), swellAt: (x, y) => 0.4 + 1.0 * Math.pow(Math.max(0, (nz(x * ft + 9, y * ft + 9) + 1) / 2), 1.4), lenOf: (w) => w, gap: 1.5, squeeze: true, minW: 2.4, seeds: 260, cell: 5, max: 120, steer: 0.5, region: (x, y) => { const q = ovalR(x, y); return q < 0.955 && q > 0.1; } });
      return spokes.filter((_, i) => i % 2 === 0).concat(rings);
    },
  };

  window.RADIANT = { BOLD, boldDesign, STARRY, DESIGNS, radiant, sizing, orbit, radial, toItems, specShape, itemPath, moved, R_of, specDesign, lineOf, STYLE, render, COMP, insideItem: inside };
})();
