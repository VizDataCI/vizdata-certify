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

/**
 * Projection publique d'un certificat du registre.
 *
 * C'est la forme que lisent le document imprimé, la page de vérification et
 * la modale de consultation. Les correspondances — titulaire, programme,
 * domaine, compétences — sont passées en paramètre et non lues ici : la même
 * projection sert au registre du serveur et au jeu de démonstration, qui ne
 * vivent pas au même endroit.
 *
 * Cette indépendance n'est pas une coquetterie. La projection était écrite
 * dans App, avec SA base ; l'administration, elle, travaille sur l'instantané
 * qu'elle a téléchargé. Ouvrir un certificat depuis l'administration cherchait
 * donc le titulaire dans une base qui ne le contenait pas, et le document
 * officiel s'imprimait au nom de « Titulaire inconnu », programme
 * « Programme inconnu ».
 *
 * Ni date d'expiration ni score : ils ne sont plus exposés nulle part.
 */
function projectionPublique(c, { userOf, typeOf, domainOf, skills = [] }) {
  const u = userOf(c);
  const t = typeOf(c);
  const d = domainOf(t);
  return {
    id: c.id,
    reference: c.reference,
    holder_name: u && (u.first_name || u.last_name)
      ? `${u.first_name || ""} ${u.last_name || ""}`.trim()
      : "Titulaire inconnu",
    certification: t?.name || "Programme inconnu",
    domain: d?.name || "",
    program_code: t?.code || "",
    issuer: "VIZDATA",
    issue_date: c.issue_date,
    status: effectiveStatus(c),
    revoke_reason: c.revoke_reason,
    public_token: c.public_token,
    description: t?.description || "",
    duration: c.duration,
    trainer: c.trainer,
    signatory: c.signatory,
    created_at: c.created_at,
    /* Les compétences sont des identifiants dans le registre, des noms sur le
       document : on aligne sur les noms. */
    skills: (c.skills || []).map((id) => skills.find((s) => s.id === id)?.name).filter(Boolean),
    /* Seul le registre complet permet d'alimenter l'historique et les compteurs. */
    local_record: c,
  };
}

export { effectiveStatus, STATUS_META, nextReference, slugify, projectionPublique };
