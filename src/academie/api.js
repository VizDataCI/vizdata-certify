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
 *
 * La candidature normalisée est attendue — voir normaliserCandidature().
 *
 * Les deux courriers — l'accusé au candidat, l'alerte à VIZDATA — partent du
 * serveur, dans la même requête. Ils ne peuvent pas partir d'ici : un envoi
 * demande une clé d'API, et une clé d'API dans un paquet navigateur est une
 * clé publique. Il y avait auparavant un second appel du navigateur vers une
 * fonction de notification ; le registre s'en charge désormais, ce qui ferme
 * au passage le cas gênant où la candidature était enregistrée et l'appel
 * suivant perdu — un candidat sans accusé, et VIZDATA sans alerte.
 *
 * @returns {Promise<{reference: string, courriel: {envoye: boolean}}>}
 */
async function soumettreCandidature(c, source = "page-academie") {
  if (!estBranchee) {
    throw new Error(
      "L'enregistrement des candidatures n'est pas configuré sur cet environnement. Écrivez-nous sur WhatsApp, votre place sera réservée de la même manière."
    );
  }
  const { reference, courriel } = await poster("/academie/candidature", { ...c, source });
  return { reference, courriel: courriel || { envoye: false } };
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
  listerCandidatures,
  listerCohortes,
  majCandidature,
  enregistrerCohorte,
  publierCohorte,
  supprimerCohorte,
};
