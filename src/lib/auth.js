/* Authentification.
 *
 * Deux régimes, décidés par le mode de construction :
 *
 * — registre      : le serveur VIZDATA vérifie le mot de passe et pose un
 *                   cookie de session HttpOnly. Le navigateur ne détient
 *                   aucun secret — il ne peut même pas lire ce cookie.
 * — démonstration : aucun mot de passe n'est vérifié, le registre vit dans le
 *                   navigateur. C'est `npm run demo`, et rien d'autre.
 *
 * Ce qui a changé en quittant Supabase
 * ------------------------------------
 * La session n'est plus un jeton conservé par le JavaScript, donc elle n'est
 * plus à la portée d'une injection dans l'interface. Il n'y a plus de flux de
 * rafraîchissement à écouter, donc plus d'événements de session : la session
 * est lue une fois au démarrage, et le serveur tranche à chaque requête.
 */

import { registreDistant, lire, poster, supprimer } from "./registre.js";
import { qualiteMotDePasse, jetonDansAdresse } from "./mot-de-passe.js";

/** Compatibilité de nom avec les écrans écrits du temps de Supabase. */
const isAuthConfigured = registreDistant;

/** Message affichable d'une erreur du registre. */
function humanError(error) {
  return error?.message || "La connexion a échoué.";
}

/**
 * Connexion. Renvoie le profil complet — rôle et autorisations compris.
 *
 * Supabase rendait un compte d'authentification qu'il fallait ensuite
 * rapprocher d'un profil, en un second aller-retour. Le registre les tient
 * dans la même table : une requête suffit.
 */
async function signIn(email, motDePasse) {
  const adresse = String(email || "").trim().toLowerCase();

  if (!registreDistant) {
    if (!motDePasse) throw new Error("Entrez votre mot de passe.");
    return { id: null, email: adresse, demonstration: true };
  }
  if (!adresse) throw new Error("Entrez votre adresse e-mail.");

  return poster("/session", { email: adresse, motDePasse });
}

async function signOut() {
  if (!registreDistant) return;
  try {
    await supprimer("/session");
  } catch {
    /* Le registre est injoignable : la session locale est quand même oubliée,
       et le cookie expirera. Refuser de déconnecter parce que le serveur ne
       répond pas serait le pire des deux mondes. */
  }
}

/** Profil de la session en cours, ou null. */
async function currentUser() {
  if (!registreDistant) return null;
  try {
    return await lire("/session");
  } catch {
    return null;
  }
}

/**
 * Jadis l'abonnement aux événements de session de Supabase.
 *
 * Il n'a plus d'objet : la session est un cookie, le serveur la valide à
 * chaque requête, et il n'y a pas de jeton à rafraîchir. La fonction est
 * conservée pour ne pas réécrire les écrans qui l'appellent, et elle ne fait
 * rien — ce qui est exactement ce qu'il faut qu'elle fasse.
 */
function onAuthChange() {
  return () => {};
}

/* --- mot de passe --------------------------------------------------------- */

/** Demande un lien de réinitialisation. Silencieux sur l'existence du compte. */
async function sendPasswordReset(email) {
  const adresse = String(email || "").trim().toLowerCase();
  if (!adresse) throw new Error("Entrez d'abord votre adresse e-mail.");
  if (!registreDistant) return;
  await poster("/mot-de-passe/oubli", { email: adresse });
}

/**
 * Écrit le mot de passe porté par un lien, et ouvre la session.
 *
 * La personne vient de prouver qu'elle a accès à sa messagerie et vient de
 * choisir son mot de passe : lui redemander de se connecter serait une étape
 * pour rien.
 */
async function definirMotDePasse(jeton, motDePasse) {
  const souci = qualiteMotDePasse(motDePasse);
  if (souci) throw new Error(souci);
  if (!registreDistant) return { demonstration: true };
  return poster("/mot-de-passe/definir", { jeton, motDePasse });
}

/** Changement depuis l'espace personnel : l'ancien mot de passe est exigé. */
async function changePassword(_email, ancien, nouveau) {
  if (!ancien) throw new Error("Entrez votre mot de passe actuel.");
  const souci = qualiteMotDePasse(nouveau);
  if (souci) throw new Error(souci);
  if (ancien === nouveau) throw new Error("Le nouveau mot de passe doit être différent de l'ancien.");
  if (!registreDistant) return;
  await poster("/mot-de-passe/changer", { ancien, nouveau });
}

export {
  isAuthConfigured,
  registreDistant,
  signIn,
  signOut,
  currentUser,
  onAuthChange,
  sendPasswordReset,
  definirMotDePasse,
  changePassword,
  jetonDansAdresse,
  qualiteMotDePasse,
  humanError,
};
