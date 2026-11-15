/* Qui a le droit de quoi.
 *
 * Ce module remplace à lui seul ce que Postgres tenait par ses politiques RLS,
 * ses fonctions `has_perm()` et son déclencheur `guard_user_privileges`. C'est
 * donc la pièce la plus sensible du serveur : s'il se trompe, aucune autre
 * couche ne rattrapera l'erreur.
 *
 * Trois partis pris en conséquence :
 *
 * 1. TOUT PASSE PAR ICI. Aucune route n'écrit sans avoir appelé l'une de ces
 *    fonctions. Une autorisation vérifiée à deux endroits différents finit
 *    toujours par être vérifiée différemment.
 *
 * 2. ON LÈVE, ON NE RENVOIE PAS UN BOOLÉEN. Une fonction qui rend `false` se
 *    laisse oublier — `if (peut(...))` sans `else` est une faille muette. Une
 *    fonction qui lève interrompt la route, et le serveur transforme le refus
 *    en réponse HTTP. L'oubli devient impossible.
 *
 * 3. LE VOCABULAIRE EST PARTAGÉ AVEC L'INTERFACE. Les rôles et les
 *    autorisations viennent de `src/lib/permissions.js`, le module qu'utilise
 *    déjà le navigateur pour décider ce qu'il affiche. Les redéclarer ici
 *    garantirait qu'ils divergent un jour : l'écran proposerait une action que
 *    le serveur refuse, ou — bien pire — cacherait une action qu'il accepte.
 *
 * La règle de fond reste celle d'avant : l'interface ne protège rien, elle
 * évite de proposer l'inutile. Le serveur, lui, décide.
 */

import { AUTORISATIONS, estAdmin, estAdministration, peut } from "../src/lib/permissions.js";

/** Refus explicite, porteur de son code HTTP. */
class Refus extends Error {
  constructor(statut, message) {
    super(message);
    this.name = "Refus";
    this.statut = statut;
  }
}

const refus401 = (m = "Authentification requise.") => new Refus(401, m);
const refus403 = (m = "Cette action n'est pas autorisée pour votre compte.") => new Refus(403, m);
const refus404 = (m = "Introuvable.") => new Refus(404, m);

/* --- exigences de base --------------------------------------------------- */

/** Une session ouverte, sur un compte actif. */
function exigerSession(acteur) {
  if (!acteur) throw refus401();
  if (acteur.account_status === "DISABLED") {
    /* Le compte garde son rôle — on ne rétrograde pas quelqu'un qu'on
       suspend — mais il ne peut plus rien. */
    throw refus403("Ce compte a été désactivé. Contactez VIZDATA.");
  }
  return acteur;
}

/** Administrateur, et rien d'autre. */
function exigerAdmin(acteur) {
  exigerSession(acteur);
  if (!estAdmin(acteur)) throw refus403("Action réservée à un administrateur.");
  return acteur;
}

/** Administration au sens large : administrateur ou gestionnaire. */
function exigerAdministration(acteur) {
  exigerSession(acteur);
  if (!estAdministration(acteur)) throw refus403("Action réservée à l'administration.");
  return acteur;
}

/** Une autorisation nommée. L'administrateur les a toutes, implicitement. */
function exigerAutorisation(acteur, cle) {
  exigerSession(acteur);
  if (!AUTORISATIONS.some((a) => a.cle === cle)) {
    /* Une clé inconnue est une faute de frappe dans le code appelant. La
       laisser passer en « refusé » masquerait le bogue ; la laisser passer en
       « autorisé » serait une faille. On refuse bruyamment. */
    throw new Error(`Autorisation inconnue : ${cle}`);
  }
  if (!peut(acteur, cle)) {
    const libelle = AUTORISATIONS.find((a) => a.cle === cle).label.toLowerCase();
    throw refus403(`Votre compte n'a pas l'autorisation de ${libelle}.`);
  }
  return acteur;
}

/* --- lecture d'un certificat --------------------------------------------- */

/** Un titulaire lit les siens ; l'administration lit tout. */
function exigerLectureCertificat(acteur, certificat) {
  exigerSession(acteur);
  if (!certificat) throw refus404("Certificat introuvable.");
  if (estAdministration(acteur)) return certificat;
  if (certificat.user_id === acteur.id) return certificat;
  /* 404 plutôt que 403 : répondre « interdit » confirmerait l'existence du
     certificat à qui n'a pas le droit de le savoir. */
  throw refus404("Certificat introuvable.");
}

/** Un titulaire lit son profil ; l'administration lit l'annuaire. */
function exigerLectureCompte(acteur, cible) {
  exigerSession(acteur);
  if (!cible) throw refus404("Compte introuvable.");
  if (cible.id === acteur.id) return cible;
  if (estAdministration(acteur)) return cible;
  throw refus404("Compte introuvable.");
}

/* --- écriture sur un compte ---------------------------------------------- */

/* Les champs qu'un compte peut modifier sur lui-même. Tout le reste relève de
   l'administration — et quatre d'entre eux de l'administrateur seul. */
const CHAMPS_LIBRES = new Set(["first_name", "last_name", "phone", "linkedin_url", "public_profile", "avatar_url"]);

/* Les champs qui donnent du pouvoir. Les modifier, c'est changer qui peut
   quoi : seul un administrateur en a le droit, et jamais sur lui-même pour
   les deux premiers. */
const CHAMPS_PRIVILEGIES = new Set(["role", "permissions", "account_status", "email"]);

/**
 * Le remplaçant de `guard_user_privileges`.
 *
 * Sans ce contrôle, un gestionnaire autorisé à corriger la fiche d'un
 * titulaire pourrait envoyer la même requête sur SA PROPRE fiche en y
 * glissant `role: 'ADMIN'`. C'est l'élévation de privilèges la plus banale
 * qui soit, et elle ne demande aucun outil particulier : une requête HTTP.
 *
 * @param {object} acteur  le compte qui écrit
 * @param {object} cible   le compte écrit
 * @param {object} champs  ce qu'il veut écrire
 * @returns {object} les champs retenus, les autres ayant été refusés
 */
function exigerEcritureCompte(acteur, cible, champs) {
  exigerSession(acteur);
  if (!cible) throw refus404("Compte introuvable.");

  const demandes = Object.keys(champs);
  const privilegies = demandes.filter((c) => CHAMPS_PRIVILEGIES.has(c));
  const inconnus = demandes.filter((c) => !CHAMPS_LIBRES.has(c) && !CHAMPS_PRIVILEGIES.has(c));

  if (inconnus.length) {
    /* On refuse plutôt que d'ignorer : un champ silencieusement écarté
       laisse croire que la modification a eu lieu. */
    throw refus403(`Champ non modifiable : ${inconnus.join(", ")}.`);
  }

  if (privilegies.length) {
    if (!estAdmin(acteur)) {
      throw refus403(
        privilegies.includes("role") || privilegies.includes("permissions")
          ? "Seul un administrateur peut changer un rôle ou des autorisations."
          : privilegies.includes("account_status")
            ? "Seul un administrateur peut activer ou désactiver un compte."
            : "Seul un administrateur peut changer une adresse e-mail."
      );
    }
    /* Même administrateur, on ne se modifie pas soi-même sur ces deux
       points : le dernier administrateur pourrait se retirer ses droits et
       verrouiller la plateforme, ou se désactiver et ne plus pouvoir se
       reconnecter. Il faut un second administrateur pour le faire. */
    if (cible.id === acteur.id) {
      if (privilegies.includes("role") || privilegies.includes("permissions")) {
        throw refus403("Vous ne pouvez pas modifier votre propre rôle. Un autre administrateur doit s'en charger.");
      }
      if (privilegies.includes("account_status")) {
        throw refus403("Vous ne pouvez pas désactiver votre propre compte.");
      }
    }
    return champs;
  }

  /* Champs libres : soi-même, ou l'administration sur la fiche d'un autre. */
  if (cible.id === acteur.id) return champs;
  if (estAdministration(acteur)) return champs;
  throw refus403();
}

/**
 * Créer un compte.
 *
 * Créer un titulaire demande `creer_titulaires`. Créer un compte
 * d'administration — gestionnaire ou administrateur — est autre chose : c'est
 * se donner un collègue de même pouvoir, et seul un administrateur peut le
 * faire. Les confondre reviendrait à laisser un gestionnaire se fabriquer un
 * second compte administrateur.
 */
function exigerCreationCompte(acteur, role) {
  exigerAutorisation(acteur, "creer_titulaires");
  if (role && role !== "CERTIFIED") {
    if (!estAdmin(acteur)) throw refus403("Seul un administrateur peut créer un compte d'administration.");
  }
  return acteur;
}

/* --- garde-fou de dernier recours ---------------------------------------- */

/**
 * Vérifie qu'un compte reste administrable : il doit rester au moins un
 * administrateur actif.
 *
 * Appelé avant toute rétrogradation ou désactivation. Sans lui, la plateforme
 * peut se retrouver sans personne pour la gouverner — et la seule issue serait
 * une écriture directe dans le fichier de base.
 */
function exigerDernierAdministrateur(db, cibleId) {
  const restants = db
    .prepare(
      `select count(*) as n from users
        where role = 'ADMIN' and account_status = 'ACTIVE' and id <> ?`
    )
    .get(cibleId);
  if (!restants || restants.n === 0) {
    throw refus403(
      "C'est le dernier administrateur actif. Nommez-en un autre avant de retirer celui-ci, " +
        "sans quoi plus personne ne pourrait administrer la plateforme."
    );
  }
}

export {
  Refus,
  refus401,
  refus403,
  refus404,
  exigerSession,
  exigerAdmin,
  exigerAdministration,
  exigerAutorisation,
  exigerLectureCertificat,
  exigerLectureCompte,
  exigerEcritureCompte,
  exigerCreationCompte,
  exigerDernierAdministrateur,
  CHAMPS_LIBRES,
  CHAMPS_PRIVILEGIES,
};
