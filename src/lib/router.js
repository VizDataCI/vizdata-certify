/* Routage par URL réelle.

   Jusqu'ici le routage vivait dans un état React : l'adresse du navigateur ne
   changeait jamais. Pour un registre public c'est rédhibitoire : le QR code
   imprimé sur un certificat pointe vers /verifier/{jeton}, et ce lien doit
   ouvrir la bonne page, être copiable, et survivre à un rechargement.

   Les chemins sont en français : ils sont lus par des titulaires et des
   employeurs, pas par des développeurs. */

const CHEMINS = {
  home: "/",
  verify: "/verifier",
  about: "/a-propos",
  login: "/connexion",
  dashboard: "/espace",
  admin: "/administration",
  /* Page de vente de l'académie. L'adresse est publique et partagée dans des
     publicités : elle doit rester lisible et stable : jamais /page-de-vente,
     jamais un paramètre de campagne dans le chemin. */
  academie: "/academie",
  /* Les deux temps de la réinitialisation. Ils sont séparés parce qu'ils ne
     répondent pas à la même question : le premier demande « quelle adresse ? »,
     le second « quel nouveau mot de passe ? ». Le second est aussi l'adresse
     de retour des liens envoyés par Supabase : invitation comme
     réinitialisation , donc elle doit figurer telle quelle dans les URL de
     redirection autorisées du projet. */
  forgotPassword: "/mot-de-passe-oublie",
  newPassword: "/nouveau-mot-de-passe",
};

/** Chemin correspondant à une route. */
function toPath(route) {
  switch (route.view) {
    case "verifyResult":
      return route.token ? `/verifier/${encodeURIComponent(route.token)}` : CHEMINS.verify;
    case "publicProfile":
      return `/u/${encodeURIComponent(route.username || "")}`;
    default: {
      const chemin = CHEMINS[route.view];
      /* Une vue inconnue retombait sur l'accueil SANS RIEN DIRE. Un bouton qui
         ramène à la page d'accueil se lit comme une page cassée, jamais comme
         une faute de frappe dans un nom de vue : c'est exactement ce qui est
         arrivé à « Ma sécurité », écrit « espace » au lieu de « dashboard ».
         Le repli reste, parce qu'un visiteur ne doit pas tomber sur un écran
         blanc ; mais en développement, il parle. */
      if (!chemin && import.meta.env?.DEV) {
        console.warn(`[routeur] vue inconnue « ${route.view} » : repli sur l'accueil.`);
      }
      return chemin || "/";
    }
  }
}

/** Route correspondant à un chemin. */
function toRoute(pathname) {
  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);

  if (segments.length === 0) return { view: "home" };

  const [premier, second] = segments;

  if (premier === "verifier") {
    /* Une arrivée directe sur un jeton vient d'un lien ou d'un QR code : la
       source est renseignée en conséquence, c'est elle qui alimente les
       statistiques de consultation. */
    return second ? { view: "verifyResult", token: second, source: "lien" } : { view: "verify" };
  }

  if (premier === "u" && second) return { view: "publicProfile", username: second };

  const vue = Object.keys(CHEMINS).find((v) => CHEMINS[v] === `/${premier}`);
  if (vue && segments.length === 1) return vue === "admin" ? { view: "admin", page: "dashboard" } : { view: vue };

  return { view: "notFound", path: pathname };
}

/** Route de la page en cours. */
function currentRoute() {
  return toRoute(window.location.pathname);
}

/** Empile une route dans l'historique, sauf si l'adresse ne change pas. */
function pushRoute(route) {
  const chemin = toPath(route);
  if (chemin !== window.location.pathname) window.history.pushState({}, "", chemin);
}

/** S'abonne aux retours arrière du navigateur. Renvoie le désabonnement. */
function onNavigate(callback) {
  const handler = () => callback(currentRoute());
  window.addEventListener("popstate", handler);
  return () => window.removeEventListener("popstate", handler);
}

export { toPath, toRoute, currentRoute, pushRoute, onNavigate };
