/* Règles métier du certificat : statut, numérotation, identifiants. */

/**
 * Statut effectif : l'expiration est calculée à la date, jamais stockée.
 *
 * La date de référence est lue à CHAQUE appel, et non une fois pour toutes au
 * chargement du module. La nuance était sans effet dans un navigateur, où la
 * page se recharge ; elle ne l'est plus depuis qu'un serveur appelle cette
 * fonction : démarré un lundi, il aurait considéré jusqu'au mois suivant que
 * l'on est toujours lundi, et un certificat échu entre-temps serait resté
 * « valide ».
 *
 * Le paramètre existe pour les tests, qui ont besoin d'une date fixe.
 */
function effectiveStatus(c, aujourdhui = new Date()) {
  if (c.status === "REVOKED" || c.status === "CANCELLED") return c.status;
  if (c.expiry_date && new Date(c.expiry_date) < aujourdhui) return "EXPIRED";
  return "ACTIVE";
}

const STATUS_META = {
  ACTIVE: { label: "Valide", tone: "vert" },
  EXPIRED: { label: "Expiré", tone: "orange" },
  REVOKED: { label: "Révoqué", tone: "rouge" },
  CANCELLED: { label: "Annulé", tone: "gris" },
};

function nextReference(certificates, code, year) {
  const prefix = `VIZ-${year}-${code}-`;
  const nums = certificates.filter((c) => c.reference.startsWith(prefix)).map((c) => parseInt(c.reference.slice(prefix.length), 10) || 0);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return prefix + String(next).padStart(6, "0");
}

function slugify(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export { effectiveStatus, STATUS_META, nextReference, slugify };
