/* Validation en deux étapes, côté registre Node.
 *
 * Le jumeau de api/lib/DoubleFacteur.php. Les deux registres suivent la même
 * norme et la même table : ce qui est activé sur l'un se vérifie sur l'autre,
 * et les tests de ce fichier valent donc pour les deux.
 *
 * TOTP (RFC 6238) : un secret partagé, l'horloge, six chiffres qui changent
 * toutes les trente secondes. C'est ce que lisent Google Authenticator,
 * Microsoft Authenticator, Authy, 1Password et Bitwarden : aucune application
 * n'est imposée, et aucun service tiers n'est payé ni cru sur parole.
 *
 * Où vit le secret
 * ----------------
 * Il ne peut pas être haché : le serveur doit le relire pour recalculer le
 * code attendu. Il est donc chiffré en AES-256-GCM, avec une clé qui vit dans
 * un FICHIER à côté de la base, jamais dans la base. Une copie de la base
 * seule ne permet pas de fabriquer des codes.
 *
 * La contrepartie : restaurer la base sur une machine sans le fichier de clé
 * rend les secrets illisibles. Les codes de secours, hachés, restent valables,
 * et un administrateur peut retirer le second facteur. C'est pour cela que ces
 * deux échappatoires existent.
 */

import { randomBytes, randomInt, createCipheriv, createDecipheriv, createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { uid, maintenant, dans } from "./db.mjs";
import { hacherMotDePasse, verifierMotDePasse, nouveauSecret, empreinteJeton } from "./comptes.mjs";

const OCTETS_SECRET = 20;
const PAS = 30;
const FENETRE = 1;
const CHIFFRES = 6;
const NB_CODES_SECOURS = 10;
const DUREE_DEFI = 300;
const ESSAIS_MAX = 6;

/* --- la clé de chiffrement ------------------------------------------------- */

const cles = new Map();

/**
 * La clé, lue ou créée à côté de la base.
 *
 * Créée à la volée au premier usage : rien à renseigner dans la configuration,
 * donc rien à oublier de renseigner.
 */
function cle(db) {
  /* Chemin ABSOLU : « data/certify.db » donnerait « data/.cle-secrets »
     relatif au dossier courant, et la clé se poserait là où la commande a été
     lancée : au pire à la racine du dépôt. */
  const chemin = join(dirname(resolve(db.name || "certify.db")), ".cle-secrets");
  if (cles.has(chemin)) return cles.get(chemin);

  let valeur;
  if (existsSync(chemin)) {
    valeur = Buffer.from(readFileSync(chemin, "utf8").trim(), "base64");
    if (valeur.length !== 32) throw new Error("Le fichier de clé des secrets est illisible.");
  } else {
    valeur = randomBytes(32);
    writeFileSync(chemin, valeur.toString("base64"), { mode: 0o600 });
    try { chmodSync(chemin, 0o600); } catch { /* systèmes sans droits POSIX */ }
  }
  cles.set(chemin, valeur);
  return valeur;
}

function chiffrer(db, clair) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", cle(db), iv);
  const corps = Buffer.concat([c.update(clair, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), corps]).toString("base64");
}

/** Rend null si le paquet ne se déchiffre pas : la base a pu changer de machine. */
function dechiffrer(db, paquet) {
  if (!paquet) return null;
  try {
    const brut = Buffer.from(paquet, "base64");
    if (brut.length < 29) return null;
    const d = createDecipheriv("aes-256-gcm", cle(db), brut.subarray(0, 12));
    d.setAuthTag(brut.subarray(12, 28));
    return Buffer.concat([d.update(brut.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/* --- base32, TOTP ----------------------------------------------------------- */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(octets) {
  let bits = "";
  for (const o of octets) bits += o.toString(2).padStart(8, "0");
  let sortie = "";
  for (let i = 0; i < bits.length; i += 5) sortie += ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  return sortie;
}

function debase32(texte) {
  const propre = String(texte || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const c of propre) bits += ALPHABET.indexOf(c).toString(2).padStart(5, "0");
  const octets = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) octets.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(octets);
}

/** Le code attendu pour un pas de temps donné. */
function codePour(secretBase32, pas, chiffres = CHIFFRES, algo = "sha1") {
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(pas));
  const h = createHmac(algo, debase32(secretBase32)).update(compteur).digest();
  const d = h[h.length - 1] & 0x0f;
  const tronque = ((h[d] & 0x7f) << 24 | h[d + 1] << 16 | h[d + 2] << 8 | h[d + 3]) % 10 ** chiffres;
  return String(tronque).padStart(chiffres, "0");
}

/**
 * Le pas de temps auquel ce code correspond, ou null.
 *
 * La comparaison est à temps constant : comparer deux chaînes avec `===`
 * s'arrête au premier caractère différent, et le temps de réponse laisse alors
 * deviner le code, chiffre par chiffre.
 */
function pasValide(secretBase32, code, maintenantSec = Math.floor(Date.now() / 1000)) {
  const propre = String(code || "").replace(/\D/g, "");
  if (propre.length !== CHIFFRES) return null;
  const pasCourant = Math.floor(maintenantSec / PAS);
  for (let d = -FENETRE; d <= FENETRE; d++) {
    const attendu = Buffer.from(codePour(secretBase32, pasCourant + d));
    const recu = Buffer.from(propre);
    if (attendu.length === recu.length && timingSafeEqual(attendu, recu)) return pasCourant + d;
  }
  return null;
}

/** L'adresse que lit l'application d'authentification, derrière le QR code. */
function uri(email, secretBase32) {
  const emetteur = encodeURIComponent("VIZDATA CERTIFY");
  return `otpauth://totp/${emetteur}:${encodeURIComponent(email)}`
    + `?secret=${secretBase32}&issuer=${emetteur}&algorithm=SHA1&digits=${CHIFFRES}&period=${PAS}`;
}

/* --- activation -------------------------------------------------------------- */

const estActif = (compte) => Number(compte?.totp_actif ?? 0) === 1;

function preparer(db, compte) {
  const secret = base32(randomBytes(OCTETS_SECRET));
  db.prepare("update users set totp_secret = ?, totp_actif = 0, totp_dernier_pas = 0 where id = ?")
    .run(chiffrer(db, secret), compte.id);
  return { secret, uri: uri(compte.email, secret) };
}

/** Confirme l'activation par un premier code. Rend les codes de secours. */
function activer(db, compte, code) {
  const ligne = db.prepare("select totp_secret from users where id = ?").get(compte.id);
  const secret = dechiffrer(db, ligne?.totp_secret);
  if (!secret) return { refus: "aucune_preparation" };
  const pas = pasValide(secret, code);
  if (pas === null) return { refus: "code" };
  db.prepare("update users set totp_actif = 1, totp_active_a = ?, totp_dernier_pas = ? where id = ?")
    .run(maintenant(), pas, compte.id);
  return { codes: renouvelerCodesSecours(db, compte.id) };
}

function desactiver(db, utilisateurId) {
  db.prepare("update users set totp_actif = 0, totp_secret = null, totp_active_a = null, totp_dernier_pas = 0 where id = ?")
    .run(utilisateurId);
  db.prepare("delete from codes_secours where user_id = ?").run(utilisateurId);
}

/* --- codes de secours ---------------------------------------------------------- */

/** Dix codes neufs ; les anciens disparaissent. Rendus une fois, hachés en base. */
function renouvelerCodesSecours(db, utilisateurId) {
  db.prepare("delete from codes_secours where user_id = ?").run(utilisateurId);
  const codes = [];
  for (let i = 0; i < NB_CODES_SECOURS; i++) {
    const brut = String(randomInt(0, 100000)).padStart(5, "0") + "-" + String(randomInt(0, 100000)).padStart(5, "0");
    codes.push(brut);
    db.prepare("insert into codes_secours (id, user_id, code_hash) values (?, ?, ?)")
      .run(uid(), utilisateurId, hacherMotDePasse(brut));
  }
  return codes;
}

function codesSecoursRestants(db, utilisateurId) {
  return db.prepare("select count(*) as n from codes_secours where user_id = ? and utilise_a is null")
    .get(utilisateurId).n;
}

function consommerCodeSecours(db, utilisateurId, saisie) {
  const propre = String(saisie || "").trim();
  if (!propre) return false;
  for (const ligne of db.prepare("select * from codes_secours where user_id = ? and utilise_a is null").all(utilisateurId)) {
    if (verifierMotDePasse(propre, ligne.code_hash)) {
      db.prepare("update codes_secours set utilise_a = ? where id = ?").run(maintenant(), ligne.id);
      return true;
    }
  }
  return false;
}

/* --- le défi de connexion ------------------------------------------------------- */

function ouvrirDefi(db, utilisateurId) {
  db.prepare("delete from defis_connexion where user_id = ? or expires_at <= ?").run(utilisateurId, maintenant());
  const secret = nouveauSecret();
  db.prepare("insert into defis_connexion (id, token_hash, user_id, expires_at) values (?, ?, ?, ?)")
    .run(uid(), empreinteJeton(secret), utilisateurId, dans(DUREE_DEFI));
  return secret;
}

/**
 * Vérifie le code d'un défi.
 *
 * Six tentatives, puis il faut ressaisir le mot de passe : un code à six
 * chiffres se devine en un million d'essais, et sans plafond une machine y
 * arriverait.
 */
function verifierDefi(db, jeton, code) {
  if (!jeton) return { refus: "absent" };
  const defi = db.prepare("select * from defis_connexion where token_hash = ?").get(empreinteJeton(jeton));
  if (!defi) return { refus: "inconnu" };
  if (defi.expires_at <= maintenant()) {
    db.prepare("delete from defis_connexion where id = ?").run(defi.id);
    return { refus: "expire" };
  }
  if (defi.essais >= ESSAIS_MAX) {
    db.prepare("delete from defis_connexion where id = ?").run(defi.id);
    return { refus: "trop_essais" };
  }
  db.prepare("update defis_connexion set essais = essais + 1 where id = ?").run(defi.id);

  const compte = db.prepare("select * from users where id = ?").get(defi.user_id);
  if (!compte) return { refus: "inconnu" };

  const secret = dechiffrer(db, compte.totp_secret);
  if (secret) {
    const pas = pasValide(secret, code);
    if (pas !== null) {
      /* Un code déjà utilisé ne vaut plus : sans cette borne il resterait
         rejouable pendant toute la fenêtre de tolérance. */
      if (pas <= Number(compte.totp_dernier_pas || 0)) return { refus: "deja_utilise" };
      db.prepare("update users set totp_dernier_pas = ? where id = ?").run(pas, compte.id);
      db.prepare("delete from defis_connexion where id = ?").run(defi.id);
      return { utilisateurId: compte.id, secours: false };
    }
  }

  if (consommerCodeSecours(db, compte.id, code)) {
    db.prepare("delete from defis_connexion where id = ?").run(defi.id);
    return { utilisateurId: compte.id, secours: true };
  }
  return { refus: "code" };
}

function menage(db) {
  return db.prepare("delete from defis_connexion where expires_at <= ?").run(maintenant()).changes;
}

export {
  base32, debase32, codePour, pasValide, uri,
  estActif, preparer, activer, desactiver,
  renouvelerCodesSecours, codesSecoursRestants,
  ouvrirDefi, verifierDefi, menage,
};
