/* Image codes: a Glyphics code that carries an image itself, not an ID.

   Layout (version 1). A fixed lattice in the radiant style:
   - rings from q = 0.14 to 0.95, whose thickness follows a fixed rhythm
     (thin, thick, very thick, …), so bead sizes vary strongly by design
   - each ring holds a power-of-two number of beads, so spokes branch outward
     where there is room, like the radiant codes
   - every bead is one symbol, its colour: red, yellow, blue or white = 2 bits;
     shape, rotation and exact size are free and generative
   Because the lattice is fixed, a reader knows where every bead is.

   Payload. [header][image bytes], split into Reed–Solomon blocks (≈18 %
   parity, so each block survives ≈9 % of its bytes misread), interleaved
   across the whole oval so a smudge spreads thinly, and XOR-ed with a fixed
   mask so plain images never make plain patterns. The header holds size, bit
   depths, length and a CRC-32 of the image bytes: a read is right or refused.

   Image codecs, chosen per image:
   1  photos: a small JPEG (YCbCr 4:2:0, 8 × 8 DCT, the standard quantisation
      tables scaled by a quality, Exp-Golomb coefficients)
   2  drawings, logos, text: up to 16 flat colours, each pixel predicted from
      the one above (or, after a change, the one to its left); runs of correct
      predictions cost a few bits, so flat areas are nearly free and edges stay
      sharp
   Either way the encoder picks the largest resolution that fits. */
(function () {
  const { TAU, O, ovalPath, paper } = window.GL;
  const { beadPath } = window.STRANDS;

  const SYMS = ['#ff2b1c', '#ffd60a', '#1d4dff', '#ffffff'];
  const BLACK = '#0a0a0a';
  const SOLID = ['circle', 'circle', 'squircle', 'pill', 'diamond', 'hex', 'oct', 'pent', 'tri3', 'star', 'star4', 'star8', 'flower', 'cog', 'burst', 'drop', 'kite', 'lens', 'cross', 'trefoil', 'quatrefoil', 'blobby', 'arch'];
  const RHYTHM = [1, 0.7, 1.35, 0.8, 1.75, 0.72, 1.15, 0.62, 1.5, 0.9, 2.0, 0.75];
  const MAGIC = 0x47, VERSION = 1, HEADER = 12, PARITY = 0.18, MIN_Q = 35, FLAT_MSE = 160;

  // ---------- lattice ----------
  function lattice(pitch = 11) {
    const q0 = 0.14, q1 = 0.95, slots = [], avg = (O.rx + O.ry) / 2;
    let q = q0;
    for (let k = 0; ; k++) {
      const t = pitch * RHYTHM[k % RHYTHM.length], dq = t / avg, qc = q + dq / 2;
      if (qc + dq / 2 > q1) break;
      // Bead counts are 2^a or 3·2^(a-1): dense, yet spokes still line up and branch.
      const tight = TAU * qc * O.ry, ideal = (TAU * qc * (O.rx + O.ry)) / 2 / t;
      const p2 = 2 ** Math.floor(Math.log2(ideal)), N = p2 * 1.5 <= ideal ? p2 * 1.5 : p2;
      for (let i = 0; i < N; i++) {
        const a = ((i + 0.5) / N) * TAU;
        slots.push({ x: O.cx + O.rx * qc * Math.cos(a), y: O.cy + O.ry * qc * Math.sin(a), s: Math.min(t, tight / N) * 0.94, ring: k, i, N, a });
      }
      q += dq;
    }
    return slots;
  }

  // ---------- bytes and symbols ----------
  const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC_T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const maskBytes = (n) => { const r = GL.rng(0x61cebee); return Uint8Array.from({ length: n }, () => r.int(0, 255)); };
  const toSyms = (bytes) => { const s = []; for (const b of bytes) for (let k = 6; k >= 0; k -= 2) s.push((b >> k) & 3); return s; };
  const toBytes = (syms, n) => Uint8Array.from({ length: n }, (_, i) => ((syms[i * 4] & 3) << 6) | ((syms[i * 4 + 1] & 3) << 4) | ((syms[i * 4 + 2] & 3) << 2) | (syms[i * 4 + 3] & 3));
  class Bits {
    constructor(bytes) { this.b = bytes || []; this.acc = 0; this.n = 0; this.pos = 0; }
    put(v, n) { for (let k = n - 1; k >= 0; k--) { this.acc = (this.acc << 1) | ((v >> k) & 1); if (++this.n === 8) { this.b.push(this.acc); this.acc = 0; this.n = 0; } } }
    done() { if (this.n) this.b.push(this.acc << (8 - this.n)); return Uint8Array.from(this.b); }
    get(n) { let v = 0; for (let k = 0; k < n; k++, this.pos++) v = (v << 1) | ((this.b[this.pos >> 3] >> (7 - (this.pos & 7))) & 1); return v; }
    ue(v) { const x = v + 1, n = 31 - Math.clz32(x); this.put(0, n); this.put(x, n + 1); }
    se(v) { this.ue(v > 0 ? 2 * v - 1 : -2 * v); }
    rue() { let n = 0; while (this.get(1) === 0) if (++n > 24) throw new Error('bad stream'); return ((1 << n) | this.get(n)) - 1; }
    rse() { const u = this.rue(); return u & 1 ? (u + 1) / 2 : -u / 2; }
  }

  // ---------- image codec ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ZZ = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
  const QY = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
  const QC = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99].concat(new Array(32).fill(99));
  const qtable = (base, q) => { const s = q < 50 ? 5000 / q : 200 - 2 * q; return base.map((v) => clamp(Math.floor((v * s + 50) / 100), 1, 255)); };
  const COS = Array.from({ length: 8 }, (_, x) => Array.from({ length: 8 }, (_, u) => Math.cos(((2 * x + 1) * u * Math.PI) / 16)));
  const CU = (u) => (u ? 1 : Math.SQRT1_2);
  function fdct(f) {
    const F = new Float32Array(64);
    for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
      let s = 0;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) s += f[y * 8 + x] * COS[x][u] * COS[y][v];
      F[v * 8 + u] = 0.25 * CU(u) * CU(v) * s;
    }
    return F;
  }
  function idct(F) {
    const f = new Float32Array(64);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      let s = 0;
      for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) s += CU(u) * CU(v) * F[v * 8 + u] * COS[x][u] * COS[y][v];
      f[y * 8 + x] = 0.25 * s;
    }
    return f;
  }
  // One plane (values 0…255) → DCT blocks → bits. DC as a difference from the
  // previous block, then the index of the last non-zero coefficient, then the
  // coefficients up to it.
  function putPlane(out, P, pw, ph, qt) {
    let prev = 0;
    for (let by = 0; by < ph; by += 8) for (let bx = 0; bx < pw; bx += 8) {
      const f = new Float32Array(64);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) f[y * 8 + x] = P[(by + y) * pw + bx + x] - 128;
      const F = fdct(f), c = ZZ.map((z) => Math.round(F[z] / qt[z]));
      out.se(c[0] - prev); prev = c[0];
      let last = 63; while (last > 0 && c[last] === 0) last--;
      out.ue(last);
      for (let i = 1; i <= last; i++) out.se(c[i]);
    }
  }
  function getPlane(inb, pw, ph, qt) {
    const P = new Float32Array(pw * ph);
    let prev = 0;
    for (let by = 0; by < ph; by += 8) for (let bx = 0; bx < pw; bx += 8) {
      const F = new Float32Array(64);
      prev += inb.rse(); F[ZZ[0]] = prev * qt[ZZ[0]];
      const last = inb.rue();
      if (last > 63) throw new Error('bad block');
      for (let i = 1; i <= last; i++) F[ZZ[i]] = inb.rse() * qt[ZZ[i]];
      const f = idct(F);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) P[(by + y) * pw + bx + x] = f[y * 8 + x] + 128;
    }
    return P;
  }
  // Source → Y, Cb, Cr planes at w × h (w, h multiples of 16; colour at half size).
  function planes(img, w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }), sw = Math.min(img.width, img.height * (w / h)), sh = sw * (h / w);
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, Y = new Float32Array(w * h), cw = w / 2, Cb = new Float32Array(cw * (h / 2)), Cr = new Float32Array(cw * (h / 2));
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const o = (j * w + i) * 4, R = d[o], G = d[o + 1], B = d[o + 2], k = (j >> 1) * cw + (i >> 1);
      Y[j * w + i] = 0.299 * R + 0.587 * G + 0.114 * B;
      Cb[k] += (128 - 0.168736 * R - 0.331264 * G + 0.5 * B) / 4;
      Cr[k] += (128 + 0.5 * R - 0.418688 * G - 0.081312 * B) / 4;
    }
    return { Y, Cb, Cr };
  }
  function compress(pl, w, h, q) {
    const out = new Bits(), qy = qtable(QY, q), qc = qtable(QC, q);
    putPlane(out, pl.Y, w, h, qy); putPlane(out, pl.Cb, w / 2, h / 2, qc); putPlane(out, pl.Cr, w / 2, h / 2, qc);
    return out.done();
  }
  // The largest resolution (multiples of 16, ≤ 240) whose best quality that
  // fits is at least MIN_Q; failing that, the best that fits at all.
  function encodeDCT(img, bits) {
    const aspect = clamp(img.width / img.height, 0.5, 2.2), bytes = Math.floor(bits / 8);
    const dims = (w) => [w, Math.max(16, Math.round(w / aspect / 16) * 16)];
    let best = null, w = Math.min(240, Math.ceil(Math.sqrt((bits / 0.9) * aspect) / 16) * 16);
    for (; w >= 16; w -= 16) {
      const [W, H] = dims(w);
      if (H > 240) continue;
      const pl = planes(img, W, H);
      let lo = 5, hi = 95, got = null;
      while (lo <= hi) { const q = (lo + hi) >> 1, b = compress(pl, W, H, q); if (b.length <= bytes) { got = { w: W, h: H, q, bytes: b }; lo = q + 1; } else hi = q - 1; }
      if (got && got.q >= MIN_Q) return { ...got, codec: 1 };
      if (got && (!best || got.q > best.q)) best = got;
    }
    if (!best) throw new Error('image does not fit');
    return { ...best, codec: 1 };
  }
  function decodeDCT({ w, h, q, bytes }) {
    const inb = new Bits(Array.from(bytes)), qy = qtable(QY, q), qc = qtable(QC, q), cw = w / 2;
    const Y = getPlane(inb, w, h, qy), Cb = getPlane(inb, cw, h / 2, qc), Cr = getPlane(inb, cw, h / 2, qc);
    const img = new ImageData(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      // Colour: bilinear from the half-size planes.
      const fx = Math.min(cw - 1.001, Math.max(0, (i - 0.5) / 2)), fy = Math.min(h / 2 - 1.001, Math.max(0, (j - 0.5) / 2));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
      const bl = (P) => (P[y0 * cw + x0] * (1 - ax) + P[y0 * cw + x0 + 1] * ax) * (1 - ay) + (P[(y0 + 1) * cw + x0] * (1 - ax) + P[(y0 + 1) * cw + x0 + 1] * ax) * ay;
      const y = Y[j * w + i], u = bl(Cb) - 128, v = bl(Cr) - 128, o = (j * w + i) * 4;
      img.data[o] = clamp(y + 1.402 * v, 0, 255); img.data[o + 1] = clamp(y - 0.344136 * u - 0.714136 * v, 0, 255); img.data[o + 2] = clamp(y + 1.772 * u, 0, 255); img.data[o + 3] = 255;
    }
    return img;
  }


  // ---------- flat-colour codec ----------
  // The source at w × h (cover-cropped), as RGBA.
  function pixelsAt(img, w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }), sw = Math.min(img.width, img.height * (w / h)), sh = sw * (h / w);
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
    return x.getImageData(0, 0, w, h).data;
  }
  const d2 = (d, i, c) => (d[i * 4] - c[0]) ** 2 + (d[i * 4 + 1] - c[1]) ** 2 + (d[i * 4 + 2] - c[2]) ** 2;
  // Up to 16 colours by k-means (farthest-point start), close colours merged.
  function palettize(d, n) {
    const step = Math.max(1, Math.floor(n / 4000)), C = [[d[0], d[1], d[2]]];
    while (C.length < 16) {
      let far = -1, fd = 0;
      for (let i = 0; i < n; i += step) { const m = Math.min(...C.map((c) => d2(d, i, c))); if (m > fd) { fd = m; far = i; } }
      if (fd < 64) break;
      C.push([d[far * 4], d[far * 4 + 1], d[far * 4 + 2]]);
    }
    const idx = new Uint8Array(n);
    for (let it = 0; it < 8; it++) {
      const sum = C.map(() => [0, 0, 0, 0]);
      for (let i = 0; i < n; i++) {
        let b = 0, bd = Infinity;
        for (let k = 0; k < C.length; k++) { const e = d2(d, i, C[k]); if (e < bd) { bd = e; b = k; } }
        idx[i] = b; const s = sum[b]; s[0] += d[i * 4]; s[1] += d[i * 4 + 1]; s[2] += d[i * 4 + 2]; s[3]++;
      }
      sum.forEach((s, k) => { if (s[3]) C[k] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]].map(Math.round); });
    }
    // Merge near-duplicates and drop unused colours.
    const map = C.map((_, k) => k), used = new Uint32Array(C.length);
    for (let a = 0; a < C.length; a++) for (let b = 0; b < a; b++) if (map[b] === b && (C[a][0] - C[b][0]) ** 2 + (C[a][1] - C[b][1]) ** 2 + (C[a][2] - C[b][2]) ** 2 < 300) { map[a] = b; break; }
    for (let i = 0; i < n; i++) { idx[i] = map[idx[i]]; used[idx[i]]++; }
    const keep = C.map((_, k) => k).filter((k) => used[k]), re = new Map(keep.map((k, j) => [k, j]));
    for (let i = 0; i < n; i++) idx[i] = re.get(idx[i]);
    const pal = keep.map((k) => C[k]);
    let mse = 0; for (let i = 0; i < n; i++) mse += d2(d, i, pal[idx[i]]) / 3;
    return { pal, idx, mse: mse / n };
  }
  // Prediction: the pixel above; after a change, the pixel to the left.
  const predict = (idx, i, w, lit) => { const x = i % w; if (i < w) return x ? idx[i - 1] : 0; return lit && x ? idx[i - 1] : idx[i - w]; };
  function putFlat(pal, idx, w, h) {
    const out = new Bits(), K = pal.length, lb = K > 2 ? Math.ceil(Math.log2(K - 1)) : 0;
    out.put(K - 1, 4); for (const c of pal) for (const v of c) out.put(v, 8);
    let run = 0, lit = false;
    for (let i = 0; i < w * h; i++) {
      const p = predict(idx, i, w, lit);
      if (idx[i] === p) { run++; lit = false; continue; }
      out.ue(run); run = 0; out.put(idx[i] < p ? idx[i] : idx[i] - 1, lb); lit = true;
    }
    out.ue(run);
    return out.done();
  }
  function encodeFlat(img, bits) {
    const aspect = clamp(img.width / img.height, 0.4, 2.5), bytes = Math.floor(bits / 8), dims = (w) => [w, clamp(Math.round(w / aspect), 8, 255)];
    let lo = 16, hi = Math.min(255, Math.round(255 * aspect)), best = null;
    while (lo <= hi) {
      const w = (lo + hi) >> 1, [W, H] = dims(w), P = palettize(pixelsAt(img, W, H), W * H), b = putFlat(P.pal, P.idx, W, H);
      if (b.length <= bytes) { best = { w: W, h: H, q: P.pal.length, bytes: b, codec: 2 }; lo = w + 1; } else hi = w - 1;
    }
    if (!best) throw new Error('image does not fit');
    return best;
  }
  function decodeFlat({ w, h, bytes }) {
    const inb = new Bits(Array.from(bytes)), K = inb.get(4) + 1, pal = Array.from({ length: K }, () => [inb.get(8), inb.get(8), inb.get(8)]);
    const n = w * h, idx = new Uint8Array(n), lb = K > 2 ? Math.ceil(Math.log2(K - 1)) : 0;
    let i = 0, lit = false;
    while (i < n) {
      let run = inb.rue();
      if (run > n) throw new Error('bad run');
      for (; run > 0 && i < n; run--, i++) { idx[i] = predict(idx, i, w, lit); lit = false; }
      if (i >= n) break;
      const p = predict(idx, i, w, lit), v = inb.get(lb);
      idx[i] = v < p ? v : v + 1;
      if (idx[i] >= K) throw new Error('bad colour');
      lit = true; i++;
    }
    const img = new ImageData(w, h);
    for (let k = 0; k < n; k++) { const c = pal[idx[k]]; img.data[k * 4] = c[0]; img.data[k * 4 + 1] = c[1]; img.data[k * 4 + 2] = c[2]; img.data[k * 4 + 3] = 255; }
    return img;
  }
  // Flat colours when the picture is mostly flat colour (few colours cover it well), otherwise the JPEG codec.
  function encodeImage(img, bits) {
    const aspect = clamp(img.width / img.height, 0.4, 2.5), W = 96, H = clamp(Math.round(W / aspect), 8, 255);
    return palettize(pixelsAt(img, W, H), W * H).mse < FLAT_MSE ? encodeFlat(img, bits) : encodeDCT(img, bits);
  }
  const decodeImage = (im) => (im.codec === 2 ? decodeFlat(im) : decodeDCT(im));

  // ---------- code ----------
  function header(img) {
    const b = new Bits();
    b.put(MAGIC, 8); b.put(VERSION, 8); b.put(img.codec, 8); b.put(img.w, 8); b.put(img.h, 8); b.put(img.q, 8); b.put(img.bytes.length, 16); b.put(crc32(img.bytes), 32);
    const out = new Uint8Array(HEADER); out.set(b.done()); return out;
  }
  const capacityBytes = (L) => Math.floor(L.length / 4);
  // How the capacity splits into Reed–Solomon blocks (each ≤ 255 bytes).
  function blocks(cap) {
    const B = Math.ceil(cap / 255), out = [];
    for (let i = 0; i < B; i++) {
      const n = Math.floor(cap / B) + (i < cap % B ? 1 : 0), nsym = Math.max(2, Math.round((n * PARITY) / 2) * 2);
      out.push({ n, nsym, k: n - nsym });
    }
    return out;
  }
  // Interleave: byte j of every block, then byte j + 1 of every block, and so on.
  function order(bl) {
    const o = [], maxn = Math.max(...bl.map((b) => b.n));
    for (let j = 0; j < maxn; j++) bl.forEach((b, bi) => { if (j < b.n) o.push([bi, j]); });
    return o;
  }
  function encode(img, pitch = 11) {
    const L = lattice(pitch), cap = capacityBytes(L), bl = blocks(cap), dataCap = bl.reduce((a, b) => a + b.k, 0);
    const im = encodeImage(img, (dataCap - HEADER) * 8), data = new Uint8Array(dataCap);
    data.set(header(im)); data.set(im.bytes, HEADER);
    let off = 0;
    const coded = bl.map((b) => { const blk = RS.encode(data.subarray(off, off + b.k), b.nsym); off += b.k; return blk; });
    const all = new Uint8Array(cap), mask = maskBytes(cap);
    order(bl).forEach(([bi, j], p) => { all[p] = coded[bi][j] ^ mask[p]; });
    return { lattice: L, syms: toSyms(all), image: im, capacity: cap, dataCapacity: dataCap, used: HEADER + im.bytes.length, blocks: bl.length };
  }

  // Draw the code. Data sits in bead colour only; everything else is free.
  function draw(ctx, code, seed = 1) {
    const r = GL.rng(seed), L = code.lattice;
    paper(ctx, '#ffffff');
    ovalPath(ctx); ctx.fillStyle = BLACK; ctx.fill();
    ctx.save(); ovalPath(ctx); ctx.clip();
    // Hairline spokes through beads that line up across rings.
    const rings = [];
    for (const s of L) (rings[s.ring] ||= []).push(s);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.8; ctx.beginPath();
    for (let k = 1; k < rings.length; k++) {
      const prev = rings[k - 1];
      for (const s of rings[k]) { const p = prev[Math.floor((s.a / TAU) * prev.length) % prev.length]; ctx.moveTo(p.x, p.y); ctx.lineTo(s.x, s.y); }
    }
    ctx.stroke();
    const shapes = r.shuffle(SOLID).slice(0, r.int(5, 12));
    L.forEach((s, i) => {
      const col = SYMS[code.syms[i] ?? 0], sz = Math.max(s.s * r.range(0.55, 1), Math.min(s.s, 7)), el = r.chance(0.3) ? r.range(0.72, 1) : 1;
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(r.range(0, TAU));
      beadPath(ctx, r.pick(shapes), sz / 2, (sz / 2) * el);
      ctx.fillStyle = col; ctx.fill('evenodd');
      if (col !== '#ffffff' && sz >= 10) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8; ctx.stroke(); }
      ctx.restore();
    });
    ctx.restore();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.ellipse(O.cx, O.cy, O.rx * 0.972, O.ry * 0.972, 0, 0, TAU); ctx.stroke();
  }

  // ---------- reading ----------
  function classify(R, G, B) {
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    if (mx < 70) return -1;
    if ((mx - mn) / mx < 0.3) return mx > 160 ? 3 : -1;
    let h = mx === R ? ((G - B) / (mx - mn)) * 60 : mx === G ? (2 + (B - R) / (mx - mn)) * 60 : (4 + (R - G) / (mx - mn)) * 60;
    if (h < 0) h += 360;
    return h < 25 || h > 330 ? 0 : h < 80 ? 1 : h > 190 && h < 265 ? 2 : -1;
  }
  function readSyms(canvas, L) {
    const k = canvas.width / GL.W, px = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
    const rad = Math.max(0, Math.round(k * 0.8));
    return L.map((s) => {
      const cx = Math.round(s.x * k), cy = Math.round(s.y * k), votes = [0, 0, 0, 0];
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        const o = ((cy + dy) * canvas.width + (cx + dx)) * 4, c = classify(px[o], px[o + 1], px[o + 2]);
        if (c >= 0) votes[c]++;
      }
      const m = Math.max(...votes);
      return m ? votes.indexOf(m) : 0;
    });
  }
  // Decode from a rendered canvas (canonical 1200 × 900 space).
  const decode = (canvas, pitch = 11) => decodeSyms(readSyms(canvas, lattice(pitch)), pitch);
  // Decode from symbols, however they were sampled (a canvas, or a camera frame).
  function decodeSyms(syms, pitch) {
    const L = lattice(pitch), cap = capacityBytes(L), bl = blocks(cap), all = toBytes(syms, cap), mask = maskBytes(cap);
    const raw = bl.map((b) => new Uint8Array(b.n));
    order(bl).forEach(([bi, j], p) => { raw[bi][j] = all[p] ^ mask[p]; });
    const parts = [];
    for (let i = 0; i < bl.length; i++) {
      const m = RS.decode(raw[i], bl[i].nsym);
      if (!m) return { ok: false, why: `block ${i + 1} of ${bl.length} beyond repair` };
      parts.push(m);
    }
    const data = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
    let off = 0; for (const p of parts) { data.set(p, off); off += p.length; }
    const hb = new Bits(Array.from(data.subarray(0, HEADER)));
    const magic = hb.get(8), ver = hb.get(8), codec = hb.get(8), w = hb.get(8), h = hb.get(8), q = hb.get(8), len = hb.get(16), crc = hb.get(32) >>> 0;
    if (magic !== MAGIC || ver !== VERSION || (codec !== 1 && codec !== 2)) return { ok: false, why: 'no image code here' };
    const bytes = data.slice(HEADER, HEADER + len);
    if (bytes.length !== len || crc32(bytes) !== crc) return { ok: false, why: 'checksum failed', w, h };
    let image;
    try { image = decodeImage({ codec, w, h, q, bytes }); } catch { return { ok: false, why: 'image stream damaged' }; }
    return { ok: true, image, w, h, q, codec, bytes: len, blocks: bl.length };
  }

  window.IMAGECODE = { lattice, encode, draw, decode, decodeSyms, decodeImage, readSyms, classify, capacityBytes, SYMS };
})();
