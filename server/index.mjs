/* Le serveur du registre.
 *
 * Il fait deux choses : servir l'application construite, et répondre aux
 * appels `/api`. Rien d'autre — pas de rendu côté serveur, pas de moteur de
 * gabarits, aucune dépendance. `node:http` suffit, et une dépendance de moins
 * est une dépendance qui ne cessera pas d'être maintenue.
 *
 * Ce qui tient la sécurité, et dans quel ordre
 * --------------------------------------------
 * 1. La session est lue au début de chaque requête, depuis un cookie
 *    HttpOnly — donc inaccessible au JavaScript de la page, ce qui met les
 *    sessions hors de portée d'une faille d'injection dans l'interface.
 * 2. Chaque route déclare si elle est publique. Une route qui ne le déclare
 *    pas exige une session : l'oubli penche du bon côté.
 * 3. L'autorisation fine est demandée à `server/autorisations.mjs`, qui lève.
 *    Le serveur n'a qu'à traduire le refus en code HTTP.
 * 4. Les erreurs inattendues ne sortent jamais telles quelles : elles sont
 *    journalisées côté serveur et répondues en « une erreur interne ». Un
 *    message de SQLite renseignerait sur le schéma.
 *
 * Ce que ce serveur ne fait pas, et pourquoi
 * ------------------------------------------
 * Pas de HTTPS : nginx est devant, c'est lui qui termine TLS. Pas de CORS :
 * l'application est servie par ce même serveur, donc même origine — et une
 * absence de CORS est une surface d'attaque en moins.
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, join, normalize, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { ouvrirBase, json as parseJson } from "./db.mjs";
import {
  Refus,
  exigerSession,
  exigerAdministration,
  exigerAutorisation,
  exigerLectureCertificat,
  exigerEcritureCompte,
  exigerCreationCompte,
  exigerDernierAdministrateur,
} from "./autorisations.mjs";
import {
  authentifier,
  ouvrirSession,
  sessionDepuisSecret,
  fermerSession,
  fermerToutesSessions,
  creerJeton,
  consommerJeton,
  definirMotDePasse,
  compteParId,
  compteParEmail,
  verifierMotDePasse,
  menage,
  DUREE_SESSION,
} from "./comptes.mjs";
import { qualiteMotDePasse } from "../src/lib/mot-de-passe.js";
import { estAdmin } from "../src/lib/permissions.js";
import * as R from "./registre.mjs";
import { envoyer } from "./courrier.mjs";

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE_STATIQUE = resolve(process.env.VIZDATA_STATIQUE || join(ICI, "..", "dist"));
const PORT = Number(process.env.PORT || 4321);
const COOKIE = "vz_session";
const CORPS_MAX = 256 * 1024;

const db = ouvrirBase();
const bilanMenage = menage(db);

/* ========================================================================
   Outils HTTP
   ====================================================================== */

const EN_TETES_SECURITE = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
};

function repondre(res, statut, corps, enTetes = {}) {
  const texte = corps === undefined ? "" : JSON.stringify(corps);
  res.writeHead(statut, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(texte),
    "Cache-Control": "no-store",
    ...EN_TETES_SECURITE,
    ...enTetes,
  });
  res.end(texte);
}

/** Lit le corps JSON, borné. Un corps démesuré est refusé avant d'être lu. */
async function corpsJson(req) {
  const annonce = Number(req.headers["content-length"] || 0);
  if (annonce > CORPS_MAX) throw new Refus(413, "Requête trop volumineuse.");

  const morceaux = [];
  let taille = 0;
  for await (const morceau of req) {
    taille += morceau.length;
    if (taille > CORPS_MAX) throw new Refus(413, "Requête trop volumineuse.");
    morceaux.push(morceau);
  }
  if (!taille) return {};

  try {
    const objet = JSON.parse(Buffer.concat(morceaux).toString("utf8"));
    if (objet === null || typeof objet !== "object" || Array.isArray(objet)) {
      throw new Error("objet attendu");
    }
    return objet;
  } catch {
    throw new Refus(400, "Corps de requête illisible.");
  }
}

function lireCookie(req, nom) {
  const brut = req.headers.cookie;
  if (!brut) return null;
  for (const part of brut.split(";")) {
    const [cle, ...reste] = part.trim().split("=");
    if (cle === nom) return decodeURIComponent(reste.join("="));
  }
  return null;
}

/* `SameSite=Lax` plutôt que `None` : le cookie n'est jamais envoyé depuis un
   autre site, ce qui ferme la falsification de requête inter-site sans avoir à
   gérer de jeton anti-CSRF. `Secure` dès que le site est en HTTPS. */
function cookieSession(secret, duree = DUREE_SESSION) {
  const securise = (process.env.VIZDATA_SITE_URL || "").startsWith("https://");
  const parts = [
    `${COOKIE}=${encodeURIComponent(secret)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, duree)}`,
  ];
  if (securise) parts.push("Secure");
  return parts.join("; ");
}

const cookieEfface = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/** Empreinte d'adresse IP, pour la limitation de débit. Jamais l'adresse
 *  elle-même : elle n'a aucune raison d'être conservée en clair. */
function empreinteClient(req) {
  const avance = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const adresse = avance || req.socket.remoteAddress || "inconnu";
  return createHash("sha256").update(adresse).digest("base64url").slice(0, 22);
}

/* --- limitation de débit --------------------------------------------------
   En mémoire, volontairement : le serveur est unique, et une table en base
   pour quelques compteurs coûterait plus qu'elle ne rapporte. Elle protège les
   deux portes qui comptent — la connexion et la demande de réinitialisation —
   contre l'essai en masse de mots de passe. Supabase s'en chargeait ; plus
   personne ne le fait à notre place. */
const tentatives = new Map();

function limiter(cle, { max, fenetre }) {
  const t = Date.now();
  const serie = (tentatives.get(cle) || []).filter((d) => t - d < fenetre);
  serie.push(t);
  tentatives.set(cle, serie);

  /* Ménage opportuniste : sans lui, la table grandirait indéfiniment. */
  if (tentatives.size > 5000) {
    for (const [k, v] of tentatives) if (!v.some((d) => t - d < fenetre)) tentatives.delete(k);
  }

  if (serie.length > max) {
    throw new Refus(429, "Trop de tentatives. Réessayez dans quelques minutes.");
  }
}

/* ========================================================================
   Routes
   ====================================================================== */

const routes = [];
const route = (methode, motif, gestionnaire, options = {}) =>
  routes.push({ methode, motif, gestionnaire, publique: options.publique === true });

/* --- santé ---------------------------------------------------------------- */

route("GET", /^\/api\/sante$/, () => ({ etat: "ok", registre: "sqlite" }), { publique: true });

/* --- chemin public -------------------------------------------------------- */

route(
  "GET",
  /^\/api\/verifier\/([^/]+)$/,
  ({ params, url, req }) => {
    const source = url.searchParams.get("source") || "qr";
    const resultat = R.verifierParJeton(db, decodeURIComponent(params[0]), source, {
      agent: String(req.headers["user-agent"] || "").slice(0, 200),
      empreinteIp: empreinteClient(req),
    });
    if (!resultat) throw new Refus(404, "Ce lien ne correspond à aucun certificat du registre VIZDATA.");
    return resultat;
  },
  { publique: true }
);

route(
  "GET",
  /^\/api\/verifier$/,
  ({ url, req }) => {
    const reference = url.searchParams.get("reference");
    if (!reference) throw new Refus(400, "Référence manquante.");
    /* Une référence se devine bien plus facilement qu'un jeton : on borne. */
    limiter("ref:" + empreinteClient(req), { max: 30, fenetre: 60_000 });

    const resultat = R.verifierParReference(db, reference, {
      agent: String(req.headers["user-agent"] || "").slice(0, 200),
      empreinteIp: empreinteClient(req),
    });
    if (!resultat) throw new Refus(404, "Aucun certificat ne correspond à cette référence.");
    return resultat;
  },
  { publique: true }
);

route("GET", /^\/api\/profil\/([^/]+)$/, ({ params }) => R.profilPublic(db, decodeURIComponent(params[0])), {
  publique: true,
});

route(
  "POST",
  /^\/api\/partage$/,
  async ({ req }) => {
    const { jeton, plateforme } = await corpsJson(req);
    return { enregistre: R.enregistrerPartage(db, jeton, plateforme) };
  },
  { publique: true }
);

/* --- session -------------------------------------------------------------- */

route(
  "POST",
  /^\/api\/session$/,
  async ({ req, res }) => {
    const { email, motDePasse } = await corpsJson(req);

    /* Deux compteurs : par adresse, pour protéger un compte visé ; par client,
       pour empêcher le balayage de nombreuses adresses depuis un même poste. */
    limiter("conn:" + String(email || "").toLowerCase(), { max: 10, fenetre: 15 * 60_000 });
    limiter("conn-ip:" + empreinteClient(req), { max: 40, fenetre: 15 * 60_000 });

    const resultat = authentifier(db, email, motDePasse);
    if (resultat.refus === "desactive") throw new Refus(403, "Ce compte a été désactivé. Contactez VIZDATA.");
    if (resultat.refus) throw new Refus(401, "Adresse e-mail ou mot de passe incorrect.");

    const { secret } = ouvrirSession(db, resultat.compte.id, {
      userAgent: String(req.headers["user-agent"] || "").slice(0, 200),
    });
    res.setHeader("Set-Cookie", cookieSession(secret));
    return resultat.compte;
  },
  { publique: true }
);

route("GET", /^\/api\/session$/, ({ acteur }) => acteur ?? null, { publique: true });

route(
  "DELETE",
  /^\/api\/session$/,
  ({ req, res }) => {
    fermerSession(db, lireCookie(req, COOKIE));
    res.setHeader("Set-Cookie", cookieEfface());
    return { deconnecte: true };
  },
  { publique: true }
);

/* --- mot de passe --------------------------------------------------------- */

route(
  "POST",
  /^\/api\/mot-de-passe\/oubli$/,
  async ({ req }) => {
    const { email } = await corpsJson(req);
    limiter("oubli:" + empreinteClient(req), { max: 5, fenetre: 15 * 60_000 });

    const compte = compteParEmail(db, email);
    if (compte && compte.account_status === "ACTIVE") {
      const { secret } = creerJeton(db, compte.id, "REINITIALISATION");
      await envoyer(db, {
        kind: "REINITIALISATION",
        destinataire: compte.email,
        utilisateurId: compte.id,
        prenom: compte.first_name,
        jeton: secret,
      });
    }

    /* La réponse est la même dans tous les cas. Dire « adresse inconnue »
       permettrait de savoir qui est inscrit au registre en essayant des
       adresses une à une. */
    return { envoye: true };
  },
  { publique: true }
);

route(
  "POST",
  /^\/api\/mot-de-passe\/definir$/,
  async ({ req, res }) => {
    const { jeton, motDePasse } = await corpsJson(req);
    limiter("definir:" + empreinteClient(req), { max: 20, fenetre: 15 * 60_000 });

    const souci = qualiteMotDePasse(motDePasse);
    if (souci) throw new Refus(400, souci);

    const verdict = consommerJeton(db, jeton);
    if (verdict.refus === "expire") {
      throw new Refus(410, "Ce lien a expiré. Les liens ne sont valables qu'un temps, et une seule fois.");
    }
    if (verdict.refus) throw new Refus(410, "Ce lien n'est plus valable. Demandez-en un nouveau.");

    definirMotDePasse(db, verdict.utilisateurId, motDePasse);

    /* On ouvre la session dans la foulée : la personne vient de prouver
       qu'elle a accès à sa messagerie et vient de choisir son mot de passe.
       Lui redemander de se connecter serait une étape pour rien. */
    const { secret } = ouvrirSession(db, verdict.utilisateurId, {
      userAgent: String(req.headers["user-agent"] || "").slice(0, 200),
    });
    res.setHeader("Set-Cookie", cookieSession(secret));
    return compteParId(db, verdict.utilisateurId);
  },
  { publique: true }
);

route("POST", /^\/api\/mot-de-passe\/changer$/, async ({ req, acteur }) => {
  const { ancien, nouveau } = await corpsJson(req);
  const souci = qualiteMotDePasse(nouveau);
  if (souci) throw new Refus(400, souci);
  if (ancien === nouveau) throw new Refus(400, "Le nouveau mot de passe doit être différent de l'ancien.");

  /* L'ancien mot de passe est exigé. Sans ce contrôle, un poste laissé
     déverrouillé suffirait à prendre le compte. */
  const ligne = db.prepare("select password_hash from users where id = ?").get(acteur.id);
  if (!verifierMotDePasse(String(ancien || ""), ligne?.password_hash)) {
    limiter("changer:" + acteur.id, { max: 10, fenetre: 15 * 60_000 });
    throw new Refus(400, "Votre mot de passe actuel est incorrect.");
  }

  definirMotDePasse(db, acteur.id, nouveau, { sauf: req.secretSession });
  return { modifie: true };
});

/* --- espace du titulaire -------------------------------------------------- */

route("GET", /^\/api\/mes-certificats$/, ({ acteur }) => R.certificatsDe(db, acteur.id));

route("PATCH", /^\/api\/moi$/, async ({ req, acteur }) => {
  const champs = await corpsJson(req);
  exigerEcritureCompte(acteur, acteur, champs);
  return R.majCompte(db, acteur, acteur.id, champs);
});

/* --- administration : lecture --------------------------------------------- */

route("GET", /^\/api\/registre$/, ({ acteur }) => {
  exigerAdministration(acteur);
  return R.registreComplet(db, { pourAdmin: estAdmin(acteur) });
});

route("GET", /^\/api\/certificats\/([^/]+)$/, ({ params, acteur }) => {
  const ligne = db.prepare("select * from certificates where id = ?").get(params[0]);
  exigerLectureCertificat(acteur, ligne);
  return ligne;
});

/* --- administration : comptes --------------------------------------------- */

route("POST", /^\/api\/titulaires$/, async ({ req, acteur }) => {
  const { email, first_name, last_name, phone, role } = await corpsJson(req);
  exigerCreationCompte(acteur, role);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) throw new Refus(400, "L'adresse e-mail n'est pas valide.");
  if (!String(first_name || "").trim() || !String(last_name || "").trim()) {
    throw new Refus(400, "Le prénom et le nom sont obligatoires.");
  }

  const resultat = R.creerTitulaire(db, acteur, { email, first_name, last_name, phone, role });
  if (resultat.existe) return { ...resultat, invitation_envoyee: false };

  const { secret } = creerJeton(db, resultat.titulaire.id, "INVITATION");
  const courrier = await envoyer(db, {
    kind: "INVITATION",
    destinataire: resultat.titulaire.email,
    utilisateurId: resultat.titulaire.id,
    prenom: resultat.titulaire.first_name,
    jeton: secret,
  });

  return {
    ...resultat,
    invitation_envoyee: courrier.envoye,
    /* Le lien n'est renvoyé que lorsqu'aucun courrier n'a pu partir, et
       seulement à l'administrateur qui vient de créer le compte : sans cela,
       le titulaire serait bloqué dehors en attendant qu'un fournisseur
       d'envoi soit configuré. */
    lien: courrier.envoye ? null : courrier.lien,
    avertissement: courrier.envoye
      ? null
      : `Le compte est créé mais l'invitation n'a pas pu être envoyée (${courrier.raison}).`,
  };
});

route("PATCH", /^\/api\/comptes\/([^/]+)$/, async ({ params, req, acteur }) => {
  const cible = compteParId(db, params[0]);
  const champs = await corpsJson(req);
  exigerEcritureCompte(acteur, cible, champs);

  /* Retirer ses droits au dernier administrateur actif, ou le désactiver,
     laisserait la plateforme sans gouvernail. */
  const retrograde = champs.role !== undefined && champs.role !== "ADMIN";
  const desactive = champs.account_status === "DISABLED";
  if (cible.role === "ADMIN" && (retrograde || desactive)) exigerDernierAdministrateur(db, cible.id);

  const maj = R.majCompte(db, acteur, cible.id, champs);

  /* Un compte désactivé doit l'être tout de suite, y compris pour les
     sessions déjà ouvertes ailleurs. */
  if (desactive) fermerToutesSessions(db, cible.id);

  if (champs.email && champs.email !== cible.email) {
    await envoyer(db, {
      kind: "PROFIL_MODIFIE",
      destinataire: maj.email,
      utilisateurId: cible.id,
      prenom: maj.first_name,
      detail: "Votre adresse e-mail a été modifiée par l'administration.",
    });
  }
  return maj;
});

route("POST", /^\/api\/comptes\/([^/]+)\/invitation$/, async ({ params, acteur }) => {
  exigerAutorisation(acteur, "creer_titulaires");
  const cible = compteParId(db, params[0]);
  if (!cible) throw new Refus(404, "Compte introuvable.");

  const { secret } = creerJeton(db, cible.id, "INVITATION");
  const courrier = await envoyer(db, {
    kind: "INVITATION",
    destinataire: cible.email,
    utilisateurId: cible.id,
    prenom: cible.first_name,
    jeton: secret,
  });
  return { envoye: courrier.envoye, lien: courrier.envoye ? null : courrier.lien, raison: courrier.raison ?? null };
});

/* --- administration : certificats ----------------------------------------- */

route("POST", /^\/api\/certificats$/, async ({ req, acteur }) => {
  exigerAutorisation(acteur, "attribuer_certificats");
  const { user_id, certificate_type_id, issue_date, duration, trainer, signatory, skills, notifier = true } =
    await corpsJson(req);

  const cree = R.creerCertificat(db, acteur, {
    user_id,
    certificate_type_id,
    issue_date,
    duration,
    trainer,
    signatory,
    skills,
  });

  let courrier = { envoye: false, raison: "Avis non demandé." };
  if (notifier) {
    const vue = db.prepare("select * from v_certificats_publics where id = ?").get(cree.id);
    const titulaire = compteParId(db, user_id);
    courrier = await envoyer(db, {
      kind: "CERTIFICAT_ATTRIBUE",
      destinataire: titulaire.email,
      utilisateurId: titulaire.id,
      prenom: titulaire.first_name,
      certification: vue.certification,
      domaine: vue.domain,
      reference: vue.reference,
    });
  }

  return { certificat: cree, avis_envoye: courrier.envoye };
});

route("PATCH", /^\/api\/certificats\/([^/]+)$/, async ({ params, req, acteur }) => {
  exigerAutorisation(acteur, "attribuer_certificats");
  const { skills, ...champs } = await corpsJson(req);
  return R.majCertificat(db, acteur, params[0], champs, skills);
});

route("POST", /^\/api\/certificats\/([^/]+)\/statut$/, async ({ params, req, acteur }) => {
  const { statut, motif } = await corpsJson(req);
  exigerAutorisation(acteur, statut === "ACTIVE" ? "attribuer_certificats" : "revoquer_certificats");
  if (statut === "REVOKED" && !String(motif || "").trim()) {
    throw new Refus(400, "Le motif est obligatoire pour une révocation : il est affiché publiquement.");
  }
  return R.changerStatutCertificat(db, acteur, params[0], statut, motif);
});

/* --- administration : catalogue ------------------------------------------- */

route("POST", /^\/api\/domaines$/, async ({ req, acteur }) => {
  exigerAdministration(acteur);
  if (!estAdmin(acteur)) throw new Refus(403, "Le catalogue relève de l'administrateur.");
  return R.creerDomaine(db, acteur, await corpsJson(req));
});

route("PATCH", /^\/api\/domaines\/([^/]+)$/, async ({ params, req, acteur }) => {
  if (!estAdmin(acteur)) throw new Refus(403, "Le catalogue relève de l'administrateur.");
  return R.majDomaine(db, acteur, params[0], await corpsJson(req));
});

route("POST", /^\/api\/programmes$/, async ({ req, acteur }) => {
  if (!estAdmin(acteur)) throw new Refus(403, "Le catalogue relève de l'administrateur.");
  return R.creerProgramme(db, acteur, await corpsJson(req));
});

route("PATCH", /^\/api\/programmes\/([^/]+)$/, async ({ params, req, acteur }) => {
  if (!estAdmin(acteur)) throw new Refus(403, "Le catalogue relève de l'administrateur.");
  return R.majProgramme(db, acteur, params[0], await corpsJson(req));
});

/* ========================================================================
   Fichiers statiques
   ====================================================================== */

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

async function servirStatique(res, chemin) {
  /* `normalize` puis vérification du préfixe : sans cela, « ../../etc/passwd »
     sortirait du dossier servi. C'est la faille la plus ancienne du web, et
     elle ne demande qu'un oubli. */
  const demande = normalize(join(RACINE_STATIQUE, decodeURIComponent(chemin)));
  if (!demande.startsWith(RACINE_STATIQUE)) {
    repondre(res, 403, { error: "Chemin refusé." });
    return;
  }

  try {
    const infos = await stat(demande);
    if (infos.isDirectory()) throw new Error("dossier");
    const contenu = await readFile(demande);

    /* Les fichiers de `assets/` portent une empreinte dans leur nom : ils ne
       changent jamais, donc ils se mettent en cache pour longtemps. Le reste
       doit être revalidé, sinon une mise en production n'atteint personne. */
    const versionne = /\/assets\//.test(chemin.replace(/\\/g, "/"));
    res.writeHead(200, {
      "Content-Type": TYPES[extname(demande).toLowerCase()] || "application/octet-stream",
      "Content-Length": contenu.length,
      "Cache-Control": versionne ? "public, max-age=31536000, immutable" : "no-cache",
      ...EN_TETES_SECURITE,
    });
    res.end(contenu);
  } catch {
    /* Repli SPA : tout chemin inconnu rend index.html, faute de quoi
       /verifier/{jeton} — l'adresse imprimée sur les certificats —
       répondrait 404 au rechargement. */
    try {
      const page = await readFile(join(RACINE_STATIQUE, "index.html"));
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": page.length,
        "Cache-Control": "no-cache",
        ...EN_TETES_SECURITE,
      });
      res.end(page);
    } catch {
      repondre(res, 404, {
        error: "Application non construite. Lancez « npm run build », ou servez l'interface avec « npm run dev ».",
      });
    }
  }
}

/* ========================================================================
   Boucle de traitement
   ====================================================================== */

const serveur = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (!url.pathname.startsWith("/api/")) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      repondre(res, 405, { error: "Méthode non autorisée." });
      return;
    }
    await servirStatique(res, url.pathname === "/" ? "/index.html" : url.pathname);
    return;
  }

  const secret = lireCookie(req, COOKIE);
  req.secretSession = secret;
  const acteur = secret ? sessionDepuisSecret(db, secret) : null;

  const trouvee = routes.find((r) => r.methode === req.method && r.motif.test(url.pathname));
  if (!trouvee) {
    /* Si le chemin existe mais pas avec cette méthode, le dire : « route
       inconnue » enverrait chercher une faute d'adresse là où il n'y en a pas.
       La table des routes n'est pas un secret — elle est dans le paquet
       servi au navigateur. */
    const methodes = routes.filter((r) => r.motif.test(url.pathname)).map((r) => r.methode);
    if (methodes.length) {
      repondre(res, 405, { error: `Méthode non autorisée. Utilisez ${methodes.join(" ou ")}.` }, { Allow: methodes.join(", ") });
      return;
    }
    repondre(res, 404, { error: "Route inconnue." });
    return;
  }

  try {
    /* Une route qui ne se déclare pas publique exige une session : l'oubli
       penche du bon côté. */
    if (!trouvee.publique) exigerSession(acteur);

    const params = url.pathname.match(trouvee.motif).slice(1);
    const resultat = await trouvee.gestionnaire({ req, res, url, params, acteur });
    repondre(res, resultat === undefined ? 204 : 200, resultat);
  } catch (e) {
    if (e instanceof Refus) {
      repondre(res, e.statut, { error: e.message });
      return;
    }
    /* Les contraintes de la base portent des messages clairs pour nous, et
       révélateurs pour un attaquant : on garde le détail côté serveur. */
    console.error(`[${new Date().toISOString()}] ${req.method} ${url.pathname} —`, e.message);
    if (/UNIQUE constraint/i.test(e.message)) {
      repondre(res, 409, { error: "Cette valeur existe déjà dans le registre." });
      return;
    }
    if (/CHECK constraint|FOREIGN KEY|NOT NULL/i.test(e.message)) {
      repondre(res, 400, { error: "Les données envoyées ne sont pas valides." });
      return;
    }
    repondre(res, 500, { error: "Une erreur interne est survenue." });
  }
});

serveur.listen(PORT, () => {
  /* Le port effectif, pas celui demandé : avec PORT=0 le système en choisit
     un, et c'est ainsi que les tests démarrent le serveur sans risquer de
     tomber sur un port déjà pris. */
  const port = serveur.address().port;
  console.log(`\n  VIZDATA CERTIFY — registre`);
  console.log(`  Base      : ${process.env.VIZDATA_DB || "data/certify.db"}`);
  console.log(`  Interface : ${RACINE_STATIQUE}`);
  console.log(`  Écoute    : http://localhost:${port}`);
  if (bilanMenage.sessions || bilanMenage.jetons) {
    console.log(`  Ménage    : ${bilanMenage.sessions} session(s) et ${bilanMenage.jetons} jeton(s) périmés retirés`);
  }
  if (!process.env.RESEND_API_KEY) {
    console.log(`  Courrier  : aucun fournisseur configuré — les liens sont imprimés ici`);
  }
  console.log("");
});

/* Fermer proprement : SQLite doit replier son journal WAL, sinon le fichier
   reste accompagné d'un .db-wal que la prochaine ouverture devra rejouer. */
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    serveur.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

export { serveur, db };
