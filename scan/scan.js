/* Glyphics scanner: find a code in a camera frame (or photo) and read it.

   Finding. Pixels that belong to a code are dark or strongly coloured; paper
   is light and grey. The largest region of those pixels, with its holes filled,
   is the black oval, and its second moments give an ellipse: centre, semi-axes
   and tilt. Mapping the canonical oval onto that ellipse undoes scale, rotation
   and foreshortening (tilt up to ~25° reads fine; beyond, perspective bends it).
   Rotation is only known up to 180° from the ellipse; the decoders search
   rotations themselves.

   Reading. For link codes, many points in the core of each ring sector vote
   for red, yellow or blue; votes add up across steady frames. For image codes,
   each bead centre is sampled and Reed–Solomon does the rest. */
(function () {
  const { TAU, O } = window.GL;
  const C = window.CODE, IC = window.IMAGECODE;
  const DW = 480, CLOSE = 3; // detection width; closing radius in detection pixels

  // Hue class for camera pixels: nearest of red / yellow / blue, or -1.
  const HUES = [8, 52, 222];
  function hueClass(R, G, B, white = false) {
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B), v = mx / 255, s = mx ? (mx - mn) / mx : 0;
    if (white && s < 0.28 && v > 0.62) return 3;
    if (s < 0.3 || v < 0.22) return -1;
    let h = mx === R ? ((G - B) / (mx - mn)) * 60 : mx === G ? (2 + (B - R) / (mx - mn)) * 60 : (4 + (R - G) / (mx - mn)) * 60;
    if (h < 0) h += 360;
    let best = -1, bd = 60;
    HUES.forEach((c, i) => { const d = Math.min(Math.abs(h - c), 360 - Math.abs(h - c)); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  // ---------- finding the oval ----------
  // Separable box max (grow) or min (shrink) of a binary mask, in place: a
  // sliding count of ones over a (2r + 1) window, first along rows, then columns.
  // Outside the frame counts as empty when growing and as full when shrinking.
  function box(m, W, H, r, grow) {
    const t = new Uint8Array(m.length), oob = grow ? 0 : 1, full = 2 * r + 1;
    const out = (ones) => (grow ? (ones > 0 ? 1 : 0) : ones === full ? 1 : 0);
    for (let y = 0; y < H; y++) {
      let ones = 0;
      for (let k = -r; k <= r; k++) ones += k < 0 || k >= W ? oob : m[y * W + k];
      for (let x = 0; x < W; x++) {
        t[y * W + x] = out(ones);
        const i = x + r + 1, o = x - r;
        ones += (i >= W ? oob : m[y * W + i]) - (o < 0 ? oob : m[y * W + o]);
      }
    }
    for (let x = 0; x < W; x++) {
      let ones = 0;
      for (let k = -r; k <= r; k++) ones += k < 0 || k >= H ? oob : t[k * W + x];
      for (let y = 0; y < H; y++) {
        m[y * W + x] = out(ones);
        const i = y + r + 1, o = y - r;
        ones += (i >= H ? oob : t[i * W + x]) - (o < 0 ? oob : t[o * W + x]);
      }
    }
  }
  function close(m, W, H, r) { box(m, W, H, r, true); box(m, W, H, r, false); }

  function detect(frame, W, H) {
    const DH = Math.round((DW * H) / W), sx = W / DW, m = new Uint8Array(DW * DH);
    // Downsample by point sampling the full frame.
    for (let j = 0; j < DH; j++) for (let i = 0; i < DW; i++) {
      const o = (Math.floor(j * sx) * W + Math.floor(i * sx)) * 4, R = frame[o], G = frame[o + 1], B = frame[o + 2];
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      m[j * DW + i] = mx < 85 || (mx > 60 && (mx - mn) / mx > 0.45) ? 1 : 0;
    }
    // Closing (grow, then shrink): bridges the thin white rim, outlines and
    // shadows so the whole oval is one region; white shapes become holes.
    close(m, DW, DH, CLOSE);
    // Connected regions of code pixels (4-connected).
    const lab = new Int32Array(DW * DH), comps = [], stack = [];
    let next = 1;
    for (let p = 0; p < m.length; p++) {
      if (!m[p] || lab[p]) continue;
      let area = 0, x0 = DW, y0 = DH, x1 = 0, y1 = 0;
      lab[p] = next; stack.push(p);
      while (stack.length) {
        const q = stack.pop(), x = q % DW, y = (q / DW) | 0;
        area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && m[q - 1] && !lab[q - 1]) { lab[q - 1] = next; stack.push(q - 1); }
        if (x < DW - 1 && m[q + 1] && !lab[q + 1]) { lab[q + 1] = next; stack.push(q + 1); }
        if (y > 0 && m[q - DW] && !lab[q - DW]) { lab[q - DW] = next; stack.push(q - DW); }
        if (y < DH - 1 && m[q + DW] && !lab[q + DW]) { lab[q + DW] = next; stack.push(q + DW); }
      }
      if (area > 150) comps.push({ id: next, area, x0, y0, x1, y1 });
      next++;
    }
    comps.sort((a, b) => b.area - a.area);
    let best = null;
    // The oval's outer black ring and its interior can come apart at the white
    // rim; fill each candidate's holes and keep the best-fitting, largest ellipse.
    for (const c of comps.slice(0, 4)) {
      const w = c.x1 - c.x0 + 3, h = c.y1 - c.y0 + 3, out = new Uint8Array(w * h), st = [];
      const inComp = (x, y) => { const X = x + c.x0 - 1, Y = y + c.y0 - 1; return X >= 0 && Y >= 0 && X < DW && Y < DH && lab[Y * DW + X] === c.id; };
      // Flood the outside from the padded border; everything not reached is the filled region.
      out[0] = 1; st.push(0);
      while (st.length) {
        const q = st.pop(), x = q % w, y = (q / w) | 0;
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (!out[k] && !inComp(nx, ny)) { out[k] = 1; st.push(k); }
        }
      }
      let A = 0, mx = 0, my = 0, mxx = 0, myy = 0, mxy = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!out[y * w + x]) { const X = x + c.x0 - 1, Y = y + c.y0 - 1; A++; mx += X; my += Y; mxx += X * X; myy += Y * Y; mxy += X * Y; }
      if (A < 600) continue;
      mx /= A; my /= A;
      const cxx = mxx / A - mx * mx, cyy = myy / A - my * my, cxy = mxy / A - mx * my;
      const tr = cxx + cyy, det = cxx * cyy - cxy * cxy, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
      const l1 = tr / 2 + disc, l2 = tr / 2 - disc, a = 2 * Math.sqrt(l1), b = 2 * Math.sqrt(Math.max(l2, 1e-6));
      const fill = A / (Math.PI * a * b), aspect = a / b;
      if (fill < 0.88 || fill > 1.08 || aspect < 1.05 || aspect > 2.1 || a < DW * 0.08) continue;
      const cand = { cx: mx * sx, cy: my * sx, a: a * sx, b: b * sx, theta: 0.5 * Math.atan2(2 * cxy, cxx - cyy), filled: A, fill, aspect };
      if (!best || cand.filled > best.filled) best = cand;
    }
    return best;
  }

  // Canonical normalised oval coordinates (u along the long axis) → frame pixel.
  function mapper(E, mirror) {
    const c = Math.cos(E.theta), s = Math.sin(E.theta), f = mirror ? -1 : 1;
    return (u, v) => [E.cx + E.a * u * c - E.b * f * v * s, E.cy + E.a * u * s + E.b * f * v * c];
  }
  const pixel = (frame, W, H, x, y) => { const X = Math.round(x), Y = Math.round(y); if (X < 0 || Y < 0 || X >= W || Y >= H) return null; const o = (Y * W + X) * 4; return [frame[o], frame[o + 1], frame[o + 2]]; };

  // ---------- link codes ----------
  // Votes per slot for one frame: many points in each sector's core.
  function linkVotes(frame, W, H, E, mirror) {
    const map = mapper(E, mirror), votes = Array.from({ length: C.SECTORS * 2 }, () => [0, 0, 0]);
    C.SAMPLE.forEach(([q0, q1], b) => {
      for (let s = 0; s < C.SECTORS; s++) for (let qi = 0; qi < 4; qi++) for (let ti = 0; ti < 7; ti++) {
        const q = q0 + ((qi + 0.5) / 4) * (q1 - q0), th = ((s + 0.5 + ((ti + 0.5) / 7 - 0.5) * C.CORE) / C.SECTORS) * TAU;
        const px = pixel(frame, W, H, ...map(q * Math.sin(th), -q * Math.cos(th)));
        if (!px) continue;
        const k = hueClass(...px);
        if (k >= 0) votes[b * C.SECTORS + s][k]++;
      }
    });
    return votes;
  }
  function decodeVotes(votes) {
    const slots = votes.map((c) => { const t = c[0] + c[1] + c[2]; if (t < 3) return [-1, 0]; const m = c.indexOf(Math.max(...c)); return [m, c[m] / t]; });
    return C.decode(slots);
  }

  // ---------- image codes ----------
  const LAT = {};
  const PITCHES_ALL = Array.from({ length: 17 }, (_, i) => 7 + i * 0.5);
  // Bright or colourful blobs inside the oval: candidate beads, as centroids.
  function beadBlobs(frame, W, H, E) {
    const R = E.a * 1.02, x0 = Math.max(0, Math.floor(E.cx - R)), y0 = Math.max(0, Math.floor(E.cy - R)), x1 = Math.min(W, Math.ceil(E.cx + R)), y1 = Math.min(H, Math.ceil(E.cy + R));
    const w = x1 - x0, h = y1 - y0, m = new Uint8Array(w * h), c = Math.cos(E.theta), sn = Math.sin(E.theta);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const dx = x0 + i - E.cx, dy = y0 + j - E.cy, u = (dx * c + dy * sn) / E.a, v = (-dx * sn + dy * c) / E.b;
      if (u * u + v * v > 0.93) continue; // inside the white rim
      const o = ((y0 + j) * W + x0 + i) * 4, R0 = frame[o], G0 = frame[o + 1], B0 = frame[o + 2], mx = Math.max(R0, G0, B0), mn = Math.min(R0, G0, B0);
      if (mx > 95 && ((mx - mn) / mx > 0.35 || mx > 150)) m[j * w + i] = 1;
    }
    const seen = new Uint8Array(w * h), out = [], st = [];
    for (let p = 0; p < m.length; p++) {
      if (!m[p] || seen[p]) continue;
      let n = 0, sx = 0, sy = 0;
      seen[p] = 1; st.push(p);
      while (st.length) {
        const q = st.pop(), x = q % w, y = (q / w) | 0;
        n++; sx += x; sy += y;
        if (x > 0 && m[q - 1] && !seen[q - 1]) { seen[q - 1] = 1; st.push(q - 1); }
        if (x < w - 1 && m[q + 1] && !seen[q + 1]) { seen[q + 1] = 1; st.push(q + 1); }
        if (y > 0 && m[q - w] && !seen[q - w]) { seen[q - w] = 1; st.push(q - w); }
        if (y < h - 1 && m[q + w] && !seen[q + w]) { seen[q + w] = 1; st.push(q + w); }
      }
      if (n >= 3) out.push([x0 + sx / n, y0 + sy / n, n]);
    }
    return out;
  }
  // Homography (canonical 1200 × 900 → frame pixels) from point pairs, by
  // normalised linear least squares with h33 = 1.
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
    for (let c = 0; c < 8; c++) { // Gaussian elimination with partial pivoting
      let piv = c; for (let r = c + 1; r < 8; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      if (Math.abs(M[c][c]) < 1e-12) return null;
      for (let r = 0; r < 8; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 9; k++) M[r][k] -= f * M[c][k]; }
    }
    const h = Array.from({ length: 8 }, (_, r) => M[r][8] / M[r][r]).concat([1]);
    const mul = (P, Q) => Array.from({ length: 9 }, (_, i) => P[(i / 3 | 0) * 3] * Q[i % 3] + P[(i / 3 | 0) * 3 + 1] * Q[3 + (i % 3)] + P[(i / 3 | 0) * 3 + 2] * Q[6 + (i % 3)]);
    return mul(B.Ti, mul(h, A.T));
  }
  // Affine fit (canonical → frame), for early stages where perspective can't be pinned down yet.
  function fitA(pairs) {
    const S = Array.from({ length: 3 }, () => new Float64Array(3)), bx = new Float64Array(3), by = new Float64Array(3);
    for (const [x, y, u, v] of pairs) { const r = [x, y, 1]; for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) S[i][j] += r[i] * r[j]; bx[i] += r[i] * u; by[i] += r[i] * v; } }
    const solve = (b) => { // 3 × 3 by Cramer's rule
      const d = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      const D = d(S); if (Math.abs(D) < 1e-9) return null;
      return [0, 1, 2].map((c) => d(S.map((row, i) => row.map((v, j) => (j === c ? b[i] : v)))) / D);
    };
    const X = solve(bx), Y = solve(by);
    return X && Y ? [X[0], X[1], X[2], Y[0], Y[1], Y[2], 0, 0, 1] : null;
  }
  const applyH = (Hm, x, y) => { const w = Hm[6] * x + Hm[7] * y + Hm[8]; return [(Hm[0] * x + Hm[1] * y + Hm[2]) / w, (Hm[3] * x + Hm[4] * y + Hm[5]) / w]; };
  // Full camera model: perspective (H), then radial lens distortion k about the frame centre.
  function project(M, x, y) {
    const [u, v] = applyH(M.H, x, y);
    if (!M.k) return [u, v];
    const nx = (u - M.cx) / M.r0, ny = (v - M.cy) / M.r0, f = 1 + M.k * (nx * nx + ny * ny);
    return [M.cx + nx * f * M.r0, M.cy + ny * f * M.r0];
  }
  function undistort(M, u, v) {
    if (!M.k) return [u, v];
    const nx = (u - M.cx) / M.r0, ny = (v - M.cy) / M.r0;
    let dx = nx, dy = ny;
    for (let it = 0; it < 5; it++) { const f = 1 + M.k * (dx * dx + dy * dy); dx = nx / f; dy = ny / f; }
    return [M.cx + dx * M.r0, M.cy + dy * M.r0];
  }
  // The code's empty black centre, found as the largest bead-free area near the
  // oval's middle. Under tilt it is the true centre; the outline's centre is not.
  function voidCentre(blobs, E, spacing) {
    const d = Math.max(2, spacing / 3), half = E.a * 0.4, gw = Math.ceil((2 * half) / d), ox = E.cx - half, oy = E.cy - half, g = new Float32Array(gw * gw).fill(1e9);
    for (const [x, y, n] of blobs) {
      const r = Math.max(1, Math.sqrt(n / Math.PI) / d), gx = (x - ox) / d, gy = (y - oy) / d;
      for (let j = Math.floor(gy - r); j <= Math.ceil(gy + r); j++) for (let i = Math.floor(gx - r); i <= Math.ceil(gx + r); i++) if (i >= 0 && j >= 0 && i < gw && j < gw) g[j * gw + i] = 0;
    }
    // Chamfer distance transform (two passes).
    for (let j = 0; j < gw; j++) for (let i = 0; i < gw; i++) { const k = j * gw + i; if (i) g[k] = Math.min(g[k], g[k - 1] + 1); if (j) g[k] = Math.min(g[k], g[k - gw] + 1); if (i && j) g[k] = Math.min(g[k], g[k - gw - 1] + 1.4); if (j && i < gw - 1) g[k] = Math.min(g[k], g[k - gw + 1] + 1.4); }
    for (let j = gw - 1; j >= 0; j--) for (let i = gw - 1; i >= 0; i--) { const k = j * gw + i; if (i < gw - 1) g[k] = Math.min(g[k], g[k + 1] + 1); if (j < gw - 1) g[k] = Math.min(g[k], g[k + gw] + 1); if (i < gw - 1 && j < gw - 1) g[k] = Math.min(g[k], g[k + gw + 1] + 1.4); if (j < gw - 1 && i) g[k] = Math.min(g[k], g[k + gw - 1] + 1.4); }
    let mx = 0; for (let k = 0; k < g.length; k++) if (g[k] < 1e8 && g[k] > mx) mx = g[k];
    if (mx < 3) return null;
    let sx = 0, sy = 0, n = 0;
    for (let j = 0; j < gw; j++) for (let i = 0; i < gw; i++) if (g[j * gw + i] >= mx * 0.55 && g[j * gw + i] < 1e8) { sx += i; sy += j; n++; }
    return [ox + (sx / n + 0.5) * d, oy + (sy / n + 0.5) * d];
  }
  // The ellipse fit as a starting homography, optionally mirrored or turned 180°.
  function startH(E, mirror, flip) {
    const c = Math.cos(E.theta), s = Math.sin(E.theta), fu = flip ? -1 : 1, fv = (flip ? -1 : 1) * (mirror ? -1 : 1), ka = E.a / O.rx, kb = E.b / O.ry;
    const h0 = ka * c * fu, h1 = -kb * s * fv, h3 = ka * s * fu, h4 = kb * c * fv;
    return [h0, h1, E.cx - h0 * O.cx - h1 * O.cy, h3, h4, E.cy - h3 * O.cx - h4 * O.cy, 0, 0, 1];
  }
  // Pull the starting guess onto the beads actually seen: match lattice beads to
  // nearby blobs and refit, growing outward from the centre band by band (each
  // fit predicts the next band well), then solve for lens distortion.
  function register(blobs, grid, cell, L, H0, spacing, frameW, frameH) {
    const M = { H: H0, k: 0, cx: frameW / 2, cy: frameH / 2, r0: Math.hypot(frameW, frameH) / 2 };
    const qOf = (b) => Math.hypot((b.x - O.cx) / O.rx, (b.y - O.cy) / O.ry);
    const Lq = L.map((b) => [b, qOf(b)]);
    const match = (qmax, rad) => {
      const pairs = [], r2 = (rad * spacing) ** 2;
      for (const [b, q] of Lq) {
        if (q > qmax) continue;
        const [x, y] = project(M, b.x, b.y), gx = Math.floor(x / cell), gy = Math.floor(y / cell);
        let best = null, bd = r2;
        for (let i = gx - 1; i <= gx + 1; i++) for (let j = gy - 1; j <= gy + 1; j++) for (const k of grid.get(i * 65536 + j) || []) { const d = (blobs[k][0] - x) ** 2 + (blobs[k][1] - y) ** 2; if (d < bd) { bd = d; best = k; } }
        if (best !== null) pairs.push([b.x, b.y, blobs[best][0], blobs[best][1], bd]);
      }
      return pairs;
    };
    const refit = (pairs, affine) => {
      pairs.sort((a, b) => a[4] - b[4]);
      const keep = pairs.slice(0, Math.floor(pairs.length * 0.85)).map((p) => [p[0], p[1], ...undistort(M, p[2], p[3])]);
      const Hn = affine ? fitA(keep) : fitH(keep);
      if (Hn) M.H = Hn;
      return !!Hn;
    };
    // The outline gives rotation and scale only roughly under tilt: try small
    // turns and scalings about the centre and keep the start that matches the
    // most inner beads tightly.
    const base = M.H.slice(), [ccx, ccy] = applyH(base, O.cx, O.cy);
    let bestH = base, bestN = -1;
    for (let da = -0.06; da <= 0.0601; da += 0.015) for (let ds = 0.92; ds <= 1.0801; ds += 0.02) for (const dq of [0.96, 1, 1.04]) {
      // Turn by da, scale by ds (and squash by dq) about the found centre.
      const c = Math.cos(da) * ds, sn = Math.sin(da) * ds, A = [c, -sn * dq, sn, c * dq];
      const Hc = [A[0] * base[0] + A[1] * base[3], A[0] * base[1] + A[1] * base[4], 0, A[2] * base[0] + A[3] * base[3], A[2] * base[1] + A[3] * base[4], 0, 0, 0, 1];
      const [u, v] = applyH(Hc, O.cx, O.cy); Hc[2] = ccx - u; Hc[5] = ccy - v;
      M.H = Hc;
      const n = match(0.22, 0.4).length;
      if (n > bestN) { bestN = n; bestH = Hc; }
    }
    M.H = bestH;
    // Small outward steps: affine while the matched area is small, full
    // perspective once enough of the oval is in play, lens distortion last.
    const steps = [];
    for (let q = 0.22; q < 1; q += 0.05) steps.push([Math.min(1, q), 0.45]);
    steps.push([1, 0.45], [1, 0.4], [1, 0.35], [1, 0.35]);
    let pairs = [];
    for (let s = 0; s < steps.length; s++) {
      pairs = match(...steps[s]);
      if (pairs.length < 30 || !refit(pairs, steps[s][0] < 0.45)) return null;
      if (steps[s][0] >= 0.85) {
        let num = 0, den = 0;
        for (const p of pairs) {
          const [u, v] = applyH(M.H, p[0], p[1]), nx = (u - M.cx) / M.r0, ny = (v - M.cy) / M.r0, r2 = nx * nx + ny * ny;
          num += ((p[2] - u) / M.r0) * nx * r2 + ((p[3] - v) / M.r0) * ny * r2; den += r2 * r2 * r2;
        }
        // Residuals are measured against the undistorted projection, so this is the total k.
        if (den > 0) M.k = Math.max(-0.3, Math.min(0.3, num / den));
      }
    }
    const total = Lq.length;
    return { M, matched: pairs.length / total };
  }
  // Colour of each bead: the brightest pixels near its centre (a blurred bead
  // is brightest in the middle and muddied at its edge). Classes are learned
  // from this frame's own colours, compared by chroma so dim beads still sort.
  function beadColours(frame, W, H, L, M, spacing) {
    const r = Math.max(1, Math.round(spacing * 0.2));
    const rgb = L.map((b) => {
      const [x, y] = project(M, b.x, b.y), px = [];
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dy * dy > r * r) continue; const p = pixel(frame, W, H, x + dx, y + dy); if (p) px.push(p); }
      if (!px.length) return [0, 0, 0];
      px.sort((a, b) => Math.max(...b) - Math.max(...a));
      const top = px.slice(0, Math.max(1, Math.ceil(px.length * 0.25)));
      return [0, 1, 2].map((j) => top.reduce((a, p) => a + p[j], 0) / top.length);
    });
    const feat = (c) => { const m = Math.max(...c, 1); return [c[0] / m, c[1] / m, c[2] / m, (m / 255) * 0.5]; };
    const first = rgb.map((c) => hueClass(c[0], c[1], c[2], true));
    const mean = [0, 1, 2, 3].map((k) => { const fs = rgb.filter((_, i) => first[i] === k).map(feat); return fs.length ? [0, 1, 2, 3].map((j) => fs.reduce((a, f) => a + f[j], 0) / fs.length) : null; });
    return rgb.map((c, i) => {
      if (Math.max(...c) < 50) return first[i] >= 0 ? first[i] : 0;
      const f = feat(c);
      let best = first[i] >= 0 ? first[i] : 0, bd = Infinity;
      mean.forEach((m, k) => { if (!m) return; const d = (f[0] - m[0]) ** 2 + (f[1] - m[1]) ** 2 + (f[2] - m[2]) ** 2 + (f[3] - m[3]) ** 2; if (d < bd) { bd = d; best = k; } });
      return best;
    });
  }
  function imageRead(frame, W, H, E, { pitches = [7], mirrors = [false] } = {}) {
    const blobs = beadBlobs(frame, W, H, E);
    if (blobs.length < 60) return null;
    const scale = E.a / O.rx;
    // Which lattice (pitch) fits the blobs best? Decode only the best few.
    const tried = [];
    for (const p of pitches) {
      const L = (LAT[p] ||= IC.lattice(p)), spacing = p * scale, cell = Math.max(4, spacing), grid = new Map();
      blobs.forEach((b, k) => { const key = Math.floor(b[0] / cell) * 65536 + Math.floor(b[1] / cell); if (!grid.has(key)) grid.set(key, []); grid.get(key).push(k); });
      const vc = voidCentre(blobs, E, spacing);
      for (const mirror of mirrors) {
        const H0 = startH(E, mirror, false);
        if (vc) { const [x, y] = applyH(H0, O.cx, O.cy); H0[2] += vc[0] - x; H0[5] += vc[1] - y; }
        const reg = register(blobs, grid, cell, L, H0, spacing, W, H);
        if (reg) tried.push({ p, L, spacing, mirror, ...reg });
      }
    }
    tried.sort((a, b) => b.matched - a.matched);
    for (const t of tried.slice(0, 3)) {
      const syms = beadColours(frame, W, H, t.L, t.M, t.spacing);
      // The lattice looks the same turned 180°; only the data can tell.
      for (const flip of [false, true]) {
        const res = IC.decodeSyms(flip ? rotate180(syms, t.L) : syms, t.p);
        if (res.ok) return { ...res, pitch: t.p, matched: t.matched };
      }
    }
    return null;
  }
  // Symbols of the same lattice read with the oval turned half a turn.
  function rotate180(syms, L) {
    const out = new Array(syms.length), start = [];
    L.forEach((s, i) => { if (s.i === 0) start[s.ring] = i; });
    L.forEach((s, i) => { out[i] = syms[start[s.ring] + ((s.i + s.N / 2) % s.N)]; });
    return out;
  }

  // ---------- a scanning session ----------
  // Feed frames; it keeps votes while the code holds still and reports once sure.
  function session() {
    let acc = null, last = null, n = 0;
    return {
      reset() { acc = null; last = null; n = 0; },
      frame(frame, W, H, { tryImage = false, pitches = [7], mirrors = [false], steady = 0 } = {}) {
        const E = detect(frame, W, H);
        if (!E) { acc = null; last = null; return { found: false }; }
        const moved = last && (Math.hypot(E.cx - last.cx, E.cy - last.cy) > E.a * 0.06 || Math.abs(E.a - last.a) > E.a * 0.06);
        if (!acc || moved) { acc = [Array.from({ length: 48 }, () => [0, 0, 0]), Array.from({ length: 48 }, () => [0, 0, 0])]; n = 0; }
        last = E; n++;
        for (const mirror of [0, 1]) {
          const v = linkVotes(frame, W, H, E, !!mirror);
          v.forEach((c, i) => { for (let k = 0; k < 3; k++) acc[mirror][i][k] = acc[mirror][i][k] * 0.85 + c[k]; });
          const res = decodeVotes(acc[mirror]);
          if (res.ok && res.disagreements <= 3) return { found: true, E, kind: 'link', id: res.id, frames: n };
        }
        if (tryImage && n > steady) {
          const img = imageRead(frame, W, H, E, { pitches, mirrors });
          if (img) return { found: true, E, kind: 'image', image: img };
        }
        return { found: true, E, frames: n };
      },
    };
  }

  window.SCAN = { detect, session, imageRead, PITCHES_ALL, hueClass, _fitH: fitH, _beadBlobs: beadBlobs, _register: register, _startH: startH, _applyH: applyH, _beadColours: beadColours, _voidCentre: voidCentre, _project: project };
})();
