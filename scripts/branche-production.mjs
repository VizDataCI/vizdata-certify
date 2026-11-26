/* Fabrique la branche `production` : ce qui est RÉELLEMENT en ligne.
 *
 *   npm run production
 *
 * Pourquoi une branche séparée
 * ----------------------------
 * L'hébergement est un mutualisé Plesk : PHP 8.4, pas de Node, pas de SSH.
 * Il ne peut donc pas construire l'interface lui-même, et `main` ne lui sert
 * à rien : il y trouverait du JSX et un vite.config.js qu'il ne sait pas lire.
 *
 * Cette branche ne contient que le résultat : l'interface construite à la
 * racine, le registre PHP dans api/. Exactement ce que le zip emportait, au
 * LISEZ-MOI près, qui n'a rien à faire sur un serveur web. Plesk la tire, et
 * une mise en ligne redevient ce qu'elle aurait toujours dû être : une
 * commande, pas une session de gestionnaire de fichiers.
 *
 * Le second bénéfice compte autant que le premier : on peut enfin SAVOIR ce
 * qui est en ligne. `git log production` le dit, et chaque commit nomme celui
 * de `main` dont il sort. Jusqu'ici, la seule réponse était de télécharger les
 * fichiers du serveur et de les comparer à la main.
 *
 * Ce que le script ne fera pas
 * ----------------------------
 * Il refuse de travailler sur un arbre modifié. Une branche de production
 * fabriquée à partir de fichiers non commités ne correspondrait à AUCUN état
 * du dépôt : le jour où il faut comprendre ce qui est en ligne, la trace
 * mènerait à un commit qui ne contient pas ce qui a été déployé. C'est
 * précisément le défaut que cette branche existe pour supprimer.
 *
 * Il ne pousse pas non plus, et ne touche ni à votre index ni à votre arbre de
 * travail : il écrit la branche avec la plomberie de git, dans un index
 * temporaire. Vous pouvez le lancer au milieu d'autre chose sans rien perdre.
 *
 * Avant la première mise en place, lire la section « Déploiement par Git » du
 * README : il reste deux points à vérifier sur le serveur, dont le sort de
 * api/config.php, qui n'est dans aucune branche et ne doit jamais disparaître.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const RACINE = resolve(process.cwd());
const ETAPE = join(RACINE, "paquet", "contenu");
const BRANCHE = "production";
const NOTICE = "LISEZ-MOI-DEPLOIEMENT.md";

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: options.cwd ?? RACINE,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** Comme `git`, mais rend null au lieu de jeter : pour les questions dont
    « ça n'existe pas » est une réponse acceptable. */
function gitOuRien(args, options) {
  try { return git(args, options); } catch { return null; }
}

function mourir(message, detail) {
  console.error(`\n  ${message}\n`);
  if (detail) console.error(`  ${detail}\n`);
  process.exit(1);
}

/* --- ce qu'on exige avant de commencer ------------------------------------ */

if (!existsSync(ETAPE)) {
  mourir(
    "Le paquet n'a pas été construit.",
    "Lancez « npm run production », qui enchaîne la construction et cette étape."
  );
}

const sale = git(["status", "--porcelain", "--untracked-files=no"]);
if (sale) {
  mourir(
    "L'arbre de travail porte des modifications non commitées.",
    "La branche de production doit correspondre à un commit de main, sinon elle\n"
    + "  ne dit plus rien de ce qui est en ligne. Commitez d'abord, reconstruisez,\n"
    + "  puis relancez :\n\n"
    + sale.split("\n").map((l) => `    ${l}`).join("\n")
  );
}

const source = git(["rev-parse", "HEAD"]);
const sourceCourt = git(["rev-parse", "--short", "HEAD"]);
const sujet = git(["log", "-1", "--format=%s", "HEAD"]);
const brancheSource = gitOuRien(["rev-parse", "--abbrev-ref", "HEAD"]) ?? "?";

/* --- on écrit l'arbre, dans un index qui n'est pas le vôtre ---------------- */

const bacASable = mkdtempSync(join(tmpdir(), "vzc-production-"));
const index = join(bacASable, "index");
const envIndex = { GIT_INDEX_FILE: index };

let nouveau;
try {
  /* `-f` passe outre les règles d'exclusion. Le contenu de paquet/contenu est
     une liste explicite, établie par paquet.mjs : rien n'y entre par hasard,
     et un .gitignore global sur la machine de quelqu'un ne doit pas pouvoir
     retirer un fichier du site sans prévenir. */
  git(["--git-dir", join(RACINE, ".git"), "--work-tree", ETAPE, "add", "-A", "-f", "."],
    { cwd: ETAPE, env: envIndex });

  git(["--git-dir", join(RACINE, ".git"), "--work-tree", ETAPE,
    "rm", "--cached", "--quiet", "--ignore-unmatch", NOTICE], { cwd: ETAPE, env: envIndex });

  const arbre = git(["write-tree"], { env: envIndex });
  const parent = gitOuRien(["rev-parse", "--verify", "--quiet", `refs/heads/${BRANCHE}`]);

  if (parent) {
    const arbrePrecedent = git(["rev-parse", `${parent}^{tree}`]);
    if (arbrePrecedent === arbre) {
      console.log(`\n  Rien à faire : « ${BRANCHE} » porte déjà exactement ce contenu.`);
      console.log(`  Tête actuelle : ${git(["rev-parse", "--short", parent])}\n`);
      process.exit(0);
    }
  }

  const message = `Mise en ligne de ${sourceCourt} : ${sujet}\n\n`
    + `Contenu construit à partir de ${brancheSource} ${source}.\n`
    + `Cette branche ne se modifie pas à la main : elle est réécrite par\n`
    + `scripts/branche-production.mjs à chaque mise en ligne.\n`;

  nouveau = git(["commit-tree", arbre, ...(parent ? ["-p", parent] : []), "-m", message]);
  git(["update-ref", `refs/heads/${BRANCHE}`, nouveau, ...(parent ? [parent] : [])]);
} finally {
  rmSync(bacASable, { recursive: true, force: true });
}

/* --- ce qu'on en dit ------------------------------------------------------- */

const court = git(["rev-parse", "--short", nouveau]);
const nombre = git(["ls-tree", "-r", "--name-only", nouveau]).split("\n").filter(Boolean).length;

console.log(`\n  Branche : ${BRANCHE} ${court}`);
console.log(`  Source  : ${brancheSource} ${sourceCourt} : ${sujet}`);
console.log(`  Contenu : ${nombre} fichiers, sans la notice de déploiement`);
console.log(`\n  Rien n'est poussé. Pour mettre en ligne :\n`);
console.log(`    git push origin ${BRANCHE}\n`);
