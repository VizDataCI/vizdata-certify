/* Qui a le droit de quoi — côté serveur.
 *
 * Ce module remplace à lui seul les politiques RLS de Postgres. S'il se
 * trompe, rien ne rattrape l'erreur : il n'y a plus de seconde ligne de
 * défense dans la base. Ces tests sont donc les plus importants du projet.
 *
 * Ils sont aussi ce que la migration vers SQLite fait GAGNER : les politiques
 * RLS n'ont jamais pu être éprouvées, faute d'un projet Supabase vivant.
 * L'autorisation est passée d'un endroit sûr mais invérifiable à un endroit
 * ordinaire et entièrement vérifié.
 *
 * L'attaque de référence, celle contre laquelle presque tout est écrit ici :
 * un gestionnaire a le droit de corriger la fiche d'un titulaire ; il envoie
 * donc la même requête sur SA PROPRE fiche, en y glissant `role: 'ADMIN'`.
 * Aucun outil particulier n'est nécessaire — une requête HTTP suffit.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { baseNeuve, compte, catalogue, certificat } from "./aide-base.mjs";
import {
  Refus,
  exigerSession,
  exigerAdmin,
  exigerAdministration,
  exigerAutorisation,
  exigerLectureCertificat,
  exigerLectureCompte,
  exigerEcritureCompte,
  exigerCreationCompte,
  exigerDernierAdministrateur,
} from "../server/autorisations.mjs";
import { AUTORISATIONS } from "../src/lib/permissions.js";

const admin = { id: "a1", role: "ADMIN", permissions: {}, account_status: "ACTIVE" };
const admin2 = { id: "a2", role: "ADMIN", permissions: {}, account_status: "ACTIVE" };
const gestionnaire = {
  id: "g1",
  role: "MANAGER",
  account_status: "ACTIVE",
  permissions: { creer_titulaires: true, attribuer_certificats: true },
};
const gestionnaireNu = { id: "g2", role: "MANAGER", permissions: {}, account_status: "ACTIVE" };
const titulaire = { id: "t1", role: "CERTIFIED", permissions: {}, account_status: "ACTIVE" };
const suspendu = { id: "s1", role: "ADMIN", permissions: {}, account_status: "DISABLED" };

/** Attend un refus, et vérifie son code HTTP. */
function refuse(execution, statut, motif) {
  assert.throws(execution, (e) => {
    assert.ok(e instanceof Refus, `erreur inattendue : ${e.message}`);
    assert.equal(e.statut, statut, `code ${e.statut} au lieu de ${statut} — ${e.message}`);
    if (motif) assert.match(e.message, motif);
    return true;
  });
}

/* --- exigences de base ---------------------------------------------------- */

test("sans session, tout est refusé", () => {
  refuse(() => exigerSession(null), 401);
  refuse(() => exigerAdmin(undefined), 401);
  refuse(() => exigerAdministration(null), 401);
  refuse(() => exigerAutorisation(null, "attribuer_certificats"), 401);
});

test("un compte désactivé ne peut plus rien, même administrateur", () => {
  /* Le compte garde son rôle — on ne rétrograde pas quelqu'un qu'on suspend —
     mais la suspension doit être effective immédiatement. */
  refuse(() => exigerSession(suspendu), 403, /désactivé/);
  refuse(() => exigerAdmin(suspendu), 403);
  refuse(() => exigerAutorisation(suspendu, "attribuer_certificats"), 403);
});

test("l'administrateur a toutes les autorisations, sans configuration", () => {
  for (const a of AUTORISATIONS) {
    assert.doesNotThrow(() => exigerAutorisation(admin, a.cle), `refusé : ${a.cle}`);
  }
  assert.doesNotThrow(() => exigerAdmin(admin));
  assert.doesNotThrow(() => exigerAdministration(admin));
});

test("le gestionnaire n'a que ce qui lui a été accordé", () => {
  assert.doesNotThrow(() => exigerAutorisation(gestionnaire, "attribuer_certificats"));
  assert.doesNotThrow(() => exigerAutorisation(gestionnaire, "creer_titulaires"));
  refuse(() => exigerAutorisation(gestionnaire, "revoquer_certificats"), 403, /révoquer/i);
  refuse(() => exigerAutorisation(gestionnaire, "exporter_donnees"), 403);
  refuse(() => exigerAdmin(gestionnaire), 403);
});

test("un gestionnaire sans autorisation ne peut rien", () => {
  for (const a of AUTORISATIONS) {
    refuse(() => exigerAutorisation(gestionnaireNu, a.cle), 403);
  }
});

test("le titulaire n'appartient pas à l'administration", () => {
  refuse(() => exigerAdministration(titulaire), 403);
  refuse(() => exigerAutorisation(titulaire, "attribuer_certificats"), 403);
});

test("une autorisation inconnue est une faute de code, pas un refus discret", () => {
  /* Si une clé mal orthographiée se traduisait par « autorisé », ce serait une
     faille ; par « refusé », un bogue invisible. On lève bruyamment. */
  assert.throws(() => exigerAutorisation(admin, "supprimer_le_registre"), /Autorisation inconnue/);
});

/* --- lecture -------------------------------------------------------------- */

test("un titulaire ne lit que ses propres certificats", () => {
  const sien = { id: "c1", user_id: "t1" };
  const autre = { id: "c2", user_id: "t9" };

  assert.equal(exigerLectureCertificat(titulaire, sien).id, "c1");
  /* 404 et non 403 : répondre « interdit » confirmerait l'existence du
     certificat à qui n'a pas le droit de le savoir. */
  refuse(() => exigerLectureCertificat(titulaire, autre), 404);
  refuse(() => exigerLectureCertificat(titulaire, null), 404);
});

test("l'administration lit tous les certificats", () => {
  const autre = { id: "c2", user_id: "t9" };
  assert.ok(exigerLectureCertificat(admin, autre));
  assert.ok(exigerLectureCertificat(gestionnaire, autre));
});

test("un titulaire ne lit que sa propre fiche", () => {
  assert.ok(exigerLectureCompte(titulaire, { id: "t1" }));
  refuse(() => exigerLectureCompte(titulaire, { id: "t9" }), 404);
  assert.ok(exigerLectureCompte(gestionnaire, { id: "t9" }));
});

/* --- écriture sur un compte : l'élévation de privilèges ------------------- */

test("un gestionnaire ne peut pas se promouvoir administrateur", () => {
  /* L'attaque de référence. Elle ne demande qu'une requête HTTP sur sa propre
     fiche — une fiche qu'il a par ailleurs le droit de modifier. */
  refuse(() => exigerEcritureCompte(gestionnaire, gestionnaire, { role: "ADMIN" }), 403, /administrateur/);
});

test("un gestionnaire ne peut promouvoir personne", () => {
  refuse(() => exigerEcritureCompte(gestionnaire, titulaire, { role: "ADMIN" }), 403);
  refuse(() => exigerEcritureCompte(gestionnaire, titulaire, { role: "MANAGER" }), 403);
});

test("un gestionnaire ne peut pas élargir ses propres autorisations", () => {
  refuse(
    () => exigerEcritureCompte(gestionnaire, gestionnaire, { permissions: { revoquer_certificats: true } }),
    403,
    /autorisations/
  );
});

test("un gestionnaire ne peut ni activer, ni désactiver un compte", () => {
  refuse(() => exigerEcritureCompte(gestionnaire, titulaire, { account_status: "DISABLED" }), 403, /activer/);
});

test("un gestionnaire ne peut pas changer une adresse e-mail", () => {
  /* L'adresse identifie le compte : la changer, c'est le détourner. */
  refuse(() => exigerEcritureCompte(gestionnaire, titulaire, { email: "pirate@ailleurs.ci" }), 403, /adresse/);
});

test("un titulaire ne peut pas changer sa propre adresse e-mail", () => {
  refuse(() => exigerEcritureCompte(titulaire, titulaire, { email: "autre@exemple.ci" }), 403);
});

test("un champ privilégié glissé parmi des champs libres est refusé en bloc", () => {
  /* Le danger n'est pas le champ isolé mais la requête composite : un
     formulaire légitime auquel on ajoute une ligne. Rien ne doit passer. */
  refuse(
    () => exigerEcritureCompte(gestionnaire, titulaire, { first_name: "Correct", role: "ADMIN" }),
    403
  );
});

test("un champ inconnu est refusé, pas ignoré en silence", () => {
  /* Un champ silencieusement écarté laisse croire que la modification a eu
     lieu — et, le jour où ce champ existera, il passera sans contrôle. */
  refuse(() => exigerEcritureCompte(admin, titulaire, { password_hash: "scrypt$…" }), 403, /non modifiable/);
  refuse(() => exigerEcritureCompte(admin, titulaire, { id: "autre" }), 403);
  refuse(() => exigerEcritureCompte(titulaire, titulaire, { must_change_password: 0 }), 403);
});

test("chacun modifie ses propres informations ordinaires", () => {
  assert.ok(exigerEcritureCompte(titulaire, titulaire, { first_name: "Yao", phone: "+225…" }));
  assert.ok(exigerEcritureCompte(titulaire, titulaire, { public_profile: true, linkedin_url: "https://…" }));
});

test("un titulaire ne modifie pas la fiche d'un autre", () => {
  refuse(() => exigerEcritureCompte(titulaire, { id: "t9" }, { first_name: "Pirate" }), 403);
});

test("le gestionnaire corrige la fiche d'un titulaire", () => {
  assert.ok(exigerEcritureCompte(gestionnaire, titulaire, { first_name: "Corrigé", last_name: "Nom" }));
});

test("l'administrateur modifie rôle, autorisations, statut et adresse", () => {
  assert.ok(exigerEcritureCompte(admin, titulaire, { role: "MANAGER" }));
  assert.ok(exigerEcritureCompte(admin, titulaire, { permissions: { attribuer_certificats: true } }));
  assert.ok(exigerEcritureCompte(admin, titulaire, { account_status: "DISABLED" }));
  assert.ok(exigerEcritureCompte(admin, titulaire, { email: "nouvelle@vizdata.ci" }));
});

test("même administrateur, on ne modifie pas son propre rôle", () => {
  /* Sans cette règle, le dernier administrateur peut se retirer ses droits et
     verrouiller la plateforme — plus personne ne peut rien réparer. */
  refuse(() => exigerEcritureCompte(admin, admin, { role: "CERTIFIED" }), 403, /propre rôle/);
  refuse(() => exigerEcritureCompte(admin, admin, { permissions: {} }), 403);
  refuse(() => exigerEcritureCompte(admin, admin, { account_status: "DISABLED" }), 403, /propre compte/);
});

test("un administrateur modifie le rôle d'un autre administrateur", () => {
  assert.ok(exigerEcritureCompte(admin, admin2, { role: "MANAGER" }));
});

test("un administrateur peut changer sa propre adresse e-mail", () => {
  /* Contrairement au rôle et au statut, elle ne verrouille rien : se tromper
     d'adresse n'enferme personne dehors tant que le mot de passe fonctionne. */
  assert.ok(exigerEcritureCompte(admin, admin, { email: "direction@vizdata.ci" }));
});

/* --- création de comptes -------------------------------------------------- */

test("créer un titulaire demande l'autorisation correspondante", () => {
  assert.ok(exigerCreationCompte(gestionnaire, "CERTIFIED"));
  refuse(() => exigerCreationCompte(gestionnaireNu, "CERTIFIED"), 403);
  refuse(() => exigerCreationCompte(titulaire, "CERTIFIED"), 403);
});

test("créer un compte d'administration est réservé à l'administrateur", () => {
  /* Les confondre reviendrait à laisser un gestionnaire se fabriquer un
     second compte, administrateur celui-là, et contourner tout le reste. */
  refuse(() => exigerCreationCompte(gestionnaire, "ADMIN"), 403, /administration/);
  refuse(() => exigerCreationCompte(gestionnaire, "MANAGER"), 403);
  assert.ok(exigerCreationCompte(admin, "ADMIN"));
  assert.ok(exigerCreationCompte(admin, "MANAGER"));
});

/* --- dernier administrateur ---------------------------------------------- */

test("on ne retire pas le dernier administrateur actif", () => {
  /* Sinon la seule issue serait une écriture directe dans le fichier de base,
     par quelqu'un ayant accès au serveur. */
  const { db, fermer } = baseNeuve();
  try {
    const seul = compte(db, { email: "seul@vizdata.ci", role: "ADMIN" });
    refuse(() => exigerDernierAdministrateur(db, seul), 403, /dernier administrateur/);

    compte(db, { email: "second@vizdata.ci", role: "ADMIN" });
    assert.doesNotThrow(() => exigerDernierAdministrateur(db, seul));
  } finally {
    fermer();
  }
});

test("un administrateur désactivé ne compte pas comme administrateur restant", () => {
  const { db, fermer } = baseNeuve();
  try {
    const actif = compte(db, { email: "actif@vizdata.ci", role: "ADMIN" });
    compte(db, { email: "suspendu@vizdata.ci", role: "ADMIN", statut: "DISABLED" });
    refuse(() => exigerDernierAdministrateur(db, actif), 403);
  } finally {
    fermer();
  }
});

/* --- cohérence avec l'interface ------------------------------------------ */

test("serveur et interface partagent le même vocabulaire d'autorisations", () => {
  /* Les deux importent `src/lib/permissions.js`. Si l'un redéclarait sa propre
     liste, l'écran finirait par cacher une action que le serveur accepte —
     ou, bien pire, par en proposer une qu'il refuse. */
  assert.ok(AUTORISATIONS.length >= 4);
  for (const a of AUTORISATIONS) {
    assert.doesNotThrow(() => exigerAutorisation(admin, a.cle), `clé inconnue du serveur : ${a.cle}`);
  }
});

test("la lecture d'un certificat inexistant répond introuvable", () => {
  const { db, fermer } = baseNeuve();
  try {
    const id = compte(db, { email: "t@exemple.ci" });
    const { programme } = catalogue(db);
    const cert = certificat(db, { titulaire: id, programme });
    const ligne = db.prepare("select * from certificates where id = ?").get(cert);
    assert.ok(exigerLectureCertificat({ ...titulaire, id }, ligne));
    refuse(() => exigerLectureCertificat({ ...titulaire, id: "quelqu-un-dautre" }, ligne), 404);
  } finally {
    fermer();
  }
});
