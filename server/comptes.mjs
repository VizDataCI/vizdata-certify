/* Mots de passe, sessions et liens à usage unique.
 *
 * Tout ce que Supabase faisait pour nous et qu'il faut désormais faire
 * correctement soi-même. Les quatre décisions qui comptent sont écrites ici,
 * avec leurs raisons — c'est le genre de code qu'on relit deux ans plus tard
 * sans se souvenir pourquoi il est ainsi.
 *
 * 1. SCRYPT, PAS UN HACHAGE RAPIDE. SHA-256 sur un mot de passe se casse à des
 *    milliards d'essais par seconde sur une carte graphique. scrypt est lent
 *    *et* gourmand en mémoire, ce qui rend l'attaque matérielle coûteuse. Il
 *    est livré avec Node ; aucune dépendance à surveiller.
 *
 * 2. UN SEL PAR MOT DE PASSE. Sans sel, deux personnes ayant le même mot de
 *    passe ont la même empreinte, et une table précalculée les casse toutes
 *    les deux d'un coup.
 *
 * 3. LES PARAMÈTRES SONT STOCKÉS AVEC L'EMPREINTE. Le coût de calcul devra
 *    être relevé dans quelques années. En l'inscrivant dans chaque empreinte,
 *    les anciens mots de passe restent vérifiables pendant que les nouveaux
 *    sont plus chers — sans quoi relever le coût invaliderait tous les comptes.
 *
 * 4. ON NE STOCKE JAMAIS UN JETON, SEULEMENT SON EMPREINTE. Ni pour les
 *    sessions, ni pour les liens de réinitialisation. Le fichier de base est
 *    copié pour les sauvegardes : s'il contenait des jetons utilisables, toute
 *    sauvegarde égarée donnerait accès aux comptes.
 */

import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { uid, maintenant, dans, json } from "./db.mjs";

/* --- mots de passe -------------------------------------------------------- */

/* N = 2^15 : environ 33 Mo de mémoire et un dixième de seconde par calcul sur
   une machine ordinaire. Assez pour qu'une attaque par force brute coûte
   cher, assez peu pour qu'une connexion reste instantanée. */
const SCRYPT = { N: 32768, r: 8, p: 1, longueur: 32, maxmem: 96 * 1024 * 1024 };

/** Empreinte d'un mot de passe, au format `scrypt$N$r$p$sel$empreinte`. */
function hacherMotDePasse(motDePasse, parametres = SCRYPT) {
  const { N, r, p, longueur, maxmem } = parametres;
  const sel = randomBytes(16);
  const empreinte = scryptSync(motDePasse, sel, longueur, { N, r, p, maxmem });
  return ["scrypt", N, r, p, sel.toString("base64url"), empreinte.toString("base64url")].join("$");
}

/**
 * Vérifie un mot de passe contre son empreinte.
 *
 * La comparaison est à temps constant : comparer deux empreintes avec `===`
 * s'arrête au premier octet différent, et la durée de la réponse renseigne
 * alors sur le nombre d'octets corrects. L'attaque est réelle, et l'éviter ne
 * coûte rien.
 */
function verifierMotDePasse(motDePasse, stocke) {
  if (!stocke || typeof stocke !== "string") return false;

  const parts = stocke.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, N, r, p, selB64, empreinteB64] = parts;
  let attendue;
  let calculee;
  try {
    attendue = Buffer.from(empreinteB64, "base64url");
    calculee = scryptSync(motDePasse, Buffer.from(selB64, "base64url"), attendue.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      maxmem: SCRYPT.maxmem,
    });
  } catch {
    /* Paramètres illisibles ou hors limites : l'empreinte est inexploitable,
       donc le mot de passe est refusé — jamais accepté par défaut. */
    return false;
  }

  if (attendue.length !== calculee.length) return false;
  return timingSafeEqual(attendue, calculee);
}

/** Exigences minimales. La même règle que l'interface, importée d'elle. */
export { qualiteMotDePasse } from "../src/lib/mot-de-passe.js";

/* --- jetons --------------------------------------------------------------- */

/** Secret aléatoire de 256 bits, transportable dans une URL ou un cookie. */
const nouveauSecret = () => randomBytes(32).toString("base64url");

/** Empreinte d'un jeton. SHA-256 suffit ici : un secret de 256 bits tirés au
 *  hasard n'a pas de faible entropie à protéger, contrairement à un mot de
 *  passe choisi par un humain. */
const empreinteJeton = (jeton) => createHash("sha256").update(jeton).digest("base64url");

/* --- sessions ------------------------------------------------------------- */

const DUREE_SESSION = 30 * 24 * 3600; // trente jours

/**
 * Combien de temps une session vit, selon ce qu'elle ouvre.
 *
 * Toutes duraient trente jours, de l'administrateur qui tient le registre
 * entier au titulaire qui vient voir son diplôme deux fois par an. C'est le
 * compte le plus puissant qui restait ouvert le plus longtemps : un cookie
 * dérobé sur un poste partagé — et le poste est souvent partagé — donnait un
 * mois d'accès à tout le registre.
 *
 * `vie` est la durée absolue : passée celle-ci la session tombe, même
 * utilisée toutes les heures. `repos` coupe une session LAISSÉE ouverte :
 * elle ne gêne pas celui qui travaille, elle ferme la porte derrière celui qui
 * est parti. Un titulaire n'a pas de coupure d'inactivité — il visite
 * rarement, et son espace ne montre que ses propres certificats.
 */
/** Inactivité tolérée avant déconnexion, et préavis donné à l'écran. */
const INACTIVITE = 600;          // dix minutes
const INACTIVITE_PREAVIS = 120;  // les deux dernières, annoncées

/**
 * La marge que le serveur laisse au-delà des dix minutes.
 *
 * C'est l'écran qui déconnecte, parce que lui seul sait qu'on lit une page
 * sans rien demander au serveur. Le serveur coupe un peu après, en filet :
 * sans cette marge, il tomberait pendant que l'écran affiche son préavis, et
 * le compte à rebours mentirait.
 */
const INACTIVITE_GRACE = 120;

const DUREES = {
  ADMIN: { vie: 7 * 24 * 3600, repos: INACTIVITE + INACTIVITE_GRACE },
  MANAGER: { vie: 7 * 24 * 3600, repos: INACTIVITE + INACTIVITE_GRACE },
  CERTIFIED: { vie: 30 * 24 * 3600, repos: INACTIVITE + INACTIVITE_GRACE },
};

/* --- tentatives de connexion -----------------------------------------------
   Cinq échecs ferment le compte pour un quart d'heure. Avant d'en arriver là,
   chaque échec impose une attente qui s'allonge : une seconde, deux, cinq,
   quinze. C'est ce qui rend l'essai en masse sans intérêt, et c'est presque
   indolore pour qui s'est trompé de touche — la première faute ne coûte rien.

   L'attente est RENDUE, pas dormie : faire patienter le serveur occuperait un
   processus pendant que l'attaquant, lui, n'attend rien. */
const ECHECS_MAX = 5;
const BLOCAGE = 900;             // un quart d'heure
const DELAIS = [0, 1, 2, 5, 15]; // par nombre d'échecs déjà commis

/**
 * Combien de secondes ce compte doit encore attendre, et pourquoi.
 *
 * Rend null quand la porte est ouverte. Le compteur se périme de lui-même :
 * un quart d'heure sans la moindre tentative et l'ardoise est effacée, sans
 * quoi cinq fautes de frappe étalées sur un mois finiraient par bloquer
 * quelqu'un qui n'a rien fait de mal.
 */
function attenteAvantEssai(ligne) {
  if (!ligne) return null;
  const echecs = ligne.failed_attempts || 0;
  if (echecs === 0) return null;

  const depuis = Date.parse(ligne.last_failed_at || "") || 0;
  const ecoule = Math.floor((Date.now() - depuis) / 1000);

  if (echecs >= ECHECS_MAX) {
    /* Le blocage court depuis le DERNIER échec : s'acharner le prolonge, ce
       qui est exactement le but. */
    return ecoule < BLOCAGE ? { motif: "blocage", secondes: BLOCAGE - ecoule } : null;
  }

  const delai = DELAIS[echecs] ?? DELAIS[DELAIS.length - 1];
  return ecoule < delai ? { motif: "delai", secondes: delai - ecoule } : null;
}

/** Durées applicables à un rôle. Un rôle inconnu est traité au plus strict. */
const dureesDe = (role) => DUREES[role] || DUREES.ADMIN;

/**
 * Ouvre une session et renvoie le secret à poser dans le cookie.
 *
 * Le secret n'est renvoyé qu'ici, une seule fois : la base n'en garde que
 * l'empreinte, et il est donc impossible de le retrouver ensuite — y compris
 * pour nous.
 */
function ouvrirSession(db, utilisateurId, { userAgent = null, duree = null } = {}) {
  const compte = db.prepare("select role, failed_attempts from users where id = ?").get(utilisateurId);
  const vie = duree ?? dureesDe(compte?.role).vie;

  const secret = nouveauSecret();
  db.prepare(
    `insert into sessions (id, token_hash, user_id, expires_at, user_agent)
     values (?, ?, ?, ?, ?)`
  ).run(uid(), empreinteJeton(secret), utilisateurId, dans(vie), userAgent);

  /* Le compteur d'échecs est relevé AVANT d'être remis à zéro : c'est ce
     chiffre qu'on annonce à celui qui entre. */
  const echecs = compte?.failed_attempts ?? 0;
  db.prepare("update users set last_login_at = ?, failed_attempts = 0 where id = ?")
    .run(maintenant(), utilisateurId);
  return { secret, expire: dans(vie), echecs };
}

/**
 * Compte associé à un cookie de session, ou null.
 *
 * Les sessions expirées sont écartées à la lecture plutôt que par une tâche
 * de ménage : une session périmée ne doit pas ouvrir de porte, même si
 * personne n'est passé la supprimer.
 */
function sessionDepuisSecret(db, secret) {
  if (!secret) return null;

  const ligne = db
    .prepare(
      `select s.id as session_id, s.expires_at, s.last_seen as session_vue, u.*
         from sessions s
         join users u on u.id = s.user_id
        where s.token_hash = ?`
    )
    .get(empreinteJeton(secret));

  if (!ligne) return null;

  /* Deux motifs de refus, et la session est supprimée dans les deux cas : un
     cookie qui ne vaut plus rien ne doit pas rester une ligne en base. */
  const { repos } = dureesDe(ligne.role);
  const abandonnee = repos > 0 && String(ligne.session_vue || "") < dans(-repos);

  if (ligne.expires_at <= maintenant() || abandonnee) {
    db.prepare("delete from sessions where id = ?").run(ligne.session_id);
    return null;
  }

  db.prepare("update sessions set last_seen = ? where id = ?").run(maintenant(), ligne.session_id);
  return normaliserCompte(ligne);
}

function fermerSession(db, secret) {
  if (!secret) return 0;
  return db.prepare("delete from sessions where token_hash = ?").run(empreinteJeton(secret)).changes;
}

/** Ferme toutes les sessions d'un compte. Après un changement de mot de passe,
 *  ou une désactivation : sinon la session déjà ouverte survit à la mesure. */
function fermerToutesSessions(db, utilisateurId, { sauf = null } = {}) {
  if (sauf) {
    return db
      .prepare("delete from sessions where user_id = ? and token_hash <> ?")
      .run(utilisateurId, empreinteJeton(sauf)).changes;
  }
  return db.prepare("delete from sessions where user_id = ?").run(utilisateurId).changes;
}

/** Supprime les sessions et les jetons périmés. À appeler au démarrage. */
function menage(db) {
  const t = maintenant();
  const sessions = db.prepare("delete from sessions where expires_at <= ?").run(t).changes;
  const jetons = db.prepare("delete from jetons where expires_at <= ? or used_at is not null").run(t).changes;
  return { sessions, jetons };
}

/* --- liens à usage unique ------------------------------------------------- */

const DUREE_INVITATION = 7 * 24 * 3600; // sept jours
const DUREE_REINITIALISATION = 3600; // une heure

/**
 * Crée un lien et renvoie son secret.
 *
 * Les jetons antérieurs du même genre sont supprimés : demander un second lien
 * doit invalider le premier, sans quoi deux liens valides circulent et le plus
 * ancien — potentiellement lu par quelqu'un d'autre — reste utilisable.
 */
function creerJeton(db, utilisateurId, kind) {
  const duree = kind === "INVITATION" ? DUREE_INVITATION : DUREE_REINITIALISATION;
  db.prepare("delete from jetons where user_id = ? and kind = ?").run(utilisateurId, kind);

  const secret = nouveauSecret();
  db.prepare(
    `insert into jetons (id, token_hash, user_id, kind, expires_at) values (?, ?, ?, ?, ?)`
  ).run(uid(), empreinteJeton(secret), utilisateurId, kind, dans(duree));

  return { secret, expire: dans(duree) };
}

/**
 * Consomme un lien. Renvoie `{ utilisateurId, kind }`, ou un motif de refus.
 *
 * La consommation est définitive : un lien de réinitialisation qui resterait
 * valable après usage traînerait indéfiniment dans une boîte de réception.
 */
function consommerJeton(db, secret, kind = null) {
  if (!secret) return { refus: "absent" };

  const ligne = db.prepare("select * from jetons where token_hash = ?").get(empreinteJeton(secret));
  if (!ligne) return { refus: "inconnu" };
  if (kind && ligne.kind !== kind) return { refus: "inconnu" };
  if (ligne.used_at) return { refus: "deja_utilise" };
  if (ligne.expires_at <= maintenant()) return { refus: "expire" };

  db.prepare("update jetons set used_at = ? where id = ?").run(maintenant(), ligne.id);
  return { utilisateurId: ligne.user_id, kind: ligne.kind };
}

/* --- lecture d'un compte -------------------------------------------------- */

/** Ligne de la table `users` vers l'objet que manipule le reste du serveur.
 *  Le mot de passe n'en fait jamais partie : il ne doit pas pouvoir être
 *  renvoyé par mégarde dans une réponse JSON. */
function normaliserCompte(ligne) {
  if (!ligne) return null;
  /* Déstructuration pour RETIRER : les quatre champs nommés ici sont extraits
     afin de ne pas se retrouver dans `reste`, donc dans la réponse JSON. Le
     souligné dit qu'ils ne sont pas destinés à être lus. */
  const {
    password_hash: _empreinte,
    session_id: _session,
    expires_at: _expiration,
    session_vue: _vue,
    token_hash: _jeton,
    ...reste
  } = ligne;
  return {
    ...reste,
    public_profile: ligne.public_profile === 1,
    must_change_password: ligne.must_change_password === 1,
    permissions: json(ligne.permissions, {}),
    a_un_mot_de_passe: Boolean(_empreinte),
  };
}

function compteParId(db, id) {
  return normaliserCompte(db.prepare("select * from users where id = ?").get(id));
}

function compteParEmail(db, email) {
  return normaliserCompte(
    db.prepare("select * from users where email = ? collate nocase").get(String(email || "").trim())
  );
}

/**
 * Vérifie une paire adresse / mot de passe.
 *
 * Le message d'échec est le même dans tous les cas — adresse inconnue, mot de
 * passe faux, compte sans mot de passe. Distinguer renseignerait un attaquant
 * sur les adresses inscrites au registre.
 *
 * Le calcul scrypt est effectué même lorsque l'adresse est inconnue : sans
 * cela, une réponse immédiate trahirait l'absence du compte.
 */
const EMPREINTE_LEURRE = hacherMotDePasse("leurre-pour-egaliser-les-temps-de-reponse");

function authentifier(db, email, motDePasse) {
  const ligne = db.prepare("select * from users where email = ? collate nocase").get(String(email || "").trim());

  /* L'attente est vérifiée AVANT de comparer le mot de passe : un compte
     bloqué ne doit pas pouvoir être ouvert par quelqu'un qui finit par tomber
     juste, et la comparaison coûte un temps de calcul qu'on ne va pas offrir
     à un attaquant. */
  const attente = attenteAvantEssai(ligne);
  if (attente) return { refus: "attendre", ...attente };

  /* Un quart d'heure sans rien tenter : l'ardoise est effacée. */
  if (ligne?.failed_attempts > 0
      && Date.now() - (Date.parse(ligne.last_failed_at || "") || 0) >= BLOCAGE * 1000) {
    db.prepare("update users set failed_attempts = 0 where id = ?").run(ligne.id);
    ligne.failed_attempts = 0;
  }

  const empreinte = ligne?.password_hash || EMPREINTE_LEURRE;
  const correct = verifierMotDePasse(String(motDePasse || ""), empreinte);

  if (!ligne || !ligne.password_hash || !correct) {
    /* L'échec est compté sur le COMPTE VISÉ, quand il existe. Compter aussi
       les adresses inconnues remplirait la base de lignes créées par
       l'extérieur, et dirait à l'attaquant lesquelles existent. Le compte
       visé, lui, apprendra à sa prochaine connexion qu'on s'est acharné. */
    if (ligne) {
      db.prepare("update users set failed_attempts = failed_attempts + 1, last_failed_at = ? where id = ?")
        .run(maintenant(), ligne.id);
    }
    return { refus: "identifiants" };
  }
  if (ligne.account_status === "DISABLED") return { refus: "desactive" };

  return { compte: normaliserCompte(ligne) };
}

/**
 * Les sessions ouvertes d'un compte, la plus récemment vue d'abord.
 *
 * Le secret n'est jamais renvoyé : seulement de quoi reconnaître l'appareil —
 * quand la session a été ouverte, quand elle a servi, et le navigateur
 * annoncé. Assez pour repérer une session qu'on ne reconnaît pas, trop peu
 * pour s'en servir.
 */
function sessionsDe(db, utilisateurId, secretCourant = null) {
  const empreinte = secretCourant ? empreinteJeton(secretCourant) : "";
  /* La liste ne montre que ce qui ouvrirait VRAIMENT la porte : une session
     au repos depuis plus longtemps que la règle est déjà refusée, même si sa
     ligne survit en base jusqu'à ce qu'on y touche. L'afficher comme
     « connectée » ferait compter dix appareils à qui n'en a qu'un, et le
     chiffre inquiéterait pour rien. */
  const { repos } = dureesDe(db.prepare("select role from users where id = ?").get(utilisateurId)?.role);
  const seuil = repos > 0 ? dans(-repos) : "";
  return db
    .prepare(
      `select id, token_hash, created_at, last_seen, expires_at, user_agent
         from sessions
        where user_id = ? and expires_at > ? and last_seen > ?
        order by last_seen desc`
    )
    .all(utilisateurId, maintenant(), seuil)
    .map((s) => ({
      id: s.id,
      courante: s.token_hash === empreinte,
      created_at: s.created_at,
      last_seen: s.last_seen,
      expires_at: s.expires_at,
      appareil: appareil(s.user_agent || ""),
    }));
}

/**
 * Un nom d'appareil lisible, tiré de l'agent annoncé.
 *
 * L'agent brut ne dit rien à personne. Ce qu'il faut pour reconnaître SA
 * session, c'est le système et le navigateur, et rien de plus.
 */
function appareil(agent) {
  if (!String(agent).trim()) return "Appareil inconnu";
  const systeme = /Android/.test(agent) ? "Android"
    : /iPhone|iPad|iPod/.test(agent) ? "iPhone ou iPad"
    : /Windows/.test(agent) ? "Windows"
    : /Mac OS X/.test(agent) ? "Mac"
    : /Linux|X11/.test(agent) ? "Linux"
    : "Appareil inconnu";
  /* L'ordre compte : Edge et Opera s'annoncent aussi « Chrome », et Chrome
     s'annonce aussi « Safari ». Du plus précis au plus général. */
  const navigateur = /Edg\//.test(agent) ? "Edge"
    : /OPR\/|Opera/.test(agent) ? "Opera"
    : /SamsungBrowser/.test(agent) ? "Samsung Internet"
    : /Firefox/.test(agent) ? "Firefox"
    : /Chrome/.test(agent) ? "Chrome"
    : /Safari/.test(agent) ? "Safari"
    : "";
  return navigateur ? `${navigateur} sur ${systeme}` : systeme;
}

/** Écrit un nouveau mot de passe et clôt les autres sessions. */
function definirMotDePasse(db, utilisateurId, motDePasse, { sauf = null } = {}) {
  db.prepare(
    `update users
        set password_hash = ?, must_change_password = 0,
            activated_at = coalesce(activated_at, ?)
      where id = ?`
  ).run(hacherMotDePasse(motDePasse), maintenant(), utilisateurId);

  /* Changer son mot de passe doit déconnecter les autres appareils : c'est
     précisément ce qu'on fait quand on soupçonne que le compte est compromis. */
  fermerToutesSessions(db, utilisateurId, { sauf });
}

export {
  hacherMotDePasse,
  verifierMotDePasse,
  nouveauSecret,
  empreinteJeton,
  ouvrirSession,
  sessionDepuisSecret,
  fermerSession,
  fermerToutesSessions,
  sessionsDe,
  dureesDe,
  attenteAvantEssai,
  INACTIVITE,
  INACTIVITE_PREAVIS,
  ECHECS_MAX,
  BLOCAGE,
  DELAIS,
  menage,
  creerJeton,
  consommerJeton,
  normaliserCompte,
  compteParId,
  compteParEmail,
  authentifier,
  definirMotDePasse,
  DUREE_SESSION,
  DUREE_INVITATION,
  DUREE_REINITIALISATION,
  SCRYPT,
};
