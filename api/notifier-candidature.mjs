/* Notification d'une candidature : alerte à VIZDATA, accusé au candidat.
 *
 * Fonction serveur (Vercel). Elle existe pour une raison précise : un envoi
 * d'e-mail demande une clé d'API, et une clé d'API ne peut pas vivre dans un
 * paquet navigateur — elle serait lisible par n'importe qui.
 *
 * Point de conception important : cette fonction ne fait pas confiance au
 * corps de la requête. Elle n'en retient que la référence, puis relit la
 * candidature dans la base avec la clé de service. Sans cela, l'adresse du
 * destinataire et le contenu du message viendraient du client : n'importe qui
 * pourrait faire envoyer, depuis le domaine de VIZDATA, un message de son
 * choix à l'adresse de son choix. Le relais ouvert est l'erreur classique de
 * ce genre d'« endpoint de notification ».
 *
 * Variables d'environnement attendues, côté serveur uniquement — aucune ne
 * porte le préfixe VITE_, donc aucune n'entre dans le paquet navigateur :
 *
 *   SUPABASE_URL                  https://<projet>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY     clé de service (lecture des candidatures)
 *   RESEND_API_KEY                clé de l'API d'envoi
 *   ACADEMIE_EXPEDITEUR           « VIZDATA <contact@vizdata.ci> » par défaut
 *   ACADEMIE_NOTIFICATION         contact@vizdata.ci par défaut
 *
 * Tant que les clés ne sont pas renseignées, la fonction répond 200 avec
 * « envoye: false » et le motif. Ce n'est pas une panne : la candidature est
 * déjà enregistrée, et la page le dit au candidat. Faire échouer la
 * candidature parce qu'un e-mail ne part pas serait absurde.
 */

const EXPEDITEUR_DEFAUT = "VIZDATA <contact@vizdata.ci>";
const NOTIFICATION_DEFAUT = "contact@vizdata.ci";

const NIVEAUX = { DEBUTANT: "Débutant", INTERMEDIAIRE: "Intermédiaire", AVANCE: "Avancé" };
const FORMULES = { INTEGRAL: "Paiement intégral", ECHELONNE: "Paiement en deux fois" };

/** Échappe le texte inséré dans un corps HTML. */
const h = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Référence au format attendu : CDA-2026-0001. Rien d'autre n'est accepté. */
const REFERENCE = /^CDA-\d{4}-\d{4,6}$/;

/** Lit la candidature dans la base. La clé de service contourne RLS : c'est
    la seule chose qui en est attendue ici, et elle ne quitte pas le serveur. */
async function lireCandidature(reference, { url, cle }) {
  const requete = new URL(`${url}/rest/v1/candidatures`);
  requete.searchParams.set("reference", `eq.${reference}`);
  requete.searchParams.set(
    "select",
    "reference,nom,email,whatsapp,profession,entreprise,niveau,formule,motivation,created_at,cohortes(libelle,date_debut)"
  );

  const reponse = await fetch(requete, {
    headers: { apikey: cle, Authorization: `Bearer ${cle}`, Accept: "application/json" },
  });
  if (!reponse.ok) throw new Error(`lecture candidature : ${reponse.status}`);
  const lignes = await reponse.json();
  return Array.isArray(lignes) && lignes.length ? lignes[0] : null;
}

/** Envoie un message. Renvoie l'erreur du service telle quelle, sans la clé. */
async function envoyer({ cle, from, to, subject, html, replyTo }) {
  const reponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!reponse.ok) {
    const detail = await reponse.text().catch(() => "");
    throw new Error(`envoi refusé (${reponse.status}) ${detail.slice(0, 300)}`);
  }
}

/* --- corps des messages --------------------------------------------------- */

const STYLE_CORPS =
  "font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#101A2B;line-height:1.6;font-size:15px";

function messageEquipe(c) {
  const ligne = (etiquette, valeur) =>
    valeur ? `<tr><td style="padding:5px 14px 5px 0;color:#5A6475">${h(etiquette)}</td><td style="padding:5px 0;font-weight:600">${h(valeur)}</td></tr>` : "";

  return `<div style="${STYLE_CORPS}">
  <p style="font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#1578A6;font-weight:600">Nouvelle candidature</p>
  <h2 style="margin:6px 0 4px;font-size:21px">${h(c.nom)}</h2>
  <p style="margin:0 0 18px;color:#5A6475">Référence ${h(c.reference)}${c.cohortes?.libelle ? ` · ${h(c.cohortes.libelle)}` : ""}</p>
  <table style="border-collapse:collapse;font-size:14px">
    ${ligne("WhatsApp", c.whatsapp)}
    ${ligne("E-mail", c.email)}
    ${ligne("Profession", c.profession)}
    ${ligne("Entreprise", c.entreprise)}
    ${ligne("Niveau Excel", NIVEAUX[c.niveau] || c.niveau)}
    ${ligne("Formule", FORMULES[c.formule] || c.formule)}
  </table>
  ${c.motivation ? `<p style="margin:18px 0 6px;color:#5A6475;font-size:13px">Motivation</p><p style="margin:0;padding:12px 14px;background:#F7F8FA;border-radius:8px;white-space:pre-wrap">${h(c.motivation)}</p>` : ""}
  <p style="margin:22px 0 0"><a href="https://certify.vizdata.ci/administration" style="color:#1578A6">Ouvrir le suivi des candidatures</a></p>
</div>`;
}

function messageCandidat(c) {
  const prenom = String(c.nom || "").trim().split(/\s+/)[0] || "";
  return `<div style="${STYLE_CORPS}">
  <p>Bonjour ${h(prenom)},</p>
  <p>Nous avons bien reçu votre candidature à la formation <strong>CITIZEN DATA ANALYST</strong>
  — Excel et Power BI, 8 jours en présentiel à Abidjan.</p>
  <p style="margin:18px 0;padding:14px 16px;background:#E8F3F8;border-radius:8px">
    Référence de votre dossier : <strong style="letter-spacing:.05em">${h(c.reference)}</strong><br>
    Formule choisie : ${h(FORMULES[c.formule] || c.formule)}
  </p>
  <p><strong>La suite :</strong> notre équipe examine votre candidature et vous contacte sur
  WhatsApp pour valider votre profil, répondre à vos questions et vous communiquer les
  modalités de paiement${c.cohortes?.libelle ? ` de la ${h(c.cohortes.libelle.toLowerCase())}` : ""}.
  Aucun paiement n'est à effectuer avant cet échange.</p>
  <p>À bientôt,<br><strong>L'équipe VIZDATA</strong><br>
  <a href="https://vizdata.ci/" style="color:#1578A6">vizdata.ci</a> · WhatsApp +225 05 04 38 35 32</p>
</div>`;
}

/* --- traitement ----------------------------------------------------------- */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ envoye: false, raison: "méthode non autorisée" });
  }

  const corps = typeof req.body === "string" ? safeJson(req.body) : req.body || {};
  const reference = String(corps.reference || "").trim();

  if (!REFERENCE.test(reference)) {
    return res.status(400).json({ envoye: false, raison: "référence absente ou mal formée" });
  }

  const url = process.env.SUPABASE_URL;
  const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cleEnvoi = process.env.RESEND_API_KEY;

  const manquantes = [
    !url && "SUPABASE_URL",
    !cleService && "SUPABASE_SERVICE_ROLE_KEY",
    !cleEnvoi && "RESEND_API_KEY",
  ].filter(Boolean);

  if (manquantes.length) {
    /* 200 volontairement : la candidature est enregistrée, seul l'e-mail
       manque. Le motif est lisible dans les journaux de la fonction. */
    console.warn("notification impossible, variables manquantes :", manquantes.join(", "));
    return res.status(200).json({ envoye: false, raison: `configuration incomplète (${manquantes.join(", ")})` });
  }

  try {
    const candidature = await lireCandidature(reference, { url, cle: cleService });
    if (!candidature) {
      return res.status(404).json({ envoye: false, raison: "candidature introuvable" });
    }

    const from = process.env.ACADEMIE_EXPEDITEUR || EXPEDITEUR_DEFAUT;
    const equipe = process.env.ACADEMIE_NOTIFICATION || NOTIFICATION_DEFAUT;

    /* L'alerte à l'équipe part la première : c'est elle qui déclenche le
       rappel du candidat, donc celle dont la perte coûte le plus. */
    await envoyer({
      cle: cleEnvoi,
      from,
      to: equipe,
      replyTo: candidature.email,
      subject: `Candidature ${candidature.reference} — ${candidature.nom}`,
      html: messageEquipe(candidature),
    });

    let accuse = true;
    let motif;
    try {
      await envoyer({
        cle: cleEnvoi,
        from,
        to: candidature.email,
        replyTo: equipe,
        subject: `Votre candidature CITIZEN DATA ANALYST — ${candidature.reference}`,
        html: messageCandidat(candidature),
      });
    } catch (e) {
      accuse = false;
      motif = e.message;
      console.warn("accusé de réception non envoyé :", e.message);
    }

    return res.status(200).json({ envoye: accuse, raison: motif });
  } catch (e) {
    console.error("notification de candidature :", e.message);
    return res.status(200).json({ envoye: false, raison: e.message });
  }
}

function safeJson(texte) {
  try {
    return JSON.parse(texte);
  } catch {
    return {};
  }
}
