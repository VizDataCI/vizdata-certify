/* Administration de la base, en ligne de commande.
 *
 *   npm run base -- init                   crée la base et le catalogue de départ
 *   npm run base -- admin direction@vizdata.ci   ouvre le premier administrateur
 *   npm run base -- etat                   ce que contient la base
 *   npm run base -- menage                 retire sessions et jetons périmés
 *
 * Le premier administrateur est le seul compte que l'application ne peut pas
 * créer elle-même : il n'y a personne pour l'inviter. D'où cette commande.
 *
 * Elle ne demande ni ne fixe de mot de passe. Elle imprime un lien
 * d'invitation, valable sept jours et une seule fois, que l'on suit pour
 * choisir son mot de passe. Un mot de passe saisi en ligne de commande
 * resterait dans l'historique du shell, et souvent pour toujours.
 */

import { ouvrirBase, enTransaction, uid, maintenant, json } from "../server/db.mjs";
import { creerJeton, menage, compteParEmail } from "../server/comptes.mjs";

const SITE = (process.env.VIZDATA_SITE_URL || "http://localhost:5173").replace(/\/$/, "");

/* --- catalogue de départ --------------------------------------------------
   Les domaines et programmes de VIZDATA au 15 novembre 2026. Posés une seule
   fois, à l'initialisation : une base vide n'est pas utilisable — on ne peut
   rien délivrer sans programme —, mais on ne réécrit jamais un catalogue que
   quelqu'un a modifié depuis. */

const DOMAINES = [
  ["EXCEL", "Excel", "Tableur, analyse et structuration des données sous Microsoft Excel.", 10],
  ["POWERBI", "Power BI", "Modélisation, analyse et visualisation sous Microsoft Power BI.", 20],
  ["DATA", "Data & Analyse", "Analyse de données, visualisation et restitution.", 30],
];

const PROGRAMMES = [
  ["EXCEL", "EXCEL-DEB", "Excel — Niveau débutant", "Prise en main du tableur, saisie, calculs et mise en forme.", 20, 10],
  ["EXCEL", "EXCEL-INT", "Excel — Niveau intermédiaire", "Formules, fonctions de recherche, mise en forme conditionnelle, graphiques.", 25, 20],
  ["EXCEL", "EXCEL-AVA", "Excel — Niveau avancé", "Fonctions imbriquées, bases de données, consolidation et automatisation.", 30, 30],
  ["EXCEL", "EXCEL-EXP", "Excel — Expert", "Maîtrise experte du tableur : modélisation, Power Query, outils d'analyse.", 40, 40],
  ["EXCEL", "EXCEL-TCD", "Excel — Tableaux croisés dynamiques", "Conception et exploitation des tableaux croisés dynamiques.", 15, 50],
  ["EXCEL", "EXCEL-STR", "Excel — Structuration et analyse des données", "Structuration des données, nettoyage, analyse et restitution.", 25, 60],
  ["POWERBI", "PBI-INI", "Power BI — Initiation", "Découverte de Power BI Desktop, premiers rapports.", 20, 10],
  ["POWERBI", "PBI-ANA", "Power BI — Analyse et visualisation", "Visuels, interactions, mise en récit des données.", 25, 20],
  ["POWERBI", "PBI-MOD", "Power BI — Modélisation des données", "Modèle en étoile, relations, mesures DAX.", 30, 30],
  ["POWERBI", "PBI-AVA", "Power BI — Niveau avancé", "DAX avancé, performance, sécurité au niveau des lignes, publication.", 35, 40],
  ["DATA", "DATA-ANA", "Data Analyst — Parcours complet", "Parcours complet d'analyse de données, de la collecte à la restitution.", 80, 10],
  ["DATA", "DATA-VIZ", "Data Visualization", "Conception de visualisations et de tableaux de bord.", 25, 20],
];

const COMPETENCES = [
  "Excel avancé", "Data Analysis", "Power Query", "Power BI", "Data Visualization",
  "DAX", "Tableaux croisés dynamiques", "Storytelling data", "SQL", "Modélisation",
];

const MODELE = ["VIZDATA-PAYSAGE-2026", "VIZDATA — A4 paysage", "Modèle institutionnel officiel : A4 paysage, logo VIZDATA, QR code de vérification."];

function semerCatalogue(db) {
  return enTransaction(db, () => {
    const bilan = { domaines: 0, programmes: 0, competences: 0, modeles: 0 };

    const modeleExistant = db.prepare("select id from certificate_templates where code = ?").get(MODELE[0]);
    const modeleId = modeleExistant?.id ?? uid();
    if (!modeleExistant) {
      db.prepare("insert into certificate_templates (id, code, name, description) values (?, ?, ?, ?)")
        .run(modeleId, ...MODELE);
      bilan.modeles++;
    }

    const idDomaine = new Map();
    for (const [code, nom, description, rang] of DOMAINES) {
      const deja = db.prepare("select id from certification_domains where code = ?").get(code);
      if (deja) { idDomaine.set(code, deja.id); continue; }
      const id = uid();
      db.prepare("insert into certification_domains (id, code, name, description, sort_order) values (?, ?, ?, ?, ?)")
        .run(id, code, nom, description, rang);
      idDomaine.set(code, id);
      bilan.domaines++;
    }

    for (const [domaine, code, nom, description, duree, rang] of PROGRAMMES) {
      if (db.prepare("select id from certificate_types where code = ?").get(code)) continue;
      db.prepare(
        `insert into certificate_types (id, domain_id, template_id, code, name, description, default_duration, sort_order)
         values (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(uid(), idDomaine.get(domaine), modeleId, code, nom, description, duree, rang);
      bilan.programmes++;
    }

    for (const nom of COMPETENCES) {
      if (db.prepare("select id from skills where name = ? collate nocase").get(nom)) continue;
      db.prepare("insert into skills (id, name) values (?, ?)").run(uid(), nom);
      bilan.competences++;
    }

    return bilan;
  });
}

/* --- commandes ------------------------------------------------------------ */

function init(db) {
  const bilan = semerCatalogue(db);
  console.log("\n  Base prête.");
  console.log(`  Catalogue : +${bilan.domaines} domaine(s), +${bilan.programmes} programme(s), +${bilan.competences} compétence(s), +${bilan.modeles} modèle(s)`);
  if (!bilan.domaines && !bilan.programmes) console.log("  (le catalogue existait déjà, rien n'a été réécrit)");

  const admins = db.prepare("select count(*) n from users where role = 'ADMIN' and account_status = 'ACTIVE'").get().n;
  if (admins === 0) {
    console.log("\n  Aucun administrateur. Ouvrez-en un :");
    console.log("    npm run base -- admin direction@vizdata.ci\n");
  } else {
    console.log(`  ${admins} administrateur(s) actif(s).\n`);
  }
  return 0;
}

function administrateur(db, email, prenom = "Direction", nom = "VIZDATA") {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("\n  Adresse e-mail manquante ou invalide.");
    console.error("  Usage : npm run base -- admin direction@vizdata.ci [Prénom] [Nom]\n");
    return 2;
  }

  const adresse = email.trim().toLowerCase();
  const existant = compteParEmail(db, adresse);
  let id;

  if (existant) {
    if (existant.role !== "ADMIN") {
      db.prepare("update users set role = 'ADMIN', account_status = 'ACTIVE' where id = ?").run(existant.id);
      console.log(`\n  ${adresse} était ${existant.role} : le compte est promu administrateur.`);
    } else {
      console.log(`\n  ${adresse} est déjà administrateur.`);
    }
    id = existant.id;
  } else {
    id = uid();
    const identifiant = `${prenom}-${nom}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    db.prepare(
      `insert into users (id, email, first_name, last_name, username, role, account_status, must_change_password, invited_at)
       values (?, ?, ?, ?, ?, 'ADMIN', 'ACTIVE', 1, ?)`
    ).run(id, adresse, prenom, nom, identifiant, maintenant());
    console.log(`\n  Administrateur créé : ${prenom} ${nom} <${adresse}>`);
  }

  /* Aucun mot de passe n'est produit ici. Un lien, valable sept jours et une
     seule fois, et la personne choisit le sien. */
  const { secret, expire } = creerJeton(db, id, "INVITATION");
  console.log("\n  Lien pour choisir le mot de passe (valable 7 jours, une seule fois) :\n");
  console.log(`    ${SITE}/nouveau-mot-de-passe?jeton=${secret}\n`);
  console.log(`  Expire le ${new Date(expire).toLocaleString("fr-FR")}.`);
  console.log("  Transmettez-le par un canal sûr : il ouvre le compte.\n");
  return 0;
}

function etat(db) {
  const n = (sql) => db.prepare(sql).get().n;
  const lignes = [
    ["Comptes", n("select count(*) n from users")],
    ["  administrateurs", n("select count(*) n from users where role = 'ADMIN'")],
    ["  gestionnaires", n("select count(*) n from users where role = 'MANAGER'")],
    ["  certifiés", n("select count(*) n from users where role = 'CERTIFIED'")],
    ["  désactivés", n("select count(*) n from users where account_status = 'DISABLED'")],
    ["  en attente de mot de passe", n("select count(*) n from users where password_hash is null")],
    ["Domaines", n("select count(*) n from certification_domains")],
    ["Programmes", n("select count(*) n from certificate_types")],
    ["Certificats délivrés", n("select count(*) n from certificates")],
    ["  en vigueur", n("select count(*) n from certificates where status = 'ACTIVE'")],
    ["  révoqués", n("select count(*) n from certificates where status = 'REVOKED'")],
    ["Vérifications", n("select count(*) n from verifications")],
    ["Candidatures", n("select count(*) n from candidatures")],
    ["Notifications en souffrance", n("select count(*) n from notifications where status <> 'SENT'")],
    ["Sessions ouvertes", n("select count(*) n from sessions")],
  ];

  console.log("");
  for (const [libelle, valeur] of lignes) {
    console.log(`  ${libelle.padEnd(32, ".")} ${String(valeur).padStart(6)}`);
  }

  const migrations = db.prepare("select nom from migrations order by nom").all().map((r) => r.nom);
  console.log(`\n  Migrations : ${migrations.join(", ")}`);
  const reglages = db.prepare("select key, value from settings").all();
  if (reglages.length) {
    console.log("  Réglages   : " + reglages.map((r) => `${r.key}=${JSON.stringify(json(r.value))}`).join(", "));
  }
  console.log("");
  return 0;
}

/* --- aiguillage ----------------------------------------------------------- */

const [commande, ...args] = process.argv.slice(2);
const db = ouvrirBase();

try {
  switch (commande) {
    case "init":
      process.exitCode = init(db);
      break;
    case "admin":
      process.exitCode = administrateur(db, args[0], args[1], args[2]);
      break;
    case "etat":
      process.exitCode = etat(db);
      break;
    case "menage": {
      const bilan = menage(db);
      console.log(`\n  ${bilan.sessions} session(s) et ${bilan.jetons} jeton(s) périmés retirés.\n`);
      break;
    }
    default:
      console.log(`
  Administration de la base VIZDATA CERTIFY

    npm run base -- init                         crée la base et le catalogue de départ
    npm run base -- admin <email> [Prénom] [Nom] ouvre ou promeut un administrateur
    npm run base -- etat                         ce que contient la base
    npm run base -- menage                       retire sessions et jetons périmés

  Fichier : ${process.env.VIZDATA_DB || "data/certify.db"}
`);
      process.exitCode = commande ? 2 : 0;
  }
} finally {
  db.close();
}
