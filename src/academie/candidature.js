/* Candidatures : règles, formats et export.
 *
 * Ce module ne touche ni au réseau ni au navigateur. Il porte les règles qui
 * décident si une candidature part, comment elle s'affiche et comment elle
 * s'exporte, donc ce qui doit être éprouvé par des tests plutôt qu'à la main
 * sur un formulaire.
 *
 * La validation est écrite deux fois : ici, pour dire au candidat ce qui
 * manque avant l'envoi, et dans la base, par des contraintes, pour que la
 * règle tienne même si l'appel ne vient pas de cette page. Ce n'est pas une
 * duplication inutile : le navigateur ne fait jamais autorité.
 */

/* --- référentiels --------------------------------------------------------
   Les clés correspondent exactement aux valeurs des types énumérés Postgres
   (`niveau_excel`, `formule_paiement`, `candidature_statut`). Un libellé
   change sans migration ; une clé, non. */

const NIVEAUX = [
  { cle: "DEBUTANT", label: "Débutant", aide: "Je saisis des données et j'utilise quelques formules simples." },
  { cle: "INTERMEDIAIRE", label: "Intermédiaire", aide: "Je suis à l'aise avec les formules et les tableaux croisés dynamiques." },
  { cle: "AVANCE", label: "Avancé", aide: "Je construis des classeurs complexes et j'automatise déjà une partie de mon travail." },
];

const FORMULES = [
  { cle: "INTEGRAL", label: "Paiement intégral", versements: 1 },
  { cle: "ECHELONNE", label: "Paiement en deux fois", versements: 2 },
];

const STATUTS = [
  { cle: "NOUVEAU", label: "Nouveau", tone: "gris" },
  { cle: "CONTACTE", label: "Contacté", tone: "orange" },
  { cle: "ATTENTE_PAIEMENT", label: "En attente de paiement", tone: "orange" },
  { cle: "INSCRIT", label: "Inscrit", tone: "vert" },
  { cle: "ANNULE", label: "Annulé", tone: "rouge" },
];

const STATUT_META = Object.fromEntries(STATUTS.map((s) => [s.cle, s]));
const NIVEAU_LABEL = Object.fromEntries(NIVEAUX.map((n) => [n.cle, n.label]));
const FORMULE_LABEL = Object.fromEntries(FORMULES.map((f) => [f.cle, f.label]));

/* --- formats -------------------------------------------------------------- */

/** Montant en francs CFA, séparé par espaces insécables : « 500 000 FCFA ». */
function montant(valeur) {
  const n = Number(valeur);
  if (!Number.isFinite(n)) return "Non chiffré";
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`;
}

/** Numéro WhatsApp normalisé : chiffres seulement, indicatif conservé.
 *
 *  Les candidats écrivent « 05 04 38 35 32 », « +225 0504383532 »,
 *  « 00225-05-04-38-35-32 ». L'équipe doit pouvoir appeler sans retaper.
 *  Un numéro ivoirien à 10 chiffres sans indicatif reçoit le 225. */
function normaliserWhatsapp(saisie) {
  const brut = String(saisie || "").trim();
  let chiffres = brut.replace(/[^\d]/g, "");
  if (chiffres.startsWith("00")) chiffres = chiffres.slice(2);
  if (!chiffres) return "";
  /* 10 chiffres commençant par 0 : numéro local ivoirien. */
  if (chiffres.length === 10 && chiffres.startsWith("0")) return `+225${chiffres}`;
  if (brut.startsWith("+") || chiffres.length > 10) return `+${chiffres}`;
  return chiffres;
}

/* --- validation ----------------------------------------------------------- */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/**
 * Contrôle une candidature avant envoi.
 * @returns {Record<string,string>} un message par champ fautif ; vide si tout va bien.
 */
function validerCandidature(c) {
  const erreurs = {};
  const texte = (v) => String(v || "").trim();

  if (texte(c.nom).length < 2) erreurs.nom = "Indiquez vos nom et prénoms.";
  else if (texte(c.nom).length > 120) erreurs.nom = "120 caractères au maximum.";

  const tel = normaliserWhatsapp(c.whatsapp);
  if (tel.replace(/\D/g, "").length < 8) erreurs.whatsapp = "Indiquez un numéro WhatsApp joignable.";

  if (!EMAIL.test(texte(c.email))) erreurs.email = "Indiquez une adresse e-mail valide.";

  if (texte(c.profession).length < 2) erreurs.profession = "Indiquez votre profession ou votre fonction.";

  if (!NIVEAU_LABEL[c.niveau]) erreurs.niveau = "Choisissez votre niveau actuel sur Excel.";
  if (!FORMULE_LABEL[c.formule]) erreurs.formule = "Choisissez votre mode de paiement.";

  if (texte(c.motivation).length > 2000) erreurs.motivation = "2 000 caractères au maximum.";

  if (!c.disponible) erreurs.disponible = "Confirmez votre disponibilité pour les 8 jours.";
  if (!c.consent) erreurs.consent = "Votre accord est nécessaire pour que VIZDATA vous contacte.";

  return erreurs;
}

/** Candidature prête pour la base : champs nettoyés, numéro normalisé. */
function normaliserCandidature(c) {
  return {
    nom: String(c.nom || "").trim().replace(/\s+/g, " "),
    whatsapp: normaliserWhatsapp(c.whatsapp),
    email: String(c.email || "").trim().toLowerCase(),
    profession: String(c.profession || "").trim(),
    entreprise: String(c.entreprise || "").trim(),
    niveau: c.niveau,
    motivation: String(c.motivation || "").trim().slice(0, 2000),
    formule: c.formule,
    disponible: Boolean(c.disponible),
    consent: Boolean(c.consent),
  };
}

/* --- export -------------------------------------------------------------- */

const COLONNES_EXPORT = [
  ["reference", "REFERENCE"],
  ["created_at", "DATE_CANDIDATURE"],
  ["nom", "NOM_ET_PRENOMS"],
  ["whatsapp", "WHATSAPP"],
  ["email", "EMAIL"],
  ["profession", "PROFESSION"],
  ["entreprise", "ENTREPRISE"],
  ["niveau", "NIVEAU_EXCEL"],
  ["formule", "FORMULE"],
  ["statut", "STATUT"],
  ["cohorte", "COHORTE"],
  ["motivation", "MOTIVATION"],
  ["notes", "NOTES_INTERNES"],
];

/** Échappe une valeur pour le format CSV. */
function champCsv(valeur) {
  const v = valeur === null || valeur === undefined ? "" : String(valeur);
  /* Un point-virgule, un guillemet ou un retour à la ligne impose les
     guillemets ; les guillemets intérieurs se doublent. */
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Tableau des candidatures au format CSV, ouvrable directement dans Excel.
 *
 * Deux détails rendent le fichier lisible par Excel en français sans
 * manipulation : le point-virgule comme séparateur, et le BOM UTF-8 : sans
 * lui, « Contacté » s'affiche « ContactÃ© ».
 */
function versCsv(lignes, { libelleCohorte = () => "" } = {}) {
  const entete = COLONNES_EXPORT.map(([, titre]) => titre).join(";");
  const corps = lignes.map((l) =>
    COLONNES_EXPORT.map(([cle]) => {
      if (cle === "statut") return champCsv(STATUT_META[l.statut]?.label || l.statut);
      if (cle === "niveau") return champCsv(NIVEAU_LABEL[l.niveau] || l.niveau);
      if (cle === "formule") return champCsv(FORMULE_LABEL[l.formule] || l.formule);
      if (cle === "cohorte") return champCsv(libelleCohorte(l.cohorte_id));
      if (cle === "created_at") return champCsv(l.created_at ? String(l.created_at).slice(0, 10) : "");
      return champCsv(l[cle]);
    }).join(";")
  );
  return "﻿" + [entete, ...corps].join("\r\n") + "\r\n";
}

/** Nom du fichier d'export, daté. */
const nomFichierExport = (date = new Date()) =>
  `candidatures-citizen-data-analyst-${date.toISOString().slice(0, 10)}.csv`;

/* --- cohorte -------------------------------------------------------------- */

/** Tarifs d'une cohorte, ou les montants de repli si aucune n'est publiée. */
function tarifsDe(cohorte, repli) {
  return {
    integral: cohorte?.tarif_integral ?? repli.integral,
    echelonne: cohorte?.tarif_echelonne ?? repli.echelonne,
  };
}

/** Économie réalisée en payant intégralement. */
const economie = ({ integral, echelonne }) => Math.max(0, echelonne - integral);

/** Compte des candidatures par statut, dans l'ordre du tableau de suivi. */
function parStatut(lignes) {
  const compte = Object.fromEntries(STATUTS.map((s) => [s.cle, 0]));
  for (const l of lignes) if (l.statut in compte) compte[l.statut] += 1;
  return compte;
}

export {
  NIVEAUX,
  FORMULES,
  STATUTS,
  STATUT_META,
  NIVEAU_LABEL,
  FORMULE_LABEL,
  montant,
  normaliserWhatsapp,
  validerCandidature,
  normaliserCandidature,
  versCsv,
  nomFichierExport,
  COLONNES_EXPORT,
  tarifsDe,
  economie,
  parStatut,
};
