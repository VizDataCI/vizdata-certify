/* Restaurer une sauvegarde.
 *
 *   npm run restaurer -- <fichier>          montre ce que contient la sauvegarde
 *   npm run restaurer -- <fichier> --oui    remplace réellement la base
 *
 * Une sauvegarde qu'on ne sait pas restaurer n'est pas une sauvegarde. Ce
 * script est donc écrit en même temps que celui qui sauvegarde, et pas « plus
 * tard, quand on en aura besoin » — c'est-à-dire sous la pression, un jour où
 * le registre est à l'arrêt.
 *
 * Trois précautions, qui viennent toutes de la même idée : on remplace le
 * registre officiel de VIZDATA, et une erreur ici ne se rattrape pas.
 *
 * 1. ON MONTRE AVANT DE FAIRE. Sans `--oui`, le script se contente de lire la
 *    sauvegarde et d'afficher ce qu'elle contient, en regard de ce que contient
 *    la base actuelle. On voit ce qu'on s'apprête à perdre.
 * 2. ON SAUVEGARDE CE QU'ON REMPLACE. La base actuelle est mise de côté avant
 *    d'être écrasée. Restaurer la mauvaise sauvegarde est une erreur banale ;
 *    la rendre irréversible serait une faute.
 * 3. ON EMPORTE LE JOURNAL. Les fichiers -wal et -shm appartiennent à l'ANCIENNE
 *    base. Les laisser à côté de la nouvelle ferait rejouer par SQLite un
 *    journal qui ne la concerne pas — et corromprait précisément ce qu'on vient
 *    de restaurer.
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, existsSync, rmSync, copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { cheminBase } from "../server/db.mjs";
import { dechiffrer, estChiffre } from "../server/chiffrement.mjs";

const TABLES_ESSENTIELLES = ["users", "certificates", "certificate_types", "certification_domains", "migrations"];

const lisible = (o) => (o < 1024 * 1024 ? `${(o / 1024).toFixed(0)} ko` : `${(o / 1024 / 1024).toFixed(1)} Mo`);

/** Ce que contient une base, pour la mettre en regard d'une autre. */
function inventaire(chemin) {
  if (!existsSync(chemin)) return null;
  const db = new DatabaseSync(chemin, { readOnly: true });
  try {
    const integrite = Object.values(db.prepare("pragma integrity_check").get() ?? {})[0];
    if (integrite !== "ok") throw new Error(`intégrité refusée : ${integrite}`);

    const tables = new Set(db.prepare("select name from sqlite_master where type='table'").all().map((r) => r.name));
    const manquantes = TABLES_ESSENTIELLES.filter((t) => !tables.has(t));
    if (manquantes.length) throw new Error(`tables absentes : ${manquantes.join(", ")}`);

    const n = (t) => (tables.has(t) ? db.prepare(`select count(*) as n from ${t}`).get().n : 0);
    const dernier = db
      .prepare("select reference, issue_date from certificates order by created_at desc limit 1")
      .get();

    return {
      comptes: n("users"),
      administrateurs: db.prepare("select count(*) as n from users where role = 'ADMIN'").get().n,
      certificats: n("certificates"),
      programmes: n("certificate_types"),
      candidatures: n("candidatures"),
      dernierCertificat: dernier ? `${dernier.reference} (${dernier.issue_date})` : "aucun",
      migrations: db.prepare("select nom from migrations order by nom").all().map((r) => r.nom).join(", "),
    };
  } finally {
    db.close();
  }
}

function tableau(titre, inv) {
  console.log(`\n  ${titre}`);
  if (!inv) {
    console.log("    (aucune base à cet emplacement)");
    return;
  }
  console.log(`    comptes ................ ${inv.comptes} (dont ${inv.administrateurs} administrateur·s)`);
  console.log(`    certificats ............ ${inv.certificats}`);
  console.log(`    programmes ............. ${inv.programmes}`);
  console.log(`    candidatures ........... ${inv.candidatures}`);
  console.log(`    dernier certificat ..... ${inv.dernierCertificat}`);
  console.log(`    migrations ............. ${inv.migrations}`);
}

function restaurer() {
  const arguments_ = process.argv.slice(2).filter((a) => a !== "--oui");
  const confirme = process.argv.includes("--oui");
  const source = arguments_[0];

  if (!source) {
    console.error(`
  Restaurer une sauvegarde VIZDATA CERTIFY

    npm run restaurer -- <fichier>          montre ce que contient la sauvegarde
    npm run restaurer -- <fichier> --oui    remplace réellement la base

  La base visée est ${process.env.VIZDATA_DB || "data/certify.db"}.
  Une sauvegarde chiffrée demande VIZDATA_SAUVEGARDE_CLE.
`);
    return 2;
  }

  const fichier = resolve(source);
  if (!existsSync(fichier)) {
    console.error(`\n  Fichier introuvable : ${fichier}\n`);
    return 2;
  }

  /* --- 1. lire, déchiffrer s'il le faut ---------------------------------- */
  let contenu = readFileSync(fichier);
  const chiffre = estChiffre(contenu);

  if (chiffre) {
    const cle = process.env.VIZDATA_SAUVEGARDE_CLE || "";
    if (!cle) {
      console.error(`\n  Cette sauvegarde est chiffrée. Renseignez VIZDATA_SAUVEGARDE_CLE pour la relire.\n`);
      return 2;
    }
    try {
      contenu = dechiffrer(contenu, cle);
    } catch (e) {
      console.error(`\n  ${e.message}\n`);
      return 1;
    }
  }

  /* --- 2. vérifier avant de toucher à quoi que ce soit -------------------- */
  const provisoire = join(tmpdir(), `vizdata-restauration-${process.pid}.db`);
  writeFileSync(provisoire, contenu);

  let depuis;
  try {
    depuis = inventaire(provisoire);
  } catch (e) {
    rmSync(provisoire, { force: true });
    console.error(`\n  SAUVEGARDE INEXPLOITABLE — ${e.message}`);
    console.error("  La base en place n'a pas été touchée.\n");
    return 1;
  }

  const cible = cheminBase();
  let actuelle = null;
  try {
    actuelle = inventaire(cible);
  } catch (e) {
    console.log(`\n  (la base en place est illisible : ${e.message})`);
  }

  console.log(`\n  Sauvegarde : ${basename(fichier)}  —  ${lisible(statSync(fichier).size)}${chiffre ? ", chiffrée" : ""}`);
  console.log(`  Déposée le : ${statSync(fichier).mtime.toLocaleString("fr-FR")}`);
  tableau("Elle contient :", depuis);
  tableau(`Elle remplacerait (${cible}) :`, actuelle);

  if (!confirme) {
    console.log(`
  Rien n'a été modifié.

  Pour restaurer réellement :
    npm run restaurer -- ${source} --oui

  Arrêtez le service d'abord, sinon il écrira dans la base que vous remplacez :
    sudo systemctl stop vizdata-certify
`);
    rmSync(provisoire, { force: true });
    return 0;
  }

  /* --- 3. mettre de côté ce qu'on remplace ------------------------------- */
  if (existsSync(cible)) {
    const avant = join(
      dirname(cible),
      `avant-restauration-${new Date().toISOString().replace(/[:.]/g, "-")}.db`
    );
    mkdirSync(dirname(avant), { recursive: true });
    copyFileSync(cible, avant);
    console.log(`\n  Base précédente mise de côté : ${avant}`);
  }

  /* --- 4. remplacer, journal compris ------------------------------------- */
  mkdirSync(dirname(cible), { recursive: true });
  copyFileSync(provisoire, cible);
  /* Les -wal et -shm appartiennent à la base qu'on vient de remplacer. Les
     laisser ferait rejouer un journal étranger sur la nouvelle. */
  rmSync(`${cible}-wal`, { force: true });
  rmSync(`${cible}-shm`, { force: true });
  rmSync(provisoire, { force: true });

  /* --- 5. relire ce qu'on vient d'écrire --------------------------------- */
  const apres = inventaire(cible);
  console.log(`  Base restaurée : ${cible}`);
  tableau("Elle contient maintenant :", apres);
  console.log(`
  Redémarrez le service :
    sudo systemctl start vizdata-certify
`);
  return 0;
}

process.exitCode = restaurer();
