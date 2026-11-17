/* Le client du registre.
 *
 * Tout ce que l'application demande au serveur passe par `demander`. C'est
 * peu de code, et c'est voulu : l'intérêt d'avoir écrit le serveur soi-même
 * est que le client n'a plus rien à faire de compliqué.
 *
 * Ce qui a disparu en route, et qui vaut d'être noté
 * -------------------------------------------------
 * LE PAQUET LIVRÉ AU NAVIGATEUR NE CONTIENT PLUS AUCUNE CLÉ. Avec Supabase, il
 * fallait y embarquer la clé publiable, et tout un garde-fou de construction
 * existait pour éviter qu'une clé secrète s'y glisse par mégarde. Désormais le
 * navigateur ne porte aucun secret : la session est un cookie HttpOnly qu'il
 * ne peut même pas lire, et les identifiants du registre ne quittent jamais le
 * serveur. Une catégorie entière d'accidents n'est plus possible.
 *
 * Le SDK Supabase — environ 200 ko — disparaît aussi du paquet.
 */

/* Mode démonstration : le registre vit dans le navigateur, aucun serveur n'est
   contacté. Déclenché explicitement par `npm run demo`, jamais par défaut :
   une absence de configuration ne doit pas faire basculer un site en ligne
   dans un mode où la connexion accepte n'importe quel mot de passe. */
const modeDemo = import.meta.env.VITE_MODE_DEMO === "1";

/** Vrai lorsque l'application parle au vrai registre. */
const registreDistant = !modeDemo;

/* Compatibilité de nom : les écrans écrits du temps de Supabase lisent
   `isAuthConfigured`. La chose est la même — « y a-t-il un vrai registre
   derrière ? » — et renommer partout n'apporterait rien aujourd'hui. */
const isAuthConfigured = registreDistant;

/** Erreur portant le code HTTP, pour que l'appelant puisse distinguer les cas. */
class ErreurRegistre extends Error {
  constructor(statut, message) {
    super(message);
    this.name = "ErreurRegistre";
    this.statut = statut;
  }
}

/**
 * Appelle le registre.
 *
 * `credentials: "same-origin"` est indispensable : sans lui, le navigateur
 * n'envoie pas le cookie de session, et toutes les routes authentifiées
 * répondraient 401 sans que rien ne l'explique.
 */
async function demander(chemin, { methode = "GET", corps, signal } = {}) {
  if (!registreDistant) throw new ErreurRegistre(0, "Le registre distant n'est pas configuré.");

  let reponse;
  try {
    reponse = await fetch(`/api${chemin}`, {
      method: methode,
      credentials: "same-origin",
      headers: corps === undefined ? undefined : { "Content-Type": "application/json" },
      body: corps === undefined ? undefined : JSON.stringify(corps),
      signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    /* Serveur arrêté, réseau coupé, coupure de courant au Plateau : le message
       doit dire ce qui se passe, pas « Failed to fetch ». */
    throw new ErreurRegistre(0, "Registre injoignable. Vérifiez votre connexion.");
  }

  if (reponse.status === 204) return null;

  const texte = await reponse.text();
  let donnees = null;
  if (texte) {
    try {
      donnees = JSON.parse(texte);
    } catch {
      throw new ErreurRegistre(reponse.status, "Le registre a répondu quelque chose d'illisible.");
    }
  }

  if (!reponse.ok) {
    throw new ErreurRegistre(reponse.status, donnees?.error || `Le registre a refusé la demande (${reponse.status}).`);
  }

  return donnees;
}

const lire = (chemin, options) => demander(chemin, options);
const poster = (chemin, corps) => demander(chemin, { methode: "POST", corps });
const modifier = (chemin, corps) => demander(chemin, { methode: "PATCH", corps });
const supprimer = (chemin) => demander(chemin, { methode: "DELETE" });

export { demander, lire, poster, modifier, supprimer, registreDistant, isAuthConfigured, modeDemo, ErreurRegistre };
