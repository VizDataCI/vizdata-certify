/* Règles métier du certificat : statut, numérotation, identifiants. */

import { TODAY } from "./dates.js";

/** Statut effectif : l'expiration est calculée automatiquement à la date. */
function effectiveStatus(c) {
  if (c.status === "REVOKED" || c.status === "CANCELLED") return c.status;
  if (c.expiry_date && new Date(c.expiry_date) < TODAY) return "EXPIRED";
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
