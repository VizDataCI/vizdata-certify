/* Règles du mot de passe et lecture des liens de récupération.
 *
 * Isolées du module d'authentification pour une raison précise : `auth.js`
 * importe le client Supabase, qui lit `import.meta.env`. Ce module serait donc
 * inexécutable hors d'un navigateur, et ces deux règles — les seules de toute
 * la chaîne de réinitialisation qui ne dépendent d'aucun réseau — ne pourraient
 * pas être éprouvées autrement qu'à la main.
 *
 * Or ce sont elles qui ont fait défaut : un lien expiré affichait « une erreur
 * est survenue », et rien ne disait qu'il fallait en redemander un.
 */

/**
 * Message d'exigence si le mot de passe ne convient pas ; chaîne vide sinon.
 *
 * Huit caractères, une lettre, un chiffre. Volontairement modeste : Supabase
 * impose six caractères par défaut, et des règles plus sévères poussent les
 * gens à écrire leur mot de passe sur un papier. Ce qui protège vraiment, c'est
 * que le mot de passe soit choisi par le titulaire — jamais transmis par
 * courrier, jamais provisoire.
 */
function qualiteMotDePasse(mdp) {
  const v = mdp || "";
  if (v.length < 8) return "Le mot de passe doit comporter au moins huit caractères.";
  if (!/[a-zA-Z]/.test(v)) return "Le mot de passe doit comporter au moins une lettre.";
  if (!/[0-9]/.test(v)) return "Le mot de passe doit comporter au moins un chiffre.";
  return "";
}

/**
 * Ce que Supabase a laissé dans l'adresse en revenant d'un lien.
 *
 *   succès : #access_token=…&type=recovery, consommé par le SDK lorsque
 *            detectSessionInUrl est actif ; ou ?code=… en flux PKCE.
 *   refus  : #error=access_denied&error_code=otp_expired&error_description=…
 *
 * Le refus doit être lu AVANT que le SDK n'efface le fragment, et il doit être
 * dit pour ce qu'il est : « demandez un nouveau lien », et non « une erreur est
 * survenue ». Les deux emplacements sont examinés — fragment et chaîne de
 * requête — parce que Supabase a utilisé l'un puis l'autre selon les versions
 * et le flux.
 *
 * @returns {{etat: "accepte"|"refuse"|"aucun", expire?: boolean, message?: string, type?: string}}
 */
function etatLienRecuperation(href) {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  const requete = url.searchParams;
  const lire = (cle) => fragment.get(cle) || requete.get(cle);

  const codeErreur = lire("error_code");
  const erreur = lire("error");

  if (codeErreur || erreur) {
    const expire = /expired/i.test(codeErreur || "");
    return {
      etat: "refuse",
      expire,
      message: expire
        ? "Ce lien a expiré. Les liens de réinitialisation ne sont valables qu'une heure, et une seule fois."
        : (lire("error_description") || "Ce lien n'est pas valable.").replace(/\+/g, " "),
    };
  }

  const jeton = lire("access_token") || requete.get("code");
  if (jeton) return { etat: "accepte", type: lire("type") || "recovery" };

  return { etat: "aucun" };
}

export { qualiteMotDePasse, etatLienRecuperation };
