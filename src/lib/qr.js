/* Générateur de QR code — mode octet, correction M, versions 1 à 6.
   Implémentation autonome, sans dépendance externe. */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

const gmul = (a, b) => (a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]);

function rsGenPoly(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= gmul(g[j], GF_EXP[i]);
    }
    g = next;
  }
  return g;
}

function rsEncode(data, ecLen) {
  const gen = rsGenPoly(ecLen);
  const res = new Array(data.length + ecLen).fill(0);
  for (let i = 0; i < data.length; i++) res[i] = data[i];
  for (let i = 0; i < data.length; i++) {
    const c = res[i];
    if (c === 0) continue;
    for (let j = 0; j < gen.length; j++) res[i + j] ^= gmul(gen[j], c);
  }
  return res.slice(data.length);
}

const QR_SPECS = {
  1: { dp: [16], ec: 10 },
  2: { dp: [28], ec: 16 },
  3: { dp: [44], ec: 26 },
  4: { dp: [32, 32], ec: 18 },
  5: { dp: [43, 43], ec: 24 },
  6: { dp: [27, 27, 27, 27], ec: 16 },
};

const MASK_FNS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => ((((r * c) % 2) + ((r * c) % 3)) % 2) === 0,
  (r, c) => ((((r + c) % 2) + ((r * c) % 3)) % 2) === 0,
];

function formatBits(mask) {
  // Niveau M => bits 00
  const d = (0b00 << 3) | mask;
  let v = d << 10;
  for (let i = 14; i >= 10; i--) {
    if ((v >> i) & 1) v ^= 0b10100110111 << (i - 10);
  }
  return ((d << 10) | v) ^ 0b101010000010010;
}

function penalty(m, size) {
  let p = 0;
  // Règle 1 : suites de 5 modules identiques
  const run = (get) => {
    for (let a = 0; a < size; a++) {
      let last = -1, len = 0;
      for (let b = 0; b < size; b++) {
        const v = get(a, b);
        if (v === last) len++;
        else { if (len >= 5) p += 3 + (len - 5); last = v; len = 1; }
      }
      if (len >= 5) p += 3 + (len - 5);
    }
  };
  run((a, b) => m[a][b]);
  run((a, b) => m[b][a]);
  // Règle 2 : blocs 2x2
  for (let r = 0; r < size - 1; r++)
    for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3;
    }
  // Règle 4 : proportion de modules sombres
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += m[r][c];
  const ratio = (dark * 100) / (size * size);
  p += Math.floor(Math.abs(ratio - 50) / 5) * 10;
  return p;
}

function buildQR(text) {
  const bytes = Array.from(new TextEncoder().encode(text));
  let ver = 0;
  for (let v = 1; v <= 6; v++) {
    const cap = QR_SPECS[v].dp.reduce((a, b) => a + b, 0) - 2;
    if (bytes.length <= cap) { ver = v; break; }
  }
  if (!ver) return null;

  const spec = QR_SPECS[ver];
  const totalData = spec.dp.reduce((a, b) => a + b, 0);

  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(4, 4);
  push(bytes.length, 8);
  bytes.forEach((b) => push(b, 8));
  const capBits = totalData * 8;
  for (let i = 0; i < 4 && bits.length < capBits; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);

  const dataCw = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataCw.push(b);
  }
  const pads = [0xec, 0x11];
  let pi = 0;
  while (dataCw.length < totalData) dataCw.push(pads[pi++ % 2]);

  const blocks = [], ecBlocks = [];
  let off = 0;
  spec.dp.forEach((n) => {
    const blk = dataCw.slice(off, off + n);
    off += n;
    blocks.push(blk);
    ecBlocks.push(rsEncode(blk, spec.ec));
  });

  const finalCw = [];
  const maxD = Math.max(...spec.dp);
  for (let i = 0; i < maxD; i++) blocks.forEach((b) => { if (i < b.length) finalCw.push(b[i]); });
  for (let i = 0; i < spec.ec; i++) ecBlocks.forEach((b) => finalCw.push(b[i]));

  const size = 17 + 4 * ver;
  const val = Array.from({ length: size }, () => new Array(size).fill(0));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const put = (r, c, v) => { val[r][c] = v; fn[r][c] = true; };

  [[0, 0], [0, size - 7], [size - 7, 0]].forEach(([r, c]) => {
    for (let i = -1; i <= 7; i++)
      for (let j = -1; j <= 7; j++) {
        const rr = r + i, cc = c + j;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        let v = 0;
        if (i >= 0 && i <= 6 && j >= 0 && j <= 6) {
          const ring = i === 0 || i === 6 || j === 0 || j === 6;
          const core = i >= 2 && i <= 4 && j >= 2 && j <= 4;
          v = ring || core ? 1 : 0;
        }
        put(rr, cc, v);
      }
  });

  for (let i = 8; i < size - 8; i++) {
    put(6, i, i % 2 === 0 ? 1 : 0);
    put(i, 6, i % 2 === 0 ? 1 : 0);
  }

  if (ver >= 2) {
    const r = size - 7, c = size - 7;
    for (let i = -2; i <= 2; i++)
      for (let j = -2; j <= 2; j++) {
        const ring = Math.max(Math.abs(i), Math.abs(j));
        put(r + i, c + j, ring === 1 ? 0 : 1);
      }
  }

  for (let i = 0; i < 9; i++) {
    if (!fn[8][i]) put(8, i, 0);
    if (!fn[i][8]) put(i, 8, 0);
  }
  for (let i = 0; i < 8; i++) {
    put(8, size - 1 - i, 0);
    put(size - 1 - i, 8, 0);
  }
  put(size - 8, 8, 1);

  const dataBits = [];
  finalCw.forEach((b) => { for (let i = 7; i >= 0; i--) dataBits.push((b >> i) & 1); });

  let bitIdx = 0, up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let k = 0; k < size; k++) {
      const row = up ? size - 1 - k : k;
      for (let d = 0; d < 2; d++) {
        const c = col - d;
        if (fn[row][c]) continue;
        val[row][c] = bitIdx < dataBits.length ? dataBits[bitIdx++] : 0;
      }
    }
    up = !up;
  }

  let best = null, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = val.map((row) => row.slice());
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (!fn[r][c] && MASK_FNS[mask](r, c)) m[r][c] ^= 1;

    const fmt = formatBits(mask);
    for (let i = 0; i < 15; i++) {
      const bit = (fmt >> i) & 1;
      if (i < 6) m[8][i] = bit;
      else if (i < 8) m[8][i + 1] = bit;
      else if (i === 8) m[7][8] = bit;
      else m[14 - i][8] = bit;
      if (i < 7) m[size - 1 - i][8] = bit;
      else m[8][size - 15 + i] = bit;
    }
    m[size - 8][8] = 1;

    const sc = penalty(m, size);
    if (sc < bestScore) { bestScore = sc; best = m; }
  }
  return { matrix: best, size };
}

export { buildQR };
