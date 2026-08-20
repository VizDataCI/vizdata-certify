/* Règles métier du certificat.
 *
 * effectiveStatus porte le principe central du produit — le statut n'est pas
 * stocké, il est calculé — et la même règle existe côté base dans
 * effective_status(). Les deux doivent rester d'accord.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { effectiveStatus, nextReference, slugify, STATUS_META } from "../src/lib/certificates.js";

const jours = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

test("un certificat sans expiration reste valide", () => {
  assert.equal(effectiveStatus({ status: "ACTIVE", expiry_date: null }), "ACTIVE");
});

test("un certificat dont l'échéance est passée bascule seul en expiré", () => {
  assert.equal(effectiveStatus({ status: "ACTIVE", expiry_date: jours(-1) }), "EXPIRED");
});

test("une échéance à venir laisse le certificat valide", () => {
  assert.equal(effectiveStatus({ status: "ACTIVE", expiry_date: jours(30) }), "ACTIVE");
});

test("une révocation prime sur la date", () => {
  assert.equal(effectiveStatus({ status: "REVOKED", expiry_date: jours(365) }), "REVOKED");
  assert.equal(effectiveStatus({ status: "CANCELLED", expiry_date: jours(-365) }), "CANCELLED");
});

test("chaque statut possible a un libellé et une couleur", () => {
  for (const statut of ["ACTIVE", "EXPIRED", "REVOKED", "CANCELLED"]) {
    assert.ok(STATUS_META[statut]?.label, `libellé manquant pour ${statut}`);
    assert.ok(STATUS_META[statut]?.tone, `couleur manquante pour ${statut}`);
  }
});

test("la numérotation suit le format VIZ-ANNÉE-CODE-NUMÉRO", () => {
  assert.equal(nextReference([], "EXCEL", 2026), "VIZ-2026-EXCEL-000001");
});

test("la numérotation reprend après le plus grand numéro existant", () => {
  const registre = [
    { reference: "VIZ-2026-EXCEL-000001" },
    { reference: "VIZ-2026-EXCEL-000009" },
    { reference: "VIZ-2026-EXCEL-000004" },
  ];
  assert.equal(nextReference(registre, "EXCEL", 2026), "VIZ-2026-EXCEL-000010");
});

test("chaque couple code / année a sa propre suite", () => {
  const registre = [{ reference: "VIZ-2026-EXCEL-000007" }, { reference: "VIZ-2025-PBI-000003" }];
  assert.equal(nextReference(registre, "PBI", 2026), "VIZ-2026-PBI-000001");
  assert.equal(nextReference(registre, "EXCEL", 2025), "VIZ-2025-EXCEL-000001");
});

test("l'identifiant public retire accents, majuscules et ponctuation", () => {
  assert.equal(slugify("Awa DIALLO"), "awa-diallo");
  assert.equal(slugify("Serge N'GUESSAN"), "serge-n-guessan");
  assert.equal(slugify("  Mariam   TOURÉ  "), "mariam-toure");
  assert.equal(slugify("Fabrice BOH"), "fabrice-boh");
});
