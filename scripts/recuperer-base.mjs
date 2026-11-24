/* Récupère ce qui est lisible d'une base abîmée, dans une base neuve.
 *
 *   node scripts/recuperer-base.mjs <source-abimée> <destination>
 *
 * Pourquoi ce script existe
 * -------------------------
 * Une base SQLite dont le fichier principal a été remplacé pendant que son
 * journal WAL vivait encore se retrouve mélangée : les pages des deux
 * versions cohabitent. `pragma integrity_check` le dit, et la base reste
 * LISIBLE — c'est le piège. On peut continuer à s'en servir des semaines,
 * jusqu'au jour où une page abîmée est enfin touchée.
 *
 * La seule issue propre est de repartir d'un fichier neuf : on crée une base
 * vierge, à qui les migrations donnent le schéma COURANT, puis on y recopie
 * ligne à ligne ce que l'ancienne accepte encore de rendre.
 *
 * Ce que le script ne fait pas, volontairement
 * --------------------------------------------
 * Il n'écrase rien. Si la destination existe, il s'arrête. Une récupération
 * qui détruit sa propre sortie en cas de deuxième passage serait une
 * mauvaise plaisanterie.
 *
 * Il ne recopie pas les sessions : un cookie de session est un secret, et le
 * seul effet d'une session recopiée serait de prolonger une connexion ouverte
 * dans une base qu'on vient de déclarer abîmée. Elles se rouvrent en se
 * reconnectant.
 *
 * Il ne recopie pas non plus la table `migrations` : c'est la base neuve qui
 * sait où elle en est, et importer l'état de l'ancienne reviendrait à lui
 * faire sauter les migrations qu'elle n'a pas encore vues.
 */

import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { ouvrirBase } from "../server/db.mjs";

/* L'ordre compte : une ligne fille ne s'insère pas avant sa mère, et les clés
   étrangères sont actives. */
const ORDRE = [
  "settings",
  "users",
  "certification_domains",
  "certificate_templates",
  "certificate_types",
  "skills",
  "certificates",
  "certificate_skills",
  "verifications",
  "shares",
  "audit_logs",
  "notifications",
  "jetons",
  "cohortes",
  "candidatures",
];

/* Ce qui ne se recopie pas. Voir l'entête. */
const EXCLUES = new Set(["migrations", "sessions", "codes_secours", "defis_connexion"]);

function colonnes(db, table) {
  return db.prepare(`pragma table_info("${table}")`).all().map((c) => c.name);
}

function recuperer(source, destination) {
  if (!existsSync(source)) {
    console.error(`\n  Source introuvable : ${source}\n`);
    return 2;
  }
  if (existsSync(destination)) {
    console.error(`\n  La destination existe déjà : ${destination}`);
    console.error("  Ce script n'écrase rien. Déplacez-la, ou choisissez un autre nom.\n");
    return 2;
  }

  const vieille = new DatabaseSync(source, { readOnly: true });
  /* La base neuve reçoit le schéma courant par ses migrations. */
  const neuve = ouvrirBase({ chemin: destination, silencieux: true });

  /* Les tables de la base NEUVE font loi : une table qui n'existe plus n'est
     pas récupérée, et une colonne ajoutée depuis reste à son défaut. */
  const tables = neuve
    .prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%'")
    .all()
    .map((r) => r.name)
    .filter((n) => !EXCLUES.has(n));

  const connues = new Set(tables);
  const ordonnees = [...ORDRE.filter((t) => connues.has(t)), ...tables.filter((t) => !ORDRE.includes(t))];

  const bilan = [];
  for (const table of ordonnees) {
    let lignes;
    try {
      lignes = vieille.prepare(`select * from "${table}"`).all();
    } catch (e) {
      bilan.push({ table, lues: 0, ecrites: 0, note: `illisible : ${e.message}` });
      continue;
    }
    if (lignes.length === 0) continue;

    const communes = colonnes(neuve, table).filter((c) => colonnes(vieille, table).includes(c));
    const inserer = neuve.prepare(
      `insert or ignore into "${table}" (${communes.map((c) => `"${c}"`).join(", ")})
       values (${communes.map(() => "?").join(", ")})`
    );

    let ecrites = 0;
    const refusees = [];
    for (const ligne of lignes) {
      try {
        /* Chaque ligne est posée seule, hors transaction : une ligne orpheline
           — et la base abîmée en portait — ne doit pas emporter les autres. */
        ecrites += inserer.run(...communes.map((c) => ligne[c] ?? null)).changes;
      } catch (e) {
        refusees.push(`${ligne.id ?? "?"} (${e.message})`);
      }
    }
    bilan.push({
      table,
      lues: lignes.length,
      ecrites,
      note: refusees.length ? `refusée(s) : ${refusees.join(", ")}` : "",
    });
  }

  vieille.close();
  neuve.close();

  console.log(`\n  Récupération de ${source}\n  vers ${destination}\n`);
  for (const b of bilan) {
    const etat = b.ecrites === b.lues ? "  " : "! ";
    console.log(`  ${etat}${String(b.ecrites).padStart(4)}/${String(b.lues).padEnd(4)} ${b.table}${b.note ? "  — " + b.note : ""}`);
  }
  const perdues = bilan.reduce((n, b) => n + (b.lues - b.ecrites), 0);
  console.log(
    perdues === 0
      ? "\n  Tout ce qui était lisible a été repris.\n"
      : `\n  ${perdues} ligne(s) n'ont pas pu être reprises — voir ci-dessus.\n`
  );
  console.log("  Les sessions ne sont pas recopiées : reconnectez-vous.\n");
  return 0;
}

const [source, destination] = process.argv.slice(2);
if (!source || !destination) {
  console.error("\n  node scripts/recuperer-base.mjs <source-abimée> <destination>\n");
  process.exitCode = 2;
} else {
  process.exitCode = recuperer(source, destination);
}
