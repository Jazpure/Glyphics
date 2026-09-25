/* The twelve directions, ordered from closest to the calligraphy to most
   atmospheric. Each draw() gets a context scaled to 1200 × 900, a seeded rng
   and a noise field, so every reload is a new draw of the same rules. */
(function () {
  const {
    W, H, TAU, O, bez, shift, rotPts, centre, frameAt, E, ovalR, ringMap, flatMap, press, flat,
    nib, addNib, addNibOutline, G, compose, scriptRing, drawPlaced, ovalPath, paper, inOval,
  } = window.GL;

  const INK = '#141312';
  const PAPER = '#f3efe6';

  // Periodic noise around the oval, so rings close without a seam.
  const ringNoise = (nz, t, freq, off = 0) => nz(Math.cos(t) * freq + off, Math.sin(t) * freq + off * 1.7);

  // Break a stroke the way the distortion reference breaks type: terminals
  // clipped off, a gap cut where a join would be, the piece after it knocked
  // off register.
  function fracture(r, pts, amt) {
    const n = pts.length;
    let a = 0, b = n;
    if (r.chance(0.45 * amt)) a = Math.floor(n * r.range(0.08, 0.24));
    if (r.chance(0.45 * amt)) b = n - Math.floor(n * r.range(0.08, 0.24));
    const seg = pts.slice(a, b), out = [];
    if (seg.length > 8 && r.chance(0.65 * amt)) {
      const c = Math.floor(seg.length * r.range(0.3, 0.7)), gap = r.int(1, 3);
      const dx = r.range(-8, 8) * amt, dy = r.range(-6, 6) * amt;
      out.push(seg.slice(0, c), shift(seg.slice(c + gap), dx, dy));
    } else out.push(seg);
    return out.filter((s) => s.length > 1);
  }

  // Tapered filament walked through the noise field (ink tendrils, stems).
  function filament(ctx, nz, x, y, ang, len, w0, curl, step = 3) {
    const L = [], R = [], n = Math.max(2, Math.floor(len / step));
    for (let i = 0; i <= n; i++) {
      const u = i / n, w = w0 * Math.pow(1 - u, 1.3) + 0.25;
      const px = -Math.sin(ang) * w * 0.5, py = Math.cos(ang) * w * 0.5;
      L.push([x + px, y + py]); R.push([x - px, y - py]);
      ang += nz(x * 0.012, y * 0.012) * curl;
      x += Math.cos(ang) * step; y += Math.sin(ang) * step;
    }
    ctx.moveTo(L[0][0], L[0][1]);
    for (const p of L) ctx.lineTo(p[0], p[1]);
    for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
    ctx.closePath();
    return [x, y];
  }

  // Irregular ink blob.
  function blob(ctx, nz, x, y, R0, rough = 0.35, k = 1) {
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * TAU, rr = R0 * (1 + rough * nz(Math.cos(a) * 1.3 * k + x * 0.01, Math.sin(a) * 1.3 * k + y * 0.01));
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  const circle = (ctx, x, y, rad) => { ctx.moveTo(x + rad, y); ctx.arc(x, y, rad, 0, TAU); };

  const DIRECTIONS = [
    // ------------------------------------------------------------------ 01
    {
      name: 'Nib Ring',
      rule: 'A fixed-angle broad nib writes clusters of uprights, sweeps and bowls around the oval. Uprights point to the centre. A second, smaller hand fills the outer gaps with marks.',
      from: 'Calligraphy',
      draw(ctx, r) {
        paper(ctx, PAPER);
        ctx.fillStyle = INK;
        const phi = r.range(0.55, 0.85), w = r.range(8, 11);
        drawPlaced(ctx, scriptRing(r, {
          s: r.range(0.83, 0.87), len: [60, 150], asc: [70, 118], desc: 34, phi,
          marks: [1, 4], markSize: w * 1.3, adv: [0.42, 0.75], minUp: 1, maxUp: 4,
        }), w, phi);
        drawPlaced(ctx, scriptRing(r, {
          s: 0.955, len: [26, 60], asc: [16, 30], desc: 10, phi, marks: [0, 2], markSize: w * 0.8,
          maxUp: 2, tall: 0, adv: [0.7, 1.1],
        }), w * 0.45, phi);
      },
    },

    // ------------------------------------------------------------------ 02
    {
      name: 'Filled Cartouche',
      rule: 'The whole oval is packed with stacked lines of script. Each line fits its chord, and uprights climb into the line above until the silhouette itself is the oval.',
      from: 'Calligraphy',
      draw(ctx, r) {
        paper(ctx, PAPER);
        ctx.fillStyle = INK;
        const phi = r.range(0.6, 0.85), w = r.range(7, 9), gap = r.range(58, 70);
        const top = (x) => O.cy - O.ry * Math.sqrt(Math.max(0, 1 - ((x - O.cx) / O.rx) ** 2));
        const bot = (x) => 2 * O.cy - top(x);
        const placed = [];
        for (let y = O.cy - O.ry + gap * 0.9; y < O.cy + O.ry - 18; y += gap * r.range(0.9, 1.1)) {
          const hw = O.rx * Math.sqrt(Math.max(0, 1 - ((y - O.cy) / O.ry) ** 2)) * 0.93;
          let x = O.cx + hw;
          while (x > O.cx - hw + 20) {
            const len = Math.min(r.range(46, 115), x - (O.cx - hw));
            const xm = x - len / 2;
            const asc = Math.min(r.range(60, 115), (y - top(xm)) * 0.9);
            const desc = Math.min(28, (bot(xm) - y) * 0.8);
            const map = flatMap(x - len, y, r.range(-0.05, 0.05));
            for (const g of compose(r, { len, asc, desc, phi, marks: [2, 5], markSize: w * 1.3 })) placed.push({ ...g, map });
            x -= len * r.range(0.7, 1.0);
          }
        }
        drawPlaced(ctx, placed, w, phi);
        // Loose marks in whatever space is left.
        const marks = [];
        for (let i = 0; i < 160; i++) {
          const [x, y] = inOval(r, 0.9);
          for (const m of G.mark(r, w * 1.1, phi)) marks.push({ pts: m, map: flatMap(x, y), w: 0.7, mark: true });
        }
        drawPlaced(ctx, marks, w, phi);
      },
    },

    // ------------------------------------------------------------------ 03
    {
      name: 'Truncated Script',
      rule: 'The nib ring, broken the way the reference breaks type. Terminals are clipped where serifs would sit, joins are cut open, and horizontal slices of the whole ring slide off register.',
      from: 'Calligraphy → Distortion',
      draw(ctx, r, nz, env) {
        paper(ctx, PAPER);
        const off = env.layer();
        off.fillStyle = INK;
        const phi = r.range(0.55, 0.85), w = r.range(10, 13), amt = r.range(0.55, 0.85);
        const placed = scriptRing(r, { s: 0.84, len: [70, 160], asc: [80, 130], desc: 36, phi, marks: [1, 3], markSize: w * 1.2, adv: [0.42, 0.72], minUp: 1, maxUp: 4 })
          .flatMap((g) => (g.mark ? [g] : fracture(r, g.pts, amt).map((pts) => ({ ...g, pts }))));
        drawPlaced(off, placed, w, phi);
        // Cut thin gaps straight through the band.
        off.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < r.int(14, 26); i++) {
          const f = frameAt(r.range(0, TAU), r.range(0.72, 0.9));
          off.save(); off.translate(f.x, f.y); off.rotate(Math.atan2(f.ny, f.nx) + r.range(-0.3, 0.3));
          off.fillRect(-r.range(10, 40), -r.range(1.5, 4), r.range(20, 70), r.range(3, 7));
          off.restore();
        }
        off.globalCompositeOperation = 'source-over';
        // Slide horizontal slices.
        let y = 0;
        while (y < H) {
          const h = r.chance(0.3) ? r.range(4, 14) : r.range(20, 90);
          const dx = r.chance(0.6) ? 0 : r.range(-18, 18);
          env.blit(off, 0, y, W, h, dx, 0);
          y += h;
        }
      },
    },

    // ------------------------------------------------------------------ 04
    {
      name: 'Grafts',
      rule: 'Strokes grow parts that belong elsewhere: ball terminals, swashes at the wrong scale, a nib at the wrong angle. A small echo of the ring sits inside, and a dry-brush slab crosses one edge.',
      from: 'Calligraphy → Distortion',
      draw(ctx, r, nz) {
        paper(ctx, PAPER);
        ctx.fillStyle = INK;
        const phi = r.range(0.55, 0.85), w = r.range(8, 11);
        // Dry-brush slab, drawn first so the script sits over it.
        const tS = r.range(0, TAU), span = r.range(1.0, 1.7);
        ctx.strokeStyle = INK; ctx.lineCap = 'butt';
        for (let k = 0; k < 150; k++) {
          const s = r.range(0.93, 1.02), lw = r.range(0.8, 2.6);
          ctx.lineWidth = lw; ctx.beginPath();
          let on = false;
          for (let i = 0; i <= 120; i++) {
            const t = tS + (span * i) / 120, [x, y] = E(t, s + nz(i * 0.05, k) * 0.004);
            const ink = nz(i * 0.05, k * 0.35) > -0.25 && i > r.range(0, 18) && i < 120 - r.range(0, 30);
            if (ink && !on) ctx.moveTo(x, y); else if (ink) ctx.lineTo(x, y);
            on = ink;
          }
          ctx.stroke();
        }
        const placed = scriptRing(r, { s: 0.82, len: [70, 150], asc: [70, 115], desc: 32, phi, marks: [0, 3], markSize: w * 1.2 });
        const grafts = [], balls = [];
        for (const g of placed) {
          if (g.mark) continue;
          const end = g.pts[r.chance(0.5) ? 0 : g.pts.length - 1];
          if (r.chance(0.28)) balls.push([...g.map(end[0], end[1]).slice(0, 2), w * r.range(0.55, 1.15)]);
          else if (r.chance(0.16)) {
            const k = r.pick([0.35, 0.4, 1.8, 2.2]);
            const part = r.chance(0.5) ? G.hook(r, 30 * k) : G.loop(r, 26 * k);
            grafts.push({ pts: shift(part, end[0], end[1]), map: g.map, w: k > 1 ? 1.2 : 0.5 });
          }
        }
        drawPlaced(ctx, placed, w, phi);
        drawPlaced(ctx, grafts, w, phi + r.range(0.9, 1.4));
        // Intruders: a couple of clusters at twice the scale.
        for (let i = 0; i < r.int(1, 3); i++) {
          const t = r.range(0, TAU), map = ringMap(t, 0.8, -1);
          const big = compose(r, { len: 150, asc: 150, desc: 50, phi, marks: [0, 1], markSize: 20, maxUp: 2 })
            .map((g) => ({ ...g, pts: g.pts.map((p) => [p[0] * 1.6, p[1] * 1.6]), map }));
          drawPlaced(ctx, big, w * 1.9, phi);
        }
        ctx.beginPath();
        for (const [x, y, rad] of balls) circle(ctx, x, y, rad);
        ctx.fill();
        // The small echo.
        const o2 = { cx: O.cx + r.range(-40, 40), cy: O.cy + r.range(10, 60), rx: O.rx * 0.4, ry: O.ry * 0.4 };
        drawPlaced(ctx, scriptRing(r, { o: o2, s: 0.8, len: [26, 60], asc: [26, 46], desc: 12, phi, marks: [0, 2], markSize: 6 }), w * 0.42, phi);
      },
    },

    // ------------------------------------------------------------------ 05
    {
      name: 'Logogram',
      rule: 'One ink loop whose weight swells at a few anchor points. Bursts of tendrils, splatter and a grey wash gather there, so what it says sits in where it erupts.',
      from: 'Circular glyph',
      draw(ctx, r, nz) {
        paper(ctx, PAPER);
        const n = r.int(3, 6), anchors = [];
        for (let i = 0; i < n; i++) anchors.push({ t: r.range(0, TAU), k: r.range(0.5, 1.4), out: r.chance(0.7) ? 1 : -1 });
        const gapT = r.chance(0.35) ? r.range(0, TAU) : null;
        const boost = (t) => anchors.reduce((a, q) => {
          let d = Math.abs(((t - q.t + Math.PI) % TAU + TAU) % TAU - Math.PI);
          return a + q.k * Math.exp(-(d * d) / 0.012);
        }, 0);
        const sAt = (t) => 0.9 + 0.018 * ringNoise(nz, t, 1.6, 4);
        const wAt = (t) => 5 + 6 * (ringNoise(nz, t, 1.8, 11) + 1) / 2 + 2.2 * ringNoise(nz, t, 22, 3) + boost(t) * 24;
        // Grey wash first.
        ctx.fillStyle = 'rgba(20,19,18,0.28)';
        ctx.beginPath();
        for (const q of anchors) {
          const f = frameAt(q.t, sAt(q.t));
          for (let i = 0; i < 5; i++) blob(ctx, nz, f.x + f.nx * q.out * r.range(0, 40) + r.gauss() * 16, f.y + f.ny * q.out * r.range(0, 40) + r.gauss() * 16, r.range(10, 34) * q.k, 0.5, 2);
          for (let i = 0; i < 20; i++) {
            const t = q.t + r.gauss() * 0.1, g = frameAt(t, sAt(t)), a = Math.atan2(g.ny * q.out, g.nx * q.out) + r.gauss() * 0.9;
            filament(ctx, nz, g.x, g.y, a, r.range(30, 150), r.range(2, 6), 0.4);
          }
        }
        ctx.fill();
        // The loop.
        ctx.fillStyle = INK;
        ctx.beginPath();
        const N = 900, outer = [], inner = [];
        for (let i = 0; i <= N; i++) {
          const t = (i / N) * TAU, f = frameAt(t, sAt(t));
          let ww = wAt(t);
          if (gapT !== null) { const d = Math.abs(((t - gapT + Math.PI) % TAU + TAU) % TAU - Math.PI); if (d < 0.05) ww = 0; }
          outer.push([f.x + f.nx * ww * 0.55, f.y + f.ny * ww * 0.55]);
          inner.push([f.x - f.nx * ww * 0.45, f.y - f.ny * ww * 0.45]);
        }
        ctx.moveTo(outer[0][0], outer[0][1]);
        for (const p of outer) ctx.lineTo(p[0], p[1]);
        ctx.closePath();
        ctx.moveTo(inner[N][0], inner[N][1]);
        for (let i = N; i >= 0; i--) ctx.lineTo(inner[i][0], inner[i][1]);
        ctx.closePath();
        ctx.fill('nonzero');
        // Bursts.
        ctx.beginPath();
        for (const q of anchors) {
          const f = frameAt(q.t, sAt(q.t));
          blob(ctx, nz, f.x + f.nx * q.out * 6, f.y + f.ny * q.out * 6, 14 * q.k, 0.6, 3);
          const m = Math.floor(r.range(25, 70) * q.k);
          for (let i = 0; i < m; i++) {
            const t = q.t + r.gauss() * 0.07, g = frameAt(t, sAt(t));
            const dir = r.chance(0.8) ? q.out : -q.out, a = Math.atan2(g.ny * dir, g.nx * dir) + r.gauss() * 0.55;
            const len = 12 + Math.pow(r.next(), 2.2) * 150 * q.k;
            const [ex, ey] = filament(ctx, nz, g.x, g.y, a, len, r.range(1.2, 4.5), 0.3);
            if (r.chance(0.25)) circle(ctx, ex, ey, r.range(1, 3));
          }
          for (let i = 0; i < 40 * q.k; i++) {
            const d = 20 + Math.pow(r.next(), 1.8) * 160, a = Math.atan2(f.ny * q.out, f.nx * q.out) + r.gauss() * 0.8;
            circle(ctx, f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, r.range(0.6, 2.8));
          }
        }
        ctx.fill();
      },
    },

    // ------------------------------------------------------------------ 06
    {
      name: 'Stain',
      rule: 'The ring is left behind, like a cup mark. Hundreds of faint nib strokes pool along the band, a darker rim forms on the outer edge, and a drip breaks out at one point.',
      from: 'Circular glyph → Texture',
      draw(ctx, r, nz) {
        paper(ctx, '#f6f2ea');
        const ink = r.pick([[150, 92, 38], [120, 70, 40], [60, 58, 54]]);
        const c = (a) => `rgba(${ink[0]},${ink[1]},${ink[2]},${a})`;
        const rings = [{ s: 0.92, bw: r.range(34, 54), k: 1 }];
        if (r.chance(0.6)) rings.push({ s: r.range(0.72, 0.8), bw: r.range(14, 24), k: 0.5, from: r.range(0, TAU), span: r.range(2, 4.5) });
        const phi = r.range(0.4, 1.0);
        for (const q of rings) {
          for (let i = 0; i < 2800 * q.k; i++) {
            const t = q.from !== undefined ? q.from + r.next() * q.span : r.range(0, TAU);
            if (ringNoise(nz, t, 5, q.s * 10) < -0.5) continue;
            const across = (Math.pow(r.next(), 0.5) - 0.5) * q.bw, f = frameAt(t, q.s);
            const x = f.x + f.nx * across, y = f.y + f.ny * across;
            const mottle = Math.max(0, 0.6 + nz(x * 0.025, y * 0.025));
            ctx.fillStyle = c(r.range(0.04, 0.12) * mottle);
            nib(ctx, [[-r.range(4, 20), 0], [r.range(4, 20), r.range(-3, 3)]], flatMap(x, y, Math.atan2(f.uy, f.ux) + r.gauss() * 0.25), r.range(6, 16), phi, flat, 0.5);
          }
          // Rim: darker, thin, on the outer edge, broken in places.
          for (const [edge, alpha, lw] of [[0.5, 0.7, 2.6], [0.44, 0.3, 1.2], [-0.5, 0.3, 1.2]]) {
            ctx.strokeStyle = c(alpha); ctx.lineWidth = lw; ctx.beginPath();
            let on = false;
            for (let i = 0; i <= 700; i++) {
              const t = q.from !== undefined ? q.from + (q.span * i) / 700 : (i / 700) * TAU;
              const f = frameAt(t, q.s), d = edge * q.bw + ringNoise(nz, t, 12, 7) * 3;
              const vis = ringNoise(nz, t, 7, 2 + edge) > -0.3;
              if (vis && !on) ctx.moveTo(f.x + f.nx * d, f.y + f.ny * d); else if (vis) ctx.lineTo(f.x + f.nx * d, f.y + f.ny * d);
              on = vis;
            }
            ctx.stroke();
          }
        }
        // Residue: a few faint, half-dissolved clusters of script in the band.
        ctx.fillStyle = c(0.4);
        drawPlaced(ctx, scriptRing(r, { s: 0.92, len: [40, 90], asc: [12, 24], desc: 10, phi, marks: [0, 2], markSize: 9, adv: [1.4, 3], maxUp: 2 }), 5, phi);
        // Drip.
        const td = r.range(0, TAU), f = frameAt(td, 0.92 + 0.5 * rings[0].bw / 400);
        ctx.fillStyle = c(0.32); ctx.beginPath(); blob(ctx, nz, f.x + f.nx * 10, f.y + f.ny * 10, r.range(12, 22), 0.55, 2); ctx.fill();
        ctx.strokeStyle = c(0.6); ctx.lineWidth = 1.4; ctx.stroke();
        ctx.fillStyle = c(0.45); ctx.beginPath();
        for (let i = 0; i < r.int(6, 16); i++) {
          const a = Math.atan2(f.ny, f.nx) + r.gauss() * 0.7, d = r.range(26, 80);
          circle(ctx, f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, r.range(1, 4.5));
        }
        ctx.fill();
      },
    },

    // ------------------------------------------------------------------ 07
    {
      name: 'Swarm',
      rule: 'Hundreds of single strokes, each one mark from the vocabulary, laid on a phyllotaxis spiral and turned to follow the flow. They grow toward the rim and overprint in three inks.',
      from: 'Circular glyph → Texture',
      draw(ctx, r) {
        paper(ctx, '#f2eee4');
        const inks = r.shuffle(['#e0482c', '#2a52c0', '#2c8653']).slice(0, r.int(2, 3));
        const N = r.int(340, 480), swirl = r.range(0.45, 1.0) * r.sign(), phi = r.range(0.4, 0.9);
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.86;
        for (let i = 0; i < N; i++) {
          const a = i * 2.39996323, s = 0.13 + 0.84 * Math.sqrt(i / N), f = frameAt(a, s);
          const ang = Math.atan2(f.uy, f.ux) + swirl + r.gauss() * 0.08;
          const sc = 0.35 + 0.85 * s;
          ctx.fillStyle = r.pick(inks);
          nib(ctx, G.any(r, r.range(50, 80)), flatMap(f.x, f.y, ang, sc), r.range(9, 15) * sc, phi, press);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      },
    },

    // ------------------------------------------------------------------ 08
    {
      name: 'Spoke Archive',
      rule: 'Spokes run from a black core to the rim, each a column of cells that are solid, outlined, ruled or empty. Cells grow as they move outward, and one wedge is cut away.',
      from: 'Circular glyph',
      draw(ctx, r, nz) {
        paper(ctx, PAPER);
        ctx.fillStyle = INK; ctx.strokeStyle = INK;
        const Ns = r.int(120, 170), wA = r.range(0, TAU), wW = r.range(0.16, 0.34);
        ctx.beginPath(); blob(ctx, nz, O.cx, O.cy, r.range(16, 30), 0.3, 2); ctx.fill();
        for (let k = 0; k < Ns; k++) {
          const th = ((k + r.range(-0.2, 0.2)) / Ns) * TAU;
          const dW = Math.abs(((th - wA + Math.PI) % TAU + TAU) % TAU - Math.PI);
          if (dW < wW / 2) continue;
          const [ex, ey] = E(th, 0.99), dx = ex - O.cx, dy = ey - O.cy, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
          let rho = r.range(0.02, 0.05);
          while (rho < 1) {
            const cl = Math.min(1 - rho, (0.012 + 0.04 * rho) * r.range(0.6, 1.6));
            const cw = Math.max(1.4, (TAU / Ns) * rho * len * r.range(0.55, 0.85));
            const d = (rho + cl / 2) * len, L = cl * len - 1.2;
            ctx.save(); ctx.translate(O.cx + Math.cos(ang) * d, O.cy + Math.sin(ang) * d); ctx.rotate(ang);
            const k2 = r.next(), solid = 0.1 + 0.8 * Math.pow(1 - rho, 3);
            if (k2 < solid) ctx.fillRect(-L / 2, -cw / 2, L, cw);
            else if (k2 < solid + 0.22) { ctx.lineWidth = 0.8; ctx.strokeRect(-L / 2, -cw / 2, L, cw); }
            else if (k2 < solid + 0.55) {
              ctx.lineWidth = r.range(0.5, 1.3); ctx.beginPath();
              for (let x = -L / 2 + 1.5; x < L / 2; x += r.range(1.8, 3.6)) { ctx.moveTo(x, -cw / 2 * r.range(0.3, 1)); ctx.lineTo(x, cw / 2 * r.range(0.3, 1)); }
              ctx.stroke();
            }
            ctx.restore();
            rho += cl + 0.004;
          }
        }
      },
    },

    // ------------------------------------------------------------------ 09
    {
      name: 'Echo',
      rule: 'One nib stroke is redrawn a hundred times, each copy nudged, turned and grown a little, until outlines alone build volume. White hairlines on a black oval.',
      from: 'Texture',
      draw(ctx, r) {
        paper(ctx, PAPER);
        ctx.fillStyle = '#0d0d0c'; ovalPath(ctx); ctx.fill();
        ctx.save(); ovalPath(ctx, 0.995); ctx.clip();
        ctx.strokeStyle = 'rgba(245,242,234,0.5)'; ctx.lineWidth = 0.7;
        const phi = r.range(0.4, 0.9), K = r.int(9, 15), a0 = r.range(0, TAU);
        for (let b = 0; b < K; b++) {
          const th = a0 + (b / K) * TAU + r.range(-0.2, 0.2);
          const s0 = r.range(0.04, 0.3), [x0, y0] = E(th, s0), [x1, y1] = E(th, r.range(0.8, 1.05));
          const pts = G.any(r, r.range(70, 140)), M = r.int(55, 110);
          const rot0 = Math.atan2(y1 - y0, x1 - x0) + r.range(-1.2, 1.2), dr = r.range(-0.012, 0.012), g = r.range(1.002, 1.01);
          const wN = r.range(10, 18);
          ctx.beginPath();
          for (let i = 0; i < M; i++) {
            const u = i / (M - 1), sc = 0.6 * Math.pow(g, i);
            addNibOutline(ctx, pts, flatMap(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, rot0 + dr * i, sc), wN * sc, phi, press, 0);
          }
          ctx.stroke();
        }
        ctx.restore();
      },
    },

    // ------------------------------------------------------------------ 10
    {
      name: 'Storm',
      rule: 'A pen travels around the oval in overlapping loops, bunching and thinning as it goes. It leaves pins, ticks and strips of tape behind.',
      from: 'Texture',
      draw(ctx, r, nz) {
        paper(ctx, '#dfe4dc');
        ctx.strokeStyle = 'rgba(28,33,30,0.78)'; ctx.fillStyle = '#1c211e';
        const pins = [];
        const u01 = (v) => (v + 1) / 2;
        for (let pen = 0, pens = r.int(3, 5); pen < pens; pen++) {
          let t = r.range(0, TAU), ph = r.range(0, TAU);
          const span = TAU * r.range(0.5, 1.0), end = t + span, s0 = r.range(0.74, 0.86);
          ctx.lineWidth = r.range(0.5, 1.2); ctx.beginPath();
          let i = 0;
          while (t < end) {
            // Speed, loop size, eccentricity and tilt all drift, so the pen
            // bunches into knots and then runs loose.
            t += 0.0003 + 0.0026 * Math.pow(u01(nz(i * 0.004, pen * 10)), 2.2);
            ph += 0.1 + 0.32 * u01(nz(i * 0.006, pen * 3));
            const rho = 3 + 50 * Math.pow(u01(nz(i * 0.005, pen * 7 + 3)), 1.6);
            const ecc = 0.35 + 0.65 * u01(nz(i * 0.003, pen * 11)), tilt = nz(i * 0.0015, pen * 13) * 2.5;
            const [cx, cy] = E(t, s0 + 0.09 * nz(i * 0.002, pen + 5));
            const lx = rho * Math.cos(ph), ly = rho * ecc * Math.sin(ph);
            const x = cx + lx * Math.cos(tilt) - ly * Math.sin(tilt), y = cy + lx * Math.sin(tilt) + ly * Math.cos(tilt);
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            if (i % 30 === 0 && r.chance(0.45)) pins.push([x, y, t]);
            i++;
          }
          ctx.stroke();
        }
        // Loose scribbles in the middle.
        for (let c = 0; c < r.int(1, 3); c++) {
          let [cx, cy] = inOval(r, 0.45), ph = 0;
          ctx.lineWidth = 0.7; ctx.beginPath();
          for (let i = 0; i < 260; i++) {
            ph += 0.3; cx += nz(i * 0.02, c * 9) * 1.4; cy += nz(c * 9, i * 0.02) * 1.4;
            const rho = 6 + 12 * (nz(i * 0.03, c) + 1) / 2, x = cx + rho * Math.cos(ph), y = cy + rho * Math.sin(ph);
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.stroke();
        }
        ctx.lineWidth = 0.8; ctx.beginPath();
        const heads = [];
        for (const [x, y, t] of pins) {
          const f = frameAt(t), a = Math.atan2(f.ny, f.nx) * (r.chance(0.7) ? 1 : -1) + r.gauss() * 0.9, l = r.range(8, 38);
          ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
          heads.push([x + Math.cos(a) * l, y + Math.sin(a) * l]);
        }
        ctx.stroke();
        ctx.beginPath(); for (const [x, y] of heads) circle(ctx, x, y, r.range(1.2, 2.2)); ctx.fill();
        // Tape.
        for (let k = 0; k < r.int(5, 9); k++) {
          const f = frameAt(r.range(0, TAU), r.range(0.7, 0.95));
          ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(r.range(0, Math.PI));
          const tw = r.range(50, 110), th = r.range(9, 15);
          ctx.fillStyle = 'rgba(250,251,248,0.78)'; ctx.fillRect(-tw / 2, -th / 2, tw, th);
          ctx.strokeStyle = 'rgba(28,33,30,0.12)'; ctx.lineWidth = 0.6; ctx.strokeRect(-tw / 2, -th / 2, tw, th);
          ctx.restore();
        }
      },
    },

    // ------------------------------------------------------------------ 11
    {
      name: 'Overprint Bloom',
      rule: 'Radial bursts of nib petals in two riso inks overprint inside the oval, tied together by a black hairline web. Density fades toward one side.',
      from: 'Texture',
      draw(ctx, r) {
        paper(ctx, '#f7f5f0');
        const inks = r.pick([['#ff48b0', '#0078bf'], ['#ff6c2f', '#0078bf'], ['#ff48b0', '#00a95c']]);
        const fa = r.range(0, TAU), fx = Math.cos(fa), fy = Math.sin(fa), phi = r.range(0.3, 1.2);
        const pts = [];
        let guard = 0;
        while (pts.length < 300 && guard++ < 6000) {
          const [x, y] = inOval(r, 0.93);
          const side = (((x - O.cx) / O.rx) * fx + ((y - O.cy) / O.ry) * fy + 1) / 2;
          if (r.next() < 0.15 + 0.85 * side) pts.push([x, y, r.range(16, 52)]);
        }
        ctx.globalCompositeOperation = 'multiply';
        for (const [x, y, L] of pts) {
          const P = r.int(7, 16), a0 = r.range(0, TAU), both = r.chance(0.3), c0 = r.int(0, 1);
          ctx.globalAlpha = r.range(0.5, 0.75);
          for (let k = 0; k < P; k++) {
            ctx.fillStyle = inks[both ? k % 2 : c0];
            const l = L * r.range(0.6, 1.1), bend = r.range(-0.2, 0.2) * l;
            nib(ctx, bez([0, 0], [l * 0.3, bend], [l * 0.7, bend], [l, 0], 10), flatMap(x, y, a0 + (k / P) * TAU), r.range(5, 12), phi, (u) => Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.05)), 0);
          }
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(20,19,18,0.45)'; ctx.lineWidth = 0.45; ctx.beginPath();
        for (const [x, y, L] of pts) {
          for (let k = 0; k < r.int(3, 7); k++) { const a = r.range(0, TAU); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * L * 1.3, y + Math.sin(a) * L * 1.3); }
          const near = pts.map((q) => [q, (q[0] - x) ** 2 + (q[1] - y) ** 2]).sort((a, b) => a[1] - b[1]).slice(1, 3);
          for (const [q] of near) { ctx.moveTo(x, y); ctx.lineTo(q[0], q[1]); }
        }
        ctx.stroke();
      },
    },

    // ------------------------------------------------------------------ 12
    {
      name: 'Hairline Garden',
      rule: 'A recursive stem grows up from the base of the oval and curls outward, carrying pods and bubbles. Everything is a flat fill with a hairline edge, in a muted palette with one accent.',
      from: 'Texture',
      draw(ctx, r, nz) {
        paper(ctx, '#f2eee2');
        const field = r.pick(['#d8dcc3', '#e9e3c4', '#cfd3c8']);
        const line = '#3b372e', sage = '#aab595', taupe = '#7d7462', cream = '#fbf6dc';
        const accent = r.pick(['#f0a13a', '#5aa9cc', '#e25a3c']);
        ctx.save(); ovalPath(ctx); ctx.fillStyle = field; ctx.fill(); ctx.clip();
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        // Faint hairline tendrils behind everything.
        ctx.strokeStyle = 'rgba(59,55,46,0.35)'; ctx.lineWidth = 0.6;
        for (let k = 0; k < 16; k++) {
          let [x, y] = inOval(r, 0.9), a = r.range(0, TAU);
          ctx.beginPath(); ctx.moveTo(x, y);
          for (let i = 0; i < 140; i++) { a += nz(x * 0.006, y * 0.006) * 0.12; x += Math.cos(a) * 4; y += Math.sin(a) * 4; ctx.lineTo(x, y); }
          ctx.stroke();
        }
        // The stem.
        const tips = [], maxD = r.int(7, 9), spread = r.range(0.3, 0.55), curl = r.range(0.08, 0.16);
        const stems = [];
        (function grow(x, y, a, len, d, side) {
          const bend = r.range(-0.25, 0.25) + side * curl * d;
          const ex = x + Math.cos(a + bend) * len, ey = y + Math.sin(a + bend) * len;
          stems.push({ pts: bez([x, y], [x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5], [ex - Math.cos(a + bend * 2) * len * 0.3, ey - Math.sin(a + bend * 2) * len * 0.3], [ex, ey], 10), w: Math.max(0.8, (maxD - d) * 1.3) });
          if (d >= maxD || ovalR(ex, ey) > 0.97) { tips.push([ex, ey, a + bend]); return; }
          const n = r.chance(0.2) ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const s = n === 2 ? (i ? 1 : -1) : i - 1;
            grow(ex, ey, a + bend + s * spread * r.range(0.7, 1.2), len * r.range(0.66, 0.78), d + 1, s || side);
          }
        })(O.cx + r.range(-40, 40), O.cy + O.ry, -Math.PI / 2 + r.range(-0.1, 0.1), r.range(130, 170), 0, 0);
        for (const pass of [0, 1]) for (const s of stems) {
          ctx.strokeStyle = pass ? cream : line; ctx.lineWidth = pass ? s.w : s.w + 1.6;
          if (pass && s.w < 1.2) continue;
          ctx.beginPath(); s.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
        }
        const disc = (x, y, rad, fill, lw = 0.8) => {
          ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU);
          if (fill) { ctx.fillStyle = fill; ctx.fill(); }
          ctx.strokeStyle = line; ctx.lineWidth = lw; ctx.stroke();
        };
        for (const [x, y, a] of tips) {
          const k = r.next();
          if (k < 0.5) {
            ctx.save(); ctx.translate(x, y); ctx.rotate(a);
            ctx.beginPath(); ctx.ellipse(6, 0, r.range(6, 11), r.range(3, 5), 0, 0, TAU);
            ctx.fillStyle = r.chance(0.85) ? sage : accent; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = 0.8; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14, 0); ctx.stroke();
            ctx.restore();
          } else if (k < 0.8) {
            for (let i = 0; i < r.int(2, 5); i++) disc(x + r.gauss() * 7, y + r.gauss() * 7, r.range(2, 6), r.pick([cream, '#fff', sage]));
          } else disc(x, y, r.range(1.5, 3), taupe);
        }
        // Bubble cloud rising from the base.
        const circles = [], baseY = O.cy + O.ry * r.range(0.15, 0.4);
        for (let i = 0; i < 3000 && circles.length < 150; i++) {
          const x = r.range(O.cx - O.rx, O.cx + O.rx), y = r.range(baseY - 60, O.cy + O.ry);
          const rad = r.range(8, 64) * (0.4 + (y - baseY + 60) / (O.cy + O.ry - baseY + 60));
          if (y - rad < baseY - 80 * r.next()) continue;
          if (circles.every(([cx, cy, cr]) => Math.hypot(cx - x, cy - y) > cr + rad - Math.min(cr, rad) * 0.35)) circles.push([x, y, rad]);
        }
        circles.sort((a, b) => a[1] - b[1]);
        for (const [x, y, rad] of circles) disc(x, y, rad, '#fbfaf5', 0.9);
        // Scattered punctuation: solid dots, targets, accent discs.
        for (let i = 0; i < 26; i++) { const [x, y] = inOval(r, 0.92); disc(x, y, r.range(2, 12), taupe, 0.6); }
        for (let i = 0; i < 7; i++) { const [x, y] = inOval(r, 0.85), R0 = r.range(8, 20); for (let k = 3; k > 0; k--) disc(x, y, (R0 * k) / 3, k === 3 ? cream : null, 0.7); }
        for (let i = 0; i < r.int(8, 16); i++) { const [x, y] = inOval(r, 0.9); disc(x, y, r.range(4, 22), accent, 0.8); }
        ctx.restore();
        ctx.strokeStyle = line; ctx.lineWidth = 1; ovalPath(ctx); ctx.stroke();
      },
    },
  ];

  window.DIRECTIONS = DIRECTIONS;
})();
