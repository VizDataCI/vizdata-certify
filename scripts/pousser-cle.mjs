/* Transfère les clés Supabase de .env.local vers le projet Vercel.
 *
 * Pourquoi un script pour trois valeurs : parce que le collage manuel a échoué
 * deux fois de suite. L'invite masquée de la CLI n'a retenu qu'un fragment, et
 * le formulaire du tableau de bord a confirmé l'enregistrement d'une valeur
 * vide. Dans les deux cas l'interface disait oui, et le déploiement partait
 * cassé — ou refusait de partir, sans que la cause soit lisible.
 *
 * Une machine ne se trompe pas de presse-papiers. Le script :
 *   1. lit les valeurs dans .env.local ;
 *   2. contrôle le format et refuse une clé secrète ;
 *   3. les éprouve auprès de Supabase AVANT de les envoyer ;
 *   4. les pousse pour Production et Preview ;
 *   5. relit le projet pour confirmer qu'elles ne sont pas vides.
 *
 * Aucune valeur n'est affichée, ni journalisée.
 *
 *   node scripts/pousser-cle.mjs
 */

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { analyserCle, eprouverCle } from "./cle-supabase.mjs";

const ENVIRONNEMENTS = ["production", "preview"];

function lireFichier() {
  let contenu;
  try {
    contenu = readFileSync(".env.local", "utf8");
  } catch {
    console.error("\n  .env.local introuvable. Copiez .env.example et renseignez les deux valeurs.\n");
    process.exit(2);
  }
  const url = contenu.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
  const cle = contenu.match(/^VITE_SUPABASE_ANON_KEY=(.+)$/m)?.[1]?.trim();
  if (!url || !cle) {
    console.error("\n  .env.local ne contient pas les deux variables VITE_SUPABASE_*.\n");
    process.exit(2);
  }
  return { url, cle };
}

/* Sur Windows, npx est un script .cmd, que Node 24 refuse de lancer
   directement — une correction de sécurité. On passe par cmd.exe en gardant
   les arguments dans un tableau, plutôt que d'activer « shell: true » qui les
   concatène sans les échapper. */
const [COMMANDE, PREFIXE] =
  process.platform === "win32" ? ["cmd.exe", ["/c", "npx"]] : ["npx", []];

/** Lance la CLI Vercel en lui passant la valeur par l'entrée standard. */
function vercel(args, entree = null) {
  return new Promise((resolve) => {
    const p = spawn(COMMANDE, [...PREFIXE, "vercel", ...args], { stdio: ["pipe", "pipe", "pipe"] });
    let sortie = "";
    p.stdout.on("data", (d) => (sortie += d));
    p.stderr.on("data", (d) => (sortie += d));
    if (entree !== null) p.stdin.write(entree);
    p.stdin.end();
    p.on("close", (code) => resolve({ code, sortie }));
  });
}

const { url, cle } = lireFichier();

/* --- 1. contrôle du format ---------------------------------------------- */
const analyse = analyserCle(cle);
if (analyse.danger) {
  console.error(`\n  Transfert refusé — clé ${analyse.format}.\n\n  ${analyse.danger}\n`);
  process.exit(1);
}
console.log(`Clé ${analyse.format} (rôle ${analyse.role}), ${cle.length} caractères.`);

/* --- 2. épreuve auprès du projet ----------------------------------------- */
const epreuve = await eprouverCle(url, cle);
if (epreuve.joignable && !epreuve.acceptee) {
  console.error(`\n  Transfert refusé : Supabase rejette cette clé (${epreuve.detail}).\n`);
  console.error("  Corrigez d'abord .env.local avant de la pousser en production.\n");
  process.exit(1);
}
console.log(
  epreuve.joignable
    ? `Clé acceptée par le projet (${epreuve.detail}).`
    : `Projet injoignable (${epreuve.detail}) — transfert poursuivi sans épreuve.`,
);

/* --- 3. transfert --------------------------------------------------------- */
for (const [nom, valeur] of [
  ["VITE_SUPABASE_URL", url],
  ["VITE_SUPABASE_ANON_KEY", cle],
]) {
  /* Les deux environnements en un seul appel : demandés séparément, « preview »
     réclame en plus une branche Git, question à laquelle une entrée standard
     déjà consommée par la valeur ne peut pas répondre.

     --no-sensitive garde les valeurs relisibles : sur une clé publiable et une
     URL de projet, le masquage n'apporte rien et empêche de vérifier qu'elles
     ne sont pas vides — le défaut qui a coûté trois déploiements.

     --force écrase la variable existante, le script est donc rejouable. */
  const cible = ENVIRONNEMENTS.join(",");
  const { code, sortie } = await vercel(
    ["env", "add", nom, cible, "--no-sensitive", "--force"],
    valeur,
  );
  /* Le code de sortie fait foi : la CLI dit « Added » à la création et
     « Overrode » à la mise à jour, et rien ne garantit ce vocabulaire. */
  const ok = code === 0;
  console.log(`  ${ok ? "posée " : "ÉCHEC "} ${nom} (${cible})`);
  if (!ok) {
    console.error("\n" + sortie.split("\n").slice(-8).join("\n"));
    process.exit(1);
  }
}

/* --- 4. relecture : rien ne doit être vide -------------------------------- */
const fichier = ".vercel/.controle-env";
await vercel(["env", "pull", "--environment=production", fichier, "--yes"]);

let verdict = 0;
try {
  const relu = readFileSync(fichier, "utf8");
  for (const nom of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]) {
    const trouve = relu.match(new RegExp(`^${nom}="?([^"]*)"?$`, "m"));
    const valeur = trouve?.[1] ?? null;
    /* Les valeurs étant posées en clair, on peut contrôler leur longueur —
       et non plus se contenter d'un « [SENSITIVE] » qui ne prouve rien. */
    const etat =
      valeur === null ? "ABSENTE" : valeur === "" ? "VIDE" : `${valeur.length} caractères`;
    console.log(`  ${nom} : ${etat}`);
    if (valeur === null || valeur === "" || valeur.length < 20) verdict = 1;
  }
} catch {
  console.warn("  Relecture impossible — vérifiez avec « npx vercel env ls ».");
} finally {
  try { (await import("node:fs")).rmSync(fichier, { force: true }); } catch { /* rien à nettoyer */ }
}

console.log(verdict === 0 ? "\nLes deux variables sont en place.\n" : "\nUne variable reste inutilisable.\n");
process.exitCode = verdict;
