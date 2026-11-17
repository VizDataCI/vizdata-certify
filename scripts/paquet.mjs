/* Prépare un paquet prêt à téléverser.
 *
 *   npm run paquet
 *
 * Pour un hébergement où l'on n'a que le gestionnaire de fichiers du panneau —
 * pas de ligne de commande, pas de git, pas de npm. Le paquet contient tout ce
 * qu'il faut pour que le registre tourne, et rien d'autre.
 *
 * Ce qui rend la chose possible
 * -----------------------------
 * Le serveur n'a AUCUNE dépendance : il n'utilise que les modules livrés avec
 * Node. Il n'y a donc pas de `node_modules` à transporter, pas de `npm
 * install` à lancer sur l'hébergement, et le paquet pèse quelques centaines de
 * kilo-octets au lieu de plusieurs dizaines de méga-octets.
 *
 * C'est une conséquence directe du choix de SQLite et de `node:http`. Elle
 * n'était pas recherchée ; elle est précieuse.
 *
 * Ce que le paquet NE contient pas, et pourquoi
 * ---------------------------------------------
 * Ni la base, ni les sauvegardes, ni la moindre clé. Un paquet se transporte,
 * se copie, s'oublie dans un dossier de téléchargement : il ne doit jamais
 * porter de données personnelles. La base est créée sur place, au premier
 * démarrage.
 */

import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const RACINE = resolve(process.cwd());
const SORTIE = join(RACINE, "paquet");
const ETAPE = join(SORTIE, "vizdata-certify");

/* Ce qui part, et seulement cela. La liste est explicite plutôt que déduite :
   un paquet qui embarquerait tout le dépôt emporterait un jour un fichier
   qu'on ne voulait pas voir sortir. */
const CONTENU = [
  ["dist", "dist"],
  ["server", "server"],
  ["scripts/base.mjs", "scripts/base.mjs"],
  ["scripts/sauvegarde.mjs", "scripts/sauvegarde.mjs"],
  ["scripts/restaurer.mjs", "scripts/restaurer.mjs"],
  /* Les trois modules que le serveur partage avec l'interface. Les dupliquer
     ici serait plus simple et garantirait qu'ils divergent un jour. */
  ["src/lib/permissions.js", "src/lib/permissions.js"],
  ["src/lib/mot-de-passe.js", "src/lib/mot-de-passe.js"],
  ["src/lib/certificates.js", "src/lib/certificates.js"],
  ["docs/deploiement.md", "docs/deploiement.md"],
];

/* Point d'entrée pour les hébergements qui lancent l'application par Passenger
   — c'est le cas de l'extension Node.js de Plesk. Passenger charge le fichier
   de démarrage en CommonJS ; l'extension .cjs le lui dit, et l'import
   dynamique à l'intérieur charge le serveur, qui est en modules ES. */
const DEMARRAGE = `/* Point d'entrée pour Passenger (extension Node.js de Plesk).
 *
 * Passenger charge ce fichier en CommonJS — d'où l'extension .cjs — et
 * l'import dynamique charge le serveur, écrit en modules ES. Passenger fournit
 * le port dans process.env.PORT ; le serveur le lit déjà.
 *
 * En ligne de commande, ce fichier ne sert à rien : lancez directement
 *   node server/index.mjs
 */
import("./server/index.mjs").catch((e) => {
  console.error("Le registre n'a pas pu démarrer :", e);
  process.exit(1);
});
`;

const LISEZMOI = `# VIZDATA CERTIFY — paquet de déploiement

Tout ce qu'il faut pour que le registre tourne. **Aucune dépendance à installer** :
le serveur n'utilise que les modules livrés avec Node.

## Avant tout : la version de Node

    node --version

Il faut **22 ou plus**. Le registre utilise \`node:sqlite\`, livré avec Node depuis cette
version. C'est la seule exigence du projet, et elle n'est pas contournable.

Sur un panneau Plesk, la version proposée par l'extension Node.js est celle qui compte si
l'application est lancée par le panneau.

## Ce que contient le paquet

    dist/              l'interface construite
    server/            le registre — API, base, autorisations, courriers
    scripts/           administration de la base et sauvegardes
    src/lib/           trois modules partagés par le serveur et l'interface
    app.cjs            point d'entrée pour Passenger (Plesk)
    package.json

Il ne contient **ni base, ni sauvegarde, ni clé**. La base est créée sur place.

## Mise en route, par le panneau

1. **Téléversez et décompressez** le contenu dans le dossier de l'application —
   par exemple \`/httpdocs\` ou un dossier dédié.

2. **Activez Node.js** pour le domaine :
   - version : **22 ou plus**
   - racine de l'application : le dossier où vous venez de décompresser
   - fichier de démarrage : \`app.cjs\`
   - racine des documents : le sous-dossier \`dist\`

3. **Variables d'environnement**, dans la même page :

       NODE_ENV          production
       VIZDATA_DB        /chemin/hors/web/certify.db
       VIZDATA_SITE_URL  https://certify.vizdata.ci

   Placez la base **hors du dossier web** : un fichier servi par erreur livrerait
   tout le registre.

4. **Démarrez l'application**, puis ouvrez \`https://votre-domaine/api/sante\`.
   La réponse attendue est \`{"etat":"ok","registre":"sqlite"}\`.

5. **Créez le premier administrateur.** Il n'y a personne pour l'inviter : c'est le
   seul compte qui demande une commande.

       VIZDATA_DB=/chemin/certify.db VIZDATA_SITE_URL=https://certify.vizdata.ci \\
         node scripts/base.mjs admin direction@vizdata.ci Fabrice BOH

   La commande imprime un lien. Suivez-le pour choisir votre mot de passe ;
   aucun mot de passe n'est produit ni envoyé.

   Si le panneau ne donne pas de ligne de commande, l'extension Node.js permet
   généralement de lancer un script : utilisez-la pour cette seule commande.

## Le réglage qu'on oublie

Si le serveur web sert les fichiers statiques lui-même, il répondra **404 sur
\`/verifier/{jeton}\`** — précisément l'adresse imprimée dans les QR codes. Les chemins
inconnus doivent revenir à l'application, qui sait les traiter.

Sur Plesk : **décochez « servir les fichiers statiques directement par nginx »**.

## Les sauvegardes

    VIZDATA_DB=/chemin/certify.db VIZDATA_SAUVEGARDE_CLE='une-phrase-longue' \\
      node scripts/sauvegarde.mjs

Copie à chaud, vérifiée, chiffrée. **Conservez la clé hors du serveur** : sans elle, les
sauvegardes sont des octets aléatoires.

Pour restaurer : \`node scripts/restaurer.mjs <fichier>\` — sans \`--oui\`, elle ne touche
à rien et montre ce qu'elle contient.

Le détail est dans \`docs/deploiement.md\`.
`;

const lisible = (o) => (o < 1024 * 1024 ? `${(o / 1024).toFixed(0)} ko` : `${(o / 1024 / 1024).toFixed(1)} Mo`);

/** Poids total d'un dossier, pour dire ce qu'on s'apprête à téléverser. */
function poids(chemin) {
  const infos = statSync(chemin);
  if (!infos.isDirectory()) return infos.size;
  return readdirSync(chemin).reduce((total, e) => total + poids(join(chemin, e)), 0);
}

function construire() {
  if (!existsSync(join(RACINE, "dist", "index.html"))) {
    console.error("\n  L'interface n'est pas construite. Lancez « npm run build », puis relancez.\n");
    return 2;
  }

  rmSync(SORTIE, { recursive: true, force: true });
  mkdirSync(ETAPE, { recursive: true });

  for (const [source, destination] of CONTENU) {
    const origine = join(RACINE, source);
    if (!existsSync(origine)) {
      console.error(`\n  Absent du dépôt : ${source}\n`);
      return 1;
    }
    const cible = join(ETAPE, destination);
    mkdirSync(join(cible, ".."), { recursive: true });
    cpSync(origine, cible, { recursive: true });
  }

  writeFileSync(join(ETAPE, "app.cjs"), DEMARRAGE);
  writeFileSync(join(ETAPE, "LISEZ-MOI.md"), LISEZMOI);

  /* Un package.json réduit à ce qui sert à l'exécution. Les dépendances de
     construction n'ont rien à faire sur l'hébergement, et les y laisser
     inviterait à lancer un « npm install » qui n'a aucune raison d'être. */
  const source = JSON.parse(readFileSync(join(RACINE, "package.json"), "utf8"));
  writeFileSync(
    join(ETAPE, "package.json"),
    JSON.stringify(
      {
        name: source.name,
        version: source.version,
        private: true,
        type: "module",
        description: "VIZDATA CERTIFY — registre des certifications. Aucune dépendance d'exécution.",
        main: "app.cjs",
        scripts: {
          start: "node server/index.mjs",
          base: "node scripts/base.mjs",
          sauvegarde: "node scripts/sauvegarde.mjs",
          restaurer: "node scripts/restaurer.mjs",
        },
        engines: { node: ">=22" },
      },
      null,
      2
    ) + "\n"
  );

  /* --- archive ------------------------------------------------------------
     Le zip est préféré : tous les gestionnaires de fichiers savent l'ouvrir,
     y compris celui d'un panneau d'hébergement. Mais l'outil qui sait en
     produire change d'une machine à l'autre — bsdtar sous Windows et macOS,
     PowerShell sous Windows, `zip` sous Linux —, et GNU tar n'en fait pas du
     tout. On essaie donc dans l'ordre, et l'on se rabat sur tar.gz, que Plesk
     et cPanel décompressent aussi bien. */
  const fabricants = [
    {
      nom: "bsdtar",
      fichier: "vizdata-certify.zip",
      faire: (sortie) => execFileSync("tar", ["-a", "-c", "-f", sortie, "-C", SORTIE, "vizdata-certify"], { stdio: "pipe" }),
    },
    {
      nom: "PowerShell",
      fichier: "vizdata-certify.zip",
      faire: (sortie) =>
        execFileSync(
          "powershell",
          ["-NoProfile", "-Command", `Compress-Archive -Path '${ETAPE}' -DestinationPath '${sortie}' -Force`],
          { stdio: "pipe" }
        ),
    },
    {
      nom: "zip",
      fichier: "vizdata-certify.zip",
      faire: (sortie) => execFileSync("zip", ["-qr", sortie, "vizdata-certify"], { cwd: SORTIE, stdio: "pipe" }),
    },
    {
      nom: "tar.gz",
      fichier: "vizdata-certify.tar.gz",
      faire: (sortie) => execFileSync("tar", ["-czf", sortie, "-C", SORTIE, "vizdata-certify"], { stdio: "pipe" }),
    },
  ];

  let archive = null;
  for (const fabricant of fabricants) {
    const sortie = join(SORTIE, fabricant.fichier);
    try {
      fabricant.faire(sortie);
      if (existsSync(sortie) && statSync(sortie).size > 0) {
        archive = sortie;
        break;
      }
    } catch {
      /* Outil absent ou refusé : on passe au suivant. */
    }
  }

  if (!archive) {
    console.error("\n  Aucun outil d'archivage disponible sur cette machine.");
    console.error(`  Le dossier prêt à téléverser reste là, compressez-le à la main :`);
    console.error(`  ${ETAPE}\n`);
    return 0;
  }

  console.log(`\n  Paquet  : ${archive}`);
  console.log(`  Poids   : ${lisible(statSync(archive).size)} compressé, ${lisible(poids(ETAPE))} une fois ouvert`);
  console.log(`  Contenu : interface construite, registre, administration, aucune dépendance`);
  console.log(`\n  Il ne contient ni base, ni sauvegarde, ni clé : rien de personnel.`);
  console.log(`  La marche à suivre est dans LISEZ-MOI.md, à la racine du paquet.\n`);
  return 0;
}

process.exitCode = construire();
