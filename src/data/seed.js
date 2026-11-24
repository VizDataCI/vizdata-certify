/* Jeu de données de démonstration, reconstruit à chaque registre vierge.
 *
 * Il sert à deux choses : faire tourner l'application sans projet Supabase, et
 * montrer la structure attendue. Il suit donc exactement le modèle de la base —
 * domaines, programmes, trois rôles, autorisations nommées. Si les deux
 * divergeaient, la démonstration mentirait sur le produit.
 */

import { TODAY } from "../lib/dates.js";

const BASE_URL = "https://certify.vizdata.ci";

/* Référence d'exemple, montrée dans les champs de recherche. Elle doit suivre
   le format réel — code de PROGRAMME, pas code de domaine — sinon elle apprend
   à saisir une référence qui n'existe pas. */
const REFERENCE_EXEMPLE = "VIZ-2026-EXCEL-AVA-000125";

const SKILLS = [
  { id: 1, name: "Excel avancé" },
  { id: 2, name: "Data Analysis" },
  { id: 3, name: "Power Query" },
  { id: 4, name: "Power BI" },
  { id: 5, name: "Data Visualization" },
  { id: 6, name: "DAX" },
  { id: 7, name: "Tableaux croisés dynamiques" },
  { id: 8, name: "Storytelling data" },
  { id: 9, name: "SQL" },
  { id: 10, name: "Modélisation" },
];

/* --- domaines -------------------------------------------------------------
   Premier niveau de la catégorisation. Un domaine regroupe les programmes
   d'un même champ : c'est ce qui permet à VIZDATA de délivrer six
   certifications Excel distinctes sans multiplier les codes de domaine. */
const SEED_DOMAINS = [
  { id: 1, code: "EXCEL", name: "Excel", description: "Tableur, analyse et structuration des données sous Microsoft Excel.", status: "ACTIVE", sort_order: 10 },
  { id: 2, code: "POWERBI", name: "Power BI", description: "Modélisation, analyse et visualisation sous Microsoft Power BI.", status: "ACTIVE", sort_order: 20 },
  { id: 3, code: "DATA", name: "Data & Analyse", description: "Analyse de données, visualisation et restitution.", status: "ACTIVE", sort_order: 30 },
];

/* --- programmes ----------------------------------------------------------
   Second niveau. Le nom est l'intitulé exact imprimé sur le certificat ; le
   code est unique et entre dans la référence : VIZ-2026-EXCEL-AVA-000001. */
const SEED_TYPES = [
  { id: 1, domain_id: 1, code: "EXCEL-DEB", name: "Excel : Niveau débutant", description: "Prise en main du tableur, saisie, calculs et mise en forme.", default_duration: 20, validity_period: null, status: "ACTIVE", sort_order: 10 },
  { id: 2, domain_id: 1, code: "EXCEL-INT", name: "Excel : Niveau intermédiaire", description: "Formules, fonctions de recherche, mise en forme conditionnelle, graphiques.", default_duration: 25, validity_period: null, status: "ACTIVE", sort_order: 20 },
  { id: 3, domain_id: 1, code: "EXCEL-AVA", name: "Excel : Niveau avancé", description: "Fonctions imbriquées, bases de données, consolidation et automatisation.", default_duration: 30, validity_period: null, status: "ACTIVE", sort_order: 30 },
  { id: 4, domain_id: 1, code: "EXCEL-EXP", name: "Excel : Expert", description: "Maîtrise experte du tableur : modélisation, Power Query, outils d'analyse.", default_duration: 40, validity_period: null, status: "ACTIVE", sort_order: 40 },
  { id: 5, domain_id: 1, code: "EXCEL-TCD", name: "Excel : Tableaux croisés dynamiques", description: "Conception et exploitation des tableaux croisés dynamiques.", default_duration: 15, validity_period: null, status: "ACTIVE", sort_order: 50 },
  { id: 6, domain_id: 1, code: "EXCEL-STR", name: "Excel : Structuration et analyse des données", description: "Structuration des données, nettoyage, analyse et restitution.", default_duration: 25, validity_period: null, status: "ACTIVE", sort_order: 60 },
  { id: 7, domain_id: 2, code: "PBI-INI", name: "Power BI : Initiation", description: "Découverte de Power BI Desktop, premiers rapports.", default_duration: 20, validity_period: null, status: "ACTIVE", sort_order: 10 },
  { id: 8, domain_id: 2, code: "PBI-ANA", name: "Power BI : Analyse et visualisation", description: "Visuels, interactions, mise en récit des données.", default_duration: 25, validity_period: null, status: "ACTIVE", sort_order: 20 },
  { id: 9, domain_id: 2, code: "PBI-MOD", name: "Power BI : Modélisation des données", description: "Modèle en étoile, relations, mesures DAX.", default_duration: 30, validity_period: null, status: "ACTIVE", sort_order: 30 },
  { id: 10, domain_id: 2, code: "PBI-AVA", name: "Power BI : Niveau avancé", description: "DAX avancé, performance, sécurité au niveau des lignes, publication.", default_duration: 35, validity_period: null, status: "ACTIVE", sort_order: 40 },
  { id: 11, domain_id: 3, code: "DATA-ANA", name: "Data Analyst : Parcours complet", description: "Parcours complet d'analyse de données, de la collecte à la restitution.", default_duration: 80, validity_period: null, status: "ACTIVE", sort_order: 10 },
  { id: 12, domain_id: 3, code: "DATA-VIZ", name: "Data Visualization", description: "Conception de visualisations et de tableaux de bord.", default_duration: 25, validity_period: null, status: "ACTIVE", sort_order: 20 },
];

const SEED_TEMPLATES = [
  { id: 1, code: "VIZDATA-PAYSAGE-2026", name: "VIZDATA : A4 paysage", description: "Modèle institutionnel officiel.", orientation: "landscape", status: "ACTIVE" },
];

/* --- comptes -------------------------------------------------------------
   Un administrateur, un gestionnaire aux autorisations partielles — pour que
   la démonstration montre ce que « selon les autorisations définies » veut
   dire —, et cinq titulaires. */
const SEED_USERS = [
  { id: 1, first_name: "Fabrice", last_name: "BOH", email: "fabrice.boh@vizdata.ci", username: "fabrice-boh", linkedin_url: "https://linkedin.com/in/fabriceboh", public_profile: true, role: "CERTIFIED", account_status: "ACTIVE", must_change_password: false, permissions: {} },
  { id: 2, first_name: "Aminata", last_name: "KONÉ", email: "aminata.kone@example.ci", username: "aminata-kone", linkedin_url: "", public_profile: true, role: "CERTIFIED", account_status: "ACTIVE", must_change_password: false, permissions: {} },
  { id: 3, first_name: "Serge", last_name: "N'GUESSAN", email: "serge.nguessan@example.ci", username: "serge-nguessan", linkedin_url: "", public_profile: false, role: "CERTIFIED", account_status: "ACTIVE", must_change_password: false, permissions: {} },
  { id: 4, first_name: "Mariam", last_name: "TOURÉ", email: "mariam.toure@example.ci", username: "mariam-toure", linkedin_url: "", public_profile: true, role: "CERTIFIED", account_status: "ACTIVE", must_change_password: false, permissions: {} },
  { id: 5, first_name: "Kouassi", last_name: "YAO", email: "kouassi.yao@example.ci", username: "kouassi-yao", linkedin_url: "", public_profile: false, role: "CERTIFIED", account_status: "ACTIVE", must_change_password: false, permissions: {} },
  { id: 98, first_name: "Awa", last_name: "GESTION", email: "gestion@vizdata.ci", username: "awa-gestion", linkedin_url: "", public_profile: false, role: "MANAGER", account_status: "ACTIVE", must_change_password: false, permissions: { creer_titulaires: true, attribuer_certificats: true } },
  { id: 99, first_name: "Direction", last_name: "VIZDATA", email: "admin@vizdata.ci", username: "vizdata", linkedin_url: "", public_profile: false, role: "ADMIN", account_status: "ACTIVE", must_change_password: false, permissions: {} },
];

/* [id, titulaire, programme, jours avant aujourd'hui, statut, compétences]
 *
 * Les dates sont relatives, pas écrites en dur. Des dates fixes vieillissent :
 * le jeu de démonstration finissait par n'avoir aucune certification délivrée
 * « ces trente derniers jours », et le tableau de bord s'ouvrait vide sur une
 * plateforme pourtant pleine. Une démonstration qui donne l'impression que
 * rien ne se passe dessert le produit.
 *
 * Ni expiration ni score : ces deux mentions ne figurent plus nulle part.
 */
const rawCerts = [
  [1, 1, 3, 4, "ACTIVE", [1, 3, 7]],
  [2, 1, 8, 12, "ACTIVE", [4, 6, 5]],
  [3, 1, 11, 420, "ACTIVE", [2, 9, 10]],
  [4, 2, 3, 6, "ACTIVE", [1, 7]],
  [5, 2, 12, 19, "ACTIVE", [], "PARTICIPATION"],
  [6, 3, 8, 27, "ACTIVE", [4, 6]],
  [7, 3, 4, 63, "ACTIVE", [1, 3, 7, 10]],
  [8, 3, 11, 310, "REVOKED", [2, 9]],
  [9, 4, 1, 2, "ACTIVE", [1, 7]],
  [10, 4, 12, 44, "ACTIVE", [5, 8]],
  [11, 4, 9, 9, "ACTIVE", [4, 6, 10]],
  [12, 5, 11, 95, "ACTIVE", [2, 9, 10]],
  [13, 5, 2, 500, "ACTIVE", [1, 3]],
  [14, 5, 4, 150, "CANCELLED", [1]],
  [15, 2, 5, 21, "ACTIVE", [2, 5, 9]],
  [16, 1, 10, 1, "ACTIVE", [], "PARTICIPATION"],
  [17, 1, 5, 35, "ACTIVE", [7, 1]],
];

/** Date au format ISO court, N jours avant aujourd'hui. */
function ilYA(jours) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - jours);
  return d.toISOString().slice(0, 10);
}

function token(n = 14) {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function buildSeed() {
  /* La référence est construite comme la base la construit —
     VIZ-{année}-{code du programme}-{numéro sur six chiffres} — avec un
     compteur par couple (code, année). Reproduire la règle ici plutôt que
     d'écrire les références à la main garantit que la démonstration montre le
     vrai format, y compris quand les dates changent d'année. */
  const compteurs = new Map();
  const referencePour = (code, issue) => {
    const annee = issue.slice(0, 4);
    const cle = `${annee}|${code}`;
    const n = (compteurs.get(cle) || 0) + 1;
    compteurs.set(cle, n);
    return `VIZ-${annee}-${code}-${String(n).padStart(6, "0")}`;
  };

  const certificates = rawCerts.map(([id, uid, tid, jours, status, skills, kind = "COMPETENCES"]) => {
    const programme = SEED_TYPES.find((t) => t.id === tid);
    const issue = ilYA(jours);
    return {
      id,
      reference: referencePour(programme.code, issue),
      public_token: token(),
      user_id: uid,
      certificate_type_id: tid,
      template_id: 1,
      issued_by: 99,
      issue_date: issue,
      /* Plus d'expiration : un certificat VIZDATA atteste d'un acquis, et un
         acquis ne périme pas à date fixe. Les colonnes restent pour les
         certificats anciens qui en portaient une. */
      expiry_date: null,
      status,
      /* Participation ou compétences. Deux entrées du jeu d'essai sont des
         certificats de participation : la démonstration doit montrer les deux
         documents, sinon le second type ne se découvre qu'en production. */
      kind,
      score: null,
      duration: programme.default_duration,
      trainer: "Fabrice BOH",
      signatory: "Direction VIZDATA",
      pdf_url: "",
      skills,
      revoke_reason: status === "REVOKED" ? "Non-respect de la charte d'usage du certificat." : "",
      created_at: issue,
    };
  });

  const verifications = [];
  let vid = 1;
  certificates.forEach((c) => {
    const n = c.status === "ACTIVE" ? 2 + Math.floor(Math.random() * 7) : 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const base = new Date(c.issue_date).getTime();
      const t = base + Math.random() * (TODAY.getTime() - base);
      verifications.push({
        id: vid++,
        certificate_id: c.id,
        verified_at: new Date(t).toISOString(),
        source: ["qr", "reference", "lien"][Math.floor(Math.random() * 3)],
        country: ["CI", "CI", "CI", "FR", "SN", "BF"][Math.floor(Math.random() * 6)],
      });
    }
  });

  const shares = [];
  let sid = 1;
  certificates.slice(0, 9).forEach((c) => {
    const n = Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++)
      shares.push({
        id: sid++,
        certificate_id: c.id,
        platform: ["linkedin", "whatsapp", "email", "copy_link"][Math.floor(Math.random() * 4)],
        shared_at: new Date().toISOString(),
      });
  });

  const audit_logs = certificates.map((c, i) => ({
    id: i + 1,
    actor: "Direction VIZDATA",
    action: "CERTIFICATE_CREATED",
    entity_type: "certificate",
    entity_id: c.id,
    metadata: c.reference,
    created_at: c.created_at + "T09:00:00",
  }));

  /* La date d'inscription compte « les nouveaux certifiés » du tableau de
     bord : sans elle, l'indicateur resterait à zéro quoi qu'il arrive. Les
     titulaires sont échelonnés sur l'année, dont deux récents. */
  const inscriptions = { 1: 300, 2: 210, 3: 120, 4: 17, 5: 5, 98: 260, 99: 400 };
  const users = SEED_USERS.map((u) => ({ ...u, created_at: ilYA(inscriptions[u.id] ?? 365) + "T09:00:00" }));

  return {
    users,
    types: SEED_TYPES,
    domains: SEED_DOMAINS,
    templates: SEED_TEMPLATES,
    skills: SKILLS,
    certificates,
    verifications,
    shares,
    audit_logs,
    notifications: [],
  };
}

export { BASE_URL, REFERENCE_EXEMPLE, SKILLS, SEED_DOMAINS, SEED_TYPES, token, buildSeed };
