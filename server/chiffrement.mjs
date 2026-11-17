/* Chiffrement des sauvegardes.
 *
 * Pourquoi chiffrer
 * -----------------
 * Une sauvegarde qui reste sur le serveur ne protège de rien : ni d'une panne
 * de disque, ni de la perte de la machine. Elle doit donc en partir — vers un
 * dépôt privé, un autre serveur, un espace de stockage. Or le fichier contient
 * tout le registre : noms, adresses, numéros de téléphone, et les empreintes
 * des mots de passe. Le laisser voyager en clair reviendrait à régler un
 * problème de disponibilité en en créant un de confidentialité.
 *
 * Les choix, et leurs raisons
 * ---------------------------
 * — AES-256-GCM. Il chiffre ET authentifie : une sauvegarde modifiée d'un seul
 *   octet est rejetée au déchiffrement, au lieu de rendre des données fausses.
 *   Pour une pièce probante, c'est la propriété qui compte le plus.
 * — La clé est dérivée du mot de passe par scrypt, avec un sel tiré au hasard
 *   POUR CHAQUE sauvegarde. Un mot de passe humain a trop peu d'entropie pour
 *   servir de clé directement ; scrypt rend l'essai en masse coûteux.
 * — Tous les paramètres voyagent dans l'en-tête du fichier. Une sauvegarde doit
 *   rester lisible dans cinq ans, par quelqu'un qui n'aura pas ce dépôt sous
 *   les yeux : elle se décrit elle-même.
 *
 * Format du fichier
 * -----------------
 *   "VIZDATA-SAUVEGARDE-1\n"   20 octets, repérable par un humain
 *   N r p                      3 × 4 octets, entiers de scrypt
 *   sel                        16 octets
 *   iv                         12 octets
 *   marque d'authenticité      16 octets
 *   données chiffrées          le reste
 */

import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";

const MAGIE = Buffer.from("VIZDATA-SAUVEGARDE-1\n", "utf8");
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
const TAILLE_SEL = 16;
const TAILLE_IV = 12;
const TAILLE_MARQUE = 16;

/** Dérive la clé de chiffrement d'un mot de passe. */
function deriver(motDePasse, sel, parametres = SCRYPT) {
  const { N, r, p, maxmem } = parametres;
  return scryptSync(motDePasse, sel, 32, { N, r, p, maxmem });
}

/** Chiffre un contenu. Renvoie le fichier complet, en-tête compris. */
function chiffrer(contenu, motDePasse) {
  if (!motDePasse) throw new Error("Aucune clé de chiffrement fournie.");

  const sel = randomBytes(TAILLE_SEL);
  const iv = randomBytes(TAILLE_IV);
  const cle = deriver(motDePasse, sel);

  const chiffreur = createCipheriv("aes-256-gcm", cle, iv);
  const donnees = Buffer.concat([chiffreur.update(contenu), chiffreur.final()]);
  const marque = chiffreur.getAuthTag();

  const parametres = Buffer.alloc(12);
  parametres.writeUInt32BE(SCRYPT.N, 0);
  parametres.writeUInt32BE(SCRYPT.r, 4);
  parametres.writeUInt32BE(SCRYPT.p, 8);

  return Buffer.concat([MAGIE, parametres, sel, iv, marque, donnees]);
}

/** Vrai si le fichier porte notre en-tête. */
const estChiffre = (fichier) =>
  Buffer.isBuffer(fichier) && fichier.length > MAGIE.length && fichier.subarray(0, MAGIE.length).equals(MAGIE);

/**
 * Déchiffre un fichier produit par `chiffrer`.
 *
 * Les messages d'échec distinguent les trois cas qu'on rencontre réellement :
 * ce n'est pas une sauvegarde chiffrée, le mot de passe est faux, le fichier a
 * été altéré. Un « erreur de déchiffrement » générique laisserait chercher.
 */
function dechiffrer(fichier, motDePasse) {
  if (!estChiffre(fichier)) {
    throw new Error("Ce fichier n'est pas une sauvegarde chiffrée VIZDATA.");
  }
  if (!motDePasse) throw new Error("Cette sauvegarde est chiffrée : la clé est nécessaire pour la relire.");

  let position = MAGIE.length;
  const lire = (n) => {
    const morceau = fichier.subarray(position, position + n);
    position += n;
    return morceau;
  };

  const parametres = lire(12);
  const N = parametres.readUInt32BE(0);
  const r = parametres.readUInt32BE(4);
  const p = parametres.readUInt32BE(8);
  const sel = lire(TAILLE_SEL);
  const iv = lire(TAILLE_IV);
  const marque = lire(TAILLE_MARQUE);
  const donnees = fichier.subarray(position);

  if (donnees.length === 0) throw new Error("Sauvegarde vide ou tronquée.");

  const cle = deriver(motDePasse, sel, { N, r, p, maxmem: SCRYPT.maxmem });
  const dechiffreur = createDecipheriv("aes-256-gcm", cle, iv);
  dechiffreur.setAuthTag(marque);

  try {
    return Buffer.concat([dechiffreur.update(donnees), dechiffreur.final()]);
  } catch {
    /* GCM ne distingue pas « mauvaise clé » de « fichier altéré » : dans les
       deux cas la marque ne correspond pas. On le dit tel quel plutôt que
       d'affirmer l'un des deux. */
    throw new Error(
      "Déchiffrement refusé : la clé est incorrecte, ou le fichier a été altéré depuis sa création."
    );
  }
}

export { chiffrer, dechiffrer, estChiffre, MAGIE };
