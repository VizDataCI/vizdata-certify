/* Routage par URL réelle.

   Jusqu'ici le routage vivait dans un état React : l'adresse du navigateur ne
   changeait jamais. Pour un registre public c'est rédhibitoire — le QR code
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
};

/** Chemin correspondant à une route. */
function toPath(route) {
  switch (route.view) {
    case "verifyResult":
      return route.token ? `/verifier/${encodeURIComponent(route.token)}` : CHEMINS.verify;
    case "publicProfile":
      return `/u/${encodeURIComponent(route.username || "")}`;
    default:
      return CHEMINS[route.view] || "/";
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
