/* Sauvegarde de la base : à chaud, vérifiée, chiffrée, expédiée.
 *
 *   npm run sauvegarde                 → data/sauvegardes/
 *   npm run sauvegarde -- /ailleurs    → dans le dossier indiqué
 *
 * Quatre étapes, et chacune répond à une façon précise de perdre le registre.
 *
 * 1. À CHAUD. `cp certify.db` pendant qu'une écriture est en cours produit un
 *    fichier incohérent : SQLite en mode WAL tient une partie des données dans
 *    un journal séparé, et la copie peut attraper l'un sans l'autre. On s'en
 *    aperçoit le jour où l'on restaure, c'est-à-dire au pire moment. L'API de
 *    sauvegarde de Node copie page par page en tenant compte des écritures
 *    concurrentes, sans jamais arrêter le service.
 *
 * 2. VÉRIFIÉE. Une sauvegarde jamais relue est un espoir, pas une sauvegarde.
 *    Celle-ci est rouverte, contrôlée par `pragma integrity_check`, et l'on
 *    vérifie qu'elle contient bien les tables du registre. Si quelque chose
 *    cloche, le script échoue BRUYAMMENT plutôt que de laisser croire.
 *
 * 3. CHIFFRÉE. Elle contient noms, adresses, téléphones et empreintes de mots
 *    de passe. Elle doit quitter le serveur : sinon elle ne protège que des
 *    erreurs humaines, et elle ne peut pas en partir en clair.
 *
 * 4. EXPÉDIÉE. L'étape « pense à la copier ailleurs » ne se fait jamais. Elle
 *    est donc confiée à une commande, lancée par le script lui-même.
 *
 * Configuration
 * -------------
 *   VIZDATA_DB                    la base (défaut : data/certify.db)
 *   VIZDATA_SAUVEGARDE_CLE        mot de passe de chiffrement
 *   VIZDATA_SAUVEGARDE_DISTANTE   commande d'expédition, {fichier} remplacé
 *   VIZDATA_SAUVEGARDES_GARDEES   combien on en garde sur place (défaut 30)
 */

import { backup, DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync, readdirSync, unlinkSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { cheminBase } from "../server/db.mjs";
import { chiffrer } from "../server/chiffrement.mjs";

/** Les tables sans lesquelles une sauvegarde ne vaut rien. */
const TABLES_ESSENTIELLES = ["users", "certificates", "certificate_types", "certification_domains", "migrations"];

/** Horodatage pour le nom : triable, lisible, sans caractère interdit. */
function horodatage() {
  const d = new Date();
  const deux = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}-${deux(d.getHours())}${deux(d.getMinutes())}`;
}

const lisible = (octets) =>
  octets < 1024 * 1024 ? `${(octets / 1024).toFixed(0)} ko` : `${(octets / 1024 / 1024).toFixed(1)} Mo`;

/**
 * Replie le journal de la copie dans son fichier principal.
 *
 * La copie hérite du mode WAL de la source : elle arrive donc accompagnée d'un
 * `-wal` et d'un `-shm`. Deux conséquences, et la seconde est grave :
 *
 *   - la sauvegarde n'est pas UN fichier mais trois, et n'en déplacer qu'un
 *     revient à perdre les écritures les plus récentes ;
 *   - le `-wal` contient des données EN CLAIR. Chiffrer le fichier principal
 *     en le laissant à côté annulerait tout l'intérêt du chiffrement.
 *
 * `journal_mode = delete` replie le journal et le supprime : il ne reste
 * qu'un fichier, complet et seul.
 */
function consolider(chemin) {
  const db = new DatabaseSync(chemin);
  try {
    db.exec("pragma journal_mode = delete");
  } finally {
    db.close();
  }
  for (const suffixe of ["-wal", "-shm"]) rmSync(chemin + suffixe, { force: true });
}

/**
 * Relit la sauvegarde et dit ce qu'elle contient.
 *
 * `integrity_check` parcourt réellement les pages : il détecte une copie
 * tronquée, un index désaccordé, une page illisible. C'est le seul contrôle
 * qui distingue « un fichier existe » de « une base est restaurable ».
 */
function verifier(chemin) {
  const db = new DatabaseSync(chemin, { readOnly: true });
  try {
    const integrite = db.prepare("pragma integrity_check").get();
    const verdict = integrite ? Object.values(integrite)[0] : "aucune réponse";
    if (verdict !== "ok") throw new Error(`intégrité refusée : ${verdict}`);

    const tables = new Set(
      db.prepare("select name from sqlite_master where type = 'table'").all().map((r) => r.name)
    );
    const manquantes = TABLES_ESSENTIELLES.filter((t) => !tables.has(t));
    if (manquantes.length) throw new Error(`tables absentes : ${manquantes.join(", ")}`);

    const compte = (t) => db.prepare(`select count(*) as n from ${t}`).get().n;
    return {
      comptes: compte("users"),
      certificats: compte("certificates"),
      programmes: compte("certificate_types"),
      candidatures: tables.has("candidatures") ? compte("candidatures") : 0,
    };
  } finally {
    db.close();
  }
}

/** Ne garde que les N sauvegardes les plus récentes. */
function elaguer(dossier, garder) {
  const fichiers = readdirSync(dossier)
    .filter((f) => f.startsWith("certify-"))
    .map((f) => ({ f, t: statSync(join(dossier, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  const retires = fichiers.slice(garder);
  for (const { f } of retires) unlinkSync(join(dossier, f));
  return retires.length;
}

/**
 * Lance la commande d'expédition.
 *
 * On passe par un shell parce que la commande est écrite par un humain dans
 * une variable d'environnement : elle contient souvent un tube ou une
 * redirection. C'est la configuration du serveur, pas une entrée d'utilisateur.
 */
function expedier(commande, fichier) {
  const ligne = commande.replaceAll("{fichier}", fichier);
  execFileSync(process.platform === "win32" ? "cmd" : "sh", process.platform === "win32" ? ["/c", ligne] : ["-c", ligne], {
    stdio: "inherit",
    timeout: 10 * 60_000,
  });
}

async function sauvegarder() {
  const source = cheminBase();

  if (!existsSync(source)) {
    console.error(`\n  Aucune base à sauvegarder : ${source} n'existe pas.`);
    console.error("  Créez-la d'abord avec « npm run base -- init ».\n");
    return 2;
  }

  const dossier = resolve(process.argv[2] || join(dirname(source), "sauvegardes"));
  mkdirSync(dossier, { recursive: true });

  const cle = process.env.VIZDATA_SAUVEGARDE_CLE || "";
  const distante = process.env.VIZDATA_SAUVEGARDE_DISTANTE || "";
  const base = join(dossier, `certify-${horodatage()}.db`);

  /* --- 1 et 2. copier à chaud, replier le journal, vérifier ---------------
     Les trois tiennent dans le même filet : la source peut être illisible, la
     copie peut échouer à mi-parcours, la vérification peut refuser. Dans tous
     les cas, on efface ce qui a été produit. Une sauvegarde illisible est pire
     que pas de sauvegarde : elle rassure. */
  let contenu;
  try {
    const db = new DatabaseSync(source, { readOnly: true });
    try {
      await backup(db, base);
    } finally {
      db.close();
    }
    consolider(base);
    contenu = verifier(base);
  } catch (e) {
    for (const suffixe of ["", "-wal", "-shm"]) rmSync(base + suffixe, { force: true });
    console.error(`\n  SAUVEGARDE REFUSÉE, ${e.message}`);
    console.error("  Rien n'a été laissé en place : un fichier inexploitable rassurerait à tort.");
    console.error(`  Vérifiez la base elle-même : ${source}\n`);
    return 1;
  }

  /* --- 3. chiffrement ----------------------------------------------------- */
  let fichier = base;
  if (cle) {
    const chiffre = `${base}.chiffre`;
    writeFileSync(chiffre, chiffrer(readFileSync(base), cle));
    /* La copie en clair n'a plus lieu d'être : la laisser à côté de la version
       chiffrée annulerait tout l'intérêt du chiffrement. Le journal est déjà
       replié par `consolider`, mais on s'en assure : c'est précisément ce
       genre de fichier oublié qui fait fuir une base. */
    for (const suffixe of ["", "-wal", "-shm"]) rmSync(base + suffixe, { force: true });
    fichier = chiffre;
  }

  const taille = statSync(fichier).size;
  console.log(`\n  Sauvegarde : ${fichier}`);
  console.log(`  Taille     : ${lisible(taille)}${cle ? " (chiffrée)" : ""}`);
  console.log(
    `  Contenu    : ${contenu.comptes} compte(s), ${contenu.certificats} certificat(s), ` +
      `${contenu.programmes} programme(s), ${contenu.candidatures} candidature(s)`
  );
  console.log(`  Vérifiée   : intégrité contrôlée, tables du registre présentes`);

  /* --- 4. expédition ------------------------------------------------------ */
  if (distante) {
    if (!cle) {
      /* On refuse plutôt que d'expédier en clair. Régler un problème de
         disponibilité en créant une fuite serait un mauvais échange. */
      console.error("\n  EXPÉDITION ANNULÉE : la sauvegarde n'est pas chiffrée.");
      console.error("  Renseignez VIZDATA_SAUVEGARDE_CLE avant d'envoyer la base hors du serveur.");
      console.error("  Elle contient des données personnelles et des empreintes de mots de passe.\n");
      return 1;
    }
    try {
      console.log(`  Expédition : ${distante.replaceAll("{fichier}", "…")}`);
      expedier(distante, fichier);
      console.log(`  Expédiée   : hors du serveur\n`);
    } catch (e) {
      /* La copie locale existe : on ne perd rien, mais on le dit fort : une
         expédition silencieusement en échec, c'est un serveur qu'on croit
         sauvegardé et qui ne l'est pas. */
      console.error(`\n  EXPÉDITION EN ÉCHEC : ${e.message}`);
      console.error("  La sauvegarde est sur place, mais elle n'a PAS quitté le serveur.\n");
      elaguer(dossier, Number(process.env.VIZDATA_SAUVEGARDES_GARDEES || 30));
      return 1;
    }
  }

  const retires = elaguer(dossier, Number(process.env.VIZDATA_SAUVEGARDES_GARDEES || 30));
  if (retires) console.log(`  Élagage    : ${retires} sauvegarde(s) ancienne(s) retirée(s)`);

  if (!cle) {
    console.log(`\n  Non chiffrée : VIZDATA_SAUVEGARDE_CLE n'est pas renseignée.`);
    console.log(`  Acceptable pour une copie qui ne quitte pas la machine, jamais pour une`);
    console.log(`  qui en part : ce fichier contient des empreintes de mots de passe.`);
  }
  if (!distante) {
    console.log(`\n  Sur place seulement : VIZDATA_SAUVEGARDE_DISTANTE n'est pas renseignée.`);
    console.log(`  Cette copie est sur la MÊME machine que la base. Elle protège d'une`);
    console.log(`  fausse manœuvre, pas d'une panne de disque ni de la perte du serveur.`);
    console.log(`  Voir docs/deploiement.md, « Les sauvegardes ».`);
  }
  console.log("");

  return 0;
}

process.exitCode = await sauvegarder();
