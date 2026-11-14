/* Accès distant au registre Supabase.
 *
 * Trois chemins, trois régimes de sécurité
 * ----------------------------------------
 * 1. CHEMIN PUBLIC — trois fonctions `security definer`, appelables sans
 *    session. Elles ne rendent que la projection publique : ni adresse e-mail,
 *    ni score, ni date d'expiration. Les tables restent fermées à la lecture
 *    anonyme, et c'est volontaire : ouvrir `certificates` exposerait tout le
 *    registre à qui sait écrire une requête REST.
 *
 * 2. CHEMIN AUTHENTIFIÉ — des requêtes sur les tables, sans aucun filtre sur
 *    l'identité. Ce sont les politiques RLS qui bornent : un titulaire ne voit
 *    que ses certificats, un gestionnaire ce que son autorisation permet.
 *    Filtrer en plus côté client donnerait l'illusion que la sécurité vient du
 *    navigateur.
 *
 * 3. CHEMIN PRIVILÉGIÉ — deux fonctions Edge. Créer un compte
 *    d'authentification et envoyer un courrier demandent la clé secrète, qui
 *    ne doit jamais approcher le navigateur. Elles vérifient elles-mêmes
 *    l'autorisation de l'appelant.
 */

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
  if (error?.code === "42501" || m.includes("row-level security")) {
    throw new Error("Cette action n'est pas autorisée pour votre compte.");
  }
  if (error?.code === "23505" || m.includes("duplicate key")) {
    throw new Error("Cette valeur existe déjà dans le registre.");
  }
  throw new Error(error?.message || "Le registre n'a pas répondu.");
}

const first = (rows) => (Array.isArray(rows) && rows.length ? rows[0] : null);

/* --- chemin public -------------------------------------------------------- */

/** Vérification par jeton public. La consultation est enregistrée côté base. */
async function verifyByToken(token, source = "qr") {
  requireRemote();
  const { data, error } = await supabase.rpc("verify_certificate", { p_token: token, p_source: source });
  if (error) fail(error);
  const row = first(data);
  /* Le jeton est reporté pour que le QR code puisse être reconstruit. */
  return row ? { ...row, public_token: row.public_token || token } : null;
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

/* --- espace du titulaire -------------------------------------------------- */

/** Colonnes du certificat, avec le programme, son domaine et les compétences.
 *  `expiry_date` et `score` restent demandés : l'administration en a besoin
 *  pour les certificats anciens. Ils ne sont simplement plus affichés au
 *  titulaire ni au public. */
const CERT_SELECT =
  "id, reference, public_token, issue_date, expiry_date, status, score, duration, " +
  "trainer, signatory, revoke_reason, created_at, " +
  "certificate_types(id, code, name, description, certification_domains(id, code, name)), " +
  "certificate_skills(skills(name))";

/** Normalise une ligne de la table vers la forme publique commune. */
function toCommonShape(row, holderName) {
  const programme = row.certificate_types || {};
  return {
    id: row.id,
    reference: row.reference,
    holder_name: holderName,
    certification: programme.name || "",
    domain: programme.certification_domains?.name || "",
    program_code: programme.code || "",
    issuer: "VIZDATA",
    issue_date: row.issue_date,
    expiry_date: row.expiry_date,
    score: row.score,
    status: row.status,
    revoke_reason: row.revoke_reason,
    public_token: row.public_token,
    description: programme.description || "",
    duration: row.duration,
    trainer: row.trainer,
    signatory: row.signatory,
    created_at: row.created_at,
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

/** Mise à jour du profil. `users_self_update` borne le titulaire à sa ligne, et
 *  le déclencheur `guard_user_privileges` lui interdit rôle, autorisations,
 *  statut et adresse e-mail — même par appel REST direct. */
async function updateProfile(userId, fields) {
  requireRemote();
  const { data, error } = await supabase.from("users").update(fields).eq("id", userId).select().maybeSingle();
  if (error) fail(error);
  return data;
}

/** Le compte n'est plus en attente de premier mot de passe. */
async function markPasswordChanged(userId) {
  requireRemote();
  const { error } = await supabase
    .from("users")
    .update({ must_change_password: false, activated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) fail(error);
}

/* --- référentiels : domaines, programmes, modèles ------------------------- */

async function fetchDomains() {
  requireRemote();
  const { data, error } = await supabase
    .from("certification_domains")
    .select("*")
    .order("sort_order")
    .order("name");
  if (error) fail(error);
  return data || [];
}

async function createDomain(fields) {
  requireRemote();
  const { data, error } = await supabase.from("certification_domains").insert(fields).select().maybeSingle();
  if (error) fail(error);
  return data;
}

async function updateDomain(id, fields) {
  requireRemote();
  const { data, error } = await supabase.from("certification_domains").update(fields).eq("id", id).select().maybeSingle();
  if (error) fail(error);
  return data;
}

/** Programmes — la table `certificate_types`, désormais rattachée à un domaine. */
async function fetchPrograms() {
  requireRemote();
  const { data, error } = await supabase
    .from("certificate_types")
    .select("*, certification_domains(id, code, name)")
    .order("sort_order")
    .order("name");
  if (error) fail(error);
  return data || [];
}

async function createProgram(fields) {
  requireRemote();
  const { data, error } = await supabase.from("certificate_types").insert(fields).select().maybeSingle();
  if (error) fail(error);
  return data;
}

async function updateProgram(id, fields) {
  requireRemote();
  const { data, error } = await supabase.from("certificate_types").update(fields).eq("id", id).select().maybeSingle();
  if (error) fail(error);
  return data;
}

async function fetchTemplates() {
  requireRemote();
  const { data, error } = await supabase.from("certificate_templates").select("*").order("name");
  if (error) fail(error);
  return data || [];
}

/* --- registre complet, pour l'administration ----------------------------- */

/** Registre tel que le voit le compte connecté. Les listes vides ne sont pas
 *  des erreurs : c'est ainsi que RLS répond à qui n'a pas le droit de lire. */
async function fetchRegistry() {
  requireRemote();

  const [users, types, domains, templates, skills, certificates, liens, verifications, shares, auditLogs, notifications] =
    await Promise.all([
      supabase.from("users").select("*").order("created_at", { ascending: false }),
      supabase.from("certificate_types").select("*, certification_domains(id, code, name)").order("sort_order").order("name"),
      supabase.from("certification_domains").select("*").order("sort_order").order("name"),
      supabase.from("certificate_templates").select("*").order("name"),
      supabase.from("skills").select("*").order("name"),
      supabase.from("certificates").select("*").order("created_at", { ascending: false }),
      supabase.from("certificate_skills").select("certificate_id, skill_id"),
      supabase.from("verifications").select("*").order("verified_at", { ascending: false }).limit(500),
      supabase.from("shares").select("*"),
      supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(200),
    ]);

  for (const r of [users, types, domains, templates, skills, certificates, liens, verifications, shares, auditLogs, notifications]) {
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
    domains: domains.data || [],
    templates: templates.data || [],
    skills: skills.data || [],
    certificates: (certificates.data || []).map((c) => ({ ...c, skills: parCertificat.get(c.id) || [] })),
    verifications: verifications.data || [],
    shares: shares.data || [],
    audit_logs: auditLogs.data || [],
    notifications: notifications.data || [],
  };
}

/* --- écritures de l'administration --------------------------------------- */

/** Journalise une action. `audit_admin_insert` exige que l'auteur déclaré soit
 *  le compte connecté : une action ne peut pas être inscrite au nom d'un autre. */
async function logAction(actorId, action, entityId, metadata, entityType = "certificate") {
  requireRemote();
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
  /* Le journal ne doit pas faire échouer l'acte qu'il journalise. On remonte
     l'échec sans interrompre : un certificat délivré reste délivré. */
  if (error) return { ok: false, message: error.message };
  return { ok: true };
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

/** Délivre un certificat à un titulaire déjà enregistré.
 *
 *  La référence et le jeton sont produits par les fonctions du projet plutôt
 *  que côté client : deux administrateurs qui délivrent au même instant ne
 *  doivent pas obtenir le même numéro. */
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

async function updateCertificate(id, fields, skillIds) {
  requireRemote();
  const { data, error } = await supabase.from("certificates").update(fields).eq("id", id).select().maybeSingle();
  if (error) fail(error);
  if (skillIds) await setCertificateSkills(id, skillIds);
  return data;
}

async function setCertificateStatus(id, status, revokeReason) {
  requireRemote();
  const { error } = await supabase
    .from("certificates")
    .update({ status, revoke_reason: revokeReason || "" })
    .eq("id", id);
  if (error) fail(error);
}

/* --- comptes -------------------------------------------------------------- */

/** Rôle et autorisations d'un compte. Le déclencheur côté base refuse ces
 *  écritures à tout autre qu'un administrateur. */
async function setAccountRole(userId, role, permissions) {
  requireRemote();
  const { data, error } = await supabase
    .from("users")
    .update({ role, permissions: permissions || {} })
    .eq("id", userId)
    .select()
    .maybeSingle();
  if (error) fail(error);
  return data;
}

/** Active ou désactive un compte. On ne supprime pas : effacer un titulaire
 *  effacerait la trace des certificats qu'il a obtenus. */
async function setAccountStatus(userId, status) {
  requireRemote();
  const { data, error } = await supabase
    .from("users")
    .update({ account_status: status })
    .eq("id", userId)
    .select()
    .maybeSingle();
  if (error) fail(error);
  return data;
}

/** Adresse e-mail d'un titulaire — administrateur seulement.
 *  Le profil est modifié ici ; l'identifiant de connexion lui-même relève de
 *  l'authentification et doit être changé depuis la console Supabase. */
async function setAccountEmail(userId, email) {
  requireRemote();
  const { data, error } = await supabase
    .from("users")
    .update({ email: email.trim().toLowerCase() })
    .eq("id", userId)
    .select()
    .maybeSingle();
  if (error) fail(error);
  return data;
}

/* --- chemin privilégié : fonctions Edge ---------------------------------- */

/** Appelle une fonction Edge avec le jeton de la session en cours. */
async function invoquer(nom, corps) {
  const { data, error } = await supabase.functions.invoke(nom, { body: corps });
  if (error) {
    /* `FunctionsHttpError` cache le message utile dans le corps de la réponse ;
       sans cette lecture, l'utilisateur ne verrait qu'« Edge Function returned
       a non-2xx status code », ce qui ne lui apprend rien. */
    let detail = "";
    try {
      const reponse = await error.context?.json();
      detail = reponse?.error || "";
    } catch { /* corps illisible ou vide */ }
    if (/failed to send|fetch/i.test(error.message) && !detail) {
      throw new Error(
        `La fonction « ${nom} » est injoignable. Elle n'est peut-être pas déployée : supabase functions deploy ${nom}`
      );
    }
    throw new Error(detail || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Crée un titulaire : compte d'authentification, profil et invitation.
 *  Renvoie { titulaire, existe, invitation_envoyee, avertissement }. */
async function inviteHolder(fields) {
  requireRemote();
  return invoquer("inviter-titulaire", fields);
}

/** Envoie une notification métier. L'échec n'interrompt rien : le certificat
 *  est délivré, et il est déjà visible dans l'espace du titulaire. */
async function notifier(kind, userId, payload) {
  requireRemote();
  try {
    return await invoquer("notifier", { kind, user_id: userId, payload: payload || {} });
  } catch (e) {
    return { envoye: false, raison: e.message };
  }
}

async function fetchNotifications() {
  requireRemote();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) fail(error);
  return data || [];
}

export {
  verifyByToken,
  verifyByReference,
  publicProfile,
  fetchProfile,
  fetchMyCertificates,
  updateProfile,
  markPasswordChanged,
  toCommonShape,
  fetchDomains,
  createDomain,
  updateDomain,
  fetchPrograms,
  createProgram,
  updateProgram,
  fetchTemplates,
  fetchRegistry,
  logAction,
  recordShare,
  createCertificate,
  updateCertificate,
  setCertificateStatus,
  setAccountRole,
  setAccountStatus,
  setAccountEmail,
  inviteHolder,
  notifier,
  fetchNotifications,
};
