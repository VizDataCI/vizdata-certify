/* Analyse d'une clé Supabase.
 *
 * Isolé du garde-fou de construction pour être testable : ce sont ces règles
 * qui décident si un paquet part en production, elles ne peuvent pas être
 * vérifiées seulement à l'usage.
 */

/** Décode la charge utile d'un JWT. Aucun secret requis : elle est en clair. */
function chargeUtile(jeton) {
  try {
    return JSON.parse(Buffer.from(jeton.split(".")[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Décrit une clé : son format, le rôle qu'elle porte, et le danger éventuel.
 * @returns {{format: string, role: string|null, danger: string|null}}
 */
function analyserCle(valeur) {
  const cle = (valeur || "").trim();

  if (!cle) return { format: "absente", role: null, danger: "Clé absente." };

  if (cle.startsWith("sb_secret_")) {
    return {
      format: "secrète",
      role: "service_role",
      danger:
        "Cette clé est SECRÈTE. Exposée dans un paquet navigateur, elle contourne toutes les politiques RLS : n'importe qui pourrait lire et modifier le registre entier.",
    };
  }

  if (cle.startsWith("sb_publishable_")) {
    return {
      format: "publiable",
      role: "anon",
      danger:
        cle.length < 30
          ? `Clé publiable anormalement courte (${cle.length} caractères) : le collage a probablement été tronqué.`
          : null,
    };
  }

  if (cle.startsWith("eyJ") && cle.split(".").length === 3) {
    const charge = chargeUtile(cle);
    const role = charge?.role || null;
    if (role === "service_role") {
      return {
        format: "legacy",
        role,
        danger:
          "Cette clé porte le rôle service_role. Exposée dans un paquet navigateur, elle contourne toutes les politiques RLS.",
      };
    }
    if (role === "anon") return { format: "legacy", role, danger: null };
    return { format: "legacy", role, danger: `Rôle inattendu dans le jeton : ${role || "aucun"}.` };
  }

  return {
    format: "inconnu",
    role: null,
    danger: `Format non reconnu (${cle.length} caractère${cle.length > 1 ? "s" : ""}). Une clé publiable commence par « sb_publishable_ ».`,
  };
}

/**
 * Interroge le projet pour savoir si la clé est acceptée.
 *
 * On demande une table volontairement inexistante. Le choix n'est pas
 * arbitraire : la racine /rest/v1/ exige une clé secrète et refuserait une clé
 * publiable parfaitement valide, tandis qu'une vraie table lierait ce contrôle
 * au schéma du moment. Une table inconnue, elle, sépare nettement les deux cas :
 *
 *   clé valide   → 404, « Could not find the table … »
 *   clé invalide → 401, « Invalid API key »
 *
 * @returns {Promise<{joignable: boolean, acceptee: boolean, detail: string}>}
 */
async function eprouverCle(url, cle) {
  /* Minuteur explicite plutôt qu'AbortSignal.timeout : ce dernier reste armé
     après la réponse, et un process.exit() sur un minuteur actif déclenche une
     assertion libuv sous Windows. */
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), 10000);

  try {
    const reponse = await fetch(`${url.replace(/\/$/, "")}/rest/v1/__controle_de_cle?limit=1`, {
      headers: { apikey: cle, Authorization: `Bearer ${cle}` },
      signal: controleur.signal,
    });
    const corps = await reponse.text();

    if (corps.includes("Invalid API key")) {
      return { joignable: true, acceptee: false, detail: "Invalid API key" };
    }
    if (reponse.status === 401 || reponse.status === 403) {
      return { joignable: true, acceptee: false, detail: `HTTP ${reponse.status}` };
    }
    return { joignable: true, acceptee: true, detail: `HTTP ${reponse.status}` };
  } catch (e) {
    /* Réseau indisponible : on ne bloque pas la construction pour autant. */
    return { joignable: false, acceptee: false, detail: e.message };
  } finally {
    clearTimeout(minuteur);
  }
}

export { analyserCle, eprouverCle };
