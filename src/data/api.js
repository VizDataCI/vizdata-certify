/* Accès au registre VIZDATA.
 *
 * Une fonction par geste, et rien d'autre : la décision (qui a le droit de
 * quoi, que faut-il journaliser, quel courrier part) appartient au serveur.
 * Ce module n'est qu'un carnet d'adresses.
 *
 * Ce qui a disparu en quittant Supabase, et pourquoi c'est un progrès
 * -------------------------------------------------------------------
 * - LA JOURNALISATION. L'application appelait `logAction` après chaque
 *   écriture. Elle pouvait donc l'oublier, et une écriture non journalisée ne
 *   se voit pas. Le serveur journalise lui-même, dans la transaction qui écrit.
 * - L'ENVOI DES COURRIERS. Le navigateur demandait une invitation, puis un
 *   avis, en deux appels séparés d'une création. Le serveur les envoie dans la
 *   foulée de l'acte qui les justifie.
 * - LES CLÉS. Le paquet livré au navigateur ne contient plus aucun secret.
 *
 * Les deux fonctions devenues inutiles sont conservées, sans effet, pour ne
 * pas réécrire les écrans qui les appellent encore. Elles le disent.
 */

import { lire, poster, modifier, registreDistant } from "../lib/registre.js";

function exigerRegistre() {
  if (!registreDistant) throw new Error("Le registre distant n'est pas configuré.");
}

/* --- chemin public -------------------------------------------------------- */

/** Vérification par jeton public. La consultation est enregistrée par le serveur. */
async function verifyByToken(jeton, source = "qr") {
  exigerRegistre();
  try {
    return await lire(`/verifier/${encodeURIComponent(jeton)}?source=${encodeURIComponent(source)}`);
  } catch (e) {
    /* Jeton inconnu : l'écran attend `null`, qui déclenche « certificat
       introuvable ». Tout autre refus reste une erreur. */
    if (e.statut === 404) return null;
    throw e;
  }
}

/** Vérification par référence saisie. */
async function verifyByReference(reference) {
  exigerRegistre();
  try {
    return await lire(`/verifier?reference=${encodeURIComponent(String(reference).trim())}`);
  } catch (e) {
    if (e.statut === 404) return null;
    throw e;
  }
}

/** Certifications en vigueur d'un titulaire au profil public. */
async function publicProfile(identifiant) {
  exigerRegistre();
  const lignes = await lire(`/profil/${encodeURIComponent(identifiant)}`);
  return Array.isArray(lignes) ? lignes : [];
}

/** Comptabilise un partage. Sans effet si le jeton est inconnu. */
async function recordShare(jeton, plateforme) {
  exigerRegistre();
  await poster("/partage", { jeton, plateforme });
}

/* --- espace du titulaire -------------------------------------------------- */

/** Profil de la session en cours. */
async function fetchProfile() {
  exigerRegistre();
  return lire("/session");
}

/** Certificats du compte connecté. Le serveur ne rend que les siens. */
async function fetchMyCertificates() {
  exigerRegistre();
  const lignes = await lire("/mes-certificats");
  return Array.isArray(lignes) ? lignes : [];
}

/** Mise à jour du profil. Le serveur refuse les champs privilégiés. */
async function updateProfile(_userId, champs) {
  exigerRegistre();
  return modifier("/moi", champs);
}

/** Sans objet : le serveur lève l'obligation en écrivant le mot de passe.
 *  Conservée pour ne pas réécrire les écrans qui l'appellent. */
async function markPasswordChanged() {
  /* rien à faire */
}

/* --- registre d'administration -------------------------------------------- */

/** Tout ce dont les écrans d'administration ont besoin, en un appel. */
async function fetchRegistry() {
  exigerRegistre();
  return lire("/registre");
}

const fetchDomains = async () => (await fetchRegistry()).domains;
const fetchPrograms = async () => (await fetchRegistry()).types;
const fetchTemplates = async () => (await fetchRegistry()).templates;
const fetchNotifications = async () => (await fetchRegistry()).notifications;

/* --- écritures : catalogue ------------------------------------------------ */

async function createDomain(champs) {
  exigerRegistre();
  return poster("/domaines", champs);
}

async function updateDomain(id, champs) {
  exigerRegistre();
  return modifier(`/domaines/${encodeURIComponent(id)}`, champs);
}

async function createProgram(champs) {
  exigerRegistre();
  return poster("/programmes", champs);
}

async function updateProgram(id, champs) {
  exigerRegistre();
  return modifier(`/programmes/${encodeURIComponent(id)}`, champs);
}

/* Le référentiel des compétences : ce qu'un certificat peut attester. Rien ne
   s'y ajoute tout seul, et rien ne s'en retire : une compétence effacée
   disparaîtrait des certificats déjà délivrés. */
/** Retire le second facteur d'un compte. Réservé aux administrateurs. */
async function retirerDoubleFacteur(id) {
  exigerRegistre();
  return poster(`/comptes/${encodeURIComponent(id)}/double-facteur`, {});
}

async function createSkill(champs) {
  exigerRegistre();
  return poster("/competences", champs);
}

async function updateSkill(id, champs) {
  exigerRegistre();
  return modifier(`/competences/${encodeURIComponent(id)}`, champs);
}

/* --- écritures : certificats ---------------------------------------------- */

/**
 * Délivre un certificat.
 *
 * La référence et le jeton public sont produits par le serveur, dans la
 * transaction d'insertion : deux attributions simultanées ne peuvent pas
 * produire la même référence.
 */
async function createCertificate(champs, skillIds, { notifier = true } = {}) {
  exigerRegistre();
  const { certificat } = await poster("/certificats", { ...champs, skills: skillIds || [], notifier });
  return certificat;
}

async function updateCertificate(id, champs, skillIds) {
  exigerRegistre();
  return modifier(`/certificats/${encodeURIComponent(id)}`, { ...champs, skills: skillIds });
}

async function setCertificateStatus(id, statut, motif) {
  exigerRegistre();
  return poster(`/certificats/${encodeURIComponent(id)}/statut`, { statut, motif });
}

/* --- écritures : comptes -------------------------------------------------- */

/** Crée un titulaire, ou retrouve celui qui porte déjà cette adresse.
 *  Renvoie { titulaire, existe, invitation_envoyee, lien, avertissement }. */
async function inviteHolder(champs) {
  exigerRegistre();
  return poster("/titulaires", champs);
}

async function setAccountRole(id, role, permissions) {
  exigerRegistre();
  return modifier(`/comptes/${encodeURIComponent(id)}`, { role, permissions: permissions || {} });
}

async function setAccountStatus(id, statut) {
  exigerRegistre();
  return modifier(`/comptes/${encodeURIComponent(id)}`, { account_status: statut });
}

async function setAccountEmail(id, email) {
  exigerRegistre();
  return modifier(`/comptes/${encodeURIComponent(id)}`, { email: String(email).trim().toLowerCase() });
}

async function updateAccount(id, champs) {
  exigerRegistre();
  return modifier(`/comptes/${encodeURIComponent(id)}`, champs);
}

/** Renvoie une invitation à un compte qui n'a pas encore de mot de passe. */
async function resendInvitation(id) {
  exigerRegistre();
  return poster(`/comptes/${encodeURIComponent(id)}/invitation`);
}

/* --- devenues sans objet -------------------------------------------------- */

/** Le serveur journalise lui-même, dans la transaction qui écrit : une
 *  écriture ne peut plus être oubliée du journal. */
async function logAction() {
  return { ok: true, sansObjet: true };
}

/** Le serveur envoie les courriers dans la foulée de l'acte qui les justifie. */
async function notifier() {
  return { envoye: true, sansObjet: true };
}

export {
  verifyByToken,
  verifyByReference,
  publicProfile,
  recordShare,
  fetchProfile,
  fetchMyCertificates,
  updateProfile,
  markPasswordChanged,
  fetchRegistry,
  fetchDomains,
  fetchPrograms,
  fetchTemplates,
  fetchNotifications,
  createDomain,
  updateDomain,
  createProgram,
  updateProgram,
  createSkill,
  updateSkill,
  retirerDoubleFacteur,
  createCertificate,
  updateCertificate,
  setCertificateStatus,
  inviteHolder,
  setAccountRole,
  setAccountStatus,
  setAccountEmail,
  updateAccount,
  resendInvitation,
  logAction,
  notifier,
};
