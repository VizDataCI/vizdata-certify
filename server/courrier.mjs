/* Envoi des courriers du registre.
 *
 * Quatre messages, et un seul gabarit
 * -----------------------------------
 * Invitation, réinitialisation de mot de passe, certification attribuée,
 * modification du profil. Tous passent par le même gabarit en tableaux : c'est
 * ce qui survit aux clients de messagerie, qui ignorent flexbox et une bonne
 * part du CSS.
 *
 * Ce que fait cette fonction quand rien n'est configuré
 * ----------------------------------------------------
 * Elle N'ÉCHOUE PAS. Elle inscrit la notification en attente, et renvoie le
 * lien à l'appelant. Attribuer un certificat ne doit pas échouer parce qu'un
 * e-mail n'a pas pu partir : le certificat est délivré, il est déjà visible
 * dans l'espace du titulaire, et l'écran Notifications montre ce qui n'est pas
 * parti.
 *
 * En développement, le lien est imprimé dans la console du serveur — c'est le
 * seul moyen d'éprouver la chaîne d'invitation sans fournisseur d'envoi.
 *
 * Configuration (toutes facultatives)
 * -----------------------------------
 *   RESEND_API_KEY   clé du fournisseur d'envoi
 *   NOTIFY_FROM      « VIZDATA CERTIFY <certify@vizdata.ci> »
 *   VIZDATA_SITE_URL adresse publique, pour les liens des messages
 */

import { tracerNotification } from "./registre.mjs";

const SITE = () => (process.env.VIZDATA_SITE_URL || "http://localhost:5173").replace(/\/$/, "");
const CLE = () => process.env.RESEND_API_KEY || "";
const EXPEDITEUR = () => process.env.NOTIFY_FROM || "VIZDATA CERTIFY <certify@vizdata.ci>";

const echapper = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function gabarit(titre, intro, corps, lien) {
  const bouton = lien
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;">
         <tr><td style="background:#12688F;border-radius:6px;">
           <a href="${echapper(lien.url)}" style="display:inline-block;padding:13px 24px;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;">${echapper(lien.libelle)}</a>
         </td></tr></table>
       <p style="margin:0 0 6px;font-size:12px;color:#8a91a0;">Si le bouton ne fonctionne pas, copiez cette adresse :</p>
       <p style="margin:0;font-size:12px;color:#12688F;word-break:break-all;">${echapper(lien.url)}</p>`
    : "";

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${echapper(titre)}</title></head>
<body style="margin:0;padding:0;background:#F6F7F9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F7F9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #E3E6EC;border-radius:10px;">
        <tr><td style="padding:26px 30px 0;">
          <div style="font-family:Helvetica,Arial,sans-serif;font-weight:600;font-size:16px;color:#4A2A63;">vizdata</div>
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:.19em;text-transform:uppercase;color:#667085;margin-top:3px;">certify</div>
        </td></tr>
        <tr><td style="padding:24px 30px 30px;font-family:Helvetica,Arial,sans-serif;color:#101A2B;">
          <h1 style="margin:0 0 14px;font-size:21px;font-weight:600;">${echapper(titre)}</h1>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#344054;">${intro}</p>
          ${corps}${bouton}
          <p style="margin:22px 0 0;font-size:12.5px;line-height:1.6;color:#667085;border-top:1px solid #E3E6EC;padding-top:16px;">
            VIZDATA CERTIFY — registre officiel des certifications VIZDATA.<br>
            Vérifiez l'authenticité d'un certificat sur <a href="${SITE()}/verifier" style="color:#12688F;">certify.vizdata.ci/verifier</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const ligne = (libelle, valeur, mono = false) =>
  `<tr><td style="padding:14px 16px;border-bottom:1px solid #E3E6EC;font-size:13px;color:#667085;">${echapper(libelle)}</td>
       <td style="padding:14px 16px;border-bottom:1px solid #E3E6EC;font-size:14px;text-align:right;${mono ? "font-family:monospace;color:#12688F;" : ""}font-weight:600;">${echapper(valeur)}</td></tr>`;

/** Compose un message. Renvoie { sujet, html } ou null si le genre est inconnu. */
function composer(kind, p = {}) {
  const prenom = echapper(p.prenom || "");

  if (kind === "INVITATION") {
    return {
      sujet: "Votre accès à VIZDATA CERTIFY",
      html: gabarit(
        "Bienvenue sur VIZDATA CERTIFY",
        `Bonjour ${prenom}, un espace personnel vous a été ouvert sur le registre des certifications VIZDATA. Vous y retrouverez toutes vos certifications, à consulter, télécharger et imprimer.`,
        `<p style="margin:0;font-size:14px;line-height:1.6;color:#344054;">Choisissez votre mot de passe en suivant ce lien. Il est valable sept jours, et une seule fois.</p>`,
        { url: `${SITE()}/nouveau-mot-de-passe?jeton=${p.jeton}`, libelle: "Choisir mon mot de passe" }
      ),
    };
  }

  if (kind === "REINITIALISATION") {
    return {
      sujet: "Réinitialiser votre mot de passe",
      html: gabarit(
        "Réinitialiser votre mot de passe",
        `Bonjour ${prenom}, vous avez demandé à changer le mot de passe de votre compte VIZDATA CERTIFY.`,
        `<p style="margin:0;font-size:14px;line-height:1.6;color:#344054;">Ce lien est valable une heure, et une seule fois. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.</p>`,
        { url: `${SITE()}/nouveau-mot-de-passe?jeton=${p.jeton}`, libelle: "Choisir un nouveau mot de passe" }
      ),
    };
  }

  if (kind === "CERTIFICAT_ATTRIBUE") {
    return {
      sujet: `Votre certification ${p.certification ?? ""} est disponible`,
      html: gabarit(
        "Une nouvelle certification vous est attribuée",
        `Bonjour ${prenom}, VIZDATA vient de vous délivrer une certification. Elle est disponible dans votre espace personnel, où vous pouvez la consulter, la télécharger en PDF et l'imprimer.`,
        `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #E3E6EC;border-radius:8px;">
           ${ligne("Certification", p.certification ?? "")}
           ${ligne("Domaine", p.domaine || "—")}
           ${ligne("Référence", p.reference ?? "", true)}
         </table>`,
        { url: `${SITE()}/espace`, libelle: "Ouvrir mon espace" }
      ),
    };
  }

  if (kind === "PROFIL_MODIFIE") {
    return {
      sujet: "Vos informations ont été modifiées",
      html: gabarit(
        "Vos informations ont été modifiées",
        `Bonjour ${prenom}, les informations de votre compte VIZDATA CERTIFY viennent d'être modifiées par l'administration.`,
        `<p style="margin:0;font-size:14px;line-height:1.6;color:#344054;">${echapper(p.detail || "Si cette modification vous surprend, signalez-le à VIZDATA.")}</p>`,
        { url: `${SITE()}/espace`, libelle: "Vérifier mon profil" }
      ),
    };
  }

  return null;
}

/**
 * Envoie un message et en garde la trace.
 *
 * Ne lève jamais : l'appelant n'a pas à défaire une délivrance parce qu'un
 * courrier n'est pas parti. Le verdict est dans la valeur renvoyée et dans la
 * table `notifications`.
 */
async function envoyer(db, { kind, destinataire, utilisateurId = null, ...donnees }) {
  const message = composer(kind, donnees);
  if (!message) {
    return { envoye: false, raison: `Type de message inconnu : ${kind}` };
  }

  const trace = {
    user_id: utilisateurId,
    recipient: destinataire,
    kind,
    subject: message.sujet,
    payload: { prenom: donnees.prenom, reference: donnees.reference },
  };

  if (!CLE()) {
    tracerNotification(db, { ...trace, status: "PENDING", error: "Aucun fournisseur d'envoi configuré (RESEND_API_KEY absente)." });
    /* En développement, le lien doit rester atteignable : sans cela, on ne
       peut pas éprouver l'invitation ni la réinitialisation. */
    if (donnees.jeton) {
      console.log(`\n  [courrier non envoyé] ${kind} → ${destinataire}`);
      console.log(`  ${SITE()}/nouveau-mot-de-passe?jeton=${donnees.jeton}\n`);
    }
    return { envoye: false, raison: "Aucun fournisseur d'envoi configuré.", lien: donnees.jeton ? `${SITE()}/nouveau-mot-de-passe?jeton=${donnees.jeton}` : null };
  }

  try {
    const reponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${CLE()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EXPEDITEUR(), to: [destinataire], subject: message.sujet, html: message.html }),
    });

    if (!reponse.ok) {
      const detail = (await reponse.text()).slice(0, 500);
      tracerNotification(db, { ...trace, status: "FAILED", error: `HTTP ${reponse.status} — ${detail}` });
      return { envoye: false, raison: `Le fournisseur a refusé l'envoi (${reponse.status}).` };
    }

    tracerNotification(db, { ...trace, status: "SENT" });
    return { envoye: true };
  } catch (e) {
    tracerNotification(db, { ...trace, status: "FAILED", error: e.message });
    return { envoye: false, raison: `Fournisseur injoignable : ${e.message}` };
  }
}

export { envoyer, composer };
