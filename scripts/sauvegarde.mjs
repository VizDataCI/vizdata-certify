/* Sauvegarde de la base, à chaud.
 *
 *   npm run sauvegarde              → data/sauvegardes/certify-AAAA-MM-JJ-HHMM.db
 *   npm run sauvegarde -- /ailleurs → dans le dossier indiqué
 *
 * Pourquoi un script et pas une copie de fichier
 * ----------------------------------------------
 * `cp certify.db` pendant qu'une écriture est en cours produit un fichier
 * incohérent : SQLite en mode WAL tient une partie des données dans un journal
 * séparé, et la copie peut attraper l'un sans l'autre. On s'en aperçoit le
 * jour où l'on restaure, c'est-à-dire au pire moment.
 *
 * L'API de sauvegarde de Node copie page par page en tenant compte des
 * écritures concurrentes, et produit un fichier cohérent sans jamais arrêter
 * le service. C'est la seule façon correcte de sauvegarder une base vivante.
 *
 * Pourquoi ce script existe du tout
 * ---------------------------------
 * Le registre a déjà disparu une fois : il vivait dans un projet hébergé qui a
 * cessé d'exister, et rien n'en avait été copié. Une base que l'on possède ne
 * protège de rien si personne ne la sauvegarde — elle déplace seulement la
 * responsabilité. Ce script la rend tenable ; la planification, elle, vous
 * appartient (voir le README, « Sauvegardes »).
 */

import { backup, DatabaseSync } from "node:sqlite";
import { mkdirSync, statSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { cheminBase } from "../server/db.mjs";

/** Horodatage pour le nom du fichier : triable, lisible, sans caractère interdit. */
function horodatage() {
  const d = new Date();
  const deux = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}-${deux(d.getHours())}${deux(d.getMinutes())}`;
}

const lisible = (octets) =>
  octets < 1024 * 1024 ? `${(octets / 1024).toFixed(0)} ko` : `${(octets / 1024 / 1024).toFixed(1)} Mo`;

/** Ne garde que les N sauvegardes les plus récentes. */
function elaguer(dossier, garder) {
  const fichiers = readdirSync(dossier)
    .filter((f) => f.startsWith("certify-") && f.endsWith(".db"))
    .map((f) => ({ f, t: statSync(join(dossier, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  const retires = fichiers.slice(garder);
  for (const { f } of retires) unlinkSync(join(dossier, f));
  return retires.length;
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

  const destination = join(dossier, `certify-${horodatage()}.db`);
  const db = new DatabaseSync(source, { readOnly: true });

  try {
    /* La base reste ouverte et servie pendant toute l'opération : la copie se
       fait page par page, en tenant compte des écritures concurrentes. */
    await backup(db, destination);
  } finally {
    db.close();
  }

  const taille = statSync(destination).size;
  const retires = elaguer(dossier, Number(process.env.VIZDATA_SAUVEGARDES_GARDEES || 30));

  console.log(`\n  Sauvegarde : ${destination}`);
  console.log(`  Taille     : ${lisible(taille)}`);
  if (retires) console.log(`  Élagage    : ${retires} sauvegarde(s) ancienne(s) retirée(s)`);

  /* Une sauvegarde qui reste sur la même machine ne protège que des erreurs
     humaines, pas d'une panne de disque ni de la perte du serveur. Le dire à
     chaque fois vaut mieux que de le supposer su. */
  console.log(`\n  Ce fichier est sur la MÊME machine que la base. Copiez-le ailleurs —`);
  console.log(`  un autre serveur, un disque externe, un espace de stockage distant —`);
  console.log(`  sans quoi il disparaîtra avec elle.\n`);

  return 0;
}

process.exitCode = await sauvegarder();
