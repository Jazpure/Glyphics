/* Glyphics sketch library — shared geometry, randomness and the broad-nib
   stroke engine every direction draws with. All drawing happens in a fixed
   1200 × 900 logical space; the page scales the context to fit. */
(function () {
  const W = 1200, H = 900, TAU = Math.PI * 2;
  // The frame: a horizontal oval at ~1.3 : 1, as on the board.
  const O = { cx: 600, cy: 450, rx: 470, ry: 360 };

  // ---------- randomness ----------
  function rng(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      range: (lo, hi) => lo + (hi - lo) * next(),
      int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      chance: (p) => next() < p,
      sign: () => (next() < 0.5 ? -1 : 1),
      gauss: () => {
        const u = Math.max(next(), 1e-9), v = next();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
      },
      shuffle: (arr) => {
        const a2 = arr.slice();
        for (let i = a2.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          [a2[i], a2[j]] = [a2[j], a2[i]];
        }
        return a2;
      },
    };
  }

  // 2D gradient noise, roughly in [-1, 1].
  function makeNoise(r) {
    const perm = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r.next() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    const p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
    const g = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const dot = (h, x, y) => g[h & 7][0] * x + g[h & 7][1] * y;
    return function (x, y) {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      x -= Math.floor(x); y -= Math.floor(y);
      const u = fade(x), v = fade(y);
      const aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
      const l1 = dot(aa, x, y) + u * (dot(ba, x - 1, y) - dot(aa, x, y));
      const l2 = dot(ab, x, y - 1) + u * (dot(bb, x - 1, y - 1) - dot(ab, x, y - 1));
      return (l1 + v * (l2 - l1)) * 1.2;
    };
  }

  // ---------- geometry ----------
  function bez(a, b, c, d, n = 16) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, m = 1 - t;
      out.push([
        m * m * m * a[0] + 3 * m * m * t * b[0] + 3 * m * t * t * c[0] + t * t * t * d[0],
        m * m * m * a[1] + 3 * m * m * t * b[1] + 3 * m * t * t * c[1] + t * t * t * d[1],
      ]);
    }
    return out;
  }
  const shift = (pts, dx, dy) => pts.map((p) => [p[0] + dx, p[1] + dy]);
  const scalePts = (pts, k) => pts.map((p) => [p[0] * k, p[1] * k]);
  const rotPts = (pts, a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return pts.map((p) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c]);
  };
  function centre(pts) {
    let x = 0, y = 0;
    for (const p of pts) { x += p[0]; y += p[1]; }
    return shift(pts, -x / pts.length, -y / pts.length);
  }

  // A point on the oval at parameter t and scale s, with its local frame:
  // u = tangent (direction of increasing t), n = outward normal.
  function frameAt(t, s = 1, o = O) {
    const tx = -o.rx * s * Math.sin(t), ty = o.ry * s * Math.cos(t);
    const L = Math.hypot(tx, ty);
    return {
      x: o.cx + o.rx * s * Math.cos(t), y: o.cy + o.ry * s * Math.sin(t),
      ux: tx / L, uy: ty / L, nx: ty / L, ny: -tx / L, speed: L,
    };
  }
  const E = (t, s = 1, o = O) => [o.cx + o.rx * s * Math.cos(t), o.cy + o.ry * s * Math.sin(t)];
  // Normalised oval radius of a point: 1 on the frame, < 1 inside.
  const ovalR = (x, y, o = O) => Math.hypot((x - o.cx) / o.rx, (y - o.cy) / o.ry);

  // Mappers turn glyph-local coordinates (x along the baseline, y up) into
  // screen space, returning [X, Y, ux, uy, vx, vy] so the nib can rotate with
  // the writing direction.
  function ringMap(t0, s0, dir = 1, o = O) {
    const sp = frameAt(t0, s0, o).speed;
    return (x, y) => {
      const f = frameAt(t0 + (dir * x) / sp, s0, o);
      const ux = f.ux * dir, uy = f.uy * dir, vx = f.nx * dir, vy = f.ny * dir;
      return [f.x + y * vx, f.y + y * vy, ux, uy, vx, vy];
    };
  }
  function flatMap(ox, oy, rot = 0, sc = 1) {
    const ux = Math.cos(rot), uy = Math.sin(rot), vx = Math.sin(rot), vy = -Math.cos(rot);
    return (x, y) => [ox + (x * ux + y * vx) * sc, oy + (x * uy + y * vy) * sc, ux, uy, vx, vy];
  }

  // ---------- the broad nib ----------
  // Width comes from direction: a fixed-angle nib is thick moving across its
  // edge and a hairline moving along it. `minW` keeps hairlines visible.
  const press = (u) => Math.min(1, 0.7 + u * 3) * (u > 0.82 ? 1 - ((u - 0.82) / 0.18) * 0.7 : 1);
  const flat = () => 1;

  function quad(ctx, ax, ay, bx, by, cx, cy, dx, dy) {
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax) + (cx - ax) * (dy - ay) - (cy - ay) * (dx - ax);
    ctx.moveTo(ax, ay);
    if (area >= 0) { ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy); }
    else { ctx.lineTo(dx, dy); ctx.lineTo(cx, cy); ctx.lineTo(bx, by); }
    ctx.closePath();
  }

  function nibEdges(pts, map, w, phi, pr = press, minW = 0.9) {
    const n = pts.length, P = pts.map((p) => map(p[0], p[1]));
    const c = Math.cos(phi), s = Math.sin(phi), L = [], R = [];
    for (let i = 0; i < n; i++) {
      const q = P[i], h = pr(n > 1 ? i / (n - 1) : 0) * w * 0.5;
      let nx = (c * q[2] + s * q[4]) * h, ny = (c * q[3] + s * q[5]) * h;
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const dl = Math.hypot(dx, dy) || 1;
      nx += (-dy / dl) * minW * 0.5; ny += (dx / dl) * minW * 0.5;
      L.push([q[0] + nx, q[1] + ny]); R.push([q[0] - nx, q[1] - ny]);
    }
    return [L, R];
  }

  // Adds a nib stroke to the current path (caller fills), so thousands of
  // strokes can share one fill.
  function addNib(ctx, pts, map, w, phi, pr, minW) {
    if (pts.length < 2) return;
    const [L, R] = nibEdges(pts, map, w, phi, pr, minW);
    for (let i = 1; i < L.length; i++)
      quad(ctx, L[i - 1][0], L[i - 1][1], L[i][0], L[i][1], R[i][0], R[i][1], R[i - 1][0], R[i - 1][1]);
    // Very long paths fill slowly; flush in chunks (same fill style).
    if ((ctx.__quads = (ctx.__quads || 0) + L.length) > 1200) { ctx.fill(); ctx.beginPath(); ctx.__quads = 0; }
  }
  function nib(ctx, pts, map, w, phi, pr, minW) {
    ctx.beginPath(); addNib(ctx, pts, map, w, phi, pr, minW); ctx.fill();
  }
  // The outline of a nib stroke, for wireframe directions.
  function addNibOutline(ctx, pts, map, w, phi, pr, minW) {
    if (pts.length < 2) return;
    const [L, R] = nibEdges(pts, map, w, phi, pr, minW);
    ctx.moveTo(L[0][0], L[0][1]);
    for (const p of L) ctx.lineTo(p[0], p[1]);
    for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
    ctx.closePath();
  }

  // ---------- stroke vocabulary ----------
  // Abstracted from circular calligraphy: tall uprights, long sweeping
  // baselines, descending bowls, hooks, small loops, and a cloud of marks.
  // Nothing here is a letter; the combinations are random.
  const G = {
    upright(r, h) {
      const lean = r.range(-0.04, 0.16) * h, bow = r.range(-0.06, 0.06) * h;
      const pts = bez([0, 0], [bow * 0.5, h * 0.33], [lean + bow, h * 0.7], [lean, h], 16);
      if (r.chance(0.5)) { const t = pts[pts.length - 1]; pts.push([t[0] - h * 0.07, t[1] - h * 0.05]); }
      if (r.chance(0.3)) pts.unshift([h * 0.1, -h * 0.02]);
      return pts;
    },
    sweep(r, L) {
      const lift = L * r.range(0.12, 0.35), dip = L * r.range(0.02, 0.1);
      return bez([L * 1.02, L * r.range(0.04, 0.16)], [L * 0.8, -dip], [L * 0.2, -dip * 1.2], [0, lift], 24);
    },
    bowl(r, w) {
      const d = w * r.range(0.35, 0.65);
      return bez([w, w * 0.25], [w * 1.02, -d], [w * 0.02, -d * 1.1], [-w * 0.08, w * r.range(0.05, 0.3)], 24);
    },
    teeth(r, L) {
      const k = r.int(2, 4), h = L * r.range(0.08, 0.16), pts = [];
      for (let i = 0; i <= 40; i++) {
        const u = i / 40;
        pts.push([L * (1 - u), Math.pow(Math.abs(Math.sin(u * Math.PI * k)), 3) * h]);
      }
      return pts;
    },
    hook(r, s) {
      return bez([s * 0.1, s * 0.35], [s * 0.35, s * 0.2], [s * 0.25, -s * 0.35], [-s * 0.35, -s * 0.6], 14);
    },
    loop(r, s) {
      const R = s * 0.5, pts = [];
      for (let i = 0; i <= 20; i++) {
        const a = Math.PI * 0.5 + (i / 20) * TAU * 0.95;
        pts.push([Math.cos(a) * R, R + Math.sin(a) * R]);
      }
      const e = pts[pts.length - 1];
      return pts.concat(bez(e, [e[0] + R * 0.4, -R * 0.2], [R * 0.2, -R * 1.4], [-R * 0.9, -R * 1.8], 12).slice(1));
    },
    // Marks: nib dots (a short stroke across the nib gives a rhombus), pairs,
    // triads, small vees, zigzags and dash-curls.
    mark(r, sz, phi) {
      const ex = Math.sin(phi) * sz * 0.22, ey = -Math.cos(phi) * sz * 0.22;
      const dot = (x, y) => [[x + ex, y + ey], [x - ex, y - ey]];
      const k = r.next();
      if (k < 0.34) return [dot(0, 0)];
      if (k < 0.5) return [dot(-sz * 0.35, 0), dot(sz * 0.35, 0)];
      if (k < 0.6) return [dot(-sz * 0.35, 0), dot(sz * 0.35, 0), dot(0, sz * 0.55)];
      if (k < 0.75) return [[[-sz * 0.4, sz * 0.35], [0, 0], [sz * 0.35, sz * 0.45]]];
      if (k < 0.87) return [[[-sz * 0.6, sz * 0.3], [-sz * 0.35, 0], [-sz * 0.1, sz * 0.3], [sz * 0.15, 0], [sz * 0.4, sz * 0.35]]];
      return [bez([-sz * 0.5, 0], [-sz * 0.1, sz * 0.3], [sz * 0.1, -sz * 0.2], [sz * 0.5, sz * 0.1], 8)];
    },
    // Any single elongated stroke, centred, lying along x — for swarms and echoes.
    any(r, s) {
      const k = r.next();
      if (k < 0.3) return centre(G.sweep(r, s));
      if (k < 0.5) return centre(rotPts(G.upright(r, s), -Math.PI / 2));
      if (k < 0.7) return centre(G.bowl(r, s * 0.7));
      if (k < 0.85) return centre(G.teeth(r, s));
      return centre(G.loop(r, s * 0.45));
    },
  };

  // One cluster: a baseline stroke, some uprights, maybe a hook or loop, and
  // marks above and below. Returns [{pts, w, mark}] in glyph-local space.
  function compose(r, o) {
    const L = o.len, A = o.asc, D = o.desc, out = [];
    const b = r.next();
    if (b < 0.4) out.push({ pts: G.sweep(r, L), w: 1 });
    else if (b < 0.65) out.push({ pts: shift(G.bowl(r, L * 0.7), L * 0.15, 0), w: 1 });
    else if (b < 0.85) out.push({ pts: G.teeth(r, L), w: 0.9 });
    else {
      out.push({ pts: G.sweep(r, L * 0.55), w: 1 });
      out.push({ pts: shift(G.hook(r, Math.max(D, 12) * 1.4), L * 0.6, 0), w: 1 });
    }
    if (A > 8) {
      const na = r.int(o.minUp ?? 0, o.maxUp ?? 3);
      for (let i = 0; i < na; i++)
        out.push({ pts: shift(G.upright(r, A * r.range(0.55, 1)), r.range(0.05, 0.95) * L, r.range(-2, 4)), w: 1 });
      if (r.chance(0.35)) out.push({ pts: shift(G.loop(r, A * 0.32), r.range(0, L), r.range(0, A * 0.15)), w: 0.9 });
      if (r.chance(0.3)) out.push({ pts: shift(G.hook(r, A * 0.4), r.range(0, L), A * r.range(0.2, 0.5)), w: 0.9 });
    }
    const [m0, m1] = o.marks || [1, 4];
    const nm = r.int(m0, m1);
    for (let i = 0; i < nm; i++) {
      const up = r.chance(A > 8 ? 0.65 : 0.3);
      const x = r.range(0, L), y = up ? r.range(A * 0.25, A * 0.85) : -r.range(D * 0.35, D * 0.9);
      for (const m of G.mark(r, o.markSize || 10, o.phi)) out.push({ pts: shift(m, x, y), w: 0.8, mark: true });
    }
    return out;
  }

  // Script written around an oval band. Returns placed strokes
  // [{pts, map, w, mark}] so a direction can distort them before drawing.
  function scriptRing(r, opt) {
    const o = opt.o || O, s = opt.s, dir = opt.dir ?? -1, placed = [];
    let t = opt.t0 ?? r.range(0, TAU);
    const tEnd = t + (opt.span ?? TAU);
    while (t < tEnd) {
      const f = frameAt(t, s, o);
      const len = r.range(opt.len[0], opt.len[1]);
      let asc = r.range(opt.asc[0], opt.asc[1]);
      if (r.chance(opt.tall ?? 0.15)) asc *= 1.5;
      const map = ringMap(t, s, dir, o);
      for (const g of compose(r, { len, asc, desc: opt.desc, phi: opt.phi, marks: opt.marks, markSize: opt.markSize, minUp: opt.minUp, maxUp: opt.maxUp }))
        placed.push({ ...g, map });
      t += (len * r.range(opt.adv?.[0] ?? 0.55, opt.adv?.[1] ?? 0.9)) / f.speed;
    }
    return placed;
  }

  function drawPlaced(ctx, placed, w, phi, minW) {
    ctx.beginPath();
    for (const g of placed) addNib(ctx, g.pts, g.map, w * g.w, phi, g.mark ? flat : press, minW);
    ctx.fill();
  }

  function ovalPath(ctx, s = 1, o = O) {
    ctx.beginPath();
    ctx.ellipse(o.cx, o.cy, o.rx * s, o.ry * s, 0, 0, TAU);
  }
  function paper(ctx, c) { ctx.fillStyle = c; ctx.fillRect(0, 0, W, H); }
  // Uniform random point inside the oval (scale s).
  function inOval(r, s = 1, o = O) {
    const a = r.range(0, TAU), d = Math.sqrt(r.next()) * s;
    return [o.cx + o.rx * d * Math.cos(a), o.cy + o.ry * d * Math.sin(a)];
  }

  // Screen-space mapper: glyph coordinates are already screen coordinates.
  const idMap = (x, y) => [x, y, 1, 0, 0, -1];

  // ---------- growth ----------
  // Space colonization: scattered attractors pull the nearest node toward
  // them; each pulled node grows one step; attractors that are reached die.
  // Even attractors give even growth. Nodes come back parent-first, with a
  // descendant count `w` for pipe-model thickness.
  function colonize(r, opt) {
    const D = opt.influence ?? 70, K = opt.kill ?? 10, S = opt.step ?? 7, J = opt.jitter ?? 0.15;
    const inside = opt.inside, nodes = opt.seeds.map((s) => ({ x: s[0], y: s[1], p: -1, d: 0 }));
    const grid = new Map(), key = (gx, gy) => (gx + 1000) * 4096 + (gy + 1000);
    const add = (i) => {
      const k = key(Math.floor(nodes[i].x / D), Math.floor(nodes[i].y / D));
      let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i);
    };
    const nearest = (x, y, lim) => {
      const cx = Math.floor(x / D), cy = Math.floor(y / D);
      let best = -1, bd = lim * lim;
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const list = grid.get(key(gx, gy)); if (!list) continue;
        for (const i of list) {
          const dx = x - nodes[i].x, dy = y - nodes[i].y, d2 = dx * dx + dy * dy;
          if (d2 < bd) { bd = d2; best = i; }
        }
      }
      return [best, bd];
    };
    nodes.forEach((_, i) => add(i));
    let att = opt.attractors;
    for (let it = 0; it < (opt.iter ?? 400) && att.length; it++) {
      const pull = new Map(), keep = [];
      for (const a of att) {
        const [best, bd] = nearest(a[0], a[1], D);
        if (best >= 0 && bd < K * K) continue;
        keep.push(a);
        if (best < 0) continue;
        const d = Math.sqrt(bd), q = pull.get(best) || [0, 0, 0];
        q[0] += (a[0] - nodes[best].x) / d; q[1] += (a[1] - nodes[best].y) / d; q[2]++;
        pull.set(best, q);
      }
      att = keep;
      if (!pull.size) break;
      for (const [i, q] of pull) {
        const n = nodes[i], b = opt.bias ? opt.bias(n.x, n.y) : [0, 0];
        const dx = q[0] / q[2] + r.gauss() * J + b[0], dy = q[1] / q[2] + r.gauss() * J + b[1], l = Math.hypot(dx, dy) || 1;
        const x = n.x + (dx / l) * S, y = n.y + (dy / l) * S;
        if (inside && !inside(x, y)) continue;
        if (nearest(x, y, S * 0.45)[0] >= 0) continue;
        nodes.push({ x, y, p: i, d: n.d + 1 }); add(nodes.length - 1);
      }
    }
    const desc = new Float32Array(nodes.length).fill(1), kids = new Uint16Array(nodes.length);
    for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i].p >= 0) { desc[nodes[i].p] += desc[i]; kids[nodes[i].p]++; }
    let maxW = 1;
    nodes.forEach((n, i) => { n.w = desc[i]; n.kids = kids[i]; n.leaf = kids[i] === 0; maxW = Math.max(maxW, desc[i]); });
    nodes.maxW = maxW;
    return nodes;
  }

  // Circle packing by dart throwing. `rad(x, y)` proposes a radius.
  function pack(r, opt) {
    const big = Math.max(opt.maxR, ...(opt.existing || []).map((c) => c[2]));
    const out = [], cell = big * 2, grid = new Map(), key = (gx, gy) => (gx + 1000) * 4096 + (gy + 1000);
    // Circles already on the page that new ones must avoid (not returned).
    for (const c of opt.existing || []) {
      const k = key(Math.floor(c[0] / cell), Math.floor(c[1] / cell));
      if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c);
    }
    for (let i = 0; i < (opt.tries ?? 4000) && out.length < (opt.n ?? 300); i++) {
      const [x, y] = opt.point(r), rad = opt.rad(x, y, r);
      if (opt.inside && !opt.inside(x, y, rad)) continue;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      let ok = true;
      for (let gx = cx - 1; gx <= cx + 1 && ok; gx++) for (let gy = cy - 1; gy <= cy + 1 && ok; gy++) {
        for (const c of grid.get(key(gx, gy)) || []) if (Math.hypot(c[0] - x, c[1] - y) < c[2] + rad + (opt.gap ?? 2)) { ok = false; break; }
      }
      if (!ok) continue;
      const c = [x, y, rad]; out.push(c);
      const k = key(cx, cy); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c);
    }
    return out;
  }

  window.GL = {
    W, H, TAU, O, rng, makeNoise, bez, shift, scalePts, rotPts, centre, frameAt, E, ovalR,
    ringMap, flatMap, idMap, press, flat, nib, addNib, addNibOutline, G, compose, scriptRing,
    drawPlaced, ovalPath, paper, inOval, colonize, pack,
  };
})();
