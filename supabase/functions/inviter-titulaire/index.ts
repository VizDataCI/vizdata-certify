/* Création d'un titulaire : compte d'authentification et profil, en une fois.
 *
 * Pourquoi une fonction Edge
 * --------------------------
 * `public.users.id` référence `auth.users(id)`. Un titulaire ne peut donc pas
 * exister sans compte d'authentification, et créer un compte demande la clé
 * secrète du projet. Cette clé ne doit jamais se trouver dans le navigateur :
 * elle contourne toutes les politiques RLS. D'où cette fonction, qui tourne
 * côté serveur, détient la clé, et n'expose qu'un seul geste très borné :
 * « crée ce titulaire ».
 *
 * Ce que la fonction garantit
 * ---------------------------
 * - L'appelant est authentifié et porte l'autorisation `creer_titulaires`.
 *   La vérification se fait en interrogeant la base AVEC le jeton de
 *   l'appelant, donc sous RLS : la clé secrète ne sert qu'après.
 * - Aucun doublon. Si l'adresse existe déjà, le profil existant est renvoyé
 *   tel quel, avec `existe: true`. Le cahier des charges l'exige, et c'est
 *   aussi ce qui évite deux comptes pour une même personne lors d'une
 *   attribution.
 * - Aucun mot de passe en clair, jamais. Le titulaire reçoit un lien
 *   d'invitation signé et choisit son mot de passe lui-même. C'est pour cela
 *   que `inviteUserByEmail` est préféré à `createUser` : il crée le compte ET
 *   envoie le lien, sans qu'un secret transite par e-mail.
 *
 * Déploiement
 * -----------
 *   supabase functions deploy inviter-titulaire
 *
 * `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis par la plateforme ;
 * rien à configurer. `SITE_URL` indique où le titulaire atterrit après avoir
 * suivi le lien : il doit figurer dans les URL de redirection autorisées du
 * projet (Authentication → URL Configuration).
 *
 *   supabase secrets set SITE_URL=https://certify.vizdata.ci
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://certify.vizdata.ci";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/** Identifiant public lisible, dérivé du nom. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return json({ error: "Authentification requise." }, 401);
  }

  /* --- 1. L'appelant a-t-il le droit ? ------------------------------------
     Interrogé avec SON jeton, donc sous RLS. `has_perm` renvoie vrai pour un
     administrateur, et pour un gestionnaire à qui l'autorisation a été
     accordée. Décider ici, et non dans l'écran, est le seul moyen de rendre
     ce contrôle réel. */
  const appelant = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data: autorise, error: errPerm } = await appelant.rpc("has_perm", {
    p_perm: "creer_titulaires",
  });
  if (errPerm) return json({ error: errPerm.message }, 403);
  if (autorise !== true) {
    return json({ error: "Vous n'avez pas l'autorisation de créer un titulaire." }, 403);
  }

  const { data: auteur } = await appelant.auth.getUser();
  const auteurId = auteur?.user?.id ?? null;

  /* --- 2. Validation de l'entrée ----------------------------------------- */
  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return json({ error: "Corps de requête illisible." }, 400);
  }

  const email = String(corps.email ?? "").trim().toLowerCase();
  const first_name = String(corps.first_name ?? "").trim();
  const last_name = String(corps.last_name ?? "").trim();
  const phone = corps.phone ? String(corps.phone).trim() : null;
  const role = corps.role === "MANAGER" || corps.role === "ADMIN" ? String(corps.role) : "CERTIFIED";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "L'adresse e-mail n'est pas valide." }, 400);
  }
  if (!first_name || !last_name) {
    return json({ error: "Le prénom et le nom sont obligatoires." }, 400);
  }
  /* Créer un administrateur ou un gestionnaire n'est pas la même chose que
     créer un titulaire : seul un administrateur peut le faire. */
  if (role !== "CERTIFIED") {
    const { data: estAdmin } = await appelant.rpc("is_admin");
    if (estAdmin !== true) {
      return json({ error: "Seul un administrateur peut créer un compte d'administration." }, 403);
    }
  }

  /* --- 3. À partir d'ici, la clé secrète -------------------------------- */
  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  /* Doublon : on ne crée pas un second compte pour une adresse connue. Le
     profil existant est renvoyé, et l'attribution peut s'y rattacher. */
  const { data: deja } = await service
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (deja) {
    return json({ titulaire: deja, existe: true, invitation_envoyee: false });
  }

  /* Identifiant public unique : on suffixe tant que le slug est pris. */
  let username = slugify(`${first_name} ${last_name}`) || slugify(email.split("@")[0]);
  for (let essai = 2; essai < 100; essai++) {
    const { data: pris } = await service.from("users").select("id").eq("username", username).maybeSingle();
    if (!pris) break;
    username = `${slugify(`${first_name} ${last_name}`)}-${essai}`;
  }

  /* L'invitation crée le compte ET envoie le lien. Aucun mot de passe n'est
     généré, donc aucun secret ne part par e-mail : le titulaire choisit le
     sien en suivant le lien. */
  const { data: invite, error: errInvite } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${SITE_URL}/nouveau-mot-de-passe`,
    data: { first_name, last_name },
  });

  let compteId = invite?.user?.id ?? null;
  let invitationEnvoyee = !errInvite;
  let avertissement: string | null = null;

  if (errInvite) {
    /* L'envoi peut échouer pour une raison étrangère au compte : quota SMTP,
       mailer non configuré. Dans ce cas on crée quand même le compte, pour que
       l'attribution ne soit pas bloquée, et on le signale. Le titulaire pourra
       passer par « mot de passe oublié ». */
    const { data: cree, error: errCreate } = await service.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: { first_name, last_name },
    });
    if (errCreate) {
      const m = errCreate.message.toLowerCase();
      if (m.includes("already been registered") || m.includes("already exists")) {
        return json({ error: "Un compte existe déjà pour cette adresse, sans profil rattaché. Contactez l'administrateur." }, 409);
      }
      return json({ error: `Création du compte impossible : ${errCreate.message}` }, 500);
    }
    compteId = cree.user.id;
    avertissement = `Le compte est créé mais l'e-mail d'invitation n'a pas pu être envoyé (${errInvite.message}). Le titulaire peut utiliser « mot de passe oublié ».`;
  }

  if (!compteId) {
    return json({ error: "Le compte d'authentification n'a pas été créé." }, 500);
  }

  /* --- 4. Le profil applicatif ------------------------------------------ */
  const { data: titulaire, error: errProfil } = await service
    .from("users")
    .insert({
      id: compteId,
      email,
      first_name,
      last_name,
      phone,
      username,
      role,
      public_profile: false,
      account_status: "ACTIVE",
      must_change_password: true,
      permissions: {},
      invited_at: new Date().toISOString(),
      created_by: auteurId,
    })
    .select()
    .single();

  if (errProfil) {
    /* Le compte sans profil serait une session orpheline : l'application la
       refuse à la connexion. On défait plutôt que de laisser l'incohérence. */
    await service.auth.admin.deleteUser(compteId);
    return json({ error: `Profil non enregistré, création annulée : ${errProfil.message}` }, 500);
  }

  await service.from("notifications").insert({
    user_id: compteId,
    recipient: email,
    kind: "INVITATION",
    subject: "Votre accès à VIZDATA CERTIFY",
    status: invitationEnvoyee ? "SENT" : "FAILED",
    error: avertissement,
    sent_at: invitationEnvoyee ? new Date().toISOString() : null,
    payload: { first_name, last_name },
  });

  return json({
    titulaire,
    existe: false,
    invitation_envoyee: invitationEnvoyee,
    avertissement,
  });
});
