/* Glyphics camera view: the camera fills the screen with only the Glyphics
   logo over it; a read code shows what it points to (a picture or a link) in
   a popup with a close button. Opened by the home page once the camera is
   allowed there, and by scan/ on its own.

   Needs lib.js, rs.js, tilecode.js and scan.js loaded first. */
(function () {
  const here = document.currentScript.src, V = (here.match(/\?.*$/) || [''])[0];
  const CSS = `
    .gx-scan { position: fixed; inset: 0; z-index: 100; background: #000; color: #fff; font: 16px/1.45 system-ui, -apple-system, sans-serif; overflow: hidden; }
    /* The camera is shown on a canvas laid over the video element, so nothing
       the browser draws on a video (play or pause icons) is ever visible. The
       video stays full size underneath: iOS pauses videos it thinks are off screen. */
    .gx-scan video, .gx-scan .gx-view { position: absolute; inset: 0; width: 100%; height: 100%; }
    .gx-scan video { object-fit: cover; }
    .gx-scan .gx-view { z-index: 1; background: #000; opacity: 0; transition: opacity 0.2s; }
    .gx-scan .gx-view.live { opacity: 1; }
    .gx-scan video::-webkit-media-controls, .gx-scan video::-webkit-media-controls-start-playback-button, .gx-scan video::-webkit-media-controls-overlay-play-button { display: none !important; -webkit-appearance: none; }
    .gx-scan .gx-logo { position: absolute; top: calc(14px + env(safe-area-inset-top)); left: 16px; z-index: 6; color: #fff; text-decoration: none; font-weight: 700; font-size: 18px; text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6); }
    .gx-scan .gx-pop { position: absolute; inset: 0; z-index: 4; display: grid; place-items: center; padding: calc(56px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom)); background: rgba(0, 0, 0, 0.5); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
    .gx-scan .gx-card { position: relative; max-width: min(100%, 760px); max-height: 100%; display: flex; }
    .gx-scan .gx-card img { display: block; max-width: 100%; max-height: calc(100vh - 120px); max-height: calc(100dvh - 120px); border-radius: 6px; background: #111; }
    .gx-scan .gx-card a { display: block; padding: 28px 24px; border-radius: 6px; background: #fff; color: #000; font-size: 20px; overflow-wrap: anywhere; text-align: center; }
    .gx-scan .gx-note { padding: 22px 28px; border-radius: 6px; background: #fff; color: #000; }
    .gx-scan .gx-close { position: absolute; top: -14px; right: -14px; width: 40px; height: 40px; padding: 0; border: 0; border-radius: 50%; font: 24px/40px system-ui, sans-serif; background: #fff; color: #000; cursor: pointer; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35); }
    .gx-scan .gx-debug { position: absolute; left: 8px; bottom: calc(8px + env(safe-area-inset-bottom)); z-index: 5; margin: 0; padding: 6px 8px; background: rgba(0, 0, 0, 0.6); color: #0f0; font: 11px ui-monospace, Menlo, monospace; white-space: pre; }
    .gx-scan [hidden] { display: none !important; }`;

  // The camera, or with ?test a simulated one showing a code.
  async function request() {
    const q = new URLSearchParams(location.search);
    if (q.has('test')) return testStream(q);
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false });
  }

  let view = null;
  // Open the camera view on a stream. onLeave runs when the logo is tapped
  // (the home page uses it to go back); without it the logo is a plain link home.
  function open(stream, { onLeave } = {}) {
    if (view) return;
    if (!document.getElementById('gx-scan-css')) { const st = document.createElement('style'); st.id = 'gx-scan-css'; st.textContent = CSS; document.head.append(st); }
    const DEBUG = new URLSearchParams(location.search).has('debug');
    const el = document.createElement('div'); el.className = 'gx-scan';
    el.innerHTML = `<video playsinline muted autoplay disablepictureinpicture></video><canvas class="gx-view"></canvas><a class="gx-logo" href="/">Glyphics</a>
      <div class="gx-pop" hidden><div class="gx-card"><div class="gx-content"></div><button class="gx-close" aria-label="Close">×</button></div></div><pre class="gx-debug" ${DEBUG ? '' : 'hidden'}></pre>`;
    document.body.append(el);
    const $ = (s) => el.querySelector(s), video = $('video'), canvas = $('.gx-view'), vx = canvas.getContext('2d');
    const grab = document.createElement('canvas'), gx = grab.getContext('2d', { willReadFrequently: true });
    const S = { el, stream, running: true, busy: false, popped: false, last: { id: null, until: 0 } };
    view = S;
    if (onLeave) $('.gx-logo').addEventListener('click', (e) => { e.preventDefault(); onLeave(); });

    // Reading runs in a worker so the camera view stays smooth.
    const reader = (() => {
      const waiting = new Map(); let seq = 0, w = null;
      try {
        w = new Worker(new URL('worker.js', here).href.split('?')[0] + V);
        w.onmessage = ({ data }) => { const f = waiting.get(data.id); waiting.delete(data.id); if (f) f(data.r); };
        w.onerror = () => { w = null; waiting.forEach((f) => f({ found: false })); waiting.clear(); };
      } catch { w = null; }
      const local = SCAN.session();
      return {
        read(px, W, H) {
          if (!w) { const dbg = {}, r = local.frame(new Uint8ClampedArray(px), W, H, dbg); return Promise.resolve({ ...r, dbg }); }
          const id = ++seq;
          return new Promise((res) => { waiting.set(id, res); w.postMessage({ id, px, W, H }, [px]); });
        },
        reset() { local.reset(); if (w) w.postMessage({ reset: true }); },
        stop() { if (w) w.terminate(); },
      };
    })();
    S.reader = reader;

    // What a code points to: the site's store, then the list kept with the site.
    let listed = null;
    async function lookup(id) {
      const r = await fetch('/api/codes/' + id).catch(() => null);
      if (r && r.ok && (r.headers.get('Content-Type') || '').includes('json')) { const e = await r.json().catch(() => null); if (e && e.type) return e; }
      if (!listed) listed = await fetch('/codes.json').then((x) => (x.ok ? x.json() : {})).catch(() => ({}));
      return (listed.codes || {})[id] || null;
    }
    async function show(id) {
      S.popped = true;
      const box = $('.gx-content'); box.replaceChildren();
      const e = await lookup(id);
      if (!S.popped || view !== S) return;
      if (e && e.type === 'image' && e.src) {
        const img = new Image(); img.alt = 'Image'; img.src = new URL(e.src, location.href).href; box.append(img);
      } else if (e && e.type === 'url' && /^https?:\/\//.test(e.url || '')) {
        const a = document.createElement('a'); a.href = e.url; a.textContent = e.url; a.target = '_blank'; a.rel = 'noopener'; box.append(a);
      } else {
        const p = document.createElement('div'); p.className = 'gx-note'; p.textContent = 'Not found'; box.append(p);
      }
      $('.gx-pop').hidden = false;
    }
    // Closing goes back to scanning; the same code is left alone for a moment.
    $('.gx-close').addEventListener('click', () => { $('.gx-pop').hidden = true; S.popped = false; reader.reset(); S.last.until = performance.now() + 2500; });

    function paint() {
      if (video.readyState < 2 || !video.videoWidth) return;
      const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const s = Math.max(w / video.videoWidth, h / video.videoHeight), dw = video.videoWidth * s, dh = video.videoHeight * s;
      vx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
      canvas.classList.add('live');
    }
    // Frames go to the reader at up to 2048 px on the long side, whenever it is free.
    function tick() {
      if (!S.running) return;
      paint();
      if (!S.busy && !S.popped && video.readyState >= 2 && video.videoWidth) {
        const k = Math.min(1, 2048 / Math.max(video.videoWidth, video.videoHeight)), W = Math.round(video.videoWidth * k), H = Math.round(video.videoHeight * k);
        if (grab.width !== W || grab.height !== H) { grab.width = W; grab.height = H; }
        gx.drawImage(video, 0, 0, W, H);
        S.busy = true;
        const t0 = performance.now();
        reader.read(gx.getImageData(0, 0, W, H).data.buffer, W, H).then((r) => {
          S.busy = false;
          if (DEBUG) $('.gx-debug').textContent = `${video.videoWidth}×${video.videoHeight} → ${W}×${H}  ${Math.round(performance.now() - t0)} ms\nblobs ${r.dbg?.blobs ?? '-'}  step ${r.dbg?.step ?? '-'}  stages ${r.dbg?.stages ?? '-'}  ${r.found ? 'grid' : 'no grid'}  ${r.id || ''}${r.dbg?.error ? '\n' + r.dbg.error : ''}`;
          if (!r.id || S.popped || !S.running) return;
          if (r.id === S.last.id && performance.now() < S.last.until) return;
          S.last = { id: r.id, until: 0 };
          show(r.id);
        });
      }
      requestAnimationFrame(tick);
    }
    video.srcObject = stream;
    video.play().catch(() => {}).then(() => requestAnimationFrame(tick));
  }
  // Close the view and let go of the camera.
  function close() {
    if (!view) return;
    const S = view; view = null; S.running = false;
    S.stream.getTracks().forEach((t) => t.stop());
    S.reader.stop(); S.el.remove();
  }
  const isOpen = () => !!view;

  // Test mode (?test&id=…&dark): a simulated camera showing a code that drifts and turns.
  async function testStream(q) {
    if (!window.TILES) await new Promise((res) => { const s = document.createElement('script'); s.src = new URL('../sketches/r9/tiles.js', here).href; s.onload = res; document.head.append(s); });
    const code = document.createElement('canvas'), k = 2400 / TILECODE.CW; code.width = 2400; code.height = Math.round(TILECODE.CH * k);
    const cx = code.getContext('2d'); cx.setTransform(k, 0, 0, k, 0, 0); TILECODE.draw(cx, { id: q.get('id') || '14e6429ddf1facae', seed: 5 });
    const cam = document.createElement('canvas'); cam.width = 1080; cam.height = 1920; const g = cam.getContext('2d'), t0 = performance.now();
    (function paint() {
      const t = (performance.now() - t0) / 1000;
      g.fillStyle = q.has('dark') ? '#0b0b0d' : '#d8d4cc'; g.fillRect(0, 0, 1080, 1920);
      g.save(); g.translate(540 + Math.sin(t * 0.4) * 14, 960 + Math.cos(t * 0.3) * 10); g.rotate(Math.sin(t * 0.2) * 0.06); g.scale(0.42, 0.42);
      g.filter = 'blur(1.4px)'; g.drawImage(code, -1200, -code.height / 2); g.restore();
      requestAnimationFrame(paint);
    })();
    return cam.captureStream(30);
  }

  window.SCANNER = { request, open, close, isOpen };
})();
