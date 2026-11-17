/* Règles du mot de passe, et lecture du lien reçu par courrier.
 *
 * Isolées du reste pour être éprouvables hors d'un navigateur : ce sont les
 * seules règles de toute la chaîne de réinitialisation qui ne dépendent ni du
 * réseau ni du DOM. Le serveur importe le même module, de sorte que l'écran et
 * le registre exigent exactement la même chose d'un mot de passe — et qu'il
 * est impossible qu'ils divergent.
 *
 * Depuis le passage à notre propre registre, le lien a une forme simple :
 *
 *     /nouveau-mot-de-passe?jeton=<secret>
 *
 * Supabase y mettait un fragment `#access_token=…&type=recovery`, consommé par
 * son SDK, et signalait ses refus par `#error_code=otp_expired`. Il fallait
 * lire tout cela avant que le SDK n'efface l'adresse, et distinguer quatre
 * états dont trois venaient de l'URL. Ici, l'URL ne porte qu'un secret : le
 * verdict appartient au serveur, qui est le seul à pouvoir le rendre.
 */

/**
 * Message d'exigence si le mot de passe ne convient pas ; chaîne vide sinon.
 *
 * Huit caractères, une lettre, un chiffre. Volontairement modeste : des règles
 * plus sévères poussent les gens à écrire leur mot de passe sur un papier. Ce
 * qui protège vraiment, c'est qu'il soit choisi par son titulaire — jamais
 * transmis par courrier, jamais provisoire.
 */
function qualiteMotDePasse(mdp) {
  const v = mdp || "";
  if (v.length < 8) return "Le mot de passe doit comporter au moins huit caractères.";
  if (!/[a-zA-Z]/.test(v)) return "Le mot de passe doit comporter au moins une lettre.";
  if (!/[0-9]/.test(v)) return "Le mot de passe doit comporter au moins un chiffre.";
  return "";
}

/**
 * Le secret porté par l'adresse, ou null.
 *
 * Il est aussi cherché dans le fragment : certains clients de messagerie et
 * certaines passerelles réécrivent les liens, et un fragment survit là où une
 * chaîne de requête est parfois tronquée. Le lire aux deux endroits ne coûte
 * rien et évite un « lien invalide » inexplicable.
 */
function jetonDansAdresse(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const requete = url.searchParams.get("jeton");
  if (requete) return requete;

  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  return fragment.get("jeton") || null;
}

/**
 * Retire le secret de l'adresse affichée, sans recharger la page.
 *
 * Un jeton qui reste dans la barre d'adresse part dans l'historique du
 * navigateur, dans le titre d'une capture d'écran, et dans l'en-tête
 * `Referer` de la première requête vers un site tiers. Il n'a plus d'usage une
 * fois lu : on l'efface.
 */
function effacerJetonDeLAdresse(historique = globalThis.history, emplacement = globalThis.location) {
  if (!historique?.replaceState || !emplacement) return;
  try {
    const url = new URL(emplacement.href);
    if (!url.searchParams.has("jeton") && !url.hash.includes("jeton")) return;
    url.searchParams.delete("jeton");
    url.hash = "";
    historique.replaceState({}, "", url.pathname + url.search);
  } catch {
    /* Adresse illisible : rien à nettoyer. */
  }
}

export { qualiteMotDePasse, jetonDansAdresse, effacerJetonDeLAdresse };
