/* L'attribution d'une certification.
 *
 * Une règle, et ses deux exceptions. Un même programme ne se délivre qu'une
 * fois à la même personne tant qu'un certificat est EN VIGUEUR : deux
 * certificats actifs pour le même parcours ne veulent rien dire, et un
 * employeur ne saurait pas lequel fait foi.
 *
 * Mais un certificat révoqué ou annulé ne barre pas la route. Sans cela, une
 * révocation par erreur fermerait le programme à quelqu'un pour toujours, et
 * la seule issue serait d'ouvrir la base à la main.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { baseNeuve, compte, catalogue, certificat } from "./aide-base.mjs";
import { creerCertificat, certificatsDe } from "../server/registre.mjs";

function monde() {
  const { db, fermer } = baseNeuve();
  const acteur = { id: compte(db, { email: "direction@vizdata.ci", role: "ADMIN" }), first_name: "Direction", last_name: "VIZDATA" };
  const titulaire = compte(db, { email: "awa@vizdata.ci", prenom: "Awa", nom: "KONE" });
  const { programme } = catalogue(db);
  return { db, fermer, acteur, titulaire, programme };
}

test("une première attribution passe", () => {
  const { db, fermer, acteur, titulaire, programme } = monde();
  try {
    const cree = creerCertificat(db, acteur, { user_id: titulaire, certificate_type_id: programme });
    assert.match(cree.reference, /^VIZ-\d{4}-EXCEL-AVA-\d{6}$/);
    assert.equal(cree.status, "ACTIVE");
  } finally { fermer(); }
});

test("le même programme ne se délivre pas deux fois à la même personne", () => {
  const { db, fermer, acteur, titulaire, programme } = monde();
  try {
    creerCertificat(db, acteur, { user_id: titulaire, certificate_type_id: programme });
    assert.throws(
      () => creerCertificat(db, acteur, { user_id: titulaire, certificate_type_id: programme }),
      /détient déjà/
    );
    /* Et le refus ne laisse pas de trace : pas de demi-certificat en base. */
    assert.equal(certificatsDe(db, titulaire).length, 1);
  } finally { fermer(); }
});

test("le message nomme le certificat qui bloque", () => {
  const { db, fermer, acteur, titulaire, programme } = monde();
  try {
    const premier = creerCertificat(db, acteur, { user_id: titulaire, certificate_type_id: programme });
    assert.throws(
      () => creerCertificat(db, acteur, { user_id: titulaire, certificate_type_id: programme }),
      new RegExp(premier.reference)
    );
  } finally { fermer(); }
});

test("un certificat révoqué ne barre pas la route", () => {
  const { db, fermer, acteur, titulaire, programme } = monde();
  try {
    certificat(db, { titulaire, programme, statut: "REVOKED", motif: "Erreur de saisie" });
    const second = creerCertificat(db, acteur, { user_id: titulaire, certificate_type_id: programme });
    assert.equal(second.status, "ACTIVE");
    assert.equal(certificatsDe(db, titulaire).length, 2);
  } finally { fermer(); }
});

test("un certificat annulé ne barre pas la route non plus", () => {
  const { db, fermer, acteur, titulaire, programme } = monde();
  try {
    certificat(db, { titulaire, programme, statut: "CANCELLED" });
    assert.ok(creerCertificat(db, acteur, { user_id: titulaire, certificate_type_id: programme }));
  } finally { fermer(); }
});

test("la règle ne vaut que pour le même programme", () => {
  const { db, fermer, acteur, titulaire, programme } = monde();
  try {
    const autre = catalogue(db, { codeDomaine: "PBI", codeProgramme: "PBI-ANA" }).programme;
    creerCertificat(db, acteur, { user_id: titulaire, certificate_type_id: programme });
    assert.ok(creerCertificat(db, acteur, { user_id: titulaire, certificate_type_id: autre }));
    assert.equal(certificatsDe(db, titulaire).length, 2);
  } finally { fermer(); }
});

test("la règle ne vaut que pour la même personne", () => {
  const { db, fermer, acteur, titulaire, programme } = monde();
  try {
    const serge = compte(db, { email: "serge@vizdata.ci" });
    creerCertificat(db, acteur, { user_id: titulaire, certificate_type_id: programme });
    assert.ok(creerCertificat(db, acteur, { user_id: serge, certificate_type_id: programme }));
  } finally { fermer(); }
});

/* --- ce que le titulaire voit de son côté ---------------------------------- */

test("le titulaire reçoit le nombre de consultations de chaque certificat", () => {
  const { db, fermer, acteur, titulaire, programme } = monde();
  try {
    const cree = creerCertificat(db, acteur, { user_id: titulaire, certificate_type_id: programme });

    /* Zéro se dit : « pas encore consulté » est une information, et une
       absence de champ passerait pour une panne côté écran. */
    assert.equal(certificatsDe(db, titulaire)[0].verifications, 0);

    for (let i = 0; i < 3; i++) {
      db.prepare("insert into verifications (id, certificate_id, source) values (?, ?, 'qr')")
        .run("v" + i + "-" + Date.now(), cree.id);
    }
    assert.equal(certificatsDe(db, titulaire)[0].verifications, 3);
  } finally { fermer(); }
});

test("les consultations d'un autre certificat ne sont pas comptées ici", () => {
  const { db, fermer, acteur, titulaire, programme } = monde();
  try {
    const mien = creerCertificat(db, acteur, { user_id: titulaire, certificate_type_id: programme });
    const serge = compte(db, { email: "serge@vizdata.ci" });
    const sien = creerCertificat(db, acteur, { user_id: serge, certificate_type_id: programme });

    db.prepare("insert into verifications (id, certificate_id, source) values ('v-serge', ?, 'qr')").run(sien.id);
    assert.equal(certificatsDe(db, titulaire)[0].verifications, 0);
    assert.equal(certificatsDe(db, serge)[0].verifications, 1);
    assert.ok(mien.id !== sien.id);
  } finally { fermer(); }
});
