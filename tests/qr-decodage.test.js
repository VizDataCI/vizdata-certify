/* Décodage réel des QR codes produits.
 *
 * Le test qui manquait. L'ancien encodeur maison passait tous les contrôles de
 * structure — dimensions, motifs de repérage, motifs de synchronisation,
 * déterminisme — et produisait des codes qu'aucun lecteur ne décodait. Un QR
 * code imprimé sur un certificat vit des années : le défaut était irrattrapable
 * une fois la promotion partie.
 *
 * On décode donc pour de vrai, avec jsQR, le décodeur qu'emploient beaucoup
 * d'applications de scan.
 */

import test from "node:test";
import assert from "node:assert/strict";
import jsQR from "jsqr";
import { buildQR } from "../src/lib/qr.js";

/**
 * Rend la matrice en image RGBA, comme le ferait un écran ou une impression.
 * @param silence zone de silence en modules — la norme en exige 4
 * @param echelle pixels par module
 */
function versImage({ matrix, size }, silence = 4, echelle = 4) {
  const cote = (size + silence * 2) * echelle;
  const data = new Uint8ClampedArray(cote * cote * 4).fill(255);

  for (let y = 0; y < cote; y++) {
    for (let x = 0; x < cote; x++) {
      const mx = Math.floor(x / echelle) - silence;
      const my = Math.floor(y / echelle) - silence;
      const noir = mx >= 0 && my >= 0 && mx < size && my < size && matrix[my][mx];
      const i = (y * cote + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = noir ? 0 : 255;
    }
  }
  return { data, cote };
}

/** Décode la matrice et renvoie le contenu lu, ou null. */
function decoder(qr, options) {
  const { data, cote } = versImage(qr, options?.silence, options?.echelle);
  return jsQR(data, cote, cote)?.data ?? null;
}

const CAS = [
  ["texte court", "VIZDATA"],
  ["référence de certificat", "VIZ-2026-EXCEL-000001"],
  ["URL de vérification", "https://certify.vizdata.ci/verifier/d926399ce6fb4465a33e"],
  ["accents", "Certificat délivré à Mariam TOURÉ"],
  ["URL longue", "https://certify.vizdata.ci/verifier/" + "a".repeat(80)],
];

for (const [nom, contenu] of CAS) {
  test(`un lecteur décode : ${nom}`, () => {
    const qr = buildQR(contenu);
    assert.ok(qr, "aucune matrice produite");
    assert.equal(decoder(qr), contenu);
  });
}

test("la zone de silence réglementaire suffit", () => {
  /* La norme impose quatre modules de silence autour du code. En deçà, un
     lecteur peine à isoler le motif du fond. */
  const contenu = "https://certify.vizdata.ci/verifier/d926399ce6fb4465a33e";
  assert.equal(decoder(buildQR(contenu), { silence: 4 }), contenu);
});

test("le code reste lisible à petite échelle", () => {
  /* Trois pixels par module : l'ordre de grandeur d'un QR affiché à l'écran
     sur la page de vérification. */
  const contenu = "VIZ-2026-EXCEL-000001";
  assert.equal(decoder(buildQR(contenu), { echelle: 3 }), contenu);
});

test("la matrice ne contient que des 0 et des 1", () => {
  const { matrix } = buildQR("https://certify.vizdata.ci/verifier/abc");
  for (const ligne of matrix) {
    for (const module of ligne) {
      assert.ok(module === 0 || module === 1, "module hors de {0,1} : " + module);
    }
  }
});

test("un contenu hors de portée est refusé plutôt que tronqué", () => {
  assert.equal(buildQR("x".repeat(10000)), null);
});
