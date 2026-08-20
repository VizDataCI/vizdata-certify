/* Persistance du registre dans le stockage du navigateur. */

import { buildSeed } from "./seed.js";

const STORE_KEY = "vizdata_certify_v1";

/** Registre chargé depuis le navigateur ; à défaut, jeu de démonstration. */
function loadDb() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* première visite, mode privé ou données illisibles */ }
  return buildSeed();
}

function resetDb() {
  try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  return buildSeed();
}

export { STORE_KEY, loadDb, resetDb };
