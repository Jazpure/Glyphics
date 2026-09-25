/* Reed–Solomon over GF(256), primitive polynomial 0x11d, generator α = 2.
   The same family of codes QR uses. `encode(msg, nsym)` appends nsym parity
   bytes; `decode(block, nsym)` corrects up to nsym / 2 byte errors or returns
   null. Blocks (message + parity) must be at most 255 bytes.
   Follows the Wikiversity "Reed–Solomon codes for coders" construction:
   Berlekamp–Massey for the locator, Chien search, Forney for magnitudes. */
(function () {
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  const div = (a, b) => (a ? EXP[(LOG[a] + 255 - LOG[b]) % 255] : 0);
  const pow = (a, n) => EXP[(((LOG[a] * n) % 255) + 255) % 255];
  const inv = (a) => EXP[255 - LOG[a]];

  const pScale = (p, x) => p.map((c) => mul(c, x));
  function pAdd(p, q) {
    const r = new Array(Math.max(p.length, q.length)).fill(0);
    p.forEach((c, i) => { r[i + r.length - p.length] = c; });
    q.forEach((c, i) => { r[i + r.length - q.length] ^= c; });
    return r;
  }
  function pMul(p, q) {
    const r = new Array(p.length + q.length - 1).fill(0);
    for (let j = 0; j < q.length; j++) for (let i = 0; i < p.length; i++) r[i + j] ^= mul(p[i], q[j]);
    return r;
  }
  function pEval(p, x) { let y = p[0]; for (let i = 1; i < p.length; i++) y = mul(y, x) ^ p[i]; return y; }
  function pDiv(dividend, divisor) {
    const out = dividend.slice();
    for (let i = 0; i < dividend.length - (divisor.length - 1); i++) {
      const c = out[i];
      if (c) for (let j = 1; j < divisor.length; j++) if (divisor[j]) out[i + j] ^= mul(divisor[j], c);
    }
    const sep = out.length - (divisor.length - 1);
    return [out.slice(0, sep), out.slice(sep)];
  }
  const genCache = {};
  function generator(nsym) {
    if (genCache[nsym]) return genCache[nsym];
    let g = [1];
    for (let i = 0; i < nsym; i++) g = pMul(g, [1, pow(2, i)]);
    return (genCache[nsym] = g);
  }

  function encode(msg, nsym) {
    const gen = generator(nsym), out = Array.from(msg).concat(new Array(nsym).fill(0));
    for (let i = 0; i < msg.length; i++) {
      const c = out[i];
      if (c) for (let j = 1; j < gen.length; j++) out[i + j] ^= mul(gen[j], c);
    }
    return Uint8Array.from(Array.from(msg).concat(out.slice(msg.length)));
  }

  const syndromes = (msg, nsym) => [0].concat(Array.from({ length: nsym }, (_, i) => pEval(msg, pow(2, i))));
  function errorLocator(synd, nsym) {
    let loc = [1], old = [1];
    const shift = synd.length - nsym;
    for (let i = 0; i < nsym; i++) {
      const K = i + shift;
      let delta = synd[K];
      for (let j = 1; j < loc.length; j++) delta ^= mul(loc[loc.length - 1 - j], synd[K - j]);
      old = old.concat([0]);
      if (delta) {
        if (old.length > loc.length) { const nl = pScale(old, delta); old = pScale(loc, inv(delta)); loc = nl; }
        loc = pAdd(loc, pScale(old, delta));
      }
    }
    while (loc.length && loc[0] === 0) loc.shift();
    if ((loc.length - 1) * 2 > nsym) return null;
    return loc;
  }
  function findErrors(locRev, n) {
    const errs = locRev.length - 1, pos = [];
    for (let i = 0; i < n; i++) if (pEval(locRev, pow(2, i)) === 0) pos.push(n - 1 - i);
    return pos.length === errs ? pos : null;
  }
  function correct(msg, synd, pos) {
    const coef = pos.map((p) => msg.length - 1 - p);
    let eloc = [1];
    for (const i of coef) eloc = pMul(eloc, pAdd([1], [pow(2, i), 0]));
    const [, rem] = pDiv(pMul(synd.slice().reverse(), eloc), [1].concat(new Array(eloc.length).fill(0)));
    const evalr = rem.reverse(), X = coef.map((c) => pow(2, -(255 - c))), E = new Array(msg.length).fill(0);
    X.forEach((Xi, i) => {
      const Xinv = inv(Xi);
      let prime = 1;
      X.forEach((Xj, j) => { if (j !== i) prime = mul(prime, 1 ^ mul(Xinv, Xj)); });
      const y = mul(Xi, pEval(evalr.slice().reverse(), Xinv));
      E[pos[i]] = div(y, prime);
    });
    return pAdd(msg, E);
  }
  // Returns the corrected message (without parity), or null if uncorrectable.
  function decode(block, nsym) {
    let msg = Array.from(block);
    let synd = syndromes(msg, nsym);
    if (Math.max(...synd) === 0) return Uint8Array.from(msg.slice(0, -nsym));
    const loc = errorLocator(synd, nsym);
    if (!loc) return null;
    const pos = findErrors(loc.slice().reverse(), msg.length);
    if (!pos) return null;
    msg = correct(msg, synd, pos);
    synd = syndromes(msg, nsym);
    if (Math.max(...synd) > 0) return null;
    return Uint8Array.from(msg.slice(0, -nsym));
  }

  window.RS = { encode, decode };
})();
