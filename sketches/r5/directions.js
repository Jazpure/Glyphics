/* Round 5: refining round 4's Swell, Weave and Beaded Petri, and scaling the
   pattern inside Bead Colonies' vacuoles up to the whole oval: lines of beads
   running into the centre in many shapes (stars included), with designs and
   circles and ovals of widely varied sizes. */
(function () {
  const { TAU, O, E, frameAt, ovalR, inOval, pack } = window.GL;
  const { HAIR, lum, on, open, close, rAdj, inside, circle, handCircle, makeShape, shapePath, design, specimen, growTracks } = window.KIT;
  const { bead, sequence, spine, drawStrands, penRim, flowOpts } = window.STRANDS;

  const ROUND = ['circle', 'circle', 'ring', 'dot', 'lens', 'squircle'];
  const STARRY = ['circle', 'ring', 'dot', 'lens', 'star', 'star4', 'star8', 'pill', 'diamond', 'squircle'];
  const DESIGNS = ['rings', 'hatch', 'dots', 'bands', 'nucleus', 'stipple', 'spokes', 'waves'];

  // Beads above a size threshold become specimens, each with a design inside.
  function beadOrSpecimen(ctx, r, nz, P, c, kind, fill, thr, designs = DESIGNS) {
    if (c.w < thr) { bead(ctx, kind, c, fill, P.ink); return; }
    const s = { x: c.x, y: c.y, R: Math.max(c.l, c.w) / 2, asp: Math.min(c.l, c.w) / Math.max(c.l, c.w), rot: c.l >= c.w ? c.a : c.a + Math.PI / 2, kind: r.pick(['circle', 'circle', 'ellipse', 'squircle']), k: c.x };
    shapePath(ctx, nz, s); ctx.fillStyle = fill; ctx.fill();
    ctx.save(); shapePath(ctx, nz, s); ctx.clip(); design(ctx, r, nz, s, r.pick(designs), on(fill)); ctx.restore();
    shapePath(ctx, nz, s); ctx.strokeStyle = P.ink; ctx.lineWidth = HAIR; ctx.stroke();
  }

  // Branching spokes across the whole oval, converging on the centre. Each
  // spoke forks when it grows too wide; bead size follows `size`, and `swirl`
  // turns the spokes into spiral arms.
  function radiant(r, nz, o) {
    const spokes = [], swirl = o.swirl ?? 0, wig = o.wiggle ?? 0.012, gap = o.gap ?? 2, end = o.end ?? 0.965;
    (function spoke(th, rho, aw, depth, cells, ph) {
      let i = 0;
      while (rho < end) {
        const f = frameAt(th), dist = Math.hypot(f.x - O.cx, f.y - O.cy), width = aw * rho * f.speed;
        if (width > 2 * o.target(rho) && depth < 10) {
          if (cells.length) spokes.push(cells);
          spoke(th - aw / 4, rho, aw / 2, depth + 1, [], ph + 1.3);
          spoke(th + aw / 4, rho, aw / 2, depth + 1, [], ph + 2.1);
          return;
        }
        const w = Math.max(2.2, width * (o.fill ?? 0.72) * (o.size ? o.size(i, ph, rho) : 1)), l = o.lenOf ? o.lenOf(w, r) : w;
        const u = rho + l / 2 / dist;
        if (u > end) break;
        const [x, y] = E(th, u), prev = cells[cells.length - 1];
        cells.push({ x, y, a: prev ? Math.atan2(y - prev.y, x - prev.x) : Math.atan2(y - O.cy, x - O.cx), l, w });
        rho += (l + gap) / dist;
        th += (swirl * (l + gap)) / dist + nz(th * 2, rho * 3) * wig;
        i++;
      }
      if (cells.length) spokes.push(cells);
    })(r.range(0, TAU), o.start ?? 0.04, TAU, 0, [], 0);
    return spokes;
  }
  // How bead size varies along a spoke: steady, swelling, or at random.
  function sizer(r) {
    const mode = r.pick(['steady', 'swell', 'swell', 'random']), fr = r.range(0.3, 0.8);
    if (mode === 'steady') return () => r.range(0.85, 1);
    if (mode === 'swell') return (i, ph) => 0.4 + 0.6 * Math.abs(Math.sin(i * fr + ph));
    return () => r.range(0.35, 1);
  }
  function drawRadiant(ctx, r, nz, P, spokes, o = {}) {
    if (o.spine ?? r.chance(0.5)) spine(ctx, P, spokes);
    const nodes = [];
    for (const sp of spokes) {
      const seq = sequence(r, P, sp.length, { alphabet: o.alphabet || STARRY, kinds: o.kinds || [1, 4] });
      sp.forEach((c, i) => {
        if (r.chance(o.nodes ?? 0.03)) nodes.push(c);
        if (o.specimens) beadOrSpecimen(ctx, r, nz, P, c, seq[i][0], seq[i][1], o.specimens);
        else bead(ctx, seq[i][0], c, seq[i][1], P.ink);
      });
    }
    // Nodes: oversized circles and ovals with designs, laid over the spokes.
    for (const c of nodes) specimen(ctx, r, nz, P, makeShape(r, c.x, c.y, c.w * r.range(1.3, 2.6), ['circle', 'circle', 'ellipse', 'squircle']), DESIGNS, 1.4);
  }

  // Pen circles with room to breathe: less clustering, and no heavy stacks.
  function airyCircles(r, n) {
    const cs = [];
    for (let guard = 0; cs.length < n && guard < n * 20; guard++) {
      let [x, y] = inOval(r, 0.93);
      const R = r.chance(0.3) ? r.range(5, 12) : r.range(16, 58);
      if (cs.length && r.chance(0.25)) { const [px, py, pr] = r.pick(cs), a = r.range(0, TAU), d = pr * r.range(0.7, 1.15) + R * 0.6; x = px + Math.cos(a) * d; y = py + Math.sin(a) * d; }
      if (ovalR(x, y) + rAdj(R) * 0.6 > 1.02) continue;
      if (cs.some(([cx, cy, cr]) => Math.hypot(cx - x, cy - y) < 0.45 * (cr + R))) continue;
      cs.push([x, y, R, r.range(0, 99)]);
    }
    return cs;
  }
  function petri(ctx, r, nz, P, cs, tracks, strandOpts) {
    if (!P.mono) for (const [x, y, R] of cs) if (r.chance(0.4)) { ctx.fillStyle = P.pick(); ctx.beginPath(); circle(ctx, x, y, R); ctx.fill(); }
    drawStrands(ctx, r, P, tracks, strandOpts);
    ctx.restore(); // pen circles may cross the rim, as in the sketch
    ctx.strokeStyle = P.ink; ctx.lineWidth = r.range(1.8, 2.4);
    for (const [x, y, R, k] of cs) {
      ctx.beginPath(); handCircle(ctx, nz, x, y, R, k); ctx.stroke();
      if (R > 14 && r.chance(0.3)) { ctx.beginPath(); handCircle(ctx, nz, x + r.range(-0.4, 0.4) * R, y + r.range(-0.4, 0.4) * R, R * r.range(0.1, 0.2), k + 5); ctx.stroke(); }
    }
    penRim(ctx, r, nz, P);
  }
  // Two layers of strands; the upper one cuts a channel through the lower.
  function weave(ctx, r, P, lower, upper) {
    drawStrands(ctx, r, P, lower, { outline: true });
    for (const t of upper) for (const c of t) bead(ctx, 'pill', { ...c, l: c.l + 8, w: c.w + 8 }, P.field, null);
    drawStrands(ctx, r, P, upper, { spine: false, outline: true });
  }
  // Tangent to the oval's own rings, and pointing at its centre.
  const orbit = (x, y) => { const t = Math.atan2((y - O.cy) / O.ry, (x - O.cx) / O.rx); return Math.atan2(O.ry * Math.cos(t), -O.rx * Math.sin(t)); };
  const radial = (x, y) => Math.atan2(y - O.cy, x - O.cx);

  window.SETS = {
    Swell: 'Swell, packed denser. When a bead would collide, it shrinks to fit instead of ending its strand.',
    Weave: 'Weave with directional cohesion: each layer follows one broad, laminar direction, like warp and weft.',
    Petri: 'Beaded Petri with more air: fewer stacked circles, and some open pools left empty.',
    Radiant: 'The vacuole pattern from Bead Colonies, scaled up to the whole oval. Lines of beads converge on the centre, in many shapes including stars, with nodes of widely varied size.',
  };

  const DIRECTIONS = [
    // =============================================================== SWELL
    {
      set: 'Swell', name: 'Swell Dense', from: 'Swell',
      rule: 'The same swelling round beads at much higher density. Strands pack tight, and a bead that would collide shrinks to fit, so the swell rhythm carries through the gaps.',
      data: 'the swell rhythm per strand.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const fr = r.range(0.12, 0.4), sharp = r.range(1, 2.4);
        const tracks = growTracks(r, nz, { w: [8, 18], swell: (i, ph) => 0.3 + 1.3 * Math.pow(Math.abs(Math.sin(i * fr + ph)), sharp), lenOf: (w) => w, gap: r.range(0.8, 1.8), margin: 1, squeeze: true, minW: 2.4, fork: 0.05, seeds: 1600, cell: 4, max: 90, minCells: 2, ...flowOpts(r) });
        drawStrands(ctx, r, P, tracks, { alphabet: ROUND, kinds: [1, 2], spine: r.chance(0.5) });
        close(ctx, P);
      },
    },
    {
      set: 'Swell', name: 'Swell Tide', from: 'Swell',
      rule: 'Dense swell, where bead size follows a field across the whole oval rather than each strand\'s own rhythm. Big beads gather in tidal patches and fine beads fill the channels between.',
      data: 'bead size read against the tide field.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const ft = r.range(0.003, 0.008), fr = r.range(0.2, 0.5);
        const tracks = growTracks(r, nz, { w: [9, 18], swellAt: (x, y) => 0.5 + 1.4 * Math.pow(Math.max(0, (nz(x * ft + 50, y * ft + 50) + 1) / 2), 1.6), swell: (i, ph) => 0.85 + 0.15 * Math.sin(i * fr + ph), lenOf: (w) => w, gap: r.range(0.8, 1.6), margin: 1, squeeze: true, minW: 2.4, fork: 0.05, seeds: 1600, cell: 4, max: 90, minCells: 2, ...flowOpts(r) });
        drawStrands(ctx, r, P, tracks, { alphabet: ROUND, kinds: [1, 2], spine: r.chance(0.5) });
        close(ctx, P);
      },
    },
    {
      set: 'Swell', name: 'Swell Stars', from: 'Swell + Specimen Reef',
      rule: 'Dense swell with a wider alphabet (stars, lenses, diamonds). The biggest beads open up into specimens with a design inside.',
      data: 'shape per bead, with designs at the peaks.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const fr = r.range(0.15, 0.35), sharp = r.range(1.2, 2.2);
        const tracks = growTracks(r, nz, { w: [9, 20], swell: (i, ph) => 0.3 + 1.4 * Math.pow(Math.abs(Math.sin(i * fr + ph)), sharp), lenOf: (w) => w, gap: r.range(1, 2), margin: 1, squeeze: true, minW: 2.6, fork: 0.04, seeds: 1400, cell: 4, max: 90, minCells: 2, ...flowOpts(r) });
        if (r.chance(0.5)) spine(ctx, P, tracks);
        for (const t of tracks) {
          const seq = sequence(r, P, t.length, { alphabet: STARRY, kinds: [2, 4] });
          t.forEach((c, i) => beadOrSpecimen(ctx, r, nz, P, c, seq[i][0], seq[i][1], 19));
        }
        close(ctx, P);
      },
    },

    // =============================================================== WEAVE
    {
      set: 'Weave', name: 'Warp & Weft', from: 'Weave',
      rule: 'The fine lower strands all run one gently wavering way, and the bold upper strands cross them at about ninety degrees, so it reads as cloth.',
      data: 'two perpendicular tracks, with the angle between them as orientation.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const A = r.range(0, TAU), fq = r.range(0.001, 0.0022);
        const lower = growTracks(r, nz, { w: [3.5, 7], lenOf: (w, r) => w * r.range(1, 1.6), gap: 2, fork: 0.02, seeds: 1000, cell: 5, base: A, freq: fq, curl: r.range(0.2, 0.4), steer: 0.35 });
        const upper = growTracks(r, nz, { w: [9, 15], lenOf: (w, r) => w * r.range(0.9, 1.3), gap: 3, fork: 0.015, seeds: 110, cell: 7, base: A + Math.PI / 2 + r.range(-0.12, 0.12), freq: fq, curl: r.range(0.2, 0.4), steer: 0.35, noiseOff: 40 });
        weave(ctx, r, P, lower, upper);
        close(ctx, P);
      },
    },
    {
      set: 'Weave', name: 'Current', from: 'Weave',
      rule: 'Both layers run the same broad way, the upper at a slight angle and wavier, like a braided river over its bed. The cohesion comes from both layers sharing a direction.',
      data: 'the upper strands as the signal over a textured ground.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const A = r.range(0, TAU), fq = r.range(0.0012, 0.0026);
        const lower = growTracks(r, nz, { w: [3.5, 7], lenOf: (w, r) => w * r.range(1, 1.6), gap: 2, fork: 0.03, seeds: 1000, cell: 5, base: A, freq: fq, curl: r.range(0.3, 0.55), steer: 0.3 });
        const upper = growTracks(r, nz, { w: [7, 13], lenOf: (w, r) => w * r.range(0.9, 1.4), gap: 3, fork: 0.03, seeds: 150, cell: 7, base: A + r.sign() * r.range(0.25, 0.45), freq: fq * 1.4, curl: r.range(0.5, 0.8), steer: 0.3, noiseOff: 40 });
        weave(ctx, r, P, lower, upper);
        close(ctx, P);
      },
    },
    {
      set: 'Weave', name: 'Orbit & Spoke', from: 'Weave + Bead Colonies',
      rule: 'The lower strands orbit the oval along its own rings, and the upper strands run straight into the centre across them, like a spider\'s web in beads.',
      data: 'the orbits and spokes as two readable axes.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const k1 = r.range(0.15, 0.3), k2 = r.range(0.05, 0.15);
        const lower = growTracks(r, nz, { w: [3.5, 7], lenOf: (w, r) => w * r.range(1, 1.6), gap: 2, fork: 0.02, seeds: 1000, cell: 5, flow: (x, y) => orbit(x, y) + nz(x * 0.004, y * 0.004) * k1, steer: 0.4, region: (x, y) => { const q = ovalR(x, y); return q < 0.955 && q > 0.06; } });
        const upper = growTracks(r, nz, { w: [8, 14], lenOf: (w, r) => w * r.range(0.9, 1.3), gap: 3, fork: 0.01, seeds: 120, cell: 7, flow: (x, y) => radial(x, y) + nz(x * 0.004 + 40, y * 0.004) * k2, steer: 0.4, max: 90, region: (x, y) => { const q = ovalR(x, y); return q < 0.955 && q > 0.06; } });
        weave(ctx, r, P, lower, upper);
        close(ctx, P);
      },
    },

    // =============================================================== PETRI
    {
      set: 'Petri', name: 'Petri Airy', from: 'Beaded Petri',
      rule: 'Fewer and less stacked pen circles over a lighter field of strands. A few open pools are left empty, so the eye has somewhere to rest.',
      data: 'strand sequences, with the pools as landmarks.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const cs = airyCircles(r, r.int(30, 46));
        const pools = pack(r, { n: r.int(4, 8), maxR: 70, gap: 50, tries: 800, point: (r) => inOval(r, 0.85), rad: (x, y, r) => r.range(26, 64), inside: inside(0, 0.9) });
        const tracks = growTracks(r, nz, { obstacles: pools, w: [3.5, 8], lenOf: (w, r) => w * r.range(1, 1.5), gap: 3, fork: 0.04, seeds: 450, cell: 5, freq: r.range(0.002, 0.005), curl: r.range(0.5, 1.2) });
        petri(ctx, r, nz, P, cs, tracks, { spine: r.chance(0.5) });
      },
    },
    {
      set: 'Petri', name: 'Petri Currents', from: 'Beaded Petri + Weave',
      rule: 'Pen circles over strands that all flow one laminar way, like a sample on a slide caught mid-current. It is airy, with the cohesion carried over from Weave.',
      data: 'strand sequences along the current.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const cs = airyCircles(r, r.int(28, 42));
        const tracks = growTracks(r, nz, { w: [4, 9], lenOf: (w, r) => w * r.range(1, 1.5), gap: 2.5, fork: 0.02, seeds: 600, cell: 5, base: r.range(0, TAU), freq: r.range(0.0012, 0.002), curl: r.range(0.3, 0.5), steer: 0.35 });
        petri(ctx, r, nz, P, cs, tracks, { spine: r.chance(0.6) });
      },
    },

    // ============================================================= RADIANT
    {
      set: 'Radiant', name: 'Radiant', from: 'Bead Colonies',
      rule: 'Branching lines of beads run into the centre from the whole rim, forking as the oval widens. Every spoke spells its own sequence with circles, rings, lenses and stars, and a few nodes swell into large circles and ovals with designs.',
      data: 'bead sequences per spoke, read like a ring code with branches.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const t0 = r.range(6, 10);
        const spokes = radiant(r, nz, { target: (rho) => t0 * (0.5 + rho * 1.1), size: sizer(r), gap: r.range(1.5, 3), lenOf: (w, r) => w * r.range(0.8, 1.4) });
        drawRadiant(ctx, r, nz, P, spokes, { nodes: 0.03 });
        close(ctx, P);
      },
    },
    {
      set: 'Radiant', name: 'Radiant Specimens', from: 'Bead Colonies + Specimen Reef',
      rule: 'Fewer, bigger beads on the spokes, many of them specimens holding designs. Nodes of widely varied size sit along the lines.',
      data: 'shape × design per bead along each spoke.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const t0 = r.range(11, 16), sz = sizer(r);
        const spokes = radiant(r, nz, { target: (rho) => t0 * (0.45 + rho * 1.0), size: (i, ph, rho) => sz(i, ph) * (0.85 + 0.3 * r.next()), gap: r.range(2, 3.5), lenOf: (w, r) => w * r.range(0.9, 1.3) });
        drawRadiant(ctx, r, nz, P, spokes, { nodes: 0.05, specimens: 12 });
        close(ctx, P);
      },
    },
    {
      set: 'Radiant', name: 'Radiant Swirl', from: 'Bead Colonies + Swell',
      rule: 'The spokes twist into spiral arms on their way to the centre, with beads swelling along each arm. Stars and circles in every size.',
      data: 'arm sequences, with the swirl direction as orientation.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        const t0 = r.range(6, 10), fr = r.range(0.3, 0.7);
        const spokes = radiant(r, nz, { target: (rho) => t0 * (0.5 + rho * 1.1), swirl: r.range(1.2, 2.6) * r.sign(), size: (i, ph) => 0.35 + 0.65 * Math.abs(Math.sin(i * fr + ph)), gap: r.range(1.5, 2.5), lenOf: (w) => w });
        drawRadiant(ctx, r, nz, P, spokes, { nodes: 0.02, alphabet: ['circle', 'circle', 'ring', 'star', 'star', 'star4', 'star8', 'dot', 'lens'] });
        close(ctx, P);
      },
    },
    {
      set: 'Radiant', name: 'Radiant Bloom', from: 'Bead Colonies + Petri',
      rule: 'Beads grow steeply from pinpricks at the centre to large circles, ovals and stars at the rim. Faint rings mark the vacuole behind them, and the rim is drawn in pen.',
      data: 'rim beads as the main track, with the fine centre as a finder.',
      draw(ctx, r, nz, env) {
        const P = open(ctx, r, env);
        ctx.strokeStyle = P.ink; ctx.lineWidth = HAIR;
        for (let i = 0, n = r.int(3, 6); i < n; i++) { ctx.beginPath(); ctx.ellipse(O.cx, O.cy, O.rx * r.range(0.15, 0.95), O.ry * r.range(0.15, 0.95), 0, 0, TAU); ctx.stroke(); }
        const t0 = r.range(11, 16), sz = sizer(r);
        const spokes = radiant(r, nz, { target: (rho) => t0 * (0.15 + 1.9 * Math.pow(rho, 1.6)), size: sz, gap: r.range(1.5, 3), lenOf: (w, r) => w * r.range(0.8, 1.3) });
        drawRadiant(ctx, r, nz, P, spokes, { nodes: 0.04, specimens: 22 });
        ctx.restore();
        penRim(ctx, r, nz, P);
      },
    },
  ];

  window.DIRECTIONS = DIRECTIONS;
})();
