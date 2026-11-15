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
 * Ouvre une session et renvoie le secret à poser dans le cookie.
 *
 * Le secret n'est renvoyé qu'ici, une seule fois : la base n'en garde que
 * l'empreinte, et il est donc impossible de le retrouver ensuite — y compris
 * pour nous.
 */
function ouvrirSession(db, utilisateurId, { userAgent = null, duree = DUREE_SESSION } = {}) {
  const secret = nouveauSecret();
  db.prepare(
    `insert into sessions (id, token_hash, user_id, expires_at, user_agent)
     values (?, ?, ?, ?, ?)`
  ).run(uid(), empreinteJeton(secret), utilisateurId, dans(duree), userAgent);

  db.prepare("update users set last_login_at = ? where id = ?").run(maintenant(), utilisateurId);
  return { secret, expire: dans(duree) };
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
      `select s.id as session_id, s.expires_at, u.*
         from sessions s
         join users u on u.id = s.user_id
        where s.token_hash = ?`
    )
    .get(empreinteJeton(secret));

  if (!ligne) return null;
  if (ligne.expires_at <= maintenant()) {
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
  const empreinte = ligne?.password_hash || EMPREINTE_LEURRE;
  const correct = verifierMotDePasse(String(motDePasse || ""), empreinte);

  if (!ligne || !ligne.password_hash || !correct) return { refus: "identifiants" };
  if (ligne.account_status === "DISABLED") return { refus: "desactive" };

  return { compte: normaliserCompte(ligne) };
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
