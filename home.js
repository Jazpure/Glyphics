/* Home page: the gate to Scan and Make.

   Background: Glyphics icons (the Free Scale vocabulary) at a third opacity,
   each assembling layer by layer, holding, then coming apart again, while new
   ones appear in the free space.

   Scan asks for the camera here, on the home page, and only then opens the
   camera view, so the permission prompt comes before any video is showing. */
(function () {
  const T = window.TILES, canvas = document.getElementById('bg'), ctx = canvas.getContext('2d');
  const off = document.createElement('canvas'), ox = off.getContext('2d');
  const BIG = ['#fbcd3a', '#f43b3b', '#1a6bff', '#15a4a6', '#141414'], SMALL = BIG.concat(['#ff6ec3']);
  const KINDS = T.CLOSE.concat(['burst', 'plus', 'target']);
  const rng = GL.rng(crypto.getRandomValues(new Uint32Array(1))[0]);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const OPACITY = 0.34, LAYER = 0.6, STAGGER = 0.17; // seconds per layer, and between layers
  let W = 0, H = 0, dpr = 1, unit = 60, target = 30, icons = [], running = false;

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const ease = (v) => v * v * (3 - 2 * v);
  const EXTENT = { quad: 1.22, xdiam: 1.12, squircle: 1.21, square: 1.3 };
  const reach = (m) => Math.max(...m.layers.map((L) => { const e = L.R * (EXTENT[L.shape] || 1); return L.at === 'diag' ? L.d * Math.SQRT2 + e : L.at ? (L.d ?? 0.6) + e : e; }));
  function colours() {
    const c0 = rng.pick(BIG), c1 = rng.pick(SMALL.filter((c) => c !== c0)), c2 = rng.pick(BIG.filter((c) => c !== c0)), c3 = rng.pick(SMALL.filter((c) => c !== c2 && c !== c0));
    return [c0, c1, c2, c3];
  }
  // A new icon in free space: a few big, many small. `phase` starts it part way through.
  function spawn(now, phase = 0) {
    for (let t = 0; t < 30; t++) {
      const m = T.motif(rng, KINDS), half = unit * (0.25 + 1.4 * rng.next() ** 3), R = half * Math.min(1.6, reach(m));
      const x = rng.range(R, W - R), y = rng.range(R, H - R);
      if (icons.some((p) => Math.hypot(p.x - x, p.y - y) < p.R + R + unit * 0.12)) continue;
      const n = m.layers.length, build = (n - 1) * STAGGER + LAYER, hold = rng.range(2.5, 7);
      icons.push({ x, y, half, R, m, c: colours(), t0: now - phase * (build + hold), build, hold, rot: rng.range(-0.3, 0.3), spin: rng.range(-0.06, 0.06) });
      return true;
    }
    return false;
  }
  // Draw one icon t seconds into its life; false once it has come apart.
  function draw(p, t) {
    const L = p.m.layers, n = L.length, end = p.build + p.hold;
    ox.save(); ox.translate(p.x, p.y); ox.rotate(p.rot + p.spin * t);
    for (let k = 0; k < n; k++) {
      // Layers arrive inside out and leave outside in.
      const v = ease(clamp01((t - k * STAGGER) / LAYER)) * (1 - ease(clamp01((t - end - (n - 1 - k) * STAGGER) / LAYER)));
      if (v <= 0.002) continue;
      const Lk = L[k], out = 1 + (1 - v) * 0.9, sc = 0.55 + 0.45 * v;
      ox.globalAlpha = v; ox.fillStyle = Lk.col === 'cut' ? '#ffffff' : p.c[Lk.col % 4]; ox.beginPath();
      for (const [sx, sy, ang] of T.spots(Lk)) {
        ox.save(); ox.translate(sx * p.half * out, sy * p.half * out);
        ox.rotate((Lk.spin ? ang + (Lk.spinOff || 0) : 0) + (Lk.rot || 0) + (1 - v) * 0.6);
        T.SHAPES[Lk.shape](ox, Lk.R * p.half * sc, Lk.o || {});
        ox.restore();
      }
      ox.fill();
    }
    ox.restore();
    return t < end + (n - 1) * STAGGER + LAYER;
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height; dpr = Math.min(2, devicePixelRatio || 1);
    for (const c of [canvas, off]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    unit = Math.max(40, Math.min(W, H) / 8);
    target = Math.max(12, Math.min(50, Math.round((W * H) / (unit * unit * 3))));
    icons = icons.filter((p) => p.x > p.R && p.y > p.R && p.x < W - p.R && p.y < H - p.R);
  }
  function render(now) {
    ox.setTransform(dpr, 0, 0, dpr, 0, 0); ox.clearRect(0, 0, W, H);
    icons = icons.filter((p) => draw(p, now - p.t0));
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // The icons as a whole at a third opacity (layers within an icon don't bleed).
    ctx.globalAlpha = OPACITY; ctx.drawImage(off, 0, 0); ctx.globalAlpha = 1;
    // A soft clearing behind the title so it always reads.
    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.42);
    g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  function frame(ms) {
    if (!running) return;
    const now = ms / 1000;
    for (let k = 0; k < 2 && icons.length < target; k++) if (!spawn(now)) break;
    render(now);
    requestAnimationFrame(frame);
  }
  function start() {
    resize();
    const now = performance.now() / 1000;
    // Begin with a sheet already in motion, every icon at a different point in its life.
    while (icons.length < target && spawn(now, still ? 0.5 : rng.next())) {}
    if (still) { render(now + 60); return; } // reduced motion: one assembled sheet
    running = true; requestAnimationFrame(frame);
  }
  const pause = () => { running = false; };
  const resume = () => { if (!running && !still && !document.hidden) { running = true; requestAnimationFrame(frame); } };
  addEventListener('resize', () => { resize(); if (still) render(performance.now() / 1000 + 60); });
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : SCANNER.isOpen() || resume()));
  start();

  // Scan: the camera is asked for here, then the camera view opens in place.
  const msg = (t) => { document.getElementById('msg').textContent = t; };
  document.getElementById('scan').addEventListener('click', async () => {
    msg('');
    let stream;
    try { stream = await SCANNER.request(); } catch { msg('Camera unavailable'); return; }
    history.pushState({ scan: true }, '', 'scan/' + location.search);
    pause();
    SCANNER.open(stream, { onLeave: () => history.back() });
  });
  addEventListener('popstate', () => { if (SCANNER.isOpen()) { SCANNER.close(); resume(); } });
})();
