/* La chaîne de réinitialisation du mot de passe, en deux écrans.
 *
 * Ils vivent dans le même fichier parce qu'ils ne se comprennent qu'ensemble :
 * le premier envoie un lien, le second est l'endroit où ce lien atterrit.
 *
 * Ce qui était cassé
 * ------------------
 * L'e-mail partait, mais `redirectTo` visait la page d'accueil. Supabase y
 * ouvrait bien une session de récupération — et personne n'en faisait rien :
 * aucun formulaire n'attendait. Le mot de passe restait l'ancien, sans qu'aucun
 * message ne le dise. Le lien n'était pas en cause ; il n'y avait pas d'arrivée.
 *
 * Les quatre états de l'arrivée, tous traités ici
 * ----------------------------------------------
 *   attente — le lien est reconnu, le SDK n'a pas encore ouvert la session.
 *   pret    — la session est ouverte, le formulaire peut écrire.
 *   refuse  — Supabase a refusé : lien expiré, déjà utilisé, altéré. On le dit,
 *             et on propose d'en redemander un ; c'est le seul cas où l'on
 *             reparle d'e-mail.
 *   fait    — le mot de passe est écrit. On le confirme, puis on emmène.
 */

import { useState, useEffect } from "react";
import {
  isAuthConfigured,
  etatLienRecuperation,
  onPasswordRecovery,
  sendPasswordReset,
  updatePassword,
  qualiteMotDePasse,
} from "../../lib/auth.js";
import { Field } from "../../ui/primitives.jsx";
import { PublicShell } from "./PublicShell.jsx";

/* --- Carte d'authentification, commune aux deux écrans ------------------- */
function Carte({ p, eyebrow, titre, children, pied }) {
  return (
    <PublicShell {...p}>
      <div className="vz-public-body">
        <div className="vz-slip" style={{ maxWidth: 440 }}>
          <div className="vz-card-body" style={{ padding: 28 }}>
            <div className="vz-eyebrow">{eyebrow}</div>
            <h2 style={{ fontSize: 20, margin: "10px 0 6px" }}>{titre}</h2>
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

  /* Le message de confirmation ne dit jamais si l'adresse est connue : le
     contraire permettrait de savoir qui est inscrit au registre en essayant
     des adresses une à une. */
  if (envoye) {
    return (
      <Carte p={p} eyebrow="Mot de passe" titre="Vérifiez votre messagerie">
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
    <Carte p={p} eyebrow="Mot de passe" titre="Réinitialiser mon mot de passe">
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
  /* L'état du lien est lu une seule fois, au premier rendu, et avant tout
     abonnement : le SDK Supabase efface le fragment de l'adresse dès qu'il l'a
     consommé, donc un refus lu trop tard serait lu comme une absence. */
  const [lien] = useState(() => etatLienRecuperation());
  const [etat, setEtat] = useState(() => {
    if (lien.etat === "refuse") return "refuse";
    /* Déjà connecté : première connexion après invitation, ou changement
       demandé. Le formulaire est utilisable tout de suite. */
    if (p.session) return "pret";
    return lien.etat === "accepte" ? "attente" : "attente";
  });
  const [mdp, setMdp] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (etat === "refuse" || etat === "pret") return;
    const desabonner = onPasswordRecovery(() => setEtat("pret"));

    /* Sans clés Supabase, aucune session ne s'ouvrira jamais : la maquette
       doit tout de même montrer l'écran. */
    if (!isAuthConfigured) {
      setEtat("pret");
      return desabonner;
    }

    /* Si rien n'arrive, c'est que l'adresse a été ouverte à la main, sans
       lien. Le dire au bout de quelques secondes vaut mieux que de laisser
       tourner un « veuillez patienter » indéfini. */
    const minuteur = setTimeout(() => {
      setEtat((actuel) => (actuel === "attente" ? "refuse" : actuel));
    }, 6000);

    return () => { clearTimeout(minuteur); desabonner(); };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const enregistrer = async () => {
    if (busy) return;
    const souci = qualiteMotDePasse(mdp);
    if (souci) { setErr(souci); return; }
    if (mdp !== confirmation) { setErr("Les deux mots de passe ne correspondent pas."); return; }

    setBusy(true);
    setErr("");
    try {
      await updatePassword(mdp);
      /* Le compte n'est plus en attente de premier mot de passe. L'oubli de ce
         geste renverrait le titulaire sur cet écran à chaque connexion. */
      if (p.session) await p.motDePasseChange();
      setEtat("fait");
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  if (etat === "refuse") {
    return (
      <Carte p={p} eyebrow="Mot de passe" titre="Ce lien n'est plus valable">
        <div className="vz-alert warn" style={{ marginTop: 16 }}>
          {lien.etat === "refuse" ? lien.message : "Cette page s'ouvre depuis un lien reçu par e-mail. Demandez-en un nouveau pour choisir votre mot de passe."}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          <button className="vz-btn vz-btn-primary" onClick={() => p.go({ view: "forgotPassword" })}>Demander un nouveau lien</button>
          <button className="vz-btn" onClick={() => p.go({ view: "login" })}>Connexion</button>
        </div>
      </Carte>
    );
  }

  if (etat === "attente") {
    return (
      <Carte p={p} eyebrow="Mot de passe" titre="Vérification du lien">
        <p className="vz-small vz-muted" style={{ marginTop: 14 }}>Ouverture de votre session de récupération…</p>
      </Carte>
    );
  }

  if (etat === "fait") {
    return (
      <Carte p={p} eyebrow="Mot de passe" titre="Votre mot de passe est modifié">
        <div className="vz-alert ok" style={{ marginTop: 16 }}>
          Le nouveau mot de passe est enregistré. Il est actif dès maintenant.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button
            className="vz-btn vz-btn-primary"
            onClick={() => p.go(p.session ? { view: p.session.role === "CERTIFIED" ? "dashboard" : "admin", page: "dashboard" } : { view: "login" })}
          >
            {p.session ? "Ouvrir mon espace" : "Se connecter"}
          </button>
        </div>
      </Carte>
    );
  }

  const force = p.session?.must_change_password;

  return (
    <Carte
      p={p}
      eyebrow="Mot de passe"
      titre={force ? "Choisissez votre mot de passe" : "Nouveau mot de passe"}
      pied="Huit caractères au minimum, dont une lettre et un chiffre."
    >
      {force && (
        <div className="vz-alert info" style={{ margin: "14px 0 4px" }}>
          Bienvenue{p.session?.first_name ? ` ${p.session.first_name}` : ""}. Définissez votre mot de passe pour accéder à votre espace.
        </div>
      )}
      <p className="vz-small vz-muted" style={{ margin: "14px 0 18px", lineHeight: 1.7 }}>
        Choisissez un mot de passe que vous n'utilisez pas ailleurs.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Nouveau mot de passe">
          <input
            className="vz-input"
            type="password"
            value={mdp}
            onChange={(e) => { setMdp(e.target.value); setErr(""); }}
            autoComplete="new-password"
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
