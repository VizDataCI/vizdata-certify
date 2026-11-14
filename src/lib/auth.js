/* Authentification.
 *
 * Deux régimes, décidés par la présence des clés Supabase :
 *
 * — configuré   : Supabase vérifie réellement le mot de passe, et le profil
 *                 (prénom, nom, rôle, autorisations) est lu dans la table
 *                 users. C'est la base qui porte le rôle, pas le navigateur.
 * — démonstration : aucun mot de passe n'est vérifié. C'est le comportement
 *                 historique de la maquette, conservé pour qu'elle tourne sans
 *                 compte Supabase.
 */

import { supabase, isAuthConfigured } from "./supabase.js";
import { qualiteMotDePasse, etatLienRecuperation as lireLien } from "./mot-de-passe.js";
import { toPath } from "./router.js";

/** Messages Supabase traduits pour l'utilisateur ; le reste est laissé tel quel. */
function humanError(error) {
  const m = (error?.message || "").toLowerCase();
  if (m.includes("invalid login credentials")) return "Adresse e-mail ou mot de passe incorrect.";
  if (m.includes("email not confirmed")) return "Cette adresse n'a pas encore été confirmée. Consultez votre messagerie.";
  if (m.includes("too many requests") || m.includes("rate limit")) return "Trop de tentatives. Réessayez dans quelques minutes.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Serveur d'authentification injoignable. Vérifiez votre connexion.";
  if (m.includes("same password")) return "Le nouveau mot de passe doit être différent de l'ancien.";
  if (m.includes("password should be at least")) return "Le mot de passe est trop court : huit caractères au minimum.";
  if (m.includes("auth session missing") || m.includes("session_not_found")) {
    return "Votre lien n'est plus valable. Demandez-en un nouveau.";
  }
  if (m.includes("weak password")) return "Ce mot de passe est trop simple. Ajoutez des chiffres ou des majuscules.";
  return error?.message || "La connexion a échoué.";
}

/** Adresse de retour des liens envoyés par courrier. Absolue, comme Supabase l'exige. */
function adresseRetour() {
  return window.location.origin + toPath({ view: "newPassword" });
}

/** Connecte et renvoie le compte { id, email }. Lève une Error au message affichable. */
async function signIn(email, password) {
  const address = email.trim().toLowerCase();

  if (!isAuthConfigured) {
    if (!password) throw new Error("Entrez votre mot de passe.");
    return { id: null, email: address };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email: address, password });
  if (error) throw new Error(humanError(error));
  return { id: data.user.id, email: data.user.email.toLowerCase() };
}

async function signOut() {
  if (isAuthConfigured) await supabase.auth.signOut();
}

/** Compte { id, email } de la session en cours, ou null. */
async function currentUser() {
  if (!isAuthConfigured) return null;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  return user ? { id: user.id, email: user.email.toLowerCase() } : null;
}

/** S'abonne aux changements de session. Renvoie la fonction de désabonnement. */
function onAuthChange(callback) {
  if (!isAuthConfigured) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user;
    callback(user ? { id: user.id, email: user.email.toLowerCase() } : null);
  });
  return () => data.subscription.unsubscribe();
}

/* --- réinitialisation du mot de passe --------------------------------------

   Ce qui ne marchait pas
   ----------------------
   L'e-mail partait bien, mais `redirectTo` pointait vers `window.location.origin`
   — la page d'accueil. Supabase y ouvrait une session de récupération, puis
   plus rien : aucun formulaire n'attendait, donc aucun mot de passe ne pouvait
   être écrit. Le lien fonctionnait ; c'est l'arrivée qui manquait.

   Les trois pièces de la chaîne, désormais :
     1. sendPasswordReset  — envoie le lien vers /nouveau-mot-de-passe.
     2. etatLienRecuperation — lit ce que Supabase a mis dans l'adresse, y
        compris un refus (lien expiré, déjà utilisé).
     3. updatePassword     — écrit le nouveau mot de passe dans la session
        ouverte par le lien.

   L'adresse de retour doit être déclarée dans le projet Supabase
   (Authentication → URL Configuration → Redirect URLs), sinon Supabase
   substitue le Site URL et l'on retombe sur le problème d'origine. */

/** Envoie un lien de réinitialisation. Silencieux sur l'existence du compte. */
async function sendPasswordReset(email) {
  const address = email.trim().toLowerCase();
  if (!address) throw new Error("Entrez d'abord votre adresse e-mail.");
  if (!isAuthConfigured) return;
  const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: adresseRetour() });
  if (error) throw new Error(humanError(error));
}

/** Ce que Supabase laisse dans l'adresse en revenant d'un lien.
 *  La lecture elle-même vit dans mot-de-passe.js, pour être éprouvable hors
 *  navigateur ; ici, on ne fait que lui donner l'adresse en cours. */
function etatLienRecuperation(href = window.location.href) {
  return lireLien(href);
}

/** Attend que le SDK ait ouvert la session portée par le lien. */
function onPasswordRecovery(callback) {
  if (!isAuthConfigured) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) callback(session);
  });
  return () => data.subscription.unsubscribe();
}

/** Écrit un nouveau mot de passe dans la session en cours. */
async function updatePassword(password) {
  const faible = qualiteMotDePasse(password);
  if (faible) throw new Error(faible);
  if (!isAuthConfigured) return;
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(humanError(error));
}

/** Changement depuis l'espace personnel : l'ancien mot de passe est vérifié. */
async function changePassword(email, ancien, nouveau) {
  if (!ancien) throw new Error("Entrez votre mot de passe actuel.");
  const faible = qualiteMotDePasse(nouveau);
  if (faible) throw new Error(faible);
  if (ancien === nouveau) throw new Error("Le nouveau mot de passe doit être différent de l'ancien.");
  if (!isAuthConfigured) return;

  /* Vérifier l'ancien mot de passe n'est pas une formalité : sans ce contrôle,
     un poste laissé déverrouillé suffirait à prendre le compte. Supabase ne le
     fait pas pour nous — updateUser écrit sans rien demander. */
  const { error: refus } = await supabase.auth.signInWithPassword({ email, password: ancien });
  if (refus) throw new Error("Votre mot de passe actuel est incorrect.");

  const { error } = await supabase.auth.updateUser({ password: nouveau });
  if (error) throw new Error(humanError(error));
}

export {
  isAuthConfigured,
  signIn,
  signOut,
  currentUser,
  onAuthChange,
  sendPasswordReset,
  etatLienRecuperation,
  onPasswordRecovery,
  updatePassword,
  changePassword,
  qualiteMotDePasse,
  humanError,
};
