/* La chaîne de mot de passe, en deux écrans.
 *
 * Ils vivent dans le même fichier parce qu'ils ne se comprennent qu'ensemble :
 * le premier envoie un lien, le second est l'endroit où ce lien atterrit.
 *
 * Ce qui était cassé, et comment c'est réglé
 * ------------------------------------------
 * L'e-mail partait, mais l'adresse de retour visait la page d'accueil.
 * Supabase y ouvrait une session de récupération dont personne ne faisait
 * rien : aucun formulaire n'attendait, et le mot de passe restait l'ancien
 * sans qu'aucun message ne le dise. Le lien n'était pas en cause ; il n'y
 * avait pas d'arrivée.
 *
 * Depuis le passage à notre propre registre, l'arrivée existe ET le mécanisme
 * a maigri. Le lien porte un secret dans son adresse, l'écran l'envoie au
 * serveur avec le nouveau mot de passe, et c'est le serveur qui tranche :
 * valide, expiré, ou déjà utilisé. Il n'y a plus de session à attendre, plus
 * de fragment à lire avant qu'un SDK ne l'efface, plus de quatre états dont
 * trois venaient de l'URL.
 *
 * Le secret est retiré de la barre d'adresse dès qu'il est lu : sans cela, il
 * resterait dans l'historique du navigateur, sur une capture d'écran, et dans
 * l'en-tête Referer de la première requête vers un site tiers.
 */

import { useState, useEffect } from "react";
import {
  isAuthConfigured,
  definirMotDePasse,
  jetonDansAdresse,
  sendPasswordReset,
  qualiteMotDePasse,
} from "../../lib/auth.js";
import { effacerJetonDeLAdresse } from "../../lib/mot-de-passe.js";
import { Field, EnteteForm } from "../../ui/primitives.jsx";
import { PublicShell } from "./PublicShell.jsx";

/* --- carte commune aux deux écrans --------------------------------------- */
function Carte({ p, titre, children, pied }) {
  return (
    <PublicShell {...p}>
      <div className="vz-public-body">
        <div className="vz-slip" style={{ maxWidth: 440 }}>
          <div className="vz-card-body" style={{ padding: "40px 34px 30px" }}>
            <EnteteForm titre={titre} />
            {children}
          </div>
          {pied && <div className="vz-slip-foot">{pied}</div>}
        </div>
      </div>
    </PublicShell>
  );
}

/* ========================================================================
   1. DEMANDE — « j'ai oublié mon mot de passe »
   ====================================================================== */

function ForgotPassword(p) {
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const [busy, setBusy] = useState(false);

  const envoyer = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      await sendPasswordReset(email);
      setEnvoye(true);
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  /* Le message ne dit jamais si l'adresse est connue : le contraire
     permettrait de savoir qui est inscrit au registre en essayant des adresses
     une à une. Le serveur applique la même règle, et répond pareil dans les
     deux cas. */
  if (envoye) {
    return (
      <Carte p={p} titre="Vérifiez votre messagerie">
        <div className="vz-alert ok" style={{ marginTop: 16 }}>
          Si un compte existe pour <strong>{email.trim().toLowerCase()}</strong>, un lien de réinitialisation vient d'y être envoyé.
        </div>
        <p className="vz-small vz-muted" style={{ marginTop: 14, lineHeight: 1.7 }}>
          Le lien n'est valable qu'une heure, et une seule fois. Pensez à regarder dans les indésirables.
          {!isAuthConfigured && " (En démonstration, aucun e-mail n'est réellement envoyé.)"}
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          <button className="vz-btn" onClick={() => p.go({ view: "login" })}>Retour à la connexion</button>
          <button className="vz-btn" onClick={() => { setEnvoye(false); setErr(""); }}>Renvoyer le lien</button>
        </div>
      </Carte>
    );
  }

  return (
    <Carte p={p} titre="Réinitialiser mon mot de passe">
      <p className="vz-small vz-muted" style={{ marginBottom: 18, lineHeight: 1.7 }}>
        Entrez l'adresse e-mail de votre compte. Vous recevrez un lien pour choisir un nouveau mot de passe.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Adresse e-mail">
          <input
            className="vz-input"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setErr(""); }}
            onKeyDown={(e) => e.key === "Enter" && envoyer()}
            placeholder="vous@exemple.ci"
            autoComplete="username"
          />
        </Field>
        {err && <div className="vz-alert err">{err}</div>}
        <button className="vz-btn vz-btn-primary vz-btn-lg" onClick={envoyer} disabled={busy}>
          {busy ? "Envoi…" : "Envoyer le lien"}
        </button>
        <button className="vz-linkbtn" style={{ alignSelf: "center" }} onClick={() => p.go({ view: "login" })}>
          Retour à la connexion
        </button>
      </div>
    </Carte>
  );
}

/* ========================================================================
   2. ARRIVÉE — « voici mon nouveau mot de passe »
   ====================================================================== */

function NewPassword(p) {
  /* Le secret est lu une seule fois, au premier rendu, puis retiré de
     l'adresse. Le lire dans un effet laisserait une fenêtre pendant laquelle
     il figure encore dans la barre du navigateur. */
  const [jeton] = useState(() => jetonDansAdresse(window.location.href));
  const [mdp, setMdp] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [err, setErr] = useState("");
  const [perime, setPerime] = useState("");
  const [busy, setBusy] = useState(false);
  const [fait, setFait] = useState(false);

  useEffect(() => {
    if (jeton) effacerJetonDeLAdresse();
  }, [jeton]);

  const enregistrer = async () => {
    if (busy) return;
    const souci = qualiteMotDePasse(mdp);
    if (souci) { setErr(souci); return; }
    if (mdp !== confirmation) { setErr("Les deux mots de passe ne correspondent pas."); return; }

    setBusy(true);
    setErr("");
    try {
      const compte = await definirMotDePasse(jeton, mdp);
      /* Le serveur ouvre la session dans la foulée : la personne vient de
         prouver qu'elle a accès à sa messagerie et vient de choisir son mot de
         passe. Lui redemander de se connecter serait une étape pour rien. */
      if (compte && compte.id) p.setSession(compte);
      setFait(true);
    } catch (e) {
      /* 410 : le lien a expiré ou a déjà servi. C'est le seul refus qui appelle
         une action précise — en redemander un —, donc il a son propre écran. */
      if (e.statut === 410) setPerime(e.message);
      else setErr(e.message);
    }
    setBusy(false);
  };

  if (!jeton) {
    return (
      <Carte p={p} titre="Cette page s'ouvre depuis un lien">
        <div className="vz-alert warn" style={{ marginTop: 16 }}>
          Pour choisir un mot de passe, suivez le lien reçu par e-mail. Si vous n'en avez pas, ou s'il a expiré,
          demandez-en un nouveau.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          <button className="vz-btn vz-btn-primary" onClick={() => p.go({ view: "forgotPassword" })}>Demander un lien</button>
          <button className="vz-btn" onClick={() => p.go({ view: "login" })}>Connexion</button>
        </div>
      </Carte>
    );
  }

  if (perime) {
    return (
      <Carte p={p} titre="Ce lien n'est plus valable">
        <div className="vz-alert warn" style={{ marginTop: 16 }}>{perime}</div>
        <p className="vz-small vz-muted" style={{ marginTop: 14, lineHeight: 1.7 }}>
          Les liens ne servent qu'une fois, et ne restent valables qu'un temps : un lien qui traînerait dans une
          boîte de réception resterait sinon une clé de votre compte.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          <button className="vz-btn vz-btn-primary" onClick={() => p.go({ view: "forgotPassword" })}>Demander un nouveau lien</button>
          <button className="vz-btn" onClick={() => p.go({ view: "login" })}>Connexion</button>
        </div>
      </Carte>
    );
  }

  if (fait) {
    const session = p.session;
    return (
      <Carte p={p} titre="Votre mot de passe est enregistré">
        <div className="vz-alert ok" style={{ marginTop: 16 }}>
          Il est actif dès maintenant, et votre session est ouverte.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button
            className="vz-btn vz-btn-primary"
            onClick={() =>
              p.go(
                session && session.role !== "CERTIFIED"
                  ? { view: "admin", page: "dashboard" }
                  : session
                    ? { view: "dashboard" }
                    : { view: "login" }
              )
            }
          >
            {session ? "Ouvrir mon espace" : "Se connecter"}
          </button>
        </div>
      </Carte>
    );
  }

  return (
    <Carte
      p={p}
      titre="Choisissez votre mot de passe"
      pied="Huit caractères au minimum, dont une lettre et un chiffre."
    >
      <p className="vz-small vz-muted" style={{ margin: "14px 0 18px", lineHeight: 1.7 }}>
        Choisissez un mot de passe que vous n'utilisez pas ailleurs. Il sera le seul à ouvrir votre espace :
        VIZDATA ne le connaîtra pas.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Nouveau mot de passe">
          <input
            className="vz-input"
            type="password"
            value={mdp}
            onChange={(e) => { setMdp(e.target.value); setErr(""); }}
            autoComplete="new-password"
            autoFocus
          />
        </Field>
        <Field label="Confirmer le mot de passe">
          <input
            className="vz-input"
            type="password"
            value={confirmation}
            onChange={(e) => { setConfirmation(e.target.value); setErr(""); }}
            onKeyDown={(e) => e.key === "Enter" && enregistrer()}
            autoComplete="new-password"
          />
        </Field>
        {err && <div className="vz-alert err">{err}</div>}
        <button className="vz-btn vz-btn-primary vz-btn-lg" onClick={enregistrer} disabled={busy}>
          {busy ? "Enregistrement…" : "Enregistrer le mot de passe"}
        </button>
      </div>
    </Carte>
  );
}

export { ForgotPassword, NewPassword };
