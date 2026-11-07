/* Accès distant de l'académie.
 *
 * La page de vente lit une cohorte et écrit une candidature. Les deux passent
 * par des fonctions `security definer` : les tables `cohortes` et
 * `candidatures` restent fermées à la lecture anonyme, comme `certificates`.
 * Un visiteur ne peut donc pas lister les candidatures de ses concurrents, ni
 * lire les tarifs d'une cohorte encore en brouillon.
 *
 * L'administration, elle, lit et écrit les tables directement : les politiques
 * `*_admin_all` s'en chargent. Aucun contrôle de rôle n'est écrit ici — un
 * compte non administrateur reçoit une liste vide ou l'erreur 42501 de
 * Postgres, et c'est la base qui l'a décidé.
 */

import { supabase, isAuthConfigured } from "../lib/supabase.js";

/** Vrai quand les candidatures peuvent réellement être enregistrées. */
const estBranchee = isAuthConfigured;

/** Erreurs techniques traduites pour un visiteur, puis pour l'administration. */
function echec(error) {
  const m = (error?.message || "").toLowerCase();

  if (m.includes("failed to fetch") || m.includes("network")) {
    throw new Error("Le serveur est injoignable. Vérifiez votre connexion, puis réessayez.");
  }
  /* Migration non appliquée : PostgREST ne trouve pas la fonction. Le message
     par défaut (« Could not find the function… in the schema cache ») n'aide
     personne ; on nomme le fichier à appliquer. */
  if (m.includes("could not find the function") || m.includes("does not exist")) {
    throw new Error(
      "La base n'est pas encore préparée pour les candidatures. Appliquez supabase/migrations/20261106_academie.sql depuis la console Supabase."
    );
  }
  if (m.includes("trop de candidatures")) throw new Error(error.message);

  throw new Error(error?.message || "Le serveur n'a pas répondu.");
}

/* --- page publique -------------------------------------------------------- */

/**
 * Cohorte annoncée au public, ou `null`.
 *
 * `null` est un cas normal, pas une panne : tant qu'aucune session n'est
 * publiée, la page affiche le programme et les tarifs de référence sans
 * annoncer de date. C'est préférable à une date inventée.
 */
async function cohortePubliee() {
  if (!estBranchee) return null;
  const { data, error } = await supabase.rpc("cohorte_publique");
  /* Une cohorte absente ne doit pas casser la page de vente : on le signale en
     console et on rend null. Une candidature, elle, remonte ses erreurs. */
  if (error) return null;
  return Array.isArray(data) && data.length ? data[0] : null;
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

  const { data, error } = await supabase.rpc("soumettre_candidature", {
    p_nom: c.nom,
    p_whatsapp: c.whatsapp,
    p_email: c.email,
    p_profession: c.profession,
    p_niveau: c.niveau,
    p_formule: c.formule,
    p_disponible: c.disponible,
    p_consent: c.consent,
    p_entreprise: c.entreprise,
    p_motivation: c.motivation,
    p_source: source,
  });
  if (error) echec(error);
  return data;
}

/**
 * Notification par e-mail : l'alerte à VIZDATA et l'accusé au candidat.
 *
 * Volontairement « au mieux ». L'envoi est fait par une fonction serveur, qui
 * dépend d'une clé d'API et d'un service tiers ; la candidature, elle, est
 * déjà enregistrée quand cet appel part. Un e-mail perdu ne doit jamais faire
 * croire au candidat que sa candidature a échoué — l'administration la voit
 * dans tous les cas.
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

const CANDIDATURE_SELECT =
  "id, reference, cohorte_id, nom, whatsapp, email, profession, entreprise, " +
  "niveau, motivation, formule, statut, notes, source, created_at, updated_at";

/** Toutes les candidatures, les plus récentes d'abord. */
async function listerCandidatures() {
  const { data, error } = await supabase
    .from("candidatures")
    .select(CANDIDATURE_SELECT)
    .order("created_at", { ascending: false });
  if (error) echec(error);
  return data || [];
}

/** Toutes les cohortes, y compris les brouillons. */
async function listerCohortes() {
  const { data, error } = await supabase
    .from("cohortes")
    .select("*")
    .order("date_debut", { ascending: false, nullsFirst: false });
  if (error) echec(error);
  return data || [];
}

/** Modifie une candidature : statut, notes de suivi, cohorte de rattachement. */
async function majCandidature(id, champs) {
  const { error } = await supabase.from("candidatures").update(champs).eq("id", id);
  if (error) echec(error);
}

/** Crée ou met à jour une cohorte. */
async function enregistrerCohorte({ id, ...champs }) {
  const requete = id
    ? supabase.from("cohortes").update(champs).eq("id", id)
    : supabase.from("cohortes").insert(champs);
  const { error } = await requete;
  if (error) echec(error);
}

/**
 * Publie une cohorte et dépublie les autres.
 *
 * `cohorte_publique()` ne rend qu'une ligne : laisser deux cohortes publiées
 * ne casserait rien, mais la page afficherait la première par date sans que
 * l'administration comprenne pourquoi. On rend l'intention explicite.
 */
async function publierCohorte(id) {
  const depublier = await supabase.from("cohortes").update({ publiee: false }).neq("id", id);
  if (depublier.error) echec(depublier.error);
  const { error } = await supabase
    .from("cohortes")
    .update({ publiee: true, statut: "OUVERTE" })
    .eq("id", id);
  if (error) echec(error);
}

/** Supprime une cohorte. Les candidatures rattachées sont conservées. */
async function supprimerCohorte(id) {
  const { error } = await supabase.from("cohortes").delete().eq("id", id);
  if (error) echec(error);
}

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
