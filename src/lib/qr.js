/* Encodage QR.
 *
 * Cette application a longtemps embarqué un encodeur écrit à la main — Galois
 * Field, Reed-Solomon, huit masques, le tout sans dépendance. Il produisait des
 * matrices d'apparence irréprochable : bonnes dimensions, motifs de repérage et
 * de synchronisation aux bons endroits, déterminisme. Les tests le vérifiaient.
 *
 * Aucun lecteur ne parvenait à les décoder.
 *
 * Contrôler la structure d'un QR code ne prouve rien : c'est le décodage qui
 * fait foi. La règle vaut au-delà d'ici — un certificat imprimé porte ce code
 * pendant des années, et un défaut y est irrattrapable une fois la promotion
 * partie. On s'appuie donc sur une implémentation éprouvée, et
 * tests/qr-decodage.test.js décode réellement ce qui sort d'ici.
 *
 * Le niveau de correction M est conservé : il tolère environ 15 % de dégâts,
 * ce qui convient à un document imprimé susceptible d'être plié ou photocopié.
 */

import QRCode from "qrcode";

/**
 * Matrice de modules pour un contenu donné.
 * @returns {{matrix: number[][], size: number} | null} null si le contenu est
 *   trop long pour tenir dans un QR code.
 */
function buildQR(text) {
  let code;
  try {
    code = QRCode.create(text, { errorCorrectionLevel: "M" });
  } catch {
    /* Contenu trop volumineux : mieux vaut ne rien afficher qu'un code
       tronqué, donc illisible sans que personne s'en aperçoive. */
    return null;
  }

  const size = code.modules.size;
  const matrix = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => (code.modules.get(r, c) ? 1 : 0)),
  );

  return { matrix, size };
}

export { buildQR };
