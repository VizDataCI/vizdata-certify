/* Garde-fou de construction.
 *
 * Il ne reste qu'une chose à empêcher, mais c'est la pire : mettre en ligne un
 * paquet construit en mode démonstration. Dans ce mode, la connexion accepte
 * n'importe quel mot de passe et le registre vit dans le navigateur : un
 * registre officiel dont l'espace d'administration s'ouvrirait à tout venant.
 *
 * Ce que ce garde-fou vérifiait avant, et pourquoi il ne le vérifie plus
 * ---------------------------------------------------------------------
 * Il contrôlait la présence, le format et la validité de la clé Supabase
 * embarquée dans le paquet : trois contrôles ajoutés après trois incidents :
 * une clé absente, une clé secrète livrée au navigateur, une clé tronquée au
 * collage qui avait produit un déploiement d'apparence saine sur lequel chaque
 * vérification répondait « Invalid API key ».
 *
 * Ces trois incidents ne peuvent plus se produire : LE PAQUET NE CONTIENT PLUS
 * AUCUNE CLÉ. Les identifiants du registre ne quittent pas le serveur, et la
 * session est un cookie que le navigateur ne peut même pas lire. Une catégorie
 * entière d'accidents a disparu avec la dépendance qui l'apportait.
 *
 * Pour construire délibérément une démonstration :
 *   npm run build -- --mode demo        (ou VITE_MODE_DEMO=1 npm run build)
 * et le dire, parce que le garde-fou le refusera autrement.
 */

const demoDemande = process.argv.includes("--mode") || process.env.VITE_MODE_DEMO === "1";
const demoAssumee = process.env.VIZDATA_DEMO_ASSUMEE === "1" || process.argv.includes("--mode");

function refuser(titre, lignes) {
  console.error(["", "  " + titre, "", ...lignes.map((l) => "  " + l), ""].join("\n"));
  return 1;
}

function controler() {
  if (process.env.VITE_MODE_DEMO === "1" && !demoAssumee) {
    return refuser("Construction interrompue : VITE_MODE_DEMO est à 1.", [
      "Le paquet produit n'aurait aucune authentification réelle : la connexion",
      "accepterait n'importe quel mot de passe, et le registre vivrait dans le",
      "navigateur de chaque visiteur.",
      "",
      "Pour une mise en production, retirez cette variable.",
      "Pour une démonstration assumée :",
      "  npm run build -- --mode demo",
    ]);
  }

  if (demoDemande) {
    console.log("Construction en mode démonstration : authentification factice, à ne pas mettre en ligne.");
    return 0;
  }

  /* Rien d'autre à vérifier ici. Ce qui peut encore mal se passer en
     production : base absente, migrations non appliquées, aucun
     administrateur : se voit au démarrage du serveur et par
     « npm run base -- etat », pas à la construction d'un paquet qui, lui, ne
     dépend plus de rien. */
  console.log("Construction en mode registre : le paquet ne contient aucune clé.");
  return 0;
}

process.exitCode = controler();
