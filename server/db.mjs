/* Ouverture et entretien de la base SQLite.
 *
 * Aucune dépendance : `node:sqlite` est livré avec Node depuis la version 22.
 * C'est l'un des arguments du choix — un pilote de base de données est
 * exactement le genre de dépendance qu'on ne veut pas voir changer de
 * mainteneur ou de licence au milieu de la vie d'un registre.
 *
 * Les PRAGMA ne sont pas des réglages d'optimisation
 * --------------------------------------------------
 * Trois d'entre eux changent la correction, pas la vitesse, et doivent être
 * posés à CHAQUE ouverture — ils ne sont pas stockés dans le fichier :
 *
 *   foreign_keys = ON   SQLite ignore les clés étrangères par défaut. Sans ce
 *                       pragma, « references users(id) » est un commentaire :
 *                       on pourrait délivrer un certificat à un titulaire
 *                       inexistant, et supprimer un titulaire qui en porte.
 *   journal_mode = WAL  les lectures ne bloquent plus les écritures. Une page
 *                       de vérification consultée pendant qu'un administrateur
 *                       délivre un certificat ne doit pas attendre.
 *   busy_timeout        au lieu d'échouer immédiatement sur une base occupée,
 *                       on patiente. Sans lui, deux écritures simultanées se
 *                       soldent par « database is locked ».
 *
 * `synchronous = NORMAL` est le compromis recommandé avec WAL : on ne perd une
 * transaction qu'en cas de coupure brutale de la machine, jamais sur un simple
 * arrêt du processus.
 */

import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const DOSSIER_SCHEMA = join(ICI, "schema");

/** Emplacement du fichier de base. Une variable d'environnement, pas une
 *  constante : en production il vit hors du dépôt, et les tests en ouvrent un
 *  à eux dans un dossier temporaire. */
function cheminBase() {
  return resolve(process.env.VIZDATA_DB || join(process.cwd(), "data", "certify.db"));
}

/* --- petites fabriques partagées ---------------------------------------- */

/** Identifiant : un uuid v4, en texte. Imprévisible, et de longueur fixe. */
const uid = () => randomUUID();

/** Horodatage ISO-8601 UTC — le même format que les valeurs par défaut SQL,
 *  et il se trie dans l'ordre chronologique. */
const maintenant = () => new Date().toISOString();

/** Date du jour au format 'AAAA-MM-JJ'. */
const jour = () => new Date().toISOString().slice(0, 10);

/** Horodatage décalé de n secondes — pour les expirations. */
const dans = (secondes) => new Date(Date.now() + secondes * 1000).toISOString();

/* --- ouverture ----------------------------------------------------------- */

/**
 * Ouvre la base, pose les pragmas, applique les migrations manquantes.
 * @param {{chemin?: string, silencieux?: boolean}} options
 */
function ouvrirBase({ chemin = cheminBase(), silencieux = false } = {}) {
  /* Le dossier doit exister : SQLite crée le fichier, pas l'arborescence. */
  mkdirSync(dirname(chemin), { recursive: true });

  const db = new DatabaseSync(chemin);

  db.exec("pragma foreign_keys = on");
  db.exec("pragma journal_mode = wal");
  db.exec("pragma synchronous = normal");
  db.exec("pragma busy_timeout = 5000");

  /* Contrôle plutôt que confiance : un pragma refusé en silence rendrait
     toutes les clés étrangères décoratives, et rien ne le signalerait avant
     qu'une ligne orpheline n'apparaisse. */
  const fk = db.prepare("pragma foreign_keys").get();
  if (!fk || Number(Object.values(fk)[0]) !== 1) {
    db.close();
    throw new Error("Les clés étrangères n'ont pas pu être activées : base ouverte sans intégrité référentielle.");
  }

  appliquerMigrations(db, { silencieux });
  return db;
}

/* --- migrations ---------------------------------------------------------- */

/** Les fichiers de `server/schema/`, dans l'ordre de leur nom. */
function fichiersMigration() {
  return readdirSync(DOSSIER_SCHEMA)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * Applique les migrations absentes de la table `migrations`.
 *
 * Chaque fichier est joué dans une transaction : s'il échoue à mi-parcours, la
 * base reste dans l'état d'avant, et elle n'est pas marquée comme migrée. Une
 * migration à moitié appliquée est la pire des situations — elle ne se rejoue
 * pas, et elle ne fonctionne pas.
 */
function appliquerMigrations(db, { silencieux = false } = {}) {
  db.exec(`
    create table if not exists migrations (
      nom        text primary key,
      applique_a text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  const deja = new Set(db.prepare("select nom from migrations").all().map((r) => r.nom));

  for (const fichier of fichiersMigration()) {
    if (deja.has(fichier)) continue;

    const sql = readFileSync(join(DOSSIER_SCHEMA, fichier), "utf8");
    db.exec("begin");
    try {
      db.exec(sql);
      db.prepare("insert into migrations (nom) values (?)").run(fichier);
      db.exec("commit");
      if (!silencieux) console.log(`  migration appliquée : ${fichier}`);
    } catch (e) {
      db.exec("rollback");
      throw new Error(`Migration ${fichier} refusée : ${e.message}`);
    }
  }
}

/* --- transactions -------------------------------------------------------- */

/**
 * Exécute `travail` dans une transaction, et défait tout en cas d'échec.
 *
 * Indispensable partout où deux écritures n'ont de sens qu'ensemble : créer un
 * certificat et lier ses compétences, créer un titulaire et son invitation.
 * Une moitié d'opération laisse des données qui mentent.
 */
function enTransaction(db, travail) {
  db.exec("begin");
  try {
    const resultat = travail();
    db.exec("commit");
    return resultat;
  } catch (e) {
    try { db.exec("rollback"); } catch { /* transaction déjà refermée */ }
    throw e;
  }
}

/* --- confort de lecture -------------------------------------------------- */

/** Première ligne, ou null. */
const un = (db, sql, ...params) => db.prepare(sql).get(...params) ?? null;

/** Toutes les lignes. */
const tous = (db, sql, ...params) => db.prepare(sql).all(...params);

/** Exécute et renvoie le nombre de lignes touchées. */
const ecrire = (db, sql, ...params) => db.prepare(sql).run(...params).changes;

/** Booléen SQLite (0/1) vers booléen JavaScript. */
const bool = (v) => v === 1 || v === true;

/** Booléen JavaScript vers entier SQLite. */
const entier = (v) => (v ? 1 : 0);

/** JSON stocké en texte vers objet, sans jamais lever. */
function json(texte, defaut = {}) {
  if (texte == null) return defaut;
  if (typeof texte === "object") return texte;
  try {
    return JSON.parse(texte);
  } catch {
    return defaut;
  }
}

export {
  ouvrirBase,
  cheminBase,
  enTransaction,
  appliquerMigrations,
  fichiersMigration,
  uid,
  maintenant,
  jour,
  dans,
  un,
  tous,
  ecrire,
  bool,
  entier,
  json,
};
