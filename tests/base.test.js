/* Intégrité du schéma SQLite.
 *
 * Ce que la base refuse, aucune application ne peut le contourner : pas même
 * un script écrit à la hâte, pas même un appel direct au fichier. C'est la
 * seule garantie qui survivra à toutes les réécritures du code au-dessus,
 * d'où ces tests.
 *
 * Le premier d'entre eux compte plus que les autres : SQLite ignore les clés
 * étrangères par défaut. Si le pragma n'était pas posé, toutes les contraintes
 * de ce fichier seraient des commentaires, et rien ne le signalerait avant
 * qu'une ligne orpheline n'apparaisse dans le registre.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baseNeuve, compte, catalogue, certificat } from "./aide-base.mjs";
import { ouvrirBase, uid, enTransaction } from "../server/db.mjs";

/** Attend que l'écriture soit refusée par la base, et dit par quelle règle. */
function refuse(db, execution, motif) {
  assert.throws(execution, (e) => {
    assert.match(e.message, motif, `refusé, mais pour une autre raison : ${e.message}`);
    return true;
  });
}

test("les clés étrangères sont réellement actives", () => {
  const { db, fermer } = baseNeuve();
  try {
    const { programme } = catalogue(db);
    refuse(
      db,
      () =>
        db
          .prepare(
            `insert into certificates (id, reference, public_token, user_id, certificate_type_id, issue_date)
             values (?, 'VIZ-X', 'jeton-x', 'titulaire-inexistant', ?, date('now'))`
          )
          .run(uid(), programme),
      /FOREIGN KEY/i
    );
  } finally {
    fermer();
  }
});

test("un titulaire qui porte des certificats ne peut pas être supprimé", () => {
  /* RESTRICT, et non CASCADE : effacer un titulaire effacerait la trace de ce
     que VIZDATA a certifié. C'est pourquoi l'application désactive un compte
     et ne le supprime jamais. */
  const { db, fermer } = baseNeuve();
  try {
    const titulaire = compte(db, { email: "titulaire@exemple.ci" });
    const { programme } = catalogue(db);
    certificat(db, { titulaire, programme });

    refuse(db, () => db.prepare("delete from users where id = ?").run(titulaire), /FOREIGN KEY/i);
  } finally {
    fermer();
  }
});

test("supprimer un certificat emporte ses compétences et ses consultations", () => {
  const { db, fermer } = baseNeuve();
  try {
    const titulaire = compte(db, { email: "t@exemple.ci" });
    const { programme } = catalogue(db);
    const cert = certificat(db, { titulaire, programme });

    const skill = uid();
    db.prepare("insert into skills (id, name) values (?, 'Excel avancé')").run(skill);
    db.prepare("insert into certificate_skills (certificate_id, skill_id) values (?, ?)").run(cert, skill);
    db.prepare("insert into verifications (id, certificate_id) values (?, ?)").run(uid(), cert);

    db.prepare("delete from certificates where id = ?").run(cert);

    assert.equal(db.prepare("select count(*) n from certificate_skills").get().n, 0);
    assert.equal(db.prepare("select count(*) n from verifications").get().n, 0);
    assert.equal(db.prepare("select count(*) n from skills").get().n, 1, "la compétence elle-même doit survivre");
  } finally {
    fermer();
  }
});

test("les références et les jetons publics sont uniques", () => {
  const { db, fermer } = baseNeuve();
  try {
    const titulaire = compte(db, { email: "t@exemple.ci" });
    const { programme } = catalogue(db);
    certificat(db, { titulaire, programme, reference: "VIZ-2026-A-000001", jeton: "jeton-unique" });

    refuse(
      db,
      () => certificat(db, { titulaire, programme, reference: "VIZ-2026-A-000001", jeton: "autre" }),
      /UNIQUE/i
    );
    refuse(
      db,
      () => certificat(db, { titulaire, programme, reference: "VIZ-2026-A-000002", jeton: "jeton-unique" }),
      /UNIQUE/i
    );
  } finally {
    fermer();
  }
});

test("une révocation sans motif est refusée par la base", () => {
  /* Le motif s'affiche sur la page publique : une révocation muette laisse le
     titulaire et son employeur sans explication. La règle ne peut pas vivre
     seulement dans le formulaire. */
  const { db, fermer } = baseNeuve();
  try {
    const titulaire = compte(db, { email: "t@exemple.ci" });
    const { programme } = catalogue(db);
    const cert = certificat(db, { titulaire, programme });

    refuse(
      db,
      () => db.prepare("update certificates set status = 'REVOKED' where id = ?").run(cert),
      /certificats_revocation_motivee|CHECK/i
    );

    db.prepare("update certificates set status = 'REVOKED', revoke_reason = ? where id = ?")
      .run("Non-respect de la charte d'usage.", cert);
    assert.equal(db.prepare("select status from certificates where id = ?").get(cert).status, "REVOKED");
  } finally {
    fermer();
  }
});

test("les valeurs hors liste sont refusées", () => {
  const { db, fermer } = baseNeuve();
  try {
    refuse(
      db,
      () => db.prepare("insert into users (id, email, role) values (?, 'x@y.ci', 'SUPERADMIN')").run(uid()),
      /CHECK/i
    );
    const titulaire = compte(db, { email: "t@exemple.ci" });
    const { programme } = catalogue(db);
    const cert = certificat(db, { titulaire, programme });
    refuse(
      db,
      () => db.prepare("update certificates set status = 'PEUT-ETRE' where id = ?").run(cert),
      /CHECK/i
    );
    refuse(
      db,
      () => db.prepare("insert into shares (id, certificate_id, platform) values (?, ?, 'telepathie')").run(uid(), cert),
      /CHECK/i
    );
  } finally {
    fermer();
  }
});

test("les adresses e-mail ne se dédoublent pas par la casse", () => {
  /* « Fabrice@vizdata.ci » et « fabrice@vizdata.ci » sont la même personne.
     Sans `collate nocase`, deux comptes coexisteraient et l'un des deux
     n'aurait jamais ses certificats. */
  const { db, fermer } = baseNeuve();
  try {
    compte(db, { email: "fabrice@vizdata.ci" });
    refuse(db, () => compte(db, { email: "FABRICE@VIZDATA.CI" }), /UNIQUE/i);
  } finally {
    fermer();
  }
});

test("les colonnes json n'acceptent que du json", () => {
  const { db, fermer } = baseNeuve();
  try {
    refuse(
      db,
      () => db.prepare("insert into users (id, email, permissions) values (?, 'j@y.ci', 'ceci nest pas du json')").run(uid()),
      /CHECK/i
    );
  } finally {
    fermer();
  }
});

test("une candidature sans engagement est refusée", () => {
  /* La règle vit dans la base et pas seulement dans le formulaire : un appel
     direct à l'API ne doit pas pouvoir enregistrer une candidature sans
     consentement au contact. */
  const { db, fermer } = baseNeuve();
  try {
    refuse(
      db,
      () =>
        db
          .prepare(
            `insert into candidatures (id, reference, nom, whatsapp, email, profession, niveau, formule, disponible, consent_contact)
             values (?, 'CDA-2026-0001', 'Essai Essai', '+2250700000000', 'e@exemple.ci', 'Analyste', 'DEBUTANT', 'INTEGRAL', 1, 0)`
          )
          .run(uid()),
      /candidatures_engagements|CHECK/i
    );
  } finally {
    fermer();
  }
});

test("les dates malformées sont refusées", () => {
  const { db, fermer } = baseNeuve();
  try {
    const titulaire = compte(db, { email: "t@exemple.ci" });
    const { programme } = catalogue(db);
    refuse(
      db,
      () =>
        db
          .prepare(
            `insert into certificates (id, reference, public_token, user_id, certificate_type_id, issue_date)
             values (?, 'VIZ-D', 'jeton-d', ?, ?, '14 novembre 2026')`
          )
          .run(uid(), titulaire, programme),
      /CHECK/i
    );
  } finally {
    fermer();
  }
});

test("une transaction défait tout en cas d'échec", () => {
  /* Créer un certificat et lier ses compétences n'a de sens qu'ensemble : une
     moitié d'opération laisse des données qui mentent. */
  const { db, fermer } = baseNeuve();
  try {
    const titulaire = compte(db, { email: "t@exemple.ci" });
    const { programme } = catalogue(db);

    assert.throws(() =>
      enTransaction(db, () => {
        certificat(db, { titulaire, programme, reference: "VIZ-TX-1", jeton: "jeton-tx-1" });
        db.prepare("insert into certificate_skills (certificate_id, skill_id) values ('x', 'inexistant')").run();
      })
    );

    assert.equal(
      db.prepare("select count(*) n from certificates where reference = 'VIZ-TX-1'").get().n,
      0,
      "le certificat a survécu à une transaction annulée"
    );
  } finally {
    fermer();
  }
});

test("updated_at avance tout seul à chaque modification", () => {
  const { db, fermer } = baseNeuve();
  try {
    const id = compte(db, { email: "t@exemple.ci" });
    const avant = db.prepare("select updated_at from users where id = ?").get(id).updated_at;
    db.prepare("update users set first_name = 'Modifié' where id = ?").run(id);
    const apres = db.prepare("select updated_at from users where id = ?").get(id).updated_at;
    assert.ok(apres >= avant, "updated_at n'a pas été touché");
  } finally {
    fermer();
  }
});

test("la vue publique n'expose aucune donnée privée", () => {
  /* Elle sert de définition : si une colonne privée devait apparaître sur la
     page de vérification, il faudrait l'ajouter ici : ce qui se voit en
     relecture, et casse ce test. */
  const { db, fermer } = baseNeuve();
  try {
    const titulaire = compte(db, { email: "prive@exemple.ci" });
    db.prepare("update users set phone = '+2250700000000' where id = ?").run(titulaire);
    const { programme } = catalogue(db);
    certificat(db, { titulaire, programme });

    const ligne = db.prepare("select * from v_certificats_publics").get();
    const colonnes = Object.keys(ligne);

    for (const interdite of ["email", "phone", "password_hash", "permissions", "score", "user_id"]) {
      assert.ok(!colonnes.includes(interdite), `la vue publique expose ${interdite}`);
    }
    assert.equal(ligne.holder_name, "Essai Essai");
    assert.equal(ligne.issuer, "VIZDATA");
  } finally {
    fermer();
  }
});

test("rouvrir la base ne rejoue pas les migrations et ne perd rien", () => {
  /* Un redémarrage du serveur rouvre le fichier et relance la migration. Si
     elle n'était pas idempotente, chaque démarrage échouerait ; si elle
     réécrasait le schéma, chaque démarrage effacerait le registre. */
  const dossier = mkdtempSync(join(tmpdir(), "vizdata-rouvre-"));
  const chemin = join(dossier, "certify.db");
  try {
    const premiere = ouvrirBase({ chemin, silencieux: true });
    const titulaire = compte(premiere, { email: "persistant@exemple.ci" });
    const nombreMigrations = premiere.prepare("select count(*) n from migrations").get().n;
    premiere.close();

    const seconde = ouvrirBase({ chemin, silencieux: true });
    assert.equal(
      seconde.prepare("select count(*) n from migrations").get().n,
      nombreMigrations,
      "une migration a été rejouée"
    );
    assert.ok(
      seconde.prepare("select id from users where id = ?").get(titulaire),
      "le compte n'a pas survécu à la réouverture"
    );
    seconde.close();
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});
