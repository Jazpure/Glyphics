/* Glyphics scanner: finds a Glyphics code (the Free Scale sheet drawn by
   app/tilecode.js) in a camera frame and reads its ID.

   Finding. The code's dot grid is the one regular thing in the frame. Small
   blobs are picked out around the middle of the frame, and the displacement
   that turns up most often between neighbouring blobs is the grid's step, in
   two directions. From a dot near the middle the grid is followed outward:
   each predicted dot is pulled onto the dot actually there and the
   perspective is refitted as it grows. Where the dots stop gives the sheet's
   edges, whatever is around it: white paper, a dark screen, a desk.

   Reading. In each 2 × 2 group of dots one is filled black. The darkest of
   the four is read, averaged over frames, and Reed–Solomon in tilecode.js
   does the rest. */
(function () {
  const T = window.TILECODE, TAU = Math.PI * 2;

  // ---------- geometry ----------
  // Homography from point pairs [x, y, u, v] (normalised DLT, h33 = 1).
  function fitH(pairs) {
    const norm = (pts) => {
      const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
      const d = pts.reduce((a, p) => a + Math.hypot(p[0] - mx, p[1] - my), 0) / n || 1, k = Math.SQRT2 / d;
      return { T: [k, 0, -k * mx, 0, k, -k * my, 0, 0, 1], Ti: [1 / k, 0, mx, 0, 1 / k, my, 0, 0, 1], p: pts.map((q) => [k * (q[0] - mx), k * (q[1] - my)]) };
    };
    const A = norm(pairs.map((q) => [q[0], q[1]])), B = norm(pairs.map((q) => [q[2], q[3]]));
    const M = Array.from({ length: 8 }, () => new Float64Array(9));
    pairs.forEach((_, i) => {
      const [x, y] = A.p[i], [u, v] = B.p[i];
      for (const [row, rhs] of [[[x, y, 1, 0, 0, 0, -x * u, -y * u], u], [[0, 0, 0, x, y, 1, -x * v, -y * v], v]])
        for (let r = 0; r < 8; r++) { if (!row[r]) continue; for (let c = 0; c < 8; c++) M[r][c] += row[r] * row[c]; M[r][8] += row[r] * rhs; }
    });
    for (let c = 0; c < 8; c++) {
      let piv = c; for (let r = c + 1; r < 8; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      if (Math.abs(M[c][c]) < 1e-12) return null;
      for (let r = 0; r < 8; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 9; k++) M[r][k] -= f * M[c][k]; }
    }
    const h = Array.from({ length: 8 }, (_, r) => M[r][8] / M[r][r]).concat([1]);
    return mul(B.Ti, mul(h, A.T));
  }
  // Affine fit, for the first steps, where perspective can't be pinned down yet.
  function fitA(pairs) {
    const S = Array.from({ length: 3 }, () => new Float64Array(3)), bx = new Float64Array(3), by = new Float64Array(3);
    for (const [x, y, u, v] of pairs) { const r = [x, y, 1]; for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) S[i][j] += r[i] * r[j]; bx[i] += r[i] * u; by[i] += r[i] * v; } }
    const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det(S); if (Math.abs(D) < 1e-9) return null;
    const solve = (b) => [0, 1, 2].map((c) => det(S.map((row, i) => row.map((v, j) => (j === c ? b[i] : v)))) / D);
    const X = solve(bx), Y = solve(by);
    return [X[0], X[1], X[2], Y[0], Y[1], Y[2], 0, 0, 1];
  }
  const mul = (P, Q) => Array.from({ length: 9 }, (_, k) => P[((k / 3) | 0) * 3] * Q[k % 3] + P[((k / 3) | 0) * 3 + 1] * Q[3 + (k % 3)] + P[((k / 3) | 0) * 3 + 2] * Q[6 + (k % 3)]);
  const applyH = (Hm, x, y) => { const w = Hm[6] * x + Hm[7] * y + Hm[8]; return [(Hm[0] * x + Hm[1] * y + Hm[2]) / w, (Hm[3] * x + Hm[4] * y + Hm[5]) / w]; };

  // ---------- brightness ----------
  function luma(frame, W, H) {
    const P = new Uint8Array(W * H);
    for (let i = 0, o = 0; i < W * H; i++, o += 4) P[i] = (77 * frame[o] + 151 * frame[o + 1] + 28 * frame[o + 2]) >> 8;
    return { P, W, H };
  }
  function lum(L, x, y) {
    if (x < 0 || y < 0 || x >= L.W - 1 || y >= L.H - 1) return 255;
    const X = x | 0, Y = y | 0, fx = x - X, fy = y - Y, o = Y * L.W + X, P = L.P, W = L.W;
    const a = P[o] + (P[o + 1] - P[o]) * fx, b = P[o + W] + (P[o + W + 1] - P[o + W]) * fx;
    return a + (b - a) * fy;
  }
  // How much a spot looks like one of the grid's dots of radius rp: a dark
  // disc on lighter ground, a light centre inside a dark ring, or a light
  // disc on darker ground.
  const RING = Array.from({ length: 8 }, (_, k) => [Math.cos((k / 8) * TAU), Math.sin((k / 8) * TAU)]);
  function dotScore(L, x, y, rp) {
    const c = lum(L, x, y), r1 = rp * 0.85, r2 = rp * 1.9;
    let ring = 0, out = 0;
    for (const [ca, sa] of RING) { ring += lum(L, x + ca * r1, y + sa * r1); out += lum(L, x + ca * r2, y + sa * r2); }
    ring /= 8; out /= 8;
    return Math.max(out - (c + ring) / 2, Math.min(c, out) - ring, c - (ring + out) / 2);
  }

  // ---------- blobs ----------
  // Small dark or light blobs in a box of the frame, at a few sizes: centre
  // against surround, from an integral image. Returns [x, y, strength].
  function blobs(L, x0, y0, w, h) {
    const I = new Uint32Array((w + 1) * (h + 1)), W1 = w + 1;
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += L.P[(y0 + y) * L.W + x0 + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + row; } }
    const sum = (xa, ya, xb, yb) => I[(yb + 1) * W1 + xb + 1] - I[ya * W1 + xb + 1] - I[(yb + 1) * W1 + xa] + I[ya * W1 + xa];
    const found = [];
    for (const r of [1, 2, 3, 4]) {
      const b = 2 * r + 1, st = r < 2 ? 1 : 2, nIn = (2 * r + 1) ** 2, nOut = (2 * b + 1) ** 2 - nIn;
      const gw = Math.floor((w - 2 * b) / st), gh = Math.floor((h - 2 * b) / st);
      if (gw < 3 || gh < 3) continue;
      const R = new Float32Array(gw * gh);
      for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
        const x = b + gx * st, y = b + gy * st, inner = sum(x - r, y - r, x + r, y + r);
        R[gy * gw + gx] = (sum(x - b, y - b, x + b, y + b) - inner) / nOut - inner / nIn;
      }
      for (let gy = 1; gy < gh - 1; gy++) for (let gx = 1; gx < gw - 1; gx++) {
        const v = R[gy * gw + gx], a = Math.abs(v);
        if (a < 14) continue;
        let peak = true;
        for (let dy = -1; dy <= 1 && peak; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && Math.abs(R[(gy + dy) * gw + gx + dx]) > a) { peak = false; break; }
        if (!peak) continue;
        // A blob, not an edge or a corner: darker (or lighter) than every
        // point on a ring around it.
        const px = x0 + b + gx * st, py = y0 + b + gy * st, c = lum(L, px, py), rr = 1.6 * r + 0.5;
        let lo = 255, hiv = 0;
        for (const [ca, sa] of RING) { const t = lum(L, px + ca * rr, py + sa * rr); if (t < lo) lo = t; if (t > hiv) hiv = t; }
        if (v > 0 ? lo - c < a * 0.5 : c - hiv < a * 0.5) continue;
        found.push([px, py, a, r]);
      }
    }
    // Strongest first; one blob per spot across sizes.
    found.sort((p, q) => q[2] - p[2]);
    const kept = [], cell = 4, grid = new Map(), key = (x, y) => Math.floor(x / cell) * 65536 + Math.floor(y / cell);
    for (const p of found) {
      const rr = Math.max(2, p[3]); let near = false;
      for (let dx = -2; dx <= 2 && !near; dx++) for (let dy = -2; dy <= 2 && !near; dy++) for (const q of grid.get(key(p[0] + dx * cell, p[1] + dy * cell)) || []) if (Math.hypot(q[0] - p[0], q[1] - p[1]) < rr) { near = true; break; }
      if (near) continue;
      kept.push(p); const k = key(p[0], p[1]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p);
      if (kept.length >= 2500) break;
    }
    return kept;
  }
  // The grid's two step vectors: the displacements that occur most often
  // between each blob and its nearest neighbours.
  function lattice(cands, maxStep) {
    const R = Math.ceil(maxStep), S = 2 * R + 1, hist = new Float32Array(S * S), cell = maxStep, grid = new Map();
    const key = (x, y) => Math.floor(x / cell) * 65536 + Math.floor(y / cell);
    for (const p of cands) { const k = key(p[0], p[1]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }
    for (const p of cands) {
      const near = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const q of grid.get(key(p[0] + dx * cell, p[1] + dy * cell)) || []) {
        const ex = q[0] - p[0], ey = q[1] - p[1], d = Math.hypot(ex, ey);
        if (d >= 4 && d <= maxStep) near.push([d, ex, ey]);
      }
      near.sort((a, b) => a[0] - b[0]);
      for (const [, ex, ey] of near.slice(0, 10)) hist[(Math.round(ey) + R) * S + Math.round(ex) + R] += 1;
    }
    // Smooth, then peaks.
    const sm = new Float32Array(S * S);
    for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) { let t = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) t += hist[(y + dy) * S + x + dx]; sm[y * S + x] = t; }
    const peaks = [];
    for (let y = 2; y < S - 2; y++) for (let x = 2; x < S - 2; x++) {
      const v = sm[y * S + x], dx = x - R, dy = y - R;
      if (v < 6 || Math.hypot(dx, dy) < 4) continue;
      let peak = true; for (let a = -2; a <= 2 && peak; a++) for (let b = -2; b <= 2; b++) if ((a || b) && sm[(y + a) * S + x + b] > v) { peak = false; break; }
      if (peak) peaks.push([dx, dy, v]);
    }
    if (peaks.length < 2) return null;
    peaks.sort((a, b) => b[2] - a[2]);
    const top = peaks[0][2], len = (p) => Math.hypot(p[0], p[1]);
    const strong = peaks.filter((p) => p[2] >= top * 0.45);
    const u = strong.reduce((a, p) => (len(p) < len(a) ? p : a));
    const angle = (p) => { const c = (u[0] * p[0] + u[1] * p[1]) / (len(u) * len(p)); return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI; };
    const vs = peaks.filter((p) => p[2] >= top * 0.3 && angle(p) > 55 && angle(p) < 125 && len(p) > len(u) * 0.6 && len(p) < len(u) * 1.6);
    if (!vs.length) return null;
    const v = vs.reduce((a, p) => (len(p) < len(a) ? p : a));
    // Refine each peak to the centre of its votes.
    const refine = (p) => { let sx = 0, sy = 0, n = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = p[0] + dx, y = p[1] + dy, c = hist[(y + R) * S + x + R] || 0; sx += x * c; sy += y * c; n += c; } return n ? [sx / n, sy / n] : [p[0], p[1]]; };
    let U = refine(u), V = refine(v);
    if (U[0] * V[1] - U[1] * V[0] < 0) V = [-V[0], -V[1]]; // keep the image's handedness
    return { u: U, v: V, support: [u[2], v[2]] };
  }

  // ---------- following the grid ----------
  // From a seed dot and the two step vectors, the grid in local indices
  // (a, b) → frame pixels, as a homography. Then the sheet's place in it.
  function follow(L, seed, u, v, dbg) {
    let Hm = [u[0], v[0], seed[0], u[1], v[1], seed[1], 0, 0, 1];
    const stepPx = (a, b) => { const [x, y] = applyH(Hm, a, b), [x2, y2] = applyH(Hm, a + 1, b), [x3, y3] = applyH(Hm, a, b + 1); return [x, y, (Math.hypot(x2 - x, y2 - y) + Math.hypot(x3 - x, y3 - y)) / 2]; };
    const seek = (a, b, reach, n = 4) => {
      const [x, y, step] = stepPx(a, b), rp = Math.max(1, T.DOT_R * (step / T.STEP));
      if (x < 2 || y < 2 || x > L.W - 3 || y > L.H - 3) return null;
      if (!reach) return [a, b, x, y, dotScore(L, x, y, rp)];
      const r = Math.max(1, reach * step), st = Math.max(0.5, r / n);
      let bs = -Infinity, bx = x, by = y;
      for (let dy = -r; dy <= r + 1e-6; dy += st) for (let dx = -r; dx <= r + 1e-6; dx += st) { const sc = dotScore(L, x + dx, y + dy, rp); if (sc > bs) { bs = sc; bx = x + dx; by = y + dy; } }
      return [a, b, bx, by, bs];
    };
    const trimFit = (pairs, affine) => {
      if (pairs.length < (affine ? 8 : 24)) return false;
      pairs.sort((p, q) => q[4] - p[4]);
      let use = pairs.slice(0, Math.ceil(pairs.length * 0.85));
      const f = affine ? fitA : fitH, H1 = f(use); if (!H1) return false;
      use = use.map((p) => { const [x, y] = applyH(H1, p[0], p[1]); return [...p, Math.hypot(x - p[2], y - p[3])]; }).sort((p, q) => p[5] - q[5]).slice(0, Math.ceil(use.length * 0.85));
      Hm = f(use) || H1; return true;
    };
    // Grow outward over the dots actually found, never far past them.
    let lo = [-2, -2], hi = [2, 2];
    const THR = 16;
    for (const [rad, reach, affine, n] of [[2, 0.3, true, 4], [4, 0.25, true, 4], [7, 0.22, false, 4], [11, 0.18, false, 3], [18, 0.15, false, 3], [36, 0.12, false, 3]]) {
      const pairs = [], a0 = Math.max(-rad, lo[0] - 3), a1 = Math.min(rad, hi[0] + 3), b0 = Math.max(-rad, lo[1] - 3), b1 = Math.min(rad, hi[1] + 3);
      for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) { const p = seek(a, b, reach, n); if (p && p[4] > THR) pairs.push(p); }
      if (!trimFit(pairs, affine)) return null;
      lo = [Math.min(...pairs.map((p) => p[0])), Math.min(...pairs.map((p) => p[1]))];
      hi = [Math.max(...pairs.map((p) => p[0])), Math.max(...pairs.map((p) => p[1]))];
      if (dbg) dbg.stages = (dbg.stages || 0) + 1;
    }
    // Where do the dots stop? The sheet is the NX × NY window (either way
    // round) holding the most dot evidence.
    const A0 = lo[0] - 3, B0 = lo[1] - 3, nA = hi[0] - lo[0] + 7, nB = hi[1] - lo[1] + 7;
    const E = new Float64Array((nA + 1) * (nB + 1)); // prefix sums
    for (let j = 0; j < nB; j++) for (let i = 0; i < nA; i++) {
      const p = seek(A0 + i, B0 + j, 0.07, 1), e = p ? Math.max(0, p[4]) : 0;
      E[(j + 1) * (nA + 1) + i + 1] = e + E[j * (nA + 1) + i + 1] + E[(j + 1) * (nA + 1) + i] - E[j * (nA + 1) + i];
    }
    const box = (i, j, w, h) => E[(j + h) * (nA + 1) + i + w] - E[j * (nA + 1) + i + w] - E[(j + h) * (nA + 1) + i] + E[j * (nA + 1) + i];
    const best = (w, h) => { let bs = -1, bi = 0, bj = 0; for (let j = 0; j + h <= nB; j++) for (let i = 0; i + w <= nA; i++) { const s = box(i, j, w, h); if (s > bs) { bs = s; bi = i; bj = j; } } return { s: bs, a: A0 + bi, b: B0 + bj }; };
    const wide = best(T.NX, T.NY), tall = best(T.NY, T.NX);
    const Q = wide.s >= tall.s
      // Long side along a: dot (i, j) is (a + i, b + j).
      ? [1 / T.STEP, 0, wide.a - T.M / T.STEP, 0, 1 / T.STEP, wide.b - T.M / T.STEP, 0, 0, 1]
      // Long side along b: dot (i, j) is (a + NY − 1 − j, b + i).
      : [0, -1 / T.STEP, tall.a + T.NY - 1 + T.M / T.STEP, 1 / T.STEP, 0, tall.b - T.M / T.STEP, 0, 0, 1];
    return { H: mul(Hm, Q), evidence: Math.max(wide.s, tall.s) };
  }

  // ---------- one frame ----------
  // Returns { found, H, dark } or { found: false }.
  function look(frame, W, H, dbg) {
    const L = luma(frame, W, H), side = Math.min(W, H);
    // Blobs in a box around the middle, where the camera is pointed.
    const bw = Math.round(Math.min(W, side * 0.65)), bh = Math.round(Math.min(H, side * 0.65)), x0 = Math.round((W - bw) / 2), y0 = Math.round((H - bh) / 2);
    const cands = blobs(L, x0, y0, bw, bh);
    if (dbg) dbg.blobs = cands.length;
    if (cands.length < 40) return { found: false };
    const lat = lattice(cands, side / 18);
    if (!lat) return { found: false };
    const step = Math.hypot(...lat.u);
    if (dbg) dbg.step = Math.round(step);
    // Seed: the blob nearest the middle that has grid neighbours around it.
    const cell = step, grid = new Map(), key = (x, y) => Math.floor(x / cell) * 65536 + Math.floor(y / cell);
    for (const p of cands) { const k = key(p[0], p[1]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }
    const has = (x, y) => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const q of grid.get(key(x + dx * cell, y + dy * cell)) || []) if (Math.hypot(q[0] - x, q[1] - y) < step * 0.22) return true; return false; };
    const cx = W / 2, cy = H / 2, { u, v } = lat;
    let seed = null, bestScore = -1;
    for (const p of cands) {
      const d = Math.hypot(p[0] - cx, p[1] - cy); if (d > side * 0.3) continue;
      let n = 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (has(p[0] + a * u[0] + b * v[0], p[1] + a * u[1] + b * v[1])) n++;
      const sc = n - d / side;
      if (sc > bestScore) { bestScore = sc; seed = p; }
    }
    if (!seed || bestScore < 3) return { found: false };
    const got = follow(L, seed, u, v, dbg);
    if (!got) return { found: false };
    return { found: true, H: got.H, dark: darkness(L, got.H) };
  }
  // Each dot's darkness: 255 minus the brightness of its middle.
  function darkness(L, Hm) {
    const dark = new Float32Array(T.NX * T.NY);
    for (let j = 0; j < T.NY; j++) for (let i = 0; i < T.NX; i++) {
      const [cx, cy] = T.dotXY(i, j), [x, y] = applyH(Hm, cx, cy), [x2, y2] = applyH(Hm, cx + T.STEP, cy), rp = T.DOT_R * (Math.hypot(x2 - x, y2 - y) / T.STEP) * 0.35;
      dark[j * T.NX + i] = 255 - (lum(L, x, y) * 2 + lum(L, x + rp, y) + lum(L, x - rp, y) + lum(L, x, y + rp) + lum(L, x, y - rp)) / 6;
    }
    return dark;
  }
  // A single still (tests, photos): the ID, or null.
  function read(frame, W, H) {
    const r = look(frame, W, H);
    return r.found ? T.readDots(r.dark) : null;
  }

  // ---------- a scanning session ----------
  // Dot darkness is averaged over frames (noise and compression change from
  // frame to frame, the code does not), lined up for the two ways up. A frame
  // that doesn't match the average at all means a different code: start over.
  function session() {
    let sum = null, w = 0, miss = 0;
    const reset = () => { sum = null; w = 0; };
    return {
      reset,
      frame(frame, W, H, dbg) {
        const r = look(frame, W, H, dbg);
        if (!r.found) { if (++miss > 6) reset(); return { found: false }; }
        miss = 0;
        const one = T.readDots(r.dark);
        if (one) { reset(); return { found: true, id: one.id }; }
        let dark = r.dark;
        if (sum) {
          const n = dark.length; let same = 0, turned = 0, mean = 0;
          for (let i = 0; i < n; i++) mean += sum[i] / w; mean /= n;
          for (let i = 0; i < n; i++) { const m = sum[i] / w - mean; same += (dark[i] - mean) * m; turned += (dark[n - 1 - i] - mean) * m; }
          if (turned > same) dark = dark.slice().reverse();
          if (Math.max(same, turned) <= 0) reset();
        }
        if (!sum) sum = new Float32Array(dark.length);
        for (let i = 0; i < dark.length; i++) sum[i] = sum[i] * 0.8 + dark[i];
        w = w * 0.8 + 1;
        const avg = T.readDots(sum.map((x) => x / w));
        if (avg) { reset(); return { found: true, id: avg.id }; }
        return { found: true };
      },
    };
  }

  window.SCAN = { session, read, _look: look, _blobs: blobs, _lattice: lattice, _luma: luma, _fitH: fitH, _applyH: applyH };
})();
