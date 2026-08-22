/* Garde-fou de construction.
 *
 * Sans clés Supabase, l'application se replie sur son mode démonstration : la
 * connexion accepte n'importe quel mot de passe. C'est utile en local, et
 * catastrophique en ligne — un registre officiel dont l'espace d'administration
 * s'ouvre sans mot de passe.
 *
 * Trois contrôles, dans cet ordre :
 *   1. les clés sont présentes ;
 *   2. la clé a le bon format, et n'est surtout pas une clé secrète — un
 *      paquet navigateur est public, une clé service_role qui s'y trouverait
 *      contournerait toutes les politiques RLS ;
 *   3. le projet Supabase l'accepte réellement.
 *
 * Le troisième contrôle a été ajouté après une mise en production où la clé,
 * présente mais tronquée au collage, avait produit un déploiement d'apparence
 * saine sur lequel chaque vérification répondait « Invalid API key ».
 *
 * Pour construire délibérément une démonstration :
 *   VITE_MODE_DEMO=1 npm run build
 */

import { readFileSync } from "node:fs";
import { analyserCle, eprouverCle } from "./cle-supabase.mjs";

/** Décrit l'état d'une variable, pour un diagnostic sans ambiguïté. */
function etat(nom) {
  const valeur = process.env[nom];
  if (valeur === undefined) return `${nom} : absente`;
  if (valeur.trim() === "") return `${nom} : présente mais VIDE`;
  return `${nom} : ${valeur.trim().length} caractères`;
}

/** Les variables viennent de l'hébergeur, ou d'un fichier .env en local. */
function lireEnvironnement() {
  const url = process.env.VITE_SUPABASE_URL?.trim();
  const cle = process.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (url && cle) return { url, cle };

  /* Une variable déclarée chez l'hébergeur mais vide est le piège classique :
     l'interface confirme l'enregistrement, et rien n'est stocké. On le dit. */
  if (process.env.VERCEL || process.env.CI) {
    return { manquantes: [etat("VITE_SUPABASE_URL"), etat("VITE_SUPABASE_ANON_KEY")] };
  }

  for (const fichier of [".env.local", ".env"]) {
    try {
      const contenu = readFileSync(fichier, "utf8");
      const url = contenu.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
      const cle = contenu.match(/^VITE_SUPABASE_ANON_KEY=(.+)$/m)?.[1]?.trim();
      if (url && cle) return { url, cle };
    } catch {
      /* fichier absent : on essaie le suivant */
    }
  }
  return null;
}

function refuser(titre, lignes) {
  console.error(["", "  " + titre, "", ...lignes.map((l) => "  " + l), ""].join("\n"));
  return 1;
}

/** @returns {Promise<number>} code de sortie */
async function controler() {
  if (process.env.VITE_MODE_DEMO === "1") {
    console.log("Construction en mode démonstration — authentification factice, à ne pas mettre en ligne.");
    return 0;
  }

  const environnement = lireEnvironnement();

  if (environnement?.manquantes) {
    return refuser("Construction interrompue : clés Supabase inutilisables.", [
      ...environnement.manquantes,
      "",
      "Une variable « présente mais VIDE » est le piège classique : l'interface de",
      "l'hébergeur confirme l'enregistrement alors que rien n'a été stocké.",
      "",
      "Chez Vercel : Settings > Environment Variables, pour Production et Preview.",
    ]);
  }

  if (!environnement) {
    return refuser("Construction interrompue : VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY est absente.", [
      "Sans elles, l'application se replie sur son mode démonstration, où la",
      "connexion accepte n'importe quel mot de passe. Mise en ligne, elle ouvrirait",
      "l'espace d'administration à tout venant.",
      "",
      "En local    : copiez .env.example en .env.local et renseignez les deux valeurs.",
      "Chez Vercel : Settings > Environment Variables, pour Production et Preview.",
      "",
      "Pour construire volontairement une démonstration :",
      "  VITE_MODE_DEMO=1 npm run build",
    ]);
  }

  const { url, cle } = environnement;
  const analyse = analyserCle(cle);

  if (analyse.danger) {
    return refuser(`Construction interrompue : clé ${analyse.format}.`, [
      analyse.danger,
      "",
      "La clé attendue est la clé PUBLIABLE du projet Supabase,",
      "dans Settings > API Keys > Publishable key.",
    ]);
  }

  console.log(`Clé ${analyse.format} (rôle ${analyse.role}) — vérification auprès du projet…`);
  const epreuve = await eprouverCle(url, cle);
  console.log(`Réponse du projet : ${epreuve.detail}`);

  if (epreuve.joignable && !epreuve.acceptee) {
    return refuser(`Construction interrompue : le projet Supabase refuse la clé (${epreuve.detail}).`, [
      "La clé a le bon format mais n'est pas reconnue. Le plus souvent, le collage",
      "a été tronqué — c'est notamment ce qui arrive dans une invite masquée.",
      "",
      "Comparez la valeur avec Settings > API Keys dans Supabase,",
      "et vérifiez qu'elle correspond bien au projet " + url,
    ]);
  }

  if (!epreuve.joignable) {
    console.warn(`Projet Supabase injoignable (${epreuve.detail}) — la clé n'a pas pu être éprouvée, construction poursuivie.`);
  } else {
    console.log(`Clé acceptée par le projet (${epreuve.detail}) — construction en mode réel.`);
  }
  return 0;
}

/* On renseigne le code de sortie sans forcer process.exit() : Node se retire
   quand ses gestionnaires se sont refermés. Un exit() brutal pendant la
   fermeture de la connexion HTTP déclenche une assertion libuv sous Windows. */
const codeSortie = await controler();
process.exitCode = codeSortie;

/* Filet de sécurité. Trois constructions ont été bloquées indéfiniment chez
   l'hébergeur : la vérification aboutissait, mais une connexion réseau restée
   ouverte maintenait la boucle d'événements, donc le processus ne rendait
   jamais la main — et le build attendait pour toujours. Ce minuteur n'empêche
   pas Node de sortir naturellement (unref), mais le force s'il traîne. */
setTimeout(() => {
  console.warn("Sortie forcée : une connexion réseau est restée ouverte.");
  process.exit(codeSortie);
}, 2000).unref();
