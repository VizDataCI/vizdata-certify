/* Fabrique le logo VIZDATA en PNG, pour les courriels.
 *
 * Pourquoi un PNG, et pourquoi le fabriquer ici
 * ---------------------------------------------
 * Les messageries ne rendent pas le SVG : Gmail le supprime, Outlook ne l'a
 * jamais su. Il faut donc une image matricielle. Plutôt que d'en déposer une
 * au hasard dans le dépôt, elle est dessinée à partir de la même géométrie que
 * le composant `VizdataMark` : une seule définition de la marque, et le jour
 * où elle change, ce fichier la suit.
 *
 * Le rendu se fait par distance : pour chaque point, on mesure l'écart aux
 * segments et aux disques qui composent la marque. C'est ce qui donne des
 * extrémités rondes exactes, là où un tracé par pixels ferait des escaliers.
 * Trois échantillons par côté lissent les bords.
 *
 *   node scripts/logo-courriel.mjs
 */

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const TEAL = [30, 127, 166];
const VIOLET = [74, 42, 99];
const ORANGE = [242, 140, 40];
const BLANC = [255, 255, 255];

/* La géométrie du composant, à l'identique. */
const R = 19;
const W = 13;
const HAUT = [[17, 72], [70, 18], [128, 73], [182, 18]];
const BAS = [[71, 67], [127, 121], [182, 67]];

/* Ordre de dessin : branche haute, pastille orange, réserve blanche, branche
   basse. La réserve est ce qui sépare visuellement les deux branches. */
const COUCHES = [
  { points: HAUT, rayon: W / 2, disques: R, couleur: TEAL },
  { points: [], rayon: 0, disques: R, couleur: ORANGE, seuls: [[126, 20]] },
  { points: BAS, rayon: (W + 13) / 2, disques: R + 6.5, couleur: BLANC },
  { points: BAS, rayon: W / 2, disques: R, couleur: VIOLET },
];

/** Distance d'un point à un segment. */
function distSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const long2 = dx * dx + dy * dy;
  let t = long2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / long2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Couleur d'un point, ou null s'il n'appartient à aucune couche. */
function couleurEn(x, y) {
  let couleur = null;
  for (const c of COUCHES) {
    let dedans = false;
    for (let i = 0; i + 1 < c.points.length && !dedans; i++) {
      if (distSegment(x, y, c.points[i], c.points[i + 1]) <= c.rayon) dedans = true;
    }
    for (const [cx, cy] of [...c.points, ...(c.seuls || [])]) {
      if (Math.hypot(x - cx, y - cy) <= c.disques) { dedans = true; break; }
    }
    if (dedans) couleur = c.couleur;
  }
  return couleur;
}

/* --- rendu ---------------------------------------------------------------- */

const VB = { x: -6, y: -6, w: 213, h: 152 };
const LARGEUR = 240;
const HAUTEUR = Math.round((LARGEUR * VB.h) / VB.w);
const ECH = 3; // échantillons par côté

const pixels = Buffer.alloc(LARGEUR * HAUTEUR * 3, 255);
for (let py = 0; py < HAUTEUR; py++) {
  for (let px = 0; px < LARGEUR; px++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < ECH; sy++) {
      for (let sx = 0; sx < ECH; sx++) {
        const ux = VB.x + ((px + (sx + 0.5) / ECH) / LARGEUR) * VB.w;
        const uy = VB.y + ((py + (sy + 0.5) / ECH) / HAUTEUR) * VB.h;
        const c = couleurEn(ux, uy) || BLANC;
        r += c[0]; g += c[1]; b += c[2];
      }
    }
    const n = ECH * ECH;
    const i = (py * LARGEUR + px) * 3;
    pixels[i] = Math.round(r / n);
    pixels[i + 1] = Math.round(g / n);
    pixels[i + 2] = Math.round(b / n);
  }
}

/* --- encodage PNG --------------------------------------------------------- */

const TABLE_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = ~0;
  for (const o of buf) c = TABLE_CRC[(c ^ o) & 255] ^ (c >>> 8);
  return (~c) >>> 0;
};

const bloc = (nom, data) => {
  const taille = Buffer.alloc(4);
  taille.writeUInt32BE(data.length);
  const n = Buffer.from(nom);
  const somme = Buffer.alloc(4);
  somme.writeUInt32BE(crc32(Buffer.concat([n, data])));
  return Buffer.concat([taille, n, data, somme]);
};

const stride = LARGEUR * 3;
const brut = Buffer.alloc(HAUTEUR * (stride + 1));
for (let y = 0; y < HAUTEUR; y++) {
  brut[y * (stride + 1)] = 0; // filtre « aucun »
  pixels.copy(brut, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(LARGEUR, 0);
ihdr.writeUInt32BE(HAUTEUR, 4);
ihdr[8] = 8;  // 8 bits par canal
ihdr[9] = 2;  // couleur vraie, sans alpha : le fond des courriels est blanc

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  bloc("IHDR", ihdr),
  bloc("IDAT", deflateSync(brut, { level: 9 })),
  bloc("IEND", Buffer.alloc(0)),
]);

writeFileSync(new URL("../public/logo-courriel.png", import.meta.url), png);
console.log(`  logo-courriel.png  ${LARGEUR}×${HAUTEUR}  ${Math.round(png.length / 1024)} ko`);
