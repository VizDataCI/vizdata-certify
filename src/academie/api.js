/* Accès au registre pour l'académie.
 *
 * La page de vente lit la cohorte publiée et dépose une candidature. Elle ne
 * lit jamais la liste des candidatures : une candidature porte un nom, un
 * numéro de téléphone et une adresse e-mail, et aucune route publique n'y
 * donne accès. L'administration a les siennes, fermées par le serveur.
 *
 * Sous Supabase, cette séparation tenait à des politiques RLS et à deux
 * fonctions `security definer`. Elle tient désormais au fait qu'il n'existe
 * pas de route publique pour lire ces tables — ce qui se vérifie en lisant la
 * table des routes du serveur.
 */

import { lire, poster, modifier, supprimer, registreDistant } from "../lib/registre.js";

/** Vrai quand les candidatures peuvent réellement être enregistrées. */
const estBranchee = registreDistant;

/* --- page publique -------------------------------------------------------- */

/**
 * Cohorte annoncée au public, ou `null`.
 *
 * `null` est un cas normal, pas une panne : tant qu'aucune session n'est
 * publiée, la page affiche le programme et les tarifs de référence sans
 * annoncer de date. Une page de vente qui tomberait parce qu'aucune session
 * n'est ouverte serait absurde — d'où le rattrapage silencieux.
 */
async function cohortePubliee() {
  if (!estBranchee) return null;
  try {
    return await lire("/academie/cohorte");
  } catch {
    return null;
  }
}

/**
 * Enregistre une candidature et rend sa référence (« CDA-2026-0001 »).
 * La candidature normalisée est attendue — voir normaliserCandidature().
 */
async function soumettreCandidature(c, source = "page-academie") {
  if (!estBranchee) {
    throw new Error(
      "L'enregistrement des candidatures n'est pas configuré sur cet environnement. Écrivez-nous sur WhatsApp, votre place sera réservée de la même manière."
    );
  }
  const { reference } = await poster("/academie/candidature", { ...c, source });
  return reference;
}

/**
 * Notification par e-mail : l'alerte à VIZDATA et l'accusé au candidat.
 *
 * Volontairement « au mieux ». La candidature est déjà enregistrée quand cet
 * appel part : un e-mail perdu ne doit jamais faire croire au candidat que sa
 * candidature a échoué — l'administration la voit dans tous les cas.
 *
 * @returns {Promise<{envoye: boolean, raison?: string}>}
 */
async function notifier(reference, c) {
  try {
    const reponse = await fetch("/api/notifier-candidature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference, ...c }),
    });
    if (!reponse.ok) {
      const detail = await reponse.text().catch(() => "");
      return { envoye: false, raison: `${reponse.status} ${detail.slice(0, 200)}` };
    }
    const corps = await reponse.json().catch(() => ({}));
    return { envoye: corps.envoye !== false, raison: corps.raison };
  } catch (e) {
    return { envoye: false, raison: e.message };
  }
}

/* --- administration ------------------------------------------------------- */

const listerCandidatures = () => lire("/academie/candidatures");
const listerCohortes = () => lire("/academie/cohortes");

const majCandidature = (id, champs) => modifier(`/academie/candidatures/${encodeURIComponent(id)}`, champs);

const enregistrerCohorte = ({ id, ...champs }) =>
  id ? modifier(`/academie/cohortes/${encodeURIComponent(id)}`, champs) : poster("/academie/cohortes", champs);

const publierCohorte = (id) => poster(`/academie/cohortes/${encodeURIComponent(id)}/publier`);

/** Supprime une cohorte. Les candidatures rattachées sont conservées : on ne
 *  perd pas un candidat parce qu'une session a été annulée. */
const supprimerCohorte = (id) => supprimer(`/academie/cohortes/${encodeURIComponent(id)}`);

export {
  estBranchee,
  cohortePubliee,
  soumettreCandidature,
  notifier,
  listerCandidatures,
  listerCohortes,
  majCandidature,
  enregistrerCohorte,
  publierCohorte,
  supprimerCohorte,
};
