/* Authentification.

   Deux régimes, décidés par la présence des clés Supabase :

   — configuré   : Supabase vérifie réellement le mot de passe. Le profil
                   (prénom, nom, rôle) reste lu dans le registre local, par
                   correspondance d'adresse e-mail, tant que la base n'est
                   pas migrée.
   — démonstration : aucun mot de passe n'est vérifié. C'est le comportement
                   historique de la maquette, conservé pour qu'elle tourne
                   sans compte Supabase. */

import { supabase, isAuthConfigured } from "./supabase.js";

/** Messages Supabase traduits pour l'utilisateur ; le reste est laissé tel quel. */
function humanError(error) {
  const m = (error?.message || "").toLowerCase();
  if (m.includes("invalid login credentials")) return "Adresse e-mail ou mot de passe incorrect.";
  if (m.includes("email not confirmed")) return "Cette adresse n'a pas encore été confirmée. Consultez votre messagerie.";
  if (m.includes("too many requests") || m.includes("rate limit")) return "Trop de tentatives. Réessayez dans quelques minutes.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Serveur d'authentification injoignable. Vérifiez votre connexion.";
  return error?.message || "La connexion a échoué.";
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

/** Envoie un lien de réinitialisation. Silencieux sur l'existence du compte. */
async function sendPasswordReset(email) {
  if (!isAuthConfigured) return;
  const address = email.trim().toLowerCase();
  if (!address) throw new Error("Entrez d'abord votre adresse e-mail.");
  const { error } = await supabase.auth.resetPasswordForEmail(address, {
    redirectTo: window.location.origin,
  });
  if (error) throw new Error(humanError(error));
}

export { isAuthConfigured, signIn, signOut, currentUser, onAuthChange, sendPasswordReset };
