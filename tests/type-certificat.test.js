/* Les deux types de certificat : participation et compétences.
 *
 * La distinction porte sur ce que le document AFFIRME. Un certificat de
 * participation atteste une présence ; un certificat de compétences atteste
 * une évaluation. Confondre les deux ferait dire au document plus qu'il ne
 * sait, et c'est exactement la phrase qu'un employeur lit.
 *
 * D'où ce que ces tests tiennent : le type est enregistré, il remonte dans la
 * vue publique que lisent le document et la page de vérification, une valeur
 * inconnue retombe sur « compétences » plutôt que de casser, et un certificat
 * de participation ne porte AUCUNE compétence : même si l'appel en propose.
 * Cette dernière règle n'est pas une coquetterie : les compétences sont
 * affichées sur la page publique, où elles seraient lues comme validées.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { baseNeuve, compte, catalogue } from "./aide-base.mjs";
import { uid } from "../server/db.mjs";
import { creerCertificat, majCertificat, certificatsDe } from "../server/registre.mjs";
import { TYPES_CERTIFICAT, typeCertificat } from "../src/lib/certificates.js";

function monde() {
  const { db, fermer } = baseNeuve();
  const acteur = { id: compte(db, { email: "direction@vizdata.ci", role: "ADMIN" }), first_name: "Direction", last_name: "VIZDATA" };
  const titulaire = compte(db, { email: "awa@vizdata.ci", prenom: "Awa", nom: "KONE" });
  const { programme } = catalogue(db);
  const competence = uid();
  db.prepare("insert into skills (id, name) values (?, ?)").run(competence, "Tableaux croisés dynamiques");
  return { db, fermer, acteur, titulaire, programme, competence };
}

const vuePublique = (db, id) => db.prepare("select * from v_certificats_publics where id = ?").get(id);

test("sans précision, le certificat atteste des compétences", () => {
  const { db, fermer, acteur, titulaire, programme } = monde();
  try {
    const cree = creerCertificat(db, acteur, { user_id: titulaire, certificate_type_id: programme });
    assert.equal(cree.kind, "COMPETENCES");
    assert.equal(vuePublique(db, cree.id).kind, "COMPETENCES");
  } finally { fermer(); }
});

test("un certificat de participation est enregistré comme tel, et la vue publique le dit", () => {
  const { db, fermer, acteur, titulaire, programme } = monde();
  try {
    const cree = creerCertificat(db, acteur, {
      user_id: titulaire, certificate_type_id: programme, kind: "PARTICIPATION",
    });
    assert.equal(cree.kind, "PARTICIPATION");
    assert.equal(vuePublique(db, cree.id).kind, "PARTICIPATION");
    /* Le titulaire le lit aussi dans son espace, qui passe par la même vue. */
    assert.equal(certificatsDe(db, titulaire)[0].kind, "PARTICIPATION");
  } finally { fermer(); }
});

test("un type inconnu retombe sur « compétences » plutôt que de casser", () => {
  const { db, fermer, acteur, titulaire, programme } = monde();
  try {
    /* La base porte une contrainte : sans normalisation, ce serait une erreur
       SQL remontée à quelqu'un qui a cliqué dans un formulaire. */
    const cree = creerCertificat(db, acteur, {
      user_id: titulaire, certificate_type_id: programme, kind: "HONORIS-CAUSA",
    });
    assert.equal(cree.kind, "COMPETENCES");
  } finally { fermer(); }
});

test("un certificat de participation ne porte aucune compétence, même si l'appel en propose", () => {
  const { db, fermer, acteur, titulaire, programme, competence } = monde();
  try {
    const cree = creerCertificat(db, acteur, {
      user_id: titulaire, certificate_type_id: programme, kind: "PARTICIPATION", skills: [competence],
    });
    const liees = db.prepare("select count(*) as n from certificate_skills where certificate_id = ?").get(cree.id);
    assert.equal(liees.n, 0);
  } finally { fermer(); }
});

test("un certificat de compétences, lui, les garde", () => {
  const { db, fermer, acteur, titulaire, programme, competence } = monde();
  try {
    const cree = creerCertificat(db, acteur, {
      user_id: titulaire, certificate_type_id: programme, kind: "COMPETENCES", skills: [competence],
    });
    const liees = db.prepare("select skill_id from certificate_skills where certificate_id = ?").all(cree.id);
    assert.deepEqual(liees.map((l) => l.skill_id), [competence]);
  } finally { fermer(); }
});

test("requalifié en participation, le certificat perd les compétences qu'il portait", () => {
  const { db, fermer, acteur, titulaire, programme, competence } = monde();
  try {
    const cree = creerCertificat(db, acteur, {
      user_id: titulaire, certificate_type_id: programme, skills: [competence],
    });
    majCertificat(db, acteur, cree.id, { kind: "PARTICIPATION" }, [competence]);

    const apres = db.prepare("select kind from certificates where id = ?").get(cree.id);
    assert.equal(apres.kind, "PARTICIPATION");
    const liees = db.prepare("select count(*) as n from certificate_skills where certificate_id = ?").get(cree.id);
    assert.equal(liees.n, 0);
  } finally { fermer(); }
});

/* --- ce que le document écrit ------------------------------------------- */

test("chaque type porte son titre, sa mention et sa formule", () => {
  assert.equal(typeCertificat("COMPETENCES").label, "Certificat de compétences");
  assert.equal(typeCertificat("PARTICIPATION").label, "Certificat de participation");
  /* Un certificat délivré avant la distinction n'a pas de type : il atteste des
     compétences, comme le seul document qui existait alors. */
  assert.equal(typeCertificat(undefined).label, "Certificat de compétences");
  assert.equal(typeCertificat("").label, "Certificat de compétences");
});

test("le certificat de participation n'affirme jamais de validation de compétences", () => {
  const participation = TYPES_CERTIFICAT.PARTICIPATION;
  assert.doesNotMatch(participation.attestation, /validation|validé/i);
  assert.match(participation.attestation, /participation/i);
  /* Et il n'énumère pas de compétences : le document s'appuie sur ce drapeau. */
  assert.equal(participation.competences, false);
  assert.equal(TYPES_CERTIFICAT.COMPETENCES.competences, true);
});
