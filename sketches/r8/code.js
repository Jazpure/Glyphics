/* The Glyphics code, first version.
   Geometry is in normalised oval coordinates (q = 1 on the rim).
   - Two data rings, each cut into 24 sectors, give 48 slots.
   - Each slot holds one of three symbols, drawn as the primary colour of every
     shape that touches it: red, yellow or blue. White and black are structure.
   - Payload: a 12-trit ID (0 … 531,440) plus 4 check trits = 16 trits,
     written three times across the 48 slots and XOR-ed (mod 3) with a fixed
     mask, so wrong rotations read as noise and plain IDs never form solid rings.
   - Reading: count hue votes per slot, try all 24 rotations, pick the one where
     the three copies agree best, majority-vote each trit, then verify the check. */
(function () {
  const { TAU, O } = window.GL;
  const SECTORS = 24;
  const BANDS = [[0.415, 0.505], [0.805, 0.895]]; // where shapes take the data colour
  const SAMPLE = [[0.43, 0.49], [0.82, 0.88]];     // where the reader looks (inside the bands)
  const CORE = 0.66;                              // central share of each sector the reader trusts
  const COLORS = ['#ff2b1c', '#ffd60a', '#1d4dff'];
  const NAMES = ['R', 'Y', 'B'];
  const ID_TRITS = 12, CHK = 4, PAY = ID_TRITS + CHK, SLOTS = SECTORS * BANDS.length;
  const MAX_ID = 3 ** ID_TRITS - 1;

  const MASK = (() => { const r = GL.rng(0x61796c); return Array.from({ length: SLOTS }, () => r.int(0, 2)); })();
  const WTS = (() => { const r = GL.rng(0x636873); return Array.from({ length: CHK }, () => Array.from({ length: ID_TRITS }, () => r.int(1, 2))); })();

  function payload(id) {
    const t = [];
    let n = id;
    for (let i = 0; i < ID_TRITS; i++) { t.push(n % 3); n = Math.floor(n / 3); }
    for (let k = 0; k < CHK; k++) t.push(t.slice(0, ID_TRITS).reduce((a, v, j) => a + v * WTS[k][j], 0) % 3);
    return t;
  }
  const encode = (id) => { const p = payload(id); return Array.from({ length: SLOTS }, (_, s) => (p[s % PAY] + MASK[s]) % 3); };

  // Oval-normalised radius and angle (0 at the top, clockwise on screen).
  function polar(x, y) {
    const u = (x - O.cx) / O.rx, v = (y - O.cy) / O.ry;
    return [Math.hypot(u, v), (((Math.atan2(v, u) + Math.PI / 2) % TAU) + TAU) % TAU];
  }
  const sectorOf = (th) => Math.floor((th / TAU) * SECTORS) % SECTORS;
  // Width of one sector along a band at angle th: a shape wider than this
  // would spill its colour into the neighbouring sector.
  const sectorWidth = (b, th) => { const q = (BANDS[b][0] + BANDS[b][1]) / 2, t = th - Math.PI / 2; return (TAU / SECTORS) * q * Math.hypot(O.rx * Math.sin(t), O.ry * Math.cos(t)); };
  // Which band a shape spanning radii [q0, q1] touches, if any.
  const bandHit = (q0, q1) => BANDS.findIndex(([a, b]) => q1 >= a && q0 <= b);

  // Hue class of one pixel: 0 R, 1 Y, 2 B, or -1 (black, white, grey, anything else).
  function classify(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx < 70 || (mx - mn) / mx < 0.38) return -1;
    let h;
    if (mx === r) h = ((g - b) / (mx - mn)) * 60; else if (mx === g) h = (2 + (b - r) / (mx - mn)) * 60; else h = (4 + (r - g) / (mx - mn)) * 60;
    if (h < 0) h += 360;
    if (h < 25 || h > 335) return 0;
    if (h > 38 && h < 75) return 1;
    if (h > 195 && h < 260) return 2;
    return -1;
  }

  function readSlots(canvas) {
    const k = canvas.width / GL.W, ctx = canvas.getContext('2d', { willReadFrequently: true });
    const x0 = Math.floor((O.cx - O.rx) * k), y0 = Math.floor((O.cy - O.ry) * k), w = Math.ceil(2 * O.rx * k), h = Math.ceil(2 * O.ry * k);
    const px = ctx.getImageData(x0, y0, w, h).data, counts = Array.from({ length: SLOTS }, () => [0, 0, 0]);
    const step = Math.max(1, Math.round(k));
    for (let j = 0; j < h; j += step) for (let i = 0; i < w; i += step) {
      const [q, th] = polar((x0 + i) / k, (y0 + j) / k);
      const b = SAMPLE.findIndex(([a, c]) => q >= a && q <= c);
      if (b < 0) continue;
      const f = (th / TAU) * SECTORS, frac = f - Math.floor(f);
      if (Math.abs(frac - 0.5) > CORE / 2) continue;
      const o = (j * w + i) * 4, c = classify(px[o], px[o + 1], px[o + 2]);
      if (c >= 0) counts[b * SECTORS + (Math.floor(f) % SECTORS)][c]++;
    }
    return counts.map((c) => { const t = c[0] + c[1] + c[2]; if (t < 3) return [-1, 0]; const m = c.indexOf(Math.max(...c)); return [m, c[m] / t]; });
  }

  function decode(slots) {
    let best = null;
    for (let rot = 0; rot < SECTORS; rot++) {
      const u = Array.from({ length: SLOTS }, (_, s) => {
        const b = Math.floor(s / SECTORS), sec = s % SECTORS, v = slots[b * SECTORS + ((sec + rot) % SECTORS)][0];
        return v < 0 ? -1 : (v - MASK[s] + 3) % 3;
      });
      let dis = 0, agree = 0, empty = 0;
      const trits = [];
      for (let j = 0; j < PAY; j++) {
        const votes = [u[j], u[j + PAY], u[j + 2 * PAY]].filter((v) => v >= 0), n = [0, 0, 0];
        votes.forEach((v) => n[v]++);
        const m = n.indexOf(Math.max(...n));
        dis += votes.length - n[m];
        agree += n[m] > 1 ? n[m] - 1 : 0;
        if (!votes.length) empty++;
        trits.push(votes.length ? m : 0);
      }
      // Score by agreement between copies, not just absence of disagreement:
      // empty slots agree with everything and must not win.
      const score = agree - 2 * dis;
      if (!best || score > best.score) best = { rot, dis, agree, empty, score, trits };
    }
    const t = best.trits, id = t.slice(0, ID_TRITS).reduceRight((a, v) => a * 3 + v, 0);
    // A read needs evidence: nearly every trit voted on, copies that mostly
    // agree, few disagreements, and the check trits. Empty or noisy input must
    // never pass (an all-empty read would otherwise look like ID 0).
    const ok = payload(id).every((v, i) => v === t[i]) && best.empty <= 1 && best.agree >= 16 && best.dis <= 4;
    return { ok, id, rot: best.rot, disagreements: best.dis, agreements: best.agree, empty: best.empty };
  }

  // Read a rendered card and say whether it carries the expected ID.
  function check(canvas, expected) {
    const slots = readSlots(canvas), res = decode(slots);
    const conf = slots.filter(([m]) => m >= 0).reduce((a, [, c]) => a + c, 0) / SLOTS;
    const good = res.ok && res.id === expected;
    return { ...res, conf, good, label: good ? `reads ${res.id} ✓` : res.ok ? `reads ${res.id} ✗` : 'no read ✗' };
  }

  // Structure: the white inner rim. (The centre is left open; the reader finds
  // orientation by trying every rotation, so no hub mark is needed.)
  function structure(ctx) {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.ellipse(O.cx, O.cy, O.rx * 0.972, O.ry * 0.972, 0, 0, TAU); ctx.stroke();
  }
  // Debug overlay: band edges, sector ticks and the symbol each slot should read.
  function overlay(ctx, slots) {
    ctx.save(); ctx.strokeStyle = '#b04cff'; ctx.fillStyle = '#b04cff'; ctx.lineWidth = 1.2; ctx.font = '600 11px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [a, b] of BANDS) for (const q of [a, b]) { ctx.beginPath(); ctx.ellipse(O.cx, O.cy, O.rx * q, O.ry * q, 0, 0, TAU); ctx.stroke(); }
    for (let s = 0; s < SECTORS; s++) {
      const th = (s / SECTORS) * TAU - Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(O.cx + Math.cos(th) * O.rx * 0.36, O.cy + Math.sin(th) * O.ry * 0.36); ctx.lineTo(O.cx + Math.cos(th) * O.rx * 0.94, O.cy + Math.sin(th) * O.ry * 0.94); ctx.stroke();
      BANDS.forEach(([a, b], bi) => { const tm = th + (0.5 / SECTORS) * TAU, q = (a + b) / 2; ctx.fillText(NAMES[slots[bi * SECTORS + s]], O.cx + Math.cos(tm) * O.rx * q, O.cy + Math.sin(tm) * O.ry * q); });
    }
    ctx.restore();
  }

  window.CODE = { SECTORS, BANDS, SAMPLE, CORE, COLORS, NAMES, MAX_ID, encode, polar, sectorOf, sectorWidth, bandHit, readSlots, decode, check, structure, overlay };
})();
