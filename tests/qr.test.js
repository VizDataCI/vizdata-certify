/* Structure des QR codes produits.
 *
 * Ces contrôles portent sur la géométrie : dimensions normalisées, motifs de
 * repérage aux trois coins, motifs de synchronisation. Ils ne prouvent pas
 * qu'un lecteur décode le code — l'ancien encodeur maison les passait tous en
 * produisant des matrices illisibles. C'est tests/qr-decodage.test.js qui rend
 * ce verdict-là.
 *
 * Ils gardent leur utilité : ils détectent une matrice retournée, transposée ou
 * décalée, et le message d'échec désigne alors directement le défaut.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { buildQR } from "../src/lib/qr.js";

/** Un QR de version v mesure 4v + 17 modules de côté. */
const cote = (version) => 4 * version + 17;

test("une chaîne courte tient dans la version 1", () => {
  const qr = buildQR("VIZDATA");
  assert.equal(qr.size, cote(1));
  assert.equal(qr.matrix.length, qr.size);
  assert.equal(qr.matrix[0].length, qr.size);
});

test("la version grandit avec la longueur du contenu", () => {
  const court = buildQR("abc");
  const long = buildQR("https://certify.vizdata.ci/verifier/71f47888728b4ab9b8f0");
  assert.ok(long.size > court.size, "une URL complète devrait demander une version supérieure");
});

test("les trois motifs de repérage sont en place", () => {
  const { matrix, size } = buildQR("https://certify.vizdata.ci/verifier/abc123");

  /* Un motif de repérage est un carré noir 7x7 à bordure blanche, aux coins
     haut-gauche, haut-droit et bas-gauche. On contrôle son anneau extérieur. */
  const coins = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];

  for (const [ligne, colonne] of coins) {
    for (let i = 0; i < 7; i++) {
      const bord = i === 0 || i === 6;
      assert.equal(matrix[ligne][colonne + i], 1, `bord haut du motif en ${ligne},${colonne}`);
      assert.equal(matrix[ligne + 6][colonne + i], 1, `bord bas du motif en ${ligne},${colonne}`);
      if (bord) continue;
      assert.equal(matrix[ligne + i][colonne], 1, `bord gauche du motif en ${ligne},${colonne}`);
      assert.equal(matrix[ligne + i][colonne + 6], 1, `bord droit du motif en ${ligne},${colonne}`);
    }
    /* Le carré central 3x3 est plein. */
    for (let i = 2; i < 5; i++) {
      for (let j = 2; j < 5; j++) {
        assert.equal(matrix[ligne + i][colonne + j], 1, "centre du motif de repérage");
      }
    }
  }
});

test("les motifs de synchronisation alternent", () => {
  const { matrix, size } = buildQR("VIZDATA CERTIFY");
  /* Ligne et colonne 6 alternent noir / blanc entre les motifs de repérage. */
  for (let i = 8; i < size - 8; i++) {
    assert.equal(matrix[6][i], i % 2 === 0 ? 1 : 0, `synchronisation horizontale en ${i}`);
    assert.equal(matrix[i][6], i % 2 === 0 ? 1 : 0, `synchronisation verticale en ${i}`);
  }
});

test("le résultat est déterministe", () => {
  const a = buildQR("VIZ-2026-EXCEL-000001");
  const b = buildQR("VIZ-2026-EXCEL-000001");
  assert.deepEqual(a.matrix, b.matrix);
});

test("deux contenus différents donnent deux matrices différentes", () => {
  const a = buildQR("VIZ-2026-EXCEL-000001");
  const b = buildQR("VIZ-2026-EXCEL-000002");
  assert.notDeepEqual(a.matrix, b.matrix);
});
