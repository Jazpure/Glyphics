/* Gallery shared by every round: draws window.DIRECTIONS into cards, with a
   lightbox for redraws and PNG export. */
(function () {
  const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
  const hex = (s) => s.toString(16).toUpperCase().padStart(8, '0');

  // Colour mode for pages that offer the switch: 'mix' | 'mono' | 'color'.
  let mode = 'mix';
  // Pages that carry a real code (round 8 on) share one ID across every card.
  const idInput = document.getElementById('codeId'), ovInput = document.getElementById('overlay');
  let codeId = idInput ? Number(idInput.value) : null, showOverlay = false;

  function render(canvas, dir, seed, cssW) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round((cssW || canvas.clientWidth || 400) * dpr), ph = Math.round(pw * 0.75), k = pw / GL.W;
    canvas.width = pw; canvas.height = ph;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const r = GL.rng(seed), nz = GL.makeNoise(GL.rng(seed ^ 0x9e3779b9));
    const env = {
      mode, id: codeId, overlay: showOverlay,
      layer() {
        const c = document.createElement('canvas'); c.width = pw; c.height = ph;
        const x = c.getContext('2d'); x.setTransform(k, 0, 0, k, 0, 0); return x;
      },
      // Copy a region of a layer back onto the card, offset by (dx, dy).
      blit(layer, sx, sy, sw, sh, dx, dy) {
        sh = Math.min(sh, GL.H - sy); if (sh <= 0) return;
        ctx.drawImage(layer.canvas, sx * k, sy * k, sw * k, sh * k, sx + dx, sy + dy, sw, sh);
      },
    };
    ctx.save();
    try { dir.draw(ctx, r, nz, env); } catch (e) { console.error(dir.name, e); }
    ctx.restore();
  }

  const grid = document.getElementById('grid');
  let lastSet = null;
  const cards = DIRECTIONS.map((dir, i) => {
    if (dir.set && dir.set !== lastSet) {
      lastSet = dir.set;
      const h = document.createElement('div');
      h.className = 'set';
      h.innerHTML = `<h2>${dir.set}</h2>${window.SETS?.[dir.set] ? `<p>${window.SETS[dir.set]}</p>` : ''}`;
      grid.appendChild(h);
    }
    const fig = document.createElement('figure');
    fig.innerHTML = `<canvas></canvas><figcaption><div class="top"><span>${String(i + 1).padStart(2, '0')} · ${dir.from}</span><span class="seed"></span></div><div class="name">${dir.name}</div><p class="rule">${dir.rule}</p>${dir.data ? `<p class="data">Data could live in: ${dir.data}</p>` : ''}</figcaption>`;
    grid.appendChild(fig);
    const card = { dir, canvas: fig.querySelector('canvas'), seedEl: fig.querySelector('.seed'), seed: 0 };
    fig.addEventListener('click', () => openLB(i));
    return card;
  });

  // With a code on the page, each card reads itself back and reports.
  const readBack = (canvas) => (window.CODE && codeId !== null ? ' · ' + CODE.check(canvas, codeId).label : '');
  function drawCard(c) {
    c.seed = newSeed();
    render(c.canvas, c.dir, c.seed);
    c.seedEl.textContent = hex(c.seed) + readBack(c.canvas);
  }
  // One card per tick so the page fills in progressively.
  function drawAll() { cards.forEach((c, i) => setTimeout(() => drawCard(c), i * 16)); }
  document.getElementById('all').addEventListener('click', drawAll);
  const modes = document.querySelectorAll('[data-mode]');
  if (idInput) {
    const setId = (v) => { codeId = Math.max(0, Math.min(window.CODE ? CODE.MAX_ID : 1e9, Math.floor(Number(v) || 0))); idInput.value = codeId; drawAll(); };
    idInput.addEventListener('change', () => setId(idInput.value));
    document.getElementById('newId')?.addEventListener('click', () => setId(Math.floor(Math.random() * (CODE.MAX_ID + 1))));
  }
  if (ovInput) ovInput.addEventListener('change', () => { showOverlay = ovInput.checked; drawAll(); });
  modes.forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    modes.forEach((m) => m.classList.toggle('on', m === b));
    drawAll();
  }));
  drawAll();

  const lb = document.getElementById('lb'), big = document.getElementById('big'), lbt = document.getElementById('lbt');
  let cur = 0;
  function showLB() {
    const c = cards[cur];
    render(big, c.dir, c.seed, big.clientWidth);
    lbt.textContent = `${String(cur + 1).padStart(2, '0')} ${c.dir.name} · ${hex(c.seed)}${readBack(big)}`;
  }
  function openLB(i) { cur = i; lb.classList.add('on'); showLB(); }
  const move = (d) => { cur = (cur + d + cards.length) % cards.length; showLB(); };
  const redraw = () => { drawCard(cards[cur]); showLB(); };
  const close = () => lb.classList.remove('on');
  lb.querySelector('.prev').onclick = () => move(-1);
  lb.querySelector('.next').onclick = () => move(1);
  lb.querySelector('.redraw').onclick = redraw;
  lb.querySelector('.close').onclick = close;
  lb.querySelector('.save').onclick = () => {
    const c = cards[cur], out = document.createElement('canvas');
    render(out, c.dir, c.seed, 2400);
    const a = document.createElement('a');
    a.download = `glyphics-${c.dir.name.toLowerCase().replace(/\s+/g, '-')}-${hex(c.seed)}.png`;
    a.href = out.toDataURL('image/png'); a.click();
  };
  lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
  addEventListener('keydown', (e) => {
    if (!lb.classList.contains('on')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') move(-1);
    else if (e.key === 'ArrowRight') move(1);
    else if (e.key === 'r' || e.key === 'R') redraw();
  });
  window.GALLERY = { openLB, move, cards };
})();
