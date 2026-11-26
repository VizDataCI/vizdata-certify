/* Base de test : un fichier neuf par suite, effacé à la fin.
 *
 * Volontairement un VRAI fichier, et non une base en mémoire. Deux
 * comportements ne se manifestent que sur disque : le mode WAL, et le
 * verrouillage entre connexions, et ce sont précisément ceux dont dépend le
 * serveur en production. Une base en mémoire aurait rendu les tests plus
 * rapides et moins fidèles.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ouvrirBase, uid } from "../server/db.mjs";

/** Ouvre une base neuve. Renvoie { db, fermer }. */
function baseNeuve() {
  const dossier = mkdtempSync(join(tmpdir(), "vizdata-test-"));
  const db = ouvrirBase({ chemin: join(dossier, "certify.db"), silencieux: true });
  return {
    db,
    fermer() {
      db.close();
      rmSync(dossier, { recursive: true, force: true });
    },
  };
}

/** Insère un compte et renvoie son identifiant. */
function compte(db, { email, role = "CERTIFIED", statut = "ACTIVE", permissions = {}, empreinte = null, prenom = "Essai", nom = "Essai" } = {}) {
  const id = uid();
  db.prepare(
    `insert into users (id, email, first_name, last_name, role, account_status, permissions, password_hash, must_change_password, username)
     values (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(id, email, prenom, nom, role, statut, JSON.stringify(permissions), empreinte, email.split("@")[0] + "-" + id.slice(0, 4));
  return id;
}

/** Insère un domaine, un programme, et renvoie leurs identifiants. */
function catalogue(db, { codeDomaine = "EXCEL", codeProgramme = "EXCEL-AVA" } = {}) {
  const domaine = uid();
  const programme = uid();
  db.prepare("insert into certification_domains (id, code, name) values (?, ?, ?)").run(domaine, codeDomaine, codeDomaine);
  db.prepare(
    "insert into certificate_types (id, domain_id, code, name, default_duration) values (?, ?, ?, ?, 30)"
  ).run(programme, domaine, codeProgramme, "Programme " + codeProgramme);
  return { domaine, programme };
}

/** Insère un certificat et renvoie son identifiant. */
function certificat(db, { titulaire, programme, reference = "VIZ-2026-EXCEL-AVA-000001", jeton = "jeton-" + uid().slice(0, 8), statut = "ACTIVE", motif = "" } = {}) {
  const id = uid();
  db.prepare(
    `insert into certificates (id, reference, public_token, user_id, certificate_type_id, issue_date, status, revoke_reason, duration)
     values (?, ?, ?, ?, ?, date('now'), ?, ?, 30)`
  ).run(id, reference, jeton, titulaire, programme, statut, motif);
  return id;
}

export { baseNeuve, compte, catalogue, certificat };
