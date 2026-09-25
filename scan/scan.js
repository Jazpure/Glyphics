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
  function imageRead(frame, W, H, E, mirror, pitches) {
    const map = mapper(E, mirror);
    for (const p of pitches) {
      const L = (LAT[p] ||= IC.lattice(p));
      const syms = L.map((s) => {
        const u = (s.x - O.cx) / O.rx, v = (s.y - O.cy) / O.ry, [x, y] = map(u, v), votes = [0, 0, 0, 0];
        for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const px = pixel(frame, W, H, x + dx, y + dy); if (px) { const k = hueClass(...px, true); if (k >= 0) votes[k]++; } }
        const m = Math.max(...votes);
        return m ? votes.indexOf(m) : 0;
      });
      // Try the 180° reading too: the ellipse can't tell the two apart.
      for (const flip of [false, true]) {
        const res = IC.decodeSyms(flip ? rotate180(syms, L) : syms, p);
        if (res.ok) return { ...res, pitch: p };
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
      frame(frame, W, H, { tryImage = false, pitches = [10] } = {}) {
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
        if (tryImage) for (const mirror of [false, true]) {
          const img = imageRead(frame, W, H, E, mirror, pitches);
          if (img) return { found: true, E, kind: 'image', image: img };
        }
        return { found: true, E, frames: n };
      },
    };
  }

  window.SCAN = { detect, session, imageRead, PITCHES_ALL, hueClass };
})();
