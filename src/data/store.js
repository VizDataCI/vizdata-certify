/* Persistance du registre dans le stockage du navigateur.
 *
 * Deux précautions, apprises à l'usage :
 *
 * - La clé porte un numéro de version. Le modèle a changé en novembre 2026
 *   (domaines, programmes, trois rôles) : un registre enregistré avant cette
 *   date n'a pas la forme attendue, et le relire tel quel ferait planter les
 *   écrans sur un `undefined`.
 * - Le numéro ne suffit pas. Un registre peut avoir été écrit par une version
 *   intermédiaire, ou tronqué par un quota. La forme est donc vérifiée avant
 *   d'être acceptée : à défaut, on repart du jeu de démonstration plutôt que
 *   de laisser l'application se casser sur des données incomplètes.
 */

import { buildSeed } from "./seed.js";

const STORE_KEY = "vizdata_certify_v2";

/** Les collections sans lesquelles les écrans ne peuvent pas fonctionner. */
const COLLECTIONS = ["users", "types", "domains", "certificates", "verifications", "shares", "audit_logs"];

function formeValide(db) {
  return Boolean(db) && COLLECTIONS.every((c) => Array.isArray(db[c]));
}

/** Registre chargé depuis le navigateur ; à défaut, jeu de démonstration. */
function loadDb() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const db = JSON.parse(raw);
      if (formeValide(db)) return db;
    }
  } catch (e) { /* première visite, mode privé ou données illisibles */ }
  return buildSeed();
}

function resetDb() {
  try {
    localStorage.removeItem(STORE_KEY);
    /* Les clés des versions antérieures n'ont plus de sens : les laisser
       occuperait le quota du navigateur sans jamais être relues. */
    localStorage.removeItem("vizdata_certify_v1");
  } catch (e) { /* stockage indisponible */ }
  return buildSeed();
}

export { STORE_KEY, loadDb, resetDb };
