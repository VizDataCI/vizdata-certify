/* Garde-fou de construction.
 *
 * Sans clés Supabase, l'application se replie sur son mode démonstration : la
 * connexion accepte n'importe quel mot de passe. C'est utile en local, et
 * catastrophique en ligne — un registre officiel dont l'espace d'administration
 * s'ouvre sans mot de passe.
 *
 * Or c'est exactement ce qui arrive si l'on oublie de renseigner les variables
 * d'environnement chez l'hébergeur : le build réussit, se déploie, et personne
 * ne s'aperçoit de rien avant qu'il ne soit trop tard.
 *
 * Ce script fait donc échouer la construction plutôt que de produire ce paquet.
 * Pour construire délibérément une démonstration :
 *
 *   VITE_MODE_DEMO=1 npm run build
 */

import { readFileSync } from "node:fs";

/** Les variables viennent de l'hébergeur, ou du fichier .env.local en local. */
function clesPresentes() {
  if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) return true;

  for (const fichier of [".env.local", ".env"]) {
    try {
      const contenu = readFileSync(fichier, "utf8");
      const url = contenu.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
      const cle = contenu.match(/^VITE_SUPABASE_ANON_KEY=(.+)$/m)?.[1]?.trim();
      if (url && cle) return true;
    } catch {
      /* fichier absent : on essaie le suivant */
    }
  }
  return false;
}

if (process.env.VITE_MODE_DEMO === "1") {
  console.log("Construction en mode démonstration — authentification factice, à ne pas mettre en ligne.");
  process.exit(0);
}

if (!clesPresentes()) {
  console.error(
    [
      "",
      "  Construction interrompue : VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY est absente.",
      "",
      "  Sans elles, l'application se replie sur son mode démonstration, où la",
      "  connexion accepte n'importe quel mot de passe. Mise en ligne, elle ouvrirait",
      "  l'espace d'administration à tout venant.",
      "",
      "  En local   : copiez .env.example en .env.local et renseignez les deux valeurs.",
      "  Chez Vercel : Settings > Environment Variables, pour Production et Preview.",
      "",
      "  Pour construire volontairement une démonstration :",
      "    VITE_MODE_DEMO=1 npm run build",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

console.log("Clés Supabase présentes : construction en mode réel.");
