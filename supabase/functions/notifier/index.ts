/* Envoi d'une notification au titulaire.
 *
 * Partage des rôles entre les deux mailers
 * ----------------------------------------
 * Supabase envoie lui-même les e-mails d'authentification : invitation,
 * réinitialisation de mot de passe, confirmation d'adresse. Ils n'ont pas
 * besoin de cette fonction, et c'est heureux : ils transportent des liens
 * signés que seule la plateforme peut produire.
 *
 * Restent les messages métier : « une certification vous a été attribuée »,
 * « votre profil a été modifié ». Ceux-là ne sont pas des e-mails
 * d'authentification : le mailer de Supabase ne les enverra pas. Il faut un
 * fournisseur d'envoi. Cette fonction parle à Resend, parce qu'une clé d'API
 * et un domaine vérifié suffisent, sans serveur SMTP à tenir.
 *
 * Dégradation volontaire
 * ----------------------
 * Si `RESEND_API_KEY` n'est pas renseignée, la fonction N'ÉCHOUE PAS : elle
 * inscrit la notification en base avec le statut PENDING et le dit dans sa
 * réponse. L'attribution d'un certificat ne doit pas échouer parce qu'un
 * e-mail n'a pas pu partir : le certificat, lui, est bien délivré, et il est
 * déjà visible dans l'espace du titulaire. L'administrateur voit les
 * notifications en attente dans l'écran des notifications.
 *
 * Déploiement
 * -----------
 *   supabase functions deploy notifier
 *   supabase secrets set RESEND_API_KEY=re_...
 *   supabase secrets set NOTIFY_FROM="VIZDATA CERTIFY <certify@vizdata.ci>"
 *   supabase secrets set SITE_URL=https://certify.vizdata.ci
 *
 * Le domaine de l'expéditeur doit être vérifié chez Resend, sans quoi les
 * messages partent en indésirables, ou ne partent pas.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://certify.vizdata.ci";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const NOTIFY_FROM = Deno.env.get("NOTIFY_FROM") ?? "VIZDATA CERTIFY <certify@vizdata.ci>";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const echapper = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* --- gabarit ---------------------------------------------------------------
   Un seul gabarit, sobre, en tableaux : c'est ce qui survit aux clients de
   messagerie, qui ignorent flexbox et une partie du CSS. Les couleurs sont
   celles de la marque. Rien de décoratif qui ne serve à lire. */
function gabarit(titre: string, intro: string, corps: string, lien?: { url: string; libelle: string }): string {
  const bouton = lien
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;">
         <tr><td style="background:#12688F;border-radius:6px;">
           <a href="${echapper(lien.url)}" style="display:inline-block;padding:13px 24px;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;">${echapper(lien.libelle)}</a>
         </td></tr>
       </table>`
    : "";

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${echapper(titre)}</title></head>
<body style="margin:0;padding:0;background:#F6F7F9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F7F9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #E3E6EC;border-radius:10px;">
        <tr><td style="padding:26px 30px 0;">
          <div style="font-family:'Poppins',Helvetica,Arial,sans-serif;font-weight:600;font-size:16px;color:#4A2A63;">vizdata</div>
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:.19em;text-transform:uppercase;color:#667085;margin-top:3px;">certify</div>
        </td></tr>
        <tr><td style="padding:24px 30px 30px;font-family:Helvetica,Arial,sans-serif;color:#101A2B;">
          <h1 style="margin:0 0 14px;font-size:21px;font-weight:600;letter-spacing:-.02em;">${echapper(titre)}</h1>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#344054;">${intro}</p>
          ${corps}
          ${bouton}
          <p style="margin:22px 0 0;font-size:12.5px;line-height:1.6;color:#667085;border-top:1px solid #E3E6EC;padding-top:16px;">
            VIZDATA CERTIFY, registre officiel des certifications VIZDATA.<br>
            Vérifiez l'authenticité d'un certificat sur
            <a href="${SITE_URL}/verifier" style="color:#12688F;">certify.vizdata.ci/verifier</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

type Message = { sujet: string; html: string };

function composer(kind: string, p: Record<string, string>): Message | null {
  const prenom = echapper(p.first_name ?? "");

  if (kind === "CERTIFICAT_ATTRIBUE") {
    return {
      sujet: `Votre certification ${p.certification ?? ""} est disponible`,
      html: gabarit(
        "Une nouvelle certification vous est attribuée",
        `Bonjour ${prenom}, VIZDATA vient de vous délivrer une certification. Elle est disponible dès maintenant dans votre espace personnel, où vous pouvez la consulter, la télécharger en PDF et l'imprimer.`,
        `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #E3E6EC;border-radius:8px;margin-top:4px;">
           <tr><td style="padding:14px 16px;border-bottom:1px solid #E3E6EC;font-size:13px;color:#667085;">Certification</td>
               <td style="padding:14px 16px;border-bottom:1px solid #E3E6EC;font-size:14px;font-weight:600;text-align:right;">${echapper(p.certification ?? "")}</td></tr>
           <tr><td style="padding:14px 16px;border-bottom:1px solid #E3E6EC;font-size:13px;color:#667085;">Domaine</td>
               <td style="padding:14px 16px;border-bottom:1px solid #E3E6EC;font-size:14px;text-align:right;">${echapper(p.domain ?? "-")}</td></tr>
           <tr><td style="padding:14px 16px;font-size:13px;color:#667085;">Référence</td>
               <td style="padding:14px 16px;font-family:monospace;font-size:13px;font-weight:600;text-align:right;color:#12688F;">${echapper(p.reference ?? "")}</td></tr>
         </table>`,
        { url: `${SITE_URL}/espace`, libelle: "Ouvrir mon espace" }
      ),
    };
  }

  if (kind === "INVITATION") {
    return {
      sujet: "Votre accès à VIZDATA CERTIFY",
      html: gabarit(
        "Bienvenue sur VIZDATA CERTIFY",
        `Bonjour ${prenom}, un espace personnel vous a été ouvert sur le registre des certifications VIZDATA. Vous y retrouverez toutes vos certifications.`,
        `<p style="margin:0;font-size:14px;line-height:1.6;color:#344054;">Pour y accéder, définissez votre mot de passe depuis le lien reçu dans le message d'invitation. Si ce lien a expiré, utilisez « Mot de passe oublié » sur la page de connexion.</p>`,
        { url: `${SITE_URL}/connexion`, libelle: "Aller à la connexion" }
      ),
    };
  }

  if (kind === "PROFIL_MODIFIE") {
    return {
      sujet: "Vos informations ont été modifiées",
      html: gabarit(
        "Vos informations ont été modifiées",
        `Bonjour ${prenom}, les informations de votre compte VIZDATA CERTIFY viennent d'être modifiées par l'administration.`,
        `<p style="margin:0;font-size:14px;line-height:1.6;color:#344054;">${echapper(p.detail ?? "Si cette modification vous surprend, signalez-le à VIZDATA.")}</p>`,
        { url: `${SITE_URL}/espace`, libelle: "Vérifier mon profil" }
      ),
    };
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Authentification requise." }, 401);

  /* Seule l'administration déclenche une notification, et c'est vérifié sous
     RLS avec le jeton de l'appelant. Sans ce contrôle, l'adresse de la
     fonction suffirait à envoyer des messages au nom de VIZDATA. */
  const appelant = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: staff, error: errStaff } = await appelant.rpc("is_staff");
  if (errStaff) return json({ error: errStaff.message }, 403);
  if (staff !== true) return json({ error: "Action réservée à l'administration." }, 403);

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return json({ error: "Corps de requête illisible." }, 400);
  }

  const kind = String(corps.kind ?? "");
  const userId = corps.user_id ? String(corps.user_id) : null;
  const donnees = (corps.payload ?? {}) as Record<string, string>;

  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  /* Le destinataire est lu en base, jamais pris dans la requête : sinon
     l'adresse de la fonction permettrait d'envoyer un courrier au nom de
     VIZDATA à n'importe qui. */
  let destinataire = "";
  let prenom = donnees.first_name ?? "";
  if (userId) {
    const { data: u } = await service.from("users").select("email, first_name").eq("id", userId).maybeSingle();
    if (!u) return json({ error: "Titulaire inconnu." }, 404);
    destinataire = u.email;
    prenom = u.first_name ?? prenom;
  }
  if (!destinataire) return json({ error: "Aucun destinataire." }, 400);

  const message = composer(kind, { ...donnees, first_name: prenom });
  if (!message) return json({ error: `Type de notification inconnu : ${kind}` }, 400);

  const trace = {
    user_id: userId,
    recipient: destinataire,
    kind,
    subject: message.sujet,
    payload: donnees,
  };

  if (!RESEND_API_KEY) {
    await service.from("notifications").insert({
      ...trace,
      status: "PENDING",
      error: "Aucun fournisseur d'envoi configuré (RESEND_API_KEY absente).",
    });
    return json({
      envoye: false,
      raison: "Aucun fournisseur d'envoi configuré. La notification est enregistrée en attente.",
    });
  }

  const reponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: NOTIFY_FROM, to: [destinataire], subject: message.sujet, html: message.html }),
  });

  if (!reponse.ok) {
    const detail = await reponse.text();
    await service.from("notifications").insert({ ...trace, status: "FAILED", error: detail.slice(0, 500) });
    return json({ envoye: false, raison: `Le fournisseur a refusé l'envoi (${reponse.status}).` }, 502);
  }

  await service.from("notifications").insert({ ...trace, status: "SENT", sent_at: new Date().toISOString() });
  return json({ envoye: true });
});
