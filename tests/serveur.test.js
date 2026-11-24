/* Le serveur, éprouvé comme un client l'éprouve.
 *
 * Un vrai processus, une vraie base, de vraies requêtes HTTP avec cookies.
 * Les tests unitaires des modules vérifient les règles ; celui-ci vérifie que
 * les règles sont bien CÂBLÉES — qu'aucune route n'a été oubliée en chemin,
 * qu'aucune ne laisse passer ce que le module d'autorisation refuse, et
 * qu'aucune réponse ne laisse fuir ce qu'elle ne doit pas.
 *
 * C'est la différence entre « la serrure fonctionne » et « la serrure est
 * posée sur la porte ».
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ouvrirBase, uid, maintenant } from "../server/db.mjs";
import { creerJeton } from "../server/comptes.mjs";
import { codePour } from "../server/double-facteur.mjs";

let processus;
let base;
let dossier;
const cookies = new Map();

/** fetch avec bocal à cookies, parce que la session en dépend. */
async function appel(chemin, { methode = "GET", corps, session = "admin" } = {}) {
  const entetes = { "Content-Type": "application/json" };
  const cookie = cookies.get(session);
  if (cookie) entetes.Cookie = cookie;

  const reponse = await fetch(base + chemin, {
    method: methode,
    headers: entetes,
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });

  const pose = reponse.headers.getSetCookie?.() ?? [];
  for (const c of pose) {
    const [paire] = c.split(";");
    if (paire.startsWith("vz_session=") && !paire.endsWith("=")) cookies.set(session, paire);
    if (paire === "vz_session=") cookies.delete(session);
  }

  const texte = await reponse.text();
  let donnees = null;
  try { donnees = texte ? JSON.parse(texte) : null; } catch { donnees = texte; }
  return { statut: reponse.status, donnees, texte };
}

before(async () => {
  dossier = mkdtempSync(join(tmpdir(), "vizdata-serveur-"));
  const chemin = join(dossier, "certify.db");

  /* La base est préparée ici plutôt que par le serveur : le test a besoin du
     jeton d'invitation du premier administrateur, qui n'est imprimé nulle
     part ailleurs. */
  const db = ouvrirBase({ chemin, silencieux: true });
  const admin = uid();
  db.prepare(
    `insert into users (id, email, first_name, last_name, username, role, must_change_password, invited_at)
     values (?, 'direction@vizdata.ci', 'Fabrice', 'BOH', 'fabrice-boh', 'ADMIN', 1, ?)`
  ).run(admin, maintenant());

  const domaine = uid();
  const programme = uid();
  db.prepare("insert into certification_domains (id, code, name) values (?, 'EXCEL', 'Excel')").run(domaine);
  db.prepare(
    "insert into certificate_types (id, domain_id, code, name, description, default_duration) values (?, ?, 'EXCEL-AVA', 'Excel — Niveau avancé', 'Fonctions imbriquées.', 30)"
  ).run(programme, domaine);

  const invitation = creerJeton(db, admin, "INVITATION").secret;
  db.close();

  processus = spawn(process.execPath, ["server/index.mjs"], {
    env: { ...process.env, VIZDATA_DB: chemin, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  base = await new Promise((resoudre, rejeter) => {
    let sortie = "";
    const minuteur = setTimeout(() => rejeter(new Error("le serveur n'a pas démarré : " + sortie)), 10000);
    processus.stdout.on("data", (morceau) => {
      sortie += morceau;
      const trouve = sortie.match(/http:\/\/localhost:(\d+)/);
      if (trouve) {
        clearTimeout(minuteur);
        resoudre(`http://localhost:${trouve[1]}`);
      }
    });
    processus.stderr.on("data", (m) => { sortie += m; });
    processus.on("exit", (code) => rejeter(new Error(`le serveur s'est arrêté (code ${code}) : ${sortie}`)));
  });

  /* Le premier administrateur choisit son mot de passe et se trouve connecté. */
  const ouverture = await appel("/api/mot-de-passe/definir", {
    methode: "POST",
    corps: { jeton: invitation, motDePasse: "VizData2026" },
  });
  assert.equal(ouverture.statut, 200, "l'invitation du premier administrateur a échoué");
});

after(async () => {
  /* Sous Windows, le fichier de base reste verrouillé tant que le processus
     n'est pas réellement mort — et `kill()` ne fait que demander. Effacer
     aussitôt échoue sur EPERM. On attend donc la sortie, puis on réessaie
     quelques fois : le système rend parfois la main avec un temps de retard. */
  if (processus && processus.exitCode === null) {
    await new Promise((resoudre) => {
      processus.once("exit", resoudre);
      processus.kill();
      setTimeout(resoudre, 3000);
    });
  }

  for (let essai = 0; essai < 10; essai++) {
    try {
      rmSync(dossier, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  /* Un dossier temporaire qui survit n'est pas une raison de faire échouer la
     suite : le système l'effacera. */
});

/* --- ce qui doit être ouvert ---------------------------------------------- */

test("le registre répond", async () => {
  const { statut, donnees } = await appel("/api/sante", { session: "anonyme" });
  assert.equal(statut, 200);
  assert.equal(donnees.registre, "sqlite");
});

test("l'administrateur voit le registre complet", async () => {
  const { statut, donnees } = await appel("/api/registre");
  assert.equal(statut, 200);
  assert.equal(donnees.domains.length, 1);
  assert.equal(donnees.types.length, 1);
  assert.equal(donnees.types[0].certification_domains.code, "EXCEL");
});

/* --- ce qui doit être fermé ----------------------------------------------- */

test("sans session, les routes d'administration répondent 401", async () => {
  const fermees = [
    ["GET", "/api/registre"],
    ["GET", "/api/mes-certificats"],
    ["PATCH", "/api/moi"],
    ["GET", "/api/certificats/nimporte-quoi"],
  ];
  for (const [methode, chemin] of fermees) {
    const { statut } = await appel(chemin, { methode, corps: methode === "GET" ? undefined : {}, session: "anonyme" });
    assert.equal(statut, 401, `${methode} ${chemin} a répondu ${statut}`);
  }
});

test("une méthode inadaptée le dit, plutôt que de parler d'adresse inconnue", async () => {
  const { statut, donnees } = await appel("/api/moi", { session: "anonyme" });
  assert.equal(statut, 405);
  assert.match(donnees.error, /PATCH/);
});

test("sans session, les écritures sont refusées", async () => {
  const tentatives = [
    ["POST", "/api/titulaires", { email: "pirate@ailleurs.ci", first_name: "P", last_name: "P" }],
    ["POST", "/api/domaines", { code: "PIRATE", name: "Pirate" }],
    ["POST", "/api/certificats", { user_id: "x", certificate_type_id: "y" }],
  ];
  for (const [methode, chemin, corps] of tentatives) {
    const { statut } = await appel(chemin, { methode, corps, session: "anonyme" });
    assert.equal(statut, 401, `${methode} ${chemin} a répondu ${statut}`);
  }
});

test("une route inconnue ne dit rien de ce qui existe", async () => {
  const { statut, donnees } = await appel("/api/administration/secrete", { session: "anonyme" });
  assert.equal(statut, 404);
  assert.equal(donnees.error, "Route inconnue.");
});

/* --- le parcours complet -------------------------------------------------- */

let titulaireId;
let jetonPublic;
let referenceCertificat;

test("un titulaire est créé, puis réutilisé s'il existe déjà", async () => {
  const creation = await appel("/api/titulaires", {
    methode: "POST",
    corps: { email: "yao.konan@example.ci", first_name: "Yao", last_name: "Konan" },
  });
  assert.equal(creation.statut, 200);
  assert.equal(creation.donnees.existe, false);
  assert.equal(creation.donnees.titulaire.username, "yao-konan");
  titulaireId = creation.donnees.titulaire.id;

  /* La casse ne doit pas créer un second compte : le titulaire se retrouverait
     avec deux espaces personnels, dont un vide. */
  const doublon = await appel("/api/titulaires", {
    methode: "POST",
    corps: { email: "YAO.KONAN@EXAMPLE.CI", first_name: "Yao", last_name: "Konan" },
  });
  assert.equal(doublon.donnees.existe, true);
  assert.equal(doublon.donnees.titulaire.id, titulaireId);
});

test("aucune réponse ne laisse fuir une empreinte de mot de passe", async () => {
  /* Le défaut a existé : la création d'un titulaire renvoyait la ligne entière
     de la table, `password_hash` compris. Sur une adresse déjà connue, cela
     livrait l'empreinte du mot de passe à tout gestionnaire sachant taper
     cette adresse. */
  const reponses = await Promise.all([
    appel("/api/session"),
    appel("/api/registre"),
    appel("/api/titulaires", { methode: "POST", corps: { email: "yao.konan@example.ci", first_name: "Yao", last_name: "Konan" } }),
  ]);
  for (const r of reponses) {
    assert.ok(!r.texte.includes("scrypt$"), "une empreinte de mot de passe est sortie");
    assert.ok(!r.texte.includes("password_hash"), "le champ password_hash est sorti");
  }
});

test("une certification est attribuée et numérotée par la base", async () => {
  const registre = await appel("/api/registre");
  const programme = registre.donnees.types[0].id;

  const attribution = await appel("/api/certificats", {
    methode: "POST",
    corps: {
      user_id: titulaireId,
      certificate_type_id: programme,
      issue_date: "2026-11-15",
      duration: 30,
      trainer: "Fabrice BOH",
      signatory: "Direction VIZDATA",
      skills: [],
    },
  });

  assert.equal(attribution.statut, 200);
  const c = attribution.donnees.certificat;
  assert.equal(c.reference, "VIZ-2026-EXCEL-AVA-000001");
  assert.ok(c.public_token.length >= 12);
  assert.equal(c.expiry_date, null, "une expiration a été posée");
  assert.equal(c.score, null, "un score a été posé");

  jetonPublic = c.public_token;
  referenceCertificat = c.reference;

  /* La numérotation suit sur le programme, pas sur la personne : le second
     certificat va donc à quelqu'un d'autre. Un même programme ne se délivre
     qu'une fois à la même personne tant qu'il est en vigueur. */
  const autre = await appel("/api/titulaires", {
    methode: "POST",
    corps: { email: "mariam.toure@example.ci", first_name: "Mariam", last_name: "Touré" },
  });
  const seconde = await appel("/api/certificats", {
    methode: "POST",
    corps: { user_id: autre.donnees.titulaire.id, certificate_type_id: programme, issue_date: "2026-11-15", skills: [] },
  });
  assert.equal(seconde.donnees.certificat.reference, "VIZ-2026-EXCEL-AVA-000002", "la numérotation ne suit pas");

  /* Et la règle elle-même, par la route : le titulaire qui détient déjà ce
     programme se voit refuser une seconde attribution. */
  const refus = await appel("/api/certificats", {
    methode: "POST",
    corps: { user_id: titulaireId, certificate_type_id: programme, issue_date: "2026-11-16", skills: [] },
  });
  assert.equal(refus.statut, 409, "une seconde attribution du même programme a été acceptée");
  assert.match(refus.donnees.error, /détient déjà/);
});

test("la vérification publique répond sans session, et sans rien exposer", async () => {
  const { statut, donnees, texte } = await appel(`/api/verifier/${jetonPublic}?source=qr`, { session: "anonyme" });
  assert.equal(statut, 200);
  assert.equal(donnees.reference, referenceCertificat);
  assert.equal(donnees.holder_name, "Yao Konan");
  assert.equal(donnees.domain, "Excel");
  assert.equal(donnees.status, "ACTIVE");

  for (const interdit of ["yao.konan@example.ci", "password", "score", "expiry_date", "user_id"]) {
    assert.ok(!texte.includes(interdit), `la réponse publique contient ${interdit}`);
  }
});

test("la vérification par référence est insensible à la casse", async () => {
  const { statut, donnees } = await appel(`/api/verifier?reference=${referenceCertificat.toLowerCase()}`, { session: "anonyme" });
  assert.equal(statut, 200);
  assert.equal(donnees.reference, referenceCertificat);
});

test("un jeton inventé ne dit pas pourquoi il échoue", async () => {
  const { statut, donnees } = await appel("/api/verifier/jeton-invente", { session: "anonyme" });
  assert.equal(statut, 404);
  assert.match(donnees.error, /aucun certificat/i);
});

test("chaque consultation est comptée", async () => {
  const avant = (await appel("/api/registre")).donnees.verifications.length;
  await appel(`/api/verifier/${jetonPublic}`, { session: "anonyme" });
  const apres = (await appel("/api/registre")).donnees.verifications.length;
  assert.equal(apres, avant + 1);
});

/* --- le gestionnaire, et ce qu'il ne peut pas ----------------------------- */

let gestionnaireId;

test("un gestionnaire est créé avec des autorisations partielles", async () => {
  const creation = await appel("/api/titulaires", {
    methode: "POST",
    corps: { email: "awa.gestion@vizdata.ci", first_name: "Awa", last_name: "Gestion", role: "MANAGER" },
  });
  assert.equal(creation.statut, 200);
  gestionnaireId = creation.donnees.titulaire.id;

  const maj = await appel(`/api/comptes/${gestionnaireId}`, {
    methode: "PATCH",
    corps: { permissions: { attribuer_certificats: true } },
  });
  assert.equal(maj.statut, 200);
  assert.equal(maj.donnees.permissions.attribuer_certificats, true);
});

test("le gestionnaire ouvre sa session", async () => {
  /* Il passe par le lien d'invitation, comme n'importe quel compte. */
  const relance = await appel(`/api/comptes/${gestionnaireId}/invitation`, { methode: "POST" });
  assert.equal(relance.statut, 200);
  const jeton = new URL(relance.donnees.lien).searchParams.get("jeton");

  const ouverture = await appel("/api/mot-de-passe/definir", {
    methode: "POST",
    corps: { jeton, motDePasse: "Gestion2026" },
    session: "gestionnaire",
  });
  assert.equal(ouverture.statut, 200);
  assert.equal(ouverture.donnees.role, "MANAGER");
});

test("le gestionnaire ne peut pas se promouvoir administrateur", async () => {
  /* L'attaque de référence : une requête HTTP sur sa propre fiche, qu'il a par
     ailleurs le droit de modifier. */
  const { statut, donnees } = await appel(`/api/comptes/${gestionnaireId}`, {
    methode: "PATCH",
    corps: { role: "ADMIN" },
    session: "gestionnaire",
  });
  assert.equal(statut, 403);
  assert.match(donnees.error, /administrateur/i);

  const verification = await appel("/api/session", { session: "gestionnaire" });
  assert.equal(verification.donnees.role, "MANAGER", "le rôle a changé malgré le refus");
});

test("le gestionnaire ne peut pas élargir ses propres autorisations", async () => {
  const { statut } = await appel(`/api/comptes/${gestionnaireId}`, {
    methode: "PATCH",
    corps: { permissions: { attribuer_certificats: true, revoquer_certificats: true, creer_titulaires: true } },
    session: "gestionnaire",
  });
  assert.equal(statut, 403);
});

test("le gestionnaire ne peut pas révoquer sans l'autorisation", async () => {
  const registre = await appel("/api/registre");
  const cert = registre.donnees.certificates[0];
  const { statut } = await appel(`/api/certificats/${cert.id}/statut`, {
    methode: "POST",
    corps: { statut: "REVOKED", motif: "Essai" },
    session: "gestionnaire",
  });
  assert.equal(statut, 403);
});

test("le gestionnaire ne peut pas créer de titulaire sans l'autorisation", async () => {
  const { statut } = await appel("/api/titulaires", {
    methode: "POST",
    corps: { email: "autre@example.ci", first_name: "Autre", last_name: "Personne" },
    session: "gestionnaire",
  });
  assert.equal(statut, 403);
});

test("le gestionnaire ne touche pas au catalogue", async () => {
  const { statut } = await appel("/api/domaines", {
    methode: "POST",
    corps: { code: "PIRATE", name: "Pirate" },
    session: "gestionnaire",
  });
  assert.equal(statut, 403);
});

test("le gestionnaire attribue bien, lui, puisqu'il en a le droit", async () => {
  const registre = await appel("/api/registre", { session: "gestionnaire" });
  /* Un titulaire qui n'a pas encore ce programme : celui des tests précédents
     le détient déjà, et la seconde attribution serait refusée pour une raison
     qui n'a rien à voir avec les autorisations. */
  const beneficiaire = await appel("/api/titulaires", {
    methode: "POST",
    corps: { email: "kouassi.yao@example.ci", first_name: "Kouassi", last_name: "Yao" },
  });
  const { statut, donnees } = await appel("/api/certificats", {
    methode: "POST",
    corps: {
      user_id: beneficiaire.donnees.titulaire.id,
      certificate_type_id: registre.donnees.types[0].id,
      issue_date: "2026-11-15",
      skills: [],
      notifier: false,
    },
    session: "gestionnaire",
  });
  assert.equal(statut, 200);
  assert.equal(donnees.certificat.issued_by, gestionnaireId, "l'auteur de l'attribution n'est pas enregistré");
});

/* --- le titulaire, et ce qu'il ne peut pas -------------------------------- */

test("le titulaire ne voit que ses propres certificats", async () => {
  const relance = await appel(`/api/comptes/${titulaireId}/invitation`, { methode: "POST" });
  const jeton = new URL(relance.donnees.lien).searchParams.get("jeton");
  await appel("/api/mot-de-passe/definir", {
    methode: "POST",
    corps: { jeton, motDePasse: "Titulaire2026" },
    session: "titulaire",
  });

  const miens = await appel("/api/mes-certificats", { session: "titulaire" });
  assert.equal(miens.statut, 200);
  /* Ce que le test doit prouver n'est pas un nombre mais une frontière :
     il voit les siens, et rien que les siens. Le certificat 000002 a été
     délivré à quelqu'un d'autre. */
  const references = miens.donnees.map((c) => c.reference);
  assert.ok(references.includes("VIZ-2026-EXCEL-AVA-000001"), "le titulaire ne voit pas son propre certificat");
  assert.ok(!references.includes("VIZ-2026-EXCEL-AVA-000002"), "le titulaire voit le certificat d'un autre");
  /* Et le compteur de consultations voyage avec, pour que son espace puisse
     le lui montrer. */
  assert.equal(typeof miens.donnees[0].verifications, "number");

  const registre = await appel("/api/registre", { session: "titulaire" });
  assert.equal(registre.statut, 403, "un titulaire a lu le registre complet");
});

test("le titulaire modifie son profil mais pas son adresse ni son rôle", async () => {
  const bon = await appel("/api/moi", { methode: "PATCH", corps: { first_name: "Yao-Michel" }, session: "titulaire" });
  assert.equal(bon.statut, 200);
  assert.equal(bon.donnees.first_name, "Yao-Michel");

  for (const champs of [{ email: "autre@example.ci" }, { role: "ADMIN" }, { account_status: "ACTIVE" }]) {
    const { statut } = await appel("/api/moi", { methode: "PATCH", corps: champs, session: "titulaire" });
    assert.equal(statut, 403, `champ accepté : ${Object.keys(champs)[0]}`);
  }
});

/* --- révocation ----------------------------------------------------------- */

test("une révocation sans motif est refusée, avec motif elle s'affiche", async () => {
  const registre = await appel("/api/registre");
  const cert = registre.donnees.certificates.find((c) => c.public_token === jetonPublic);

  const muette = await appel(`/api/certificats/${cert.id}/statut`, {
    methode: "POST",
    corps: { statut: "REVOKED" },
  });
  assert.equal(muette.statut, 400);

  const motivee = await appel(`/api/certificats/${cert.id}/statut`, {
    methode: "POST",
    corps: { statut: "REVOKED", motif: "Non-respect de la charte d'usage." },
  });
  assert.equal(motivee.statut, 200);

  const publique = await appel(`/api/verifier/${jetonPublic}`, { session: "anonyme" });
  assert.equal(publique.donnees.status, "REVOKED");
  assert.match(publique.donnees.revoke_reason, /charte/);
});

/* --- comptes désactivés --------------------------------------------------- */

test("désactiver un compte ferme ses sessions dans l'instant", async () => {
  /* Si la session ouverte survivait, la désactivation ne servirait à rien
     avant la prochaine déconnexion. */
  assert.equal((await appel("/api/session", { session: "gestionnaire" })).donnees.role, "MANAGER");

  const arret = await appel(`/api/comptes/${gestionnaireId}`, {
    methode: "PATCH",
    corps: { account_status: "DISABLED" },
  });
  assert.equal(arret.statut, 200);

  const apres = await appel("/api/session", { session: "gestionnaire" });
  assert.equal(apres.donnees, null, "la session du compte désactivé a survécu");
});

test("on ne retire pas le dernier administrateur", async () => {
  const moi = await appel("/api/session");
  const { statut, donnees } = await appel(`/api/comptes/${moi.donnees.id}`, {
    methode: "PATCH",
    corps: { role: "CERTIFIED" },
  });
  assert.equal(statut, 403);
  assert.match(donnees.error, /propre rôle/i);
});

/* --- mot de passe --------------------------------------------------------- */

test("l'oubli de mot de passe répond pareil, adresse connue ou non", async () => {
  const connue = await appel("/api/mot-de-passe/oubli", {
    methode: "POST",
    corps: { email: "direction@vizdata.ci" },
    session: "anonyme",
  });
  const inconnue = await appel("/api/mot-de-passe/oubli", {
    methode: "POST",
    corps: { email: "personne@nulle-part.ci" },
    session: "anonyme",
  });
  assert.equal(connue.statut, inconnue.statut);
  assert.deepEqual(connue.donnees, inconnue.donnees);
});

test("un mot de passe trop faible est refusé par le serveur", async () => {
  const { statut, donnees } = await appel("/api/mot-de-passe/changer", {
    methode: "POST",
    corps: { ancien: "Titulaire2026", nouveau: "court" },
    session: "titulaire",
  });
  assert.equal(statut, 400);
  assert.match(donnees.error, /huit caractères/);
});

test("changer de mot de passe exige l'ancien", async () => {
  const faux = await appel("/api/mot-de-passe/changer", {
    methode: "POST",
    corps: { ancien: "PasLeBon2026", nouveau: "Nouveau2026" },
    session: "titulaire",
  });
  assert.equal(faux.statut, 400);
  assert.match(faux.donnees.error, /actuel est incorrect/);

  const bon = await appel("/api/mot-de-passe/changer", {
    methode: "POST",
    corps: { ancien: "Titulaire2026", nouveau: "Nouveau2026" },
    session: "titulaire",
  });
  assert.equal(bon.statut, 200);
});

/* --- robustesse ----------------------------------------------------------- */

test("un corps illisible est refusé proprement", async () => {
  const reponse = await fetch(base + "/api/partage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ceci n'est pas du json",
  });
  assert.equal(reponse.status, 400);
});

test("un corps démesuré est refusé avant d'être lu", async () => {
  const reponse = await fetch(base + "/api/partage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jeton: "x".repeat(400 * 1024) }),
  });
  assert.equal(reponse.status, 413);
});

test("on ne sort pas du dossier servi", async () => {
  /* La plus ancienne faille du web, et elle ne demande qu'un oubli. */
  for (const chemin of ["/../server/comptes.mjs", "/..%2f..%2fserver%2fdb.mjs", "/../../.env.local"]) {
    const reponse = await fetch(base + chemin);
    const texte = await reponse.text();
    assert.ok(!texte.includes("scrypt"), `${chemin} a servi un fichier du serveur`);
    assert.ok(!texte.includes("VITE_SUPABASE"), `${chemin} a servi un fichier d'environnement`);
  }
});

test("les en-têtes de sécurité sont posés", async () => {
  const reponse = await fetch(base + "/api/sante");
  assert.equal(reponse.headers.get("x-frame-options"), "DENY");
  assert.equal(reponse.headers.get("x-content-type-options"), "nosniff");
  assert.equal(reponse.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
});

test("le cookie de session est hors de portée du JavaScript", async () => {
  /* HttpOnly met la session à l'abri d'une injection dans l'interface ;
     SameSite ferme la falsification de requête inter-site. */
  const reponse = await fetch(base + "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "direction@vizdata.ci", motDePasse: "VizData2026" }),
  });
  const pose = (reponse.headers.getSetCookie?.() ?? []).join(" ");
  assert.match(pose, /HttpOnly/i);
  assert.match(pose, /SameSite=Lax/i);
});

test("la connexion en deux temps est câblée de bout en bout", async () => {
  /* Le parcours complet, par HTTP : activer, se déconnecter, et constater que
     le mot de passe seul ne donne plus de session. C'est la différence entre
     « l'algorithme est juste » — éprouvé dans double-facteur.test.js contre
     les vecteurs de la RFC — et « la porte est réellement verrouillée ». */
  const prep = await appel("/api/double-facteur/preparer", { methode: "POST", corps: {} });
  assert.equal(prep.statut, 200);
  assert.match(prep.donnees.secret, /^[A-Z2-7]{32}$/);
  assert.match(prep.donnees.uri, /^otpauth:\/\/totp\//);

  const secret = prep.donnees.secret;
  const pas = Math.floor(Date.now() / 1000 / 30);

  const refus = await appel("/api/double-facteur/activer", { methode: "POST", corps: { code: "000000" } });
  assert.equal(refus.statut, 400, "un code faux ne doit pas activer la protection");

  const active = await appel("/api/double-facteur/activer", { methode: "POST", corps: { code: codePour(secret, pas) } });
  assert.equal(active.statut, 200);
  assert.equal(active.donnees.codes.length, 10);

  await appel("/api/session", { methode: "DELETE" });

  /* Le mot de passe seul ne rend plus un profil, mais un défi — et surtout
     aucun cookie. */
  const premier = await fetch(base + "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "direction@vizdata.ci", motDePasse: "VizData2026" }),
  });
  const corps = await premier.json();
  assert.equal(premier.status, 200);
  assert.equal(corps.deuxiemeFacteur, true);
  assert.ok(corps.defi, "aucun défi rendu");
  assert.equal(corps.email, undefined, "le profil ne doit pas fuiter avant le second facteur");
  assert.equal((premier.headers.getSetCookie?.() ?? []).length, 0, "un cookie a été posé avant la preuve");

  const faux = await appel("/api/session/code", { methode: "POST", corps: { defi: corps.defi, code: "000001" } });
  assert.equal(faux.statut, 401);

  /* Le pas suivant, et pas celui de l'activation : un code déjà consommé ne
     vaut plus, c'est ce qui ferme le rejeu. */
  const ok = await appel("/api/session/code", { methode: "POST", corps: { defi: corps.defi, code: codePour(secret, pas + 1) } });
  assert.equal(ok.statut, 200);
  assert.equal(ok.donnees.email, "direction@vizdata.ci");
  assert.equal(ok.donnees.codes_secours_restants, 10);

  /* On repart propre : les tests suivants supposent une session ordinaire. */
  const coupe = await appel("/api/double-facteur/desactiver", { methode: "POST", corps: { motDePasse: "VizData2026" } });
  assert.equal(coupe.statut, 200);
  assert.equal(coupe.donnees.actif, false);
});

test("trop de tentatives de connexion finissent par être bloquées", async () => {
  let bloque = false;
  for (let i = 0; i < 25; i++) {
    const { statut } = await appel("/api/session", {
      methode: "POST",
      corps: { email: "cible@vizdata.ci", motDePasse: "essai" + i },
      session: "attaquant",
    });
    if (statut === 429) { bloque = true; break; }
  }
  assert.ok(bloque, "la force brute n'est pas freinée");
});

test("les appareils connectés se listent et se ferment à distance", async () => {
  /* Deux sessions pour le même compte, depuis deux « appareils » : le bocal à
     cookies du test en tient un par nom de session. */
  const seconde = await appel("/api/session", {
    methode: "POST",
    corps: { email: "direction@vizdata.ci", motDePasse: "VizData2026" },
    session: "ailleurs",
  });
  assert.equal(seconde.statut, 200);

  const liste = await appel("/api/mes-sessions", { session: "ailleurs" });
  assert.equal(liste.statut, 200);
  assert.ok(liste.donnees.sessions.length >= 2, "les deux sessions doivent apparaître");
  assert.equal(liste.donnees.sessions.filter((s) => s.courante).length, 1);

  /* Rien de ce qui sert à ouvrir la porte ne doit sortir d'ici. */
  for (const s of liste.donnees.sessions) {
    assert.equal(s.token_hash, undefined);
    assert.equal(s.secret, undefined);
  }

  /* Fermer depuis « ailleurs » coupe la session d'administration, pas
     celle-ci : c'est tout l'intérêt du geste. */
  const coupe = await appel("/api/mes-sessions/fermer", { methode: "POST", corps: {}, session: "ailleurs" });
  assert.equal(coupe.statut, 200);
  assert.ok(coupe.donnees.fermees >= 1);

  const toujours = await appel("/api/session", { session: "ailleurs" });
  assert.equal(toujours.statut, 200);
  assert.equal(toujours.donnees.email, "direction@vizdata.ci");

  const coupee = await appel("/api/session", { session: "admin" });
  assert.equal(coupee.donnees, null, "l'autre session a bien été fermée");

  /* On rouvre la session « admin » : les tests suivants la supposent ouverte. */
  const retour = await appel("/api/session", {
    methode: "POST",
    corps: { email: "direction@vizdata.ci", motDePasse: "VizData2026" },
    session: "admin",
  });
  assert.equal(retour.statut, 200);
});

test("la connexion rend le compte des tentatives échouées", async () => {
  /* Le COMPTAGE lui-même est éprouvé sur la base, dans sessions.test.js : il
     se vérifie sans HTTP, et le faire ici consommerait le limiteur de débit
     partagé par tous les tests du fichier. Ce qui se vérifie ici, et nulle
     part ailleurs, c'est que le chiffre traverse bien la route : un compteur
     juste qui n'arrive pas jusqu'à l'écran ne prévient personne. */
  const entree = await appel("/api/session", {
    methode: "POST",
    corps: { email: "direction@vizdata.ci", motDePasse: "VizData2026" },
    session: "admin",
  });
  assert.equal(entree.statut, 200);
  assert.equal(typeof entree.donnees.tentatives_echouees, "number");

  const etat = await appel("/api/mes-sessions", { session: "admin" });
  assert.equal(etat.statut, 200);
  assert.ok("derniere_tentative_echouee" in etat.donnees);
});
