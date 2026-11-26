/* Rôles et autorisations.
 *
 * Trois rôles, et un principe
 * ---------------------------
 *   ADMIN     : tous les droits, sans exception et sans configuration.
 *   MANAGER   : gestionnaire : ce que l'administrateur lui a accordé, et rien
 *               d'autre. Les autorisations sont nommées et stockées une par une
 *               dans users.permissions.
 *   CERTIFIED : titulaire : ses propres certificats, son propre profil.
 *
 * Ce module ne protège rien. Il sert à décider ce qu'un écran affiche : un
 * bouton qu'on ne pourrait pas utiliser n'a rien à faire là. L'autorisation
 * réelle est tenue par la base : politiques RLS, fonctions `has_perm()` et
 * `is_admin()`, et un déclencheur qui empêche un gestionnaire d'élargir ses
 * propres droits. Les deux doivent dire la même chose, mais c'est la base qui
 * tranche. Si jamais elles divergent, l'écran propose une action que la base
 * refuse : désagréable, jamais dangereux. L'inverse serait une faille.
 */

/** Autorisations qu'un administrateur peut accorder à un gestionnaire. */
const AUTORISATIONS = [
  {
    cle: "creer_titulaires",
    label: "Créer des certifiés",
    detail: "Enregistrer un nouveau titulaire et lui envoyer son invitation.",
  },
  {
    cle: "attribuer_certificats",
    label: "Attribuer des certifications",
    detail: "Délivrer un certificat et modifier un certificat existant.",
  },
  {
    cle: "revoquer_certificats",
    label: "Révoquer des certificats",
    detail: "Retirer un certificat du registre en motivant la décision.",
  },
  {
    cle: "exporter_donnees",
    label: "Exporter les données",
    detail: "Télécharger le registre et les listes de titulaires.",
  },
];

const ROLES = {
  ADMIN: { label: "Administrateur", detail: "Tous les droits sur la plateforme." },
  MANAGER: { label: "Gestionnaire", detail: "Droits accordés un par un par l'administrateur." },
  CERTIFIED: { label: "Certifié", detail: "Accès à son espace personnel uniquement." },
};

/** Vrai pour un administrateur. */
const estAdmin = (session) => session?.role === "ADMIN";

/** Vrai pour l'administration au sens large : administrateur ou gestionnaire. */
const estAdministration = (session) =>
  Boolean(session) && (session.role === "ADMIN" || session.role === "MANAGER") && session.account_status !== "DISABLED";

/** Vrai si le compte porte l'autorisation nommée. L'administrateur les a toutes. */
function peut(session, autorisation) {
  if (!estAdministration(session)) return false;
  if (session.role === "ADMIN") return true;
  return Boolean(session.permissions?.[autorisation]);
}

/** Libellé lisible d'un rôle. */
const libelleRole = (role) => ROLES[role]?.label || role || "Rôle inconnu";

/** Résumé des autorisations d'un compte, pour l'annuaire. */
function resumeAutorisations(session) {
  if (session?.role === "ADMIN") return "Tous les droits";
  if (session?.role !== "MANAGER") return "Sans objet";
  const accordees = AUTORISATIONS.filter((a) => session.permissions?.[a.cle]);
  if (accordees.length === 0) return "Aucune autorisation";
  if (accordees.length === AUTORISATIONS.length) return "Toutes les autorisations";
  return accordees.map((a) => a.label).join(", ");
}

export { AUTORISATIONS, ROLES, estAdmin, estAdministration, peut, libelleRole, resumeAutorisations };
