/* Accès distant — les trois fonctions publiques du projet Supabase.

   Elles sont déclarées `security definer` : elles répondent sans session et ne
   rendent que la projection publique du certificat. L'adresse e-mail du
   titulaire ne sort jamais, et les tables restent fermées à la lecture anonyme.

   Ce que ces fonctions renvoient :
     reference, holder_name, certification, issuer,
     issue_date, expiry_date, score, status, revoke_reason

   Ni les compétences, ni la durée, ni le formateur ou le signataire. Le
   certificat imprimable ne peut donc pas être reconstitué depuis le chemin
   public tant que les fonctions ne sont pas étendues — voir docs/schema.md. */

import { supabase, isAuthConfigured } from "../lib/supabase.js";

function requireRemote() {
  if (!isAuthConfigured) throw new Error("Le registre distant n'est pas configuré.");
}

/** Erreurs réseau ou base traduites pour l'utilisateur. */
function fail(error) {
  const m = (error?.message || "").toLowerCase();
  if (m.includes("failed to fetch") || m.includes("network")) {
    throw new Error("Registre injoignable. Vérifiez votre connexion.");
  }
  throw new Error(error?.message || "Le registre n'a pas répondu.");
}

const first = (rows) => (Array.isArray(rows) && rows.length ? rows[0] : null);

/** Vérification par jeton public. La consultation est enregistrée côté base. */
async function verifyByToken(token, source = "qr") {
  requireRemote();
  const { data, error } = await supabase.rpc("verify_certificate", { p_token: token, p_source: source });
  if (error) fail(error);
  const row = first(data);
  /* Le jeton n'est pas renvoyé par la fonction ; on le reporte pour le QR code. */
  return row ? { ...row, public_token: token } : null;
}

/** Vérification par référence saisie. */
async function verifyByReference(reference) {
  requireRemote();
  const { data, error } = await supabase.rpc("verify_by_reference", { p_reference: reference.trim() });
  if (error) fail(error);
  return first(data);
}

/** Certifications en vigueur d'un titulaire au profil public. */
async function publicProfile(username) {
  requireRemote();
  const { data, error } = await supabase.rpc("public_profile", { p_username: username });
  if (error) fail(error);
  return Array.isArray(data) ? data : [];
}

/* --- espace certifié ------------------------------------------------------
   Aucun filtre sur le titulaire n'est écrit ici : les politiques s'en chargent.
   certificates_owner_select vaut « user_id = auth.uid() OR is_admin() », donc
   une requête sans clause where ne rend que les certificats du titulaire
   connecté — et tous si c'est un administrateur. Filtrer côté client en plus
   donnerait l'illusion que la sécurité vient du navigateur. */

/** Colonnes du certificat, avec le type et les compétences liés. */
const CERT_SELECT =
  "id, reference, public_token, issue_date, expiry_date, status, score, duration, " +
  "trainer, signatory, revoke_reason, certificate_types(name, description), " +
  "certificate_skills(skills(name))";

/** Normalise une ligne de la table vers la forme publique commune. */
function toCommonShape(row, holderName) {
  return {
    id: row.id,
    reference: row.reference,
    holder_name: holderName,
    certification: row.certificate_types?.name || "",
    issuer: "VIZDATA",
    issue_date: row.issue_date,
    expiry_date: row.expiry_date,
    score: row.score,
    status: row.status,
    revoke_reason: row.revoke_reason,
    public_token: row.public_token,
    description: row.certificate_types?.description || "",
    duration: row.duration,
    trainer: row.trainer,
    signatory: row.signatory,
    skills: (row.certificate_skills || []).map((cs) => cs.skills?.name).filter(Boolean),
  };
}

/** Profil du compte connecté — lisible grâce à users_self_select. */
async function fetchProfile(userId) {
  requireRemote();
  const { data, error } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
  if (error) fail(error);
  return data;
}

/** Certificats visibles par le compte connecté. */
async function fetchMyCertificates(holderName) {
  requireRemote();
  const { data, error } = await supabase
    .from("certificates")
    .select(CERT_SELECT)
    .order("issue_date", { ascending: false });
  if (error) fail(error);
  return (data || []).map((row) => toCommonShape(row, holderName));
}

/** Mise à jour du profil — users_self_update borne le titulaire à sa propre ligne. */
async function updateProfile(userId, fields) {
  requireRemote();
  const { data, error } = await supabase
    .from("users")
    .update(fields)
    .eq("id", userId)
    .select()
    .maybeSingle();
  if (error) fail(error);
  return data;
}

/* --- espace administrateur ------------------------------------------------
   Le registre distant est reconstitué dans la forme de l'objet local, pour que
   les écrans d'administration n'aient pas à connaître leur source. Les
   identifiants restent des uuid, ce que le code traite indifféremment.

   Aucune de ces requêtes ne filtre sur le rôle : toutes les tables concernées
   sont fermées par « is_admin() ». Un compte non administrateur reçoit des
   listes vides plutôt qu'une erreur — c'est le fonctionnement normal de RLS. */

/** Registre complet, tel que le voit le compte connecté. */
async function fetchRegistry() {
  requireRemote();

  const [users, types, skills, certificates, liens, verifications, shares, auditLogs] = await Promise.all([
    supabase.from("users").select("*"),
    supabase.from("certificate_types").select("*").order("code"),
    supabase.from("skills").select("*").order("name"),
    supabase.from("certificates").select("*").order("created_at", { ascending: false }),
    supabase.from("certificate_skills").select("certificate_id, skill_id"),
    supabase.from("verifications").select("*").order("verified_at", { ascending: false }).limit(500),
    supabase.from("shares").select("*"),
    supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200),
  ]);

  for (const r of [users, types, skills, certificates, liens, verifications, shares, auditLogs]) {
    if (r.error) fail(r.error);
  }

  /* Les compétences sont rapatriées à plat puis regroupées par certificat,
     comme le registre local les stocke. */
  const parCertificat = new Map();
  for (const l of liens.data || []) {
    if (!parCertificat.has(l.certificate_id)) parCertificat.set(l.certificate_id, []);
    parCertificat.get(l.certificate_id).push(l.skill_id);
  }

  return {
    users: users.data || [],
    types: types.data || [],
    skills: skills.data || [],
    certificates: (certificates.data || []).map((c) => ({ ...c, skills: parCertificat.get(c.id) || [] })),
    verifications: verifications.data || [],
    shares: shares.data || [],
    audit_logs: auditLogs.data || [],
  };
}

/* --- écritures de l'administration ----------------------------------------
   Toutes ces tables sont fermées par « is_admin() ». Un compte non
   administrateur reçoit une erreur 42501 de Postgres, que fail() remonte telle
   quelle : l'autorisation n'est jamais vérifiée dans le navigateur.

   La référence et le jeton sont produits par les fonctions du projet plutôt que
   côté client, pour que la numérotation reste cohérente même si deux
   administrateurs créent un certificat en même temps. */

/** Journalise une action. Réservé aux administrateurs par audit_admin_insert. */
async function logAction(actorId, action, entityId, metadata) {
  requireRemote();
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action,
    entity_type: "certificate",
    entity_id: entityId,
    metadata,
  });
  if (error) fail(error);
}

/** Enregistre un partage à partir du jeton public, sans ouvrir la table. */
async function recordShare(token, platform) {
  requireRemote();
  const { error } = await supabase.rpc("record_share", { p_token: token, p_platform: platform });
  if (error) fail(error);
}

/** Remplace les compétences liées à un certificat. */
async function setCertificateSkills(certificateId, skillIds) {
  const { error: effacement } = await supabase.from("certificate_skills").delete().eq("certificate_id", certificateId);
  if (effacement) fail(effacement);
  if (!skillIds?.length) return;
  const { error } = await supabase
    .from("certificate_skills")
    .insert(skillIds.map((skill_id) => ({ certificate_id: certificateId, skill_id })));
  if (error) fail(error);
}

/** Crée un certificat pour un titulaire déjà enregistré. */
async function createCertificate({ code, ...fields }, skillIds) {
  requireRemote();
  const annee = new Date(fields.issue_date).getFullYear();

  const [ref, jeton] = await Promise.all([
    supabase.rpc("next_reference", { p_code: code, p_year: annee }),
    supabase.rpc("new_public_token"),
  ]);
  if (ref.error) fail(ref.error);
  if (jeton.error) fail(jeton.error);

  const { data, error } = await supabase
    .from("certificates")
    .insert({ ...fields, reference: ref.data, public_token: jeton.data, status: "ACTIVE" })
    .select()
    .maybeSingle();
  if (error) fail(error);

  await setCertificateSkills(data.id, skillIds);
  return data;
}

/** Met à jour un certificat existant. */
async function updateCertificate(id, fields, skillIds) {
  requireRemote();
  const { data, error } = await supabase.from("certificates").update(fields).eq("id", id).select().maybeSingle();
  if (error) fail(error);
  if (skillIds) await setCertificateSkills(id, skillIds);
  return data;
}

/** Révoque ou annule un certificat. */
async function setCertificateStatus(id, status, revokeReason) {
  requireRemote();
  const { error } = await supabase
    .from("certificates")
    .update({ status, revoke_reason: revokeReason || "" })
    .eq("id", id);
  if (error) fail(error);
}

/** Ajoute un type de certification. */
async function createType(fields) {
  requireRemote();
  const { data, error } = await supabase.from("certificate_types").insert(fields).select().maybeSingle();
  if (error) fail(error);
  return data;
}

export {
  verifyByToken,
  verifyByReference,
  publicProfile,
  fetchProfile,
  fetchMyCertificates,
  updateProfile,
  toCommonShape,
  fetchRegistry,
  logAction,
  recordShare,
  createCertificate,
  updateCertificate,
  setCertificateStatus,
  createType,
};
