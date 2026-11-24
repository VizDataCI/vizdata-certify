/* Prépare le paquet à téléverser sur l'hébergement.
 *
 *   npm run paquet
 *
 * L'hébergement de VIZDATA est un mutualisé Plesk : PHP 8.4, pas de Node, pas
 * d'accès SSH. Le déploiement se fait donc par le gestionnaire de fichiers du
 * panneau — on dépose une archive, on la décompresse, et c'est tout.
 *
 * Ce que contient le paquet
 * -------------------------
 * L'interface construite à la racine, et le registre PHP dans api/. Aucune
 * dépendance à installer : ni composer, ni node_modules. Le registre n'utilise
 * que PDO SQLite, OpenSSL et cURL, tous présents.
 *
 * Ce qu'il ne contient pas, et pourquoi
 * -------------------------------------
 * Ni base, ni sauvegarde, ni configuration renseignée. Une archive se copie,
 * se transfère, s'oublie dans un dossier de téléchargement : elle ne doit
 * jamais porter de données personnelles ni de clé. `config.php` est écrit sur
 * le serveur, et lui seul.
 *
 * Le schéma vient de server/schema/ — un seul fichier dans le dépôt, recopié
 * ici. Les deux implémentations du registre partagent donc leur définition de
 * la vérité.
 */

import { execFileSync } from "node:child_process";
import {
  cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, statSync, readdirSync,
} from "node:fs";
import { deflateRawSync, gunzipSync } from "node:zlib";
import { join, resolve } from "node:path";

const RACINE = resolve(process.cwd());
const SORTIE = join(RACINE, "paquet");
const ETAPE = join(SORTIE, "contenu");

/* Ce qui part, et seulement cela. La liste est explicite plutôt que déduite :
   un paquet qui embarquerait tout le dépôt emporterait un jour un fichier
   qu'on ne voulait pas voir sortir. */
const CONTENU = [
  /* L'interface construite se déverse à la RACINE du paquet : c'est elle que
     le serveur web sert, et le .htaccess qu'elle contient doit s'y trouver. */
  ["dist", "."],
  /* Le registre PHP. */
  ["api/index.php", "api/index.php"],
  ["api/config.exemple.php", "api/config.exemple.php"],
  ["api/lib", "api/lib"],
  /* Le schéma, recopié depuis sa source unique. */
  ["server/schema", "api/schema"],
];

const LISEZMOI = `# VIZDATA CERTIFY — paquet de déploiement

Pour un hébergement mutualisé : PHP 8.4, SQLite, pas de ligne de commande.
**Aucune dépendance à installer.**

## 1. Déposer les fichiers

Décompressez tout à la racine du site — là où se trouvent aujourd'hui
\`index.html\` et \`assets/\`. Vous pouvez écraser l'ancienne version : elle est
entièrement remplacée.

Après décompression, la racine contient :

    index.html  assets/  .htaccess  api/  favicon.svg  …

## 2. Créer le dossier de la base, HORS du dossier web

Dans le gestionnaire de fichiers, remontez d'un niveau — au-dessus de
\`certify.vizdata.ci\` — et créez un dossier \`certify-registre\`.

**C'est important.** La base contient les adresses, les téléphones et les
empreintes des mots de passe. Un fichier servi par erreur livrerait tout le
registre d'un coup.

## 3. Écrire la configuration

Copiez \`api/config.exemple.php\` en \`api/config.php\`, puis renseignez :

- \`CHEMIN_BASE\` et \`DOSSIER_SAUVEGARDES\` : dans \`certify-registre\`
- \`SAUVEGARDE_CLE\` : une longue phrase aléatoire — **conservez-en une copie
  ailleurs que sur ce serveur**, sans elle les sauvegardes sont illisibles
- \`JETON_INSTALLATION\` : une autre phrase aléatoire, le temps de l'étape 4

## 4. Créer le premier administrateur

C'est le seul compte que l'application ne peut pas créer elle-même : il n'y a
personne pour l'inviter.

    curl -X POST https://certify.vizdata.ci/api/installation \\
      -H "Content-Type: application/json" \\
      -d '{"jeton":"VOTRE_JETON","email":"direction@vizdata.ci","prenom":"Fabrice","nom":"BOH"}'

La réponse contient un lien : suivez-le pour choisir votre mot de passe. Aucun
mot de passe n'est produit ni envoyé.

**Videz ensuite \`JETON_INSTALLATION\` dans \`config.php\`.** Le point
d'installation refuse de toute façon dès qu'un compte existe, mais une porte
fermée vaut mieux qu'une porte qui se verrouille toute seule.

## 5. Vérifier

    https://certify.vizdata.ci/api/sante

La réponse attendue : \`{"etat":"ok","registre":"sqlite","moteur":"php"}\`

Puis ouvrez le site, connectez-vous, et délivrez une certification d'essai.

## Les sauvegardes

Un bouton dans **Administration → Paramètres**, ou une tâche planifiée du
panneau qui appelle :

    https://certify.vizdata.ci/api/sauvegarde?jeton=VOTRE_JETON_SAUVEGARDE

La copie est faite à chaud, vérifiée, chiffrée, et déposée hors du dossier web.
**Téléchargez-en une régulièrement** : une sauvegarde qui reste sur le serveur
ne protège que des fausses manœuvres, pas d'une panne de disque.

## Si quelque chose ne répond pas

- \`/api/sante\` renvoie du HTML → la règle \`/api\` du \`.htaccess\` n'est pas
  appliquée ; vérifiez que \`mod_rewrite\` est actif pour ce domaine.
- « Une erreur interne est survenue » → passez \`DEBOGUAGE\` à \`true\` dans
  \`config.php\`, relancez l'appel, puis remettez-le à \`false\`.
- Erreur sur la base → le dossier \`certify-registre\` n'existe pas, ou n'est
  pas inscriptible.
`;

/* Ce qui doit être dans l'archive, sous peine de déploiement muet et cassé. */
const INDISPENSABLES = ["index.html", ".htaccess", "api/index.php", "api/lib/Base.php"];

const lisible = (o) => (o < 1024 * 1024 ? `${(o / 1024).toFixed(0)} ko` : `${(o / 1024 / 1024).toFixed(1)} Mo`);

/* --- lire la liste des fichiers d'une archive ----------------------------
   Pourquoi ce code existe : sur Windows, `tar -a -c -f x.zip` produit un zip
   valide dont les noms portent des ANTISLASHES. Décompressé sur le serveur —
   Linux —, on obtient des fichiers nommés « api\lib\Base.php » à la racine :
   le site répond 404 partout, et rien n'indique pourquoi. L'archive avait
   « réussi ». Compress-Archive, de son côté, a selon les versions l'habitude
   d'ignorer les fichiers cachés — et `.htaccess` est un fichier caché.
   Deux pannes silencieuses, un même remède : relire l'archive produite.
   Aucune dépendance pour cela : les deux formats se lisent à la main. */

/** Noms de fichiers d'un zip, par son répertoire central. `null` si illisible. */
function entreesZip(chemin) {
  const o = readFileSync(chemin);
  /* La fin du répertoire central est en queue de fichier, après un commentaire
     de longueur variable : on la cherche à reculons. */
  const plancher = Math.max(0, o.length - 65557);
  let fin = -1;
  for (let i = o.length - 22; i >= plancher; i--) {
    if (o.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) return null;

  let reste = o.readUInt16LE(fin + 10);
  let p = o.readUInt32LE(fin + 16);
  const noms = [];
  while (reste-- > 0) {
    if (p + 46 > o.length || o.readUInt32LE(p) !== 0x02014b50) return null;
    const lNom = o.readUInt16LE(p + 28);
    noms.push(o.toString("utf8", p + 46, p + 46 + lNom));
    p += 46 + lNom + o.readUInt16LE(p + 30) + o.readUInt16LE(p + 32);
  }
  return noms;
}

/** Noms de fichiers d'un tar.gz, par ses en-têtes de 512 octets. */
function entreesTarGz(chemin) {
  const o = gunzipSync(readFileSync(chemin));
  const noms = [];
  for (let p = 0; p + 512 <= o.length; ) {
    const nom = o.toString("utf8", p, p + 100).replace(/\0.*$/, "");
    if (nom === "") break; /* bloc de fin */
    const taille = parseInt(o.toString("ascii", p + 124, p + 136).replace(/\0| /g, ""), 8) || 0;
    noms.push(nom);
    p += 512 + Math.ceil(taille / 512) * 512;
  }
  return noms;
}

/* --- écrire le zip -------------------------------------------------------
   Pourquoi ce code existe plutôt qu'un appel à un outil du système : aucun
   des trois outils disponibles ici ne produit l'archive attendue.
   `tar -a -c -f` de GNU tar ne sait pas faire de zip ; `Compress-Archive`
   écrit des antislashes dans les noms ; `zip` d'Info-ZIP n'est pas installé
   partout. Le format zip tient en trois structures, et zlib est dans Node :
   autant l'écrire, et savoir exactement ce qui sort.

   Ce qui est délibéré ici :
   — les noms portent des barres obliques, parce que c'est ce que le format
     demande et ce que les extracteurs des serveurs attendent ;
   — aucune entrée de dossier : les extracteurs créent les dossiers manquants,
     et une entrée de dossier mal nommée est une source de surprises ;
   — les fichiers cachés sont inclus comme les autres. `.htaccess` est caché,
     et c'est lui qui route tout le site. */

const TABLE_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(o) {
  let c = -1;
  for (let i = 0; i < o.length; i++) c = TABLE_CRC[(c ^ o[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Tous les fichiers d'un dossier, en chemins relatifs à barres obliques. */
function fichiersDe(racine, prefixe = "") {
  const liste = [];
  for (const entree of readdirSync(join(racine, prefixe), { withFileTypes: true })) {
    const relatif = prefixe ? `${prefixe}/${entree.name}` : entree.name;
    if (entree.isDirectory()) liste.push(...fichiersDe(racine, relatif));
    else liste.push(relatif);
  }
  return liste;
}

function ecrireZip(dossier, destination) {
  const morceaux = [];
  const central = [];
  let position = 0;

  for (const nom of fichiersDe(dossier).sort()) {
    const brut = readFileSync(join(dossier, nom));
    const comprime = deflateRawSync(brut, { level: 9 });
    /* Un fichier déjà compressé — une image, un .js minifié — grossit parfois
       en passant par deflate : on le stocke tel quel dans ce cas. */
    const gagne = comprime.length < brut.length;
    const corps = gagne ? comprime : brut;
    const methode = gagne ? 8 : 0;
    const octetsNom = Buffer.from(nom, "utf8");
    const somme = crc32(brut);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); /* version minimale */
    local.writeUInt16LE(0x0800, 6); /* noms en UTF-8 */
    local.writeUInt16LE(methode, 8);
    local.writeUInt32LE(somme, 14);
    local.writeUInt32LE(corps.length, 18);
    local.writeUInt32LE(brut.length, 22);
    local.writeUInt16LE(octetsNom.length, 26);

    const entree = Buffer.alloc(46);
    entree.writeUInt32LE(0x02014b50, 0);
    entree.writeUInt16LE(20, 4);
    entree.writeUInt16LE(20, 6);
    entree.writeUInt16LE(0x0800, 8);
    entree.writeUInt16LE(methode, 10);
    entree.writeUInt32LE(somme, 16);
    entree.writeUInt32LE(corps.length, 20);
    entree.writeUInt32LE(brut.length, 24);
    entree.writeUInt16LE(octetsNom.length, 28);
    /* 0644 pour tout le monde : un fichier du site n'a pas à être exécutable. */
    entree.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    entree.writeUInt32LE(position, 42);

    morceaux.push(local, octetsNom, corps);
    central.push(entree, octetsNom);
    position += local.length + octetsNom.length + corps.length;
  }

  const taillecentral = central.reduce((t, b) => t + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(central.length / 2, 8);
  fin.writeUInt16LE(central.length / 2, 10);
  fin.writeUInt32LE(taillecentral, 12);
  fin.writeUInt32LE(position, 16);

  writeFileSync(destination, Buffer.concat([...morceaux, ...central, fin]));
}

/**
 * Relit l'archive produite. Rend `null` si elle est bonne, sinon la raison.
 *
 * On ne se contente pas d'un fichier non vide : une archive qui « existe »
 * n'est pas une archive qui se décompressera correctement sur le serveur.
 */
function verifier(chemin) {
  let noms;
  try {
    noms = chemin.endsWith(".zip") ? entreesZip(chemin) : entreesTarGz(chemin);
  } catch (e) {
    return `archive illisible (${e.message})`;
  }
  if (!noms || noms.length === 0) return "archive illisible ou vide";

  const propres = noms.map((n) => n.replace(/^\.\//, "")).filter((n) => n !== "" && !n.endsWith("/"));

  const antislash = propres.find((n) => n.includes("\\"));
  if (antislash) return `noms de fichiers à l'antislash (« ${antislash} ») : illisible sur le serveur`;

  const douteux = propres.find((n) => n.startsWith("/") || n.split("/").includes(".."));
  if (douteux) return `chemin dangereux dans l'archive (« ${douteux} »)`;

  const absents = INDISPENSABLES.filter((n) => !propres.includes(n));
  if (absents.length) return `fichiers absents de l'archive : ${absents.join(", ")}`;

  if (!propres.some((n) => n.startsWith("api/schema/") && n.endsWith(".sql"))) {
    return "aucun fichier de schéma dans api/schema/ : la base ne pourrait pas être créée";
  }
  return null;
}

/**
 * Retire du paquet les migrations que le dépôt ne connaît pas encore.
 *
 * Une migration s'applique UNE FOIS et se marque appliquée, par son nom de
 * fichier. Un brouillon emporté par mégarde crée donc ses tables en
 * production, définitivement — et la vraie version, livrée plus tard sous le
 * même nom, ne sera jamais exécutée. Il n'y a pas de marche arrière.
 *
 * Le critère est le dépôt, pas une liste d'exceptions : un fichier non suivi
 * par git est un travail en cours, de quiconque, et le travail en cours ne se
 * déploie pas. Rien n'est touché dans le dossier de travail : on n'élague que
 * la copie déjà posée dans le paquet.
 *
 * Si git ne peut pas répondre, on s'arrête. Continuer « au cas où » est
 * exactement ce qui a failli emporter une migration de quelqu'un d'autre.
 *
 * Rend la liste des fichiers écartés, ou null si le contrôle n'a pas pu se
 * faire.
 */
function elaguerSchema() {
  const dossier = join(ETAPE, "api", "schema");
  if (!existsSync(dossier)) return [];

  let suivis;
  try {
    suivis = new Set(
      execFileSync("git", ["ls-files", "--", "server/schema"], { cwd: RACINE, encoding: "utf8" })
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => l.slice(l.lastIndexOf("/") + 1))
    );
  } catch (e) {
    console.error(`\n  Impossible de demander à git quelles migrations sont commitées : ${e.message}`);
    console.error("  Le paquet n'est pas construit : une migration en brouillon ne se rattrape pas.\n");
    return null;
  }
  if (suivis.size === 0) {
    console.error("\n  git ne connaît aucune migration dans server/schema/ : contrôle impossible.\n");
    return null;
  }

  const ecarte = [];
  for (const nom of readdirSync(dossier)) {
    if (!nom.endsWith(".sql") || suivis.has(nom)) continue;
    rmSync(join(dossier, nom), { force: true });
    ecarte.push(nom);
  }
  return ecarte;
}

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
  if (!existsSync(join(RACINE, "dist", ".htaccess"))) {
    console.error("\n  dist/.htaccess est absent : sans lui, /api ne serait pas routé et");
    console.error("  /verifier/{jeton} répondrait 404. Vérifiez public/.htaccess.\n");
    return 1;
  }

  rmSync(SORTIE, { recursive: true, force: true });
  mkdirSync(ETAPE, { recursive: true });

  for (const [source, destination] of CONTENU) {
    const origine = join(RACINE, source);
    if (!existsSync(origine)) {
      console.error(`\n  Absent du dépôt : ${source}\n`);
      return 1;
    }
    const cible = destination === "." ? ETAPE : join(ETAPE, destination);
    mkdirSync(destination === "." ? cible : join(cible, ".."), { recursive: true });
    cpSync(origine, cible, { recursive: true });
  }

  const ecarte = elaguerSchema();
  if (ecarte === null) return 1;
  for (const nom of ecarte) {
    console.log(`  Écarté  : api/schema/${nom} — migration non commitée, elle n'a rien à faire en production`);
  }

  writeFileSync(join(ETAPE, "LISEZ-MOI-DEPLOIEMENT.md"), LISEZMOI);

  const archive = join(SORTIE, "vizdata-certify.zip");
  ecrireZip(ETAPE, archive);

  const verdict = verifier(archive);
  if (verdict !== null) {
    console.error(`\n  L'archive produite n'est pas utilisable : ${verdict}`);
    console.error(`\n  Le dossier prêt à téléverser reste là, à envoyer tel quel :`);
    console.error(`  ${ETAPE}\n`);
    return 1;
  }

  console.log(`\n  Paquet  : ${archive}`);
  console.log(`  Poids   : ${lisible(statSync(archive).size)} compressé, ${lisible(poids(ETAPE))} une fois ouvert`);
  console.log(`  Contenu : interface construite + registre PHP, aucune dépendance`);
  console.log(`\n  Ni base, ni sauvegarde, ni clé : rien de personnel n'en sort.`);
  console.log(`  La marche à suivre est dans LISEZ-MOI-DEPLOIEMENT.md.\n`);
  return 0;
}

process.exitCode = construire();
