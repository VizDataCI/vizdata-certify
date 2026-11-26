/* Le catalogue et le registre de démonstration.
 *
 * Le jeu de démonstration n'est pas qu'un décor : c'est ce que l'application
 * montre tant qu'aucun projet Supabase n'est configuré, et c'est aussi la
 * seule description exécutable du modèle de données. S'il s'écarte du modèle
 * réel : un programme sans domaine, une référence au mauvais format, un score
 * qui traîne : la démonstration ment sur le produit.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { buildSeed, SEED_DOMAINS, SEED_TYPES, REFERENCE_EXEMPLE } from "../src/data/seed.js";
import { effectiveStatus, nextReference } from "../src/lib/certificates.js";

const db = buildSeed();

/* --- catégorisation à deux niveaux -------------------------------------- */

test("chaque programme est rattaché à un domaine existant", () => {
  for (const t of SEED_TYPES) {
    const domaine = SEED_DOMAINS.find((d) => d.id === t.domain_id);
    assert.ok(domaine, `le programme ${t.code} n'a pas de domaine`);
  }
});

test("un même domaine porte plusieurs programmes distincts", () => {
  /* C'est la raison d'être de la refonte : six certifications Excel ne
     tenaient pas dans un code de domaine unique. */
  const excel = SEED_DOMAINS.find((d) => d.code === "EXCEL");
  const programmes = SEED_TYPES.filter((t) => t.domain_id === excel.id);
  assert.ok(programmes.length >= 4, `un seul niveau Excel : ${programmes.length}`);
});

test("les codes de programme sont uniques", () => {
  const codes = SEED_TYPES.map((t) => t.code);
  assert.equal(new Set(codes).size, codes.length, "code de programme en double");
});

test("l'intitulé du programme est distinct de son code", () => {
  /* Le code entre dans la référence ; l'intitulé est imprimé sur le
     certificat. Les confondre donnerait « EXCEL-AVA » sur le document. */
  for (const t of SEED_TYPES) {
    assert.notEqual(t.name, t.code, `intitulé manquant pour ${t.code}`);
    assert.ok(t.name.length > t.code.length, `intitulé trop sommaire : ${t.name}`);
  }
});

/* --- certificats délivrés ------------------------------------------------ */

test("aucun certificat ne porte d'expiration ni de score", () => {
  for (const c of db.certificates) {
    assert.equal(c.expiry_date, null, `${c.reference} porte encore une expiration`);
    assert.equal(c.score, null, `${c.reference} porte encore un score`);
  }
});

test("sans expiration, aucun certificat ne bascule en expiré", () => {
  for (const c of db.certificates) {
    assert.notEqual(effectiveStatus(c), "EXPIRED", `${c.reference} est calculé comme expiré`);
  }
});

test("les références suivent le format et restent uniques", () => {
  const vues = new Set();
  for (const c of db.certificates) {
    assert.match(c.reference, /^VIZ-\d{4}-[A-Z0-9-]+-\d{6}$/, `format inattendu : ${c.reference}`);
    assert.ok(!vues.has(c.reference), `référence en double : ${c.reference}`);
    vues.add(c.reference);
  }
});

test("la référence porte le code du programme et l'année de délivrance", () => {
  for (const c of db.certificates) {
    const programme = SEED_TYPES.find((t) => t.id === c.certificate_type_id);
    const attendu = `VIZ-${c.issue_date.slice(0, 4)}-${programme.code}-`;
    assert.ok(c.reference.startsWith(attendu), `${c.reference} n'ouvre pas sur ${attendu}`);
  }
});

test("la référence d'exemple suit le même format que les vraies", () => {
  /* Elle est montrée dans les champs de recherche : si elle garde l'ancien
     format (un code de domaine au lieu d'un code de programme) elle apprend
     à saisir une référence qui n'existera jamais. */
  assert.match(REFERENCE_EXEMPLE, /^VIZ-\d{4}-[A-Z0-9-]+-\d{6}$/);
  const codes = SEED_TYPES.map((t) => t.code);
  assert.ok(
    codes.some((code) => REFERENCE_EXEMPLE.includes(`-${code}-`)),
    `l'exemple ${REFERENCE_EXEMPLE} ne cite aucun code de programme existant`
  );
});

test("la numérotation suivante poursuit la série du programme et de l'année", () => {
  const annee = new Date().getFullYear();
  const suivante = nextReference(db.certificates, "EXCEL-AVA", annee);
  const deja = db.certificates.filter((c) => c.reference.startsWith(`VIZ-${annee}-EXCEL-AVA-`)).length;
  assert.equal(suivante, `VIZ-${annee}-EXCEL-AVA-${String(deja + 1).padStart(6, "0")}`);
});

test("chaque certificat désigne un titulaire et un programme existants", () => {
  for (const c of db.certificates) {
    assert.ok(db.users.some((u) => u.id === c.user_id), `titulaire introuvable pour ${c.reference}`);
    assert.ok(SEED_TYPES.some((t) => t.id === c.certificate_type_id), `programme introuvable pour ${c.reference}`);
  }
});

test("un titulaire peut porter plusieurs certifications", () => {
  /* La relation est de plusieurs à plusieurs : c'est la demande centrale du
     cahier des charges, et le jeu de démonstration doit la montrer. */
  const parTitulaire = new Map();
  for (const c of db.certificates) {
    parTitulaire.set(c.user_id, (parTitulaire.get(c.user_id) || 0) + 1);
  }
  const maximum = Math.max(...parTitulaire.values());
  assert.ok(maximum >= 3, `aucun titulaire n'a plus de ${maximum} certification(s)`);
});

/* --- dates relatives ----------------------------------------------------- */

test("le registre de démonstration comporte des délivrances récentes", () => {
  /* Des dates écrites en dur vieillissent : le tableau de bord finissait par
     s'ouvrir sur « 0 sur les trente derniers jours ». */
  const limite = new Date();
  limite.setDate(limite.getDate() - 30);
  const recents = db.certificates.filter((c) => new Date(c.issue_date) >= limite);
  assert.ok(recents.length >= 3, `seulement ${recents.length} délivrance(s) sur trente jours`);
});

test("aucune délivrance n'est datée du futur", () => {
  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  for (const c of db.certificates) {
    assert.ok(new Date(c.issue_date) < demain, `${c.reference} est daté du futur`);
  }
});

/* --- comptes ------------------------------------------------------------- */

test("les trois rôles sont représentés", () => {
  for (const role of ["ADMIN", "MANAGER", "CERTIFIED"]) {
    assert.ok(db.users.some((u) => u.role === role), `aucun compte ${role}`);
  }
});

test("le gestionnaire de démonstration n'a qu'une partie des autorisations", () => {
  /* Un gestionnaire tout-puissant ne montrerait pas la différence avec un
     administrateur, et la démonstration raterait la notion. */
  const gestionnaire = db.users.find((u) => u.role === "MANAGER");
  const accordees = Object.values(gestionnaire.permissions).filter(Boolean).length;
  assert.ok(accordees > 0, "le gestionnaire n'a aucune autorisation");
  assert.ok(accordees < 4, "le gestionnaire a toutes les autorisations");
});

test("les identifiants publics sont uniques", () => {
  const noms = db.users.map((u) => u.username);
  assert.equal(new Set(noms).size, noms.length, "identifiant public en double");
});

test("les jetons publics sont uniques et assez longs pour n'être pas devinés", () => {
  const jetons = db.certificates.map((c) => c.public_token);
  assert.equal(new Set(jetons).size, jetons.length, "jeton public en double");
  for (const j of jetons) assert.ok(j.length >= 12, `jeton trop court : ${j}`);
});
