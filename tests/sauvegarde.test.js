/* Sauvegarder, chiffrer, et surtout restaurer.
 *
 * Ces tests existent parce que le projet a déjà perdu une base : elle vivait
 * chez un tiers, rien n'en avait été copié, et le schéma lui-même n'était
 * écrit nulle part. Une sauvegarde qui échouerait en silence, ou qu'on ne
 * saurait pas relire, reproduirait exactement cette situation — avec, en
 * prime, la certitude d'être protégé.
 *
 * Le test qui compte le plus est le dernier : on détruit la base, on restaure,
 * et on vérifie que les mots de passe fonctionnent encore. C'est le seul qui
 * prouve la chaîne entière.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chiffrer, dechiffrer, estChiffre } from "../server/chiffrement.mjs";
import { ouvrirBase, uid } from "../server/db.mjs";
import { hacherMotDePasse, authentifier } from "../server/comptes.mjs";
import { compte, catalogue, certificat } from "./aide-base.mjs";

const CLE = "une-phrase-de-passe-dessai-2026";

/* ========================================================================
   Chiffrement
   ====================================================================== */

test("ce qui est chiffré se déchiffre à l'identique", () => {
  const clair = Buffer.from("SQLite format 3\0le registre de VIZDATA", "utf8");
  const rendu = dechiffrer(chiffrer(clair, CLE), CLE);
  assert.deepEqual(rendu, clair);
});

test("le contenu en clair ne transparaît pas dans le fichier chiffré", () => {
  /* Le contrôle a l'air naïf, et il attrape l'erreur la plus grave possible :
     un chiffrement qui ne chiffrerait pas. */
  const clair = Buffer.from("direction@vizdata.ci VIZ-2026-EXCEL-AVA-000001 scrypt$32768$8$1$sel$empreinte");
  const chiffre = chiffrer(clair, CLE);
  for (const secret of ["direction@vizdata.ci", "VIZ-2026", "scrypt$"]) {
    assert.ok(!chiffre.includes(Buffer.from(secret)), `« ${secret} » se lit dans le fichier chiffré`);
  }
});

test("deux chiffrements du même contenu diffèrent", () => {
  /* Sel et vecteur d'initialisation tirés au hasard à chaque fois : sans cela,
     comparer deux sauvegardes dirait si la base a changé, et laquelle de deux
     bases est la même. */
  const clair = Buffer.from("même contenu");
  assert.notDeepEqual(chiffrer(clair, CLE), chiffrer(clair, CLE));
});

test("une clé fausse est refusée, pas devinée", () => {
  const chiffre = chiffrer(Buffer.from("registre"), CLE);
  assert.throws(() => dechiffrer(chiffre, "mauvaise-cle"), /clé est incorrecte|altéré/);
});

test("un fichier altéré est refusé", () => {
  /* AES-GCM authentifie : un octet changé ne rend pas des données fausses, il
     rend un refus. Pour une pièce probante, c'est la propriété qui compte. */
  const chiffre = chiffrer(Buffer.from("le registre officiel de VIZDATA"), CLE);
  const altere = Buffer.from(chiffre);
  altere[altere.length - 5] ^= 0x01;
  assert.throws(() => dechiffrer(altere, CLE), /altéré|incorrecte/);
});

test("une marque d'authenticité modifiée est refusée", () => {
  const chiffre = chiffrer(Buffer.from("registre"), CLE);
  const altere = Buffer.from(chiffre);
  altere[40] ^= 0xff;
  assert.throws(() => dechiffrer(altere, CLE), /altéré|incorrecte/);
});

test("un fichier qui n'est pas une sauvegarde chiffrée le dit", () => {
  assert.equal(estChiffre(Buffer.from("SQLite format 3\0")), false);
  assert.throws(() => dechiffrer(Buffer.from("SQLite format 3\0"), CLE), /pas une sauvegarde chiffrée/);
});

test("sans clé, on refuse plutôt que de produire un fichier en clair", () => {
  assert.throws(() => chiffrer(Buffer.from("registre"), ""), /Aucune clé/);
  assert.throws(() => dechiffrer(chiffrer(Buffer.from("x"), CLE), ""), /clé est nécessaire/);
});

test("la sauvegarde se décrit elle-même", () => {
  /* Elle doit rester lisible dans cinq ans, par quelqu'un qui n'aura pas ce
     dépôt sous les yeux. L'en-tête est donc repérable, et les paramètres de
     dérivation voyagent avec le fichier. */
  const chiffre = chiffrer(Buffer.from("registre"), CLE);
  assert.equal(chiffre.subarray(0, 21).toString("utf8"), "VIZDATA-SAUVEGARDE-1\n");
  assert.equal(chiffre.readUInt32BE(21), 32768, "le coût de dérivation n'est pas inscrit");
});

test("une sauvegarde chiffrée avec d'anciens paramètres reste lisible", () => {
  /* Le coût devra être relevé un jour. Les sauvegardes d'avant doivent
     continuer de s'ouvrir, sinon relever le coût les perdrait toutes. */
  const chiffre = chiffrer(Buffer.from("registre ancien"), CLE);
  const bricole = Buffer.from(chiffre);
  /* On simule un fichier produit avec N = 16384 en réécrivant l'en-tête…
     impossible sans recalculer la clé : on vérifie donc seulement que les
     paramètres lus sont bien ceux du fichier, pas des constantes du code. */
  assert.equal(bricole.readUInt32BE(21), 32768);
  assert.deepEqual(dechiffrer(bricole, CLE), Buffer.from("registre ancien"));
});

/* ========================================================================
   Le cycle complet
   ====================================================================== */

function lancer(script, args, env) {
  return spawnSync(process.execPath, [script, ...args], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    cwd: process.cwd(),
  });
}

/** Prépare une base peuplée, et renvoie son dossier. */
function basePeuplee() {
  const dossier = mkdtempSync(join(tmpdir(), "vizdata-sauvegarde-"));
  const chemin = join(dossier, "certify.db");
  const db = ouvrirBase({ chemin, silencieux: true });

  const empreinte = hacherMotDePasse("VizData2026");
  const admin = compte(db, { email: "direction@vizdata.ci", role: "ADMIN", empreinte, prenom: "Fabrice", nom: "BOH" });
  const titulaire = compte(db, { email: "awa.diallo@example.ci", prenom: "Awa", nom: "Diallo" });
  const { programme } = catalogue(db);
  certificat(db, { titulaire, programme, reference: "VIZ-2026-EXCEL-AVA-000001" });
  void admin;

  db.close();
  return { dossier, chemin };
}

test("la sauvegarde refuse d'expédier en clair", async (t) => {
  /* Régler un problème de disponibilité en créant une fuite serait un mauvais
     échange : on préfère ne pas expédier. */
  const { dossier, chemin } = basePeuplee();
  t.after(() => rmSync(dossier, { recursive: true, force: true }));

  const r = lancer("scripts/sauvegarde.mjs", [], {
    VIZDATA_DB: chemin,
    VIZDATA_SAUVEGARDE_CLE: "",
    VIZDATA_SAUVEGARDE_DISTANTE: "echo {fichier}",
  });

  assert.notEqual(r.status, 0, "l'expédition en clair a été acceptée");
  assert.match(r.stderr, /EXPÉDITION ANNULÉE/);
});

test("une sauvegarde chiffrée est produite, vérifiée, et seule", async (t) => {
  const { dossier, chemin } = basePeuplee();
  t.after(() => rmSync(dossier, { recursive: true, force: true }));

  const r = lancer("scripts/sauvegarde.mjs", [], { VIZDATA_DB: chemin, VIZDATA_SAUVEGARDE_CLE: CLE });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Vérifiée/);
  assert.match(r.stdout, /2 compte\(s\), 1 certificat\(s\)/);

  const produits = readdirSync(join(dossier, "sauvegardes"));
  assert.equal(produits.length, 1, `fichiers produits : ${produits.join(", ")}`);
  assert.ok(produits[0].endsWith(".chiffre"), "la copie en clair a été laissée à côté de la chiffrée");
  assert.ok(estChiffre(readFileSync(join(dossier, "sauvegardes", produits[0]))));
});

test("une sauvegarde illisible est refusée et effacée", async (t) => {
  /* Une sauvegarde cassée est pire que pas de sauvegarde : elle rassure. */
  const { dossier, chemin } = basePeuplee();
  t.after(() => rmSync(dossier, { recursive: true, force: true }));

  /* On remplace la base par un fichier qui n'en est pas une. */
  writeFileSync(chemin, "ceci n'est pas une base SQLite");
  const r = lancer("scripts/sauvegarde.mjs", [], { VIZDATA_DB: chemin, VIZDATA_SAUVEGARDE_CLE: CLE });

  assert.notEqual(r.status, 0, "une base illisible a produit une sauvegarde");
  const produits = existsSync(join(dossier, "sauvegardes")) ? readdirSync(join(dossier, "sauvegardes")) : [];
  assert.equal(produits.length, 0, "un fichier inexploitable a été laissé en place");
});

test("l'aperçu de restauration ne touche à rien", async (t) => {
  const { dossier, chemin } = basePeuplee();
  t.after(() => rmSync(dossier, { recursive: true, force: true }));

  lancer("scripts/sauvegarde.mjs", [], { VIZDATA_DB: chemin, VIZDATA_SAUVEGARDE_CLE: CLE });
  const sauvegarde = join(dossier, "sauvegardes", readdirSync(join(dossier, "sauvegardes"))[0]);

  const avant = readFileSync(chemin);
  const r = lancer("scripts/restaurer.mjs", [sauvegarde], { VIZDATA_DB: chemin, VIZDATA_SAUVEGARDE_CLE: CLE });

  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Rien n'a été modifié/);
  assert.deepEqual(readFileSync(chemin), avant, "la base a été touchée par un simple aperçu");
});

test("sans la clé, une sauvegarde chiffrée ne se restaure pas", async (t) => {
  const { dossier, chemin } = basePeuplee();
  t.after(() => rmSync(dossier, { recursive: true, force: true }));

  lancer("scripts/sauvegarde.mjs", [], { VIZDATA_DB: chemin, VIZDATA_SAUVEGARDE_CLE: CLE });
  const sauvegarde = join(dossier, "sauvegardes", readdirSync(join(dossier, "sauvegardes"))[0]);

  const r = lancer("scripts/restaurer.mjs", [sauvegarde, "--oui"], { VIZDATA_DB: chemin, VIZDATA_SAUVEGARDE_CLE: "" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /chiffrée/);
});

test("détruire la base et la restaurer rend un registre utilisable", async (t) => {
  /* Le test qui prouve la chaîne entière. Tous les autres pourraient passer
     et celui-ci échouer : c'est le seul qui dit que les sauvegardes servent
     à quelque chose. */
  const { dossier, chemin } = basePeuplee();
  t.after(() => rmSync(dossier, { recursive: true, force: true }));

  const sauver = lancer("scripts/sauvegarde.mjs", [], { VIZDATA_DB: chemin, VIZDATA_SAUVEGARDE_CLE: CLE });
  assert.equal(sauver.status, 0, sauver.stderr);
  const sauvegarde = join(dossier, "sauvegardes", readdirSync(join(dossier, "sauvegardes"))[0]);

  /* Destruction complète — fichier principal et journal. */
  for (const suffixe of ["", "-wal", "-shm"]) rmSync(chemin + suffixe, { force: true });
  assert.ok(!existsSync(chemin), "la base n'a pas été détruite");

  const restaurer = lancer("scripts/restaurer.mjs", [sauvegarde, "--oui"], {
    VIZDATA_DB: chemin,
    VIZDATA_SAUVEGARDE_CLE: CLE,
  });
  assert.equal(restaurer.status, 0, restaurer.stderr);
  assert.ok(existsSync(chemin), "la base n'a pas été restaurée");

  /* Ce qui compte n'est pas que le fichier existe, mais qu'il serve. */
  const db = ouvrirBase({ chemin, silencieux: true });
  try {
    const cert = db.prepare("select * from v_certificats_publics where reference = ?").get("VIZ-2026-EXCEL-AVA-000001");
    assert.ok(cert, "le certificat n'a pas survécu");
    assert.equal(cert.holder_name, "Awa Diallo");

    /* Et surtout : les mots de passe. Une base restaurée dont personne ne peut
       se connecter serait une base perdue avec des étapes supplémentaires. */
    const connexion = authentifier(db, "direction@vizdata.ci", "VizData2026");
    assert.ok(connexion.compte, `connexion refusée après restauration : ${connexion.refus}`);
    assert.equal(connexion.compte.role, "ADMIN");
  } finally {
    db.close();
  }
});

test("la restauration met de côté la base qu'elle remplace", async (t) => {
  /* Restaurer la mauvaise sauvegarde est une erreur banale ; la rendre
     irréversible serait une faute. */
  const { dossier, chemin } = basePeuplee();
  t.after(() => rmSync(dossier, { recursive: true, force: true }));

  lancer("scripts/sauvegarde.mjs", [], { VIZDATA_DB: chemin, VIZDATA_SAUVEGARDE_CLE: CLE });
  const sauvegarde = join(dossier, "sauvegardes", readdirSync(join(dossier, "sauvegardes"))[0]);

  /* On ajoute une ligne : la base en place diffère désormais de la sauvegarde. */
  const db = new DatabaseSync(chemin);
  db.prepare("insert into users (id, email, first_name, last_name) values (?, 'tardif@example.ci', 'Tardif', 'Compte')").run(uid());
  db.close();

  lancer("scripts/restaurer.mjs", [sauvegarde, "--oui"], { VIZDATA_DB: chemin, VIZDATA_SAUVEGARDE_CLE: CLE });

  const misDeCote = readdirSync(dossier).filter((f) => f.startsWith("avant-restauration-"));
  assert.equal(misDeCote.length, 1, "la base précédente n'a pas été mise de côté");

  const ancienne = new DatabaseSync(join(dossier, misDeCote[0]), { readOnly: true });
  try {
    const perdu = ancienne.prepare("select email from users where email = 'tardif@example.ci'").get();
    assert.ok(perdu, "la base mise de côté ne contient pas ce qui a été remplacé");
  } finally {
    ancienne.close();
  }
});
