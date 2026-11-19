/* La validation en deux étapes.
 *
 * Le cœur est un algorithme publié : TOTP, RFC 6238. On le vérifie d'abord
 * contre les vecteurs d'essai de la norme — c'est la seule façon d'être sûr
 * que ce que produit ce code est bien ce qu'attend Google Authenticator, sans
 * avoir à sortir un téléphone. Le reste éprouve ce qui entoure l'algorithme :
 * la fenêtre de tolérance, le rejeu, les codes de secours, le plafond
 * d'essais. C'est là que se logent les vraies failles.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { baseNeuve, compte } from "./aide-base.mjs";
import {
  base32, debase32, codePour, pasValide, uri,
  preparer, activer, desactiver, estActif,
  renouvelerCodesSecours, codesSecoursRestants,
  ouvrirDefi, verifierDefi, menage,
} from "../server/double-facteur.mjs";
import { maintenant } from "../server/db.mjs";

/* Le secret des vecteurs de la RFC : la chaîne ASCII « 12345678901234567890 ». */
const SECRET_RFC = base32(Buffer.from("12345678901234567890", "ascii"));

test("les vecteurs d'essai de la RFC 6238 sont reproduits", () => {
  const vecteurs = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];
  for (const [temps, attendu] of vecteurs) {
    assert.equal(codePour(SECRET_RFC, Math.floor(temps / 30), 8), attendu, `T=${temps}`);
  }
});

test("base32 fait l'aller-retour", () => {
  const octets = Buffer.from([0, 1, 2, 250, 255, 128, 64, 32, 16, 8]);
  assert.deepEqual(Buffer.from(debase32(base32(octets))), octets);
  /* Les applications tolèrent les espaces : nous aussi, puisque le secret est
     proposé à la saisie manuelle par groupes de quatre. */
  assert.deepEqual(debase32("GEZD GNBV GY3T QOJQ"), debase32("GEZDGNBVGY3TQOJQ"));
});

test("l'adresse otpauth porte ce que lisent les applications", () => {
  const a = uri("awa@vizdata.ci", "ABCDEFGH");
  assert.match(a, /^otpauth:\/\/totp\/VIZDATA%20CERTIFY:awa%40vizdata\.ci\?/);
  assert.match(a, /secret=ABCDEFGH/);
  assert.match(a, /issuer=VIZDATA%20CERTIFY/);
  assert.match(a, /algorithm=SHA1/);
  assert.match(a, /digits=6/);
  assert.match(a, /period=30/);
});

test("la tolérance d'horloge couvre un pas, pas deux", () => {
  const t = 1700000000;
  const pas = Math.floor(t / 30);
  assert.equal(pasValide(SECRET_RFC, codePour(SECRET_RFC, pas), t), pas);
  assert.equal(pasValide(SECRET_RFC, codePour(SECRET_RFC, pas - 1), t), pas - 1);
  assert.equal(pasValide(SECRET_RFC, codePour(SECRET_RFC, pas + 1), t), pas + 1);
  /* Deux pas, c'est une minute d'écart : au-delà, c'est une horloge fausse ou
     un code recopié trop tard, et dans les deux cas il faut redemander. */
  assert.equal(pasValide(SECRET_RFC, codePour(SECRET_RFC, pas - 2), t), null);
  assert.equal(pasValide(SECRET_RFC, codePour(SECRET_RFC, pas + 2), t), null);
});

test("un code mal formé est refusé sans calcul", () => {
  for (const saisie of ["", "12345", "1234567", "abcdef", null, undefined]) {
    assert.equal(pasValide(SECRET_RFC, saisie), null);
  }
});

/* --- le parcours complet ---------------------------------------------------- */

function avecBase(fn) {
  const { db, fermer } = baseNeuve();
  try {
    const id = compte(db, { email: "awa@vizdata.ci" });
    fn(db, db.prepare("select * from users where id = ?").get(id));
  } finally {
    fermer();
  }
}

test("activer demande un code juste, et rend dix codes de secours", () => {
  avecBase((db, u) => {
    const prep = preparer(db, u);
    assert.match(prep.secret, /^[A-Z2-7]{32}$/);
    assert.equal(estActif(db.prepare("select * from users where id = ?").get(u.id)), false);

    assert.equal(activer(db, u, "000000").refus, "code");
    assert.equal(estActif(db.prepare("select * from users where id = ?").get(u.id)), false);

    const bon = codePour(prep.secret, Math.floor(Date.now() / 1000 / 30));
    const r = activer(db, u, bon);
    assert.equal(r.codes.length, 10);
    assert.equal(estActif(db.prepare("select * from users where id = ?").get(u.id)), true);
    assert.equal(codesSecoursRestants(db, u.id), 10);
  });
});

test("le secret n'est jamais lisible dans la base", () => {
  avecBase((db, u) => {
    const prep = preparer(db, u);
    const stocke = db.prepare("select totp_secret from users where id = ?").get(u.id).totp_secret;
    assert.notEqual(stocke, prep.secret);
    assert.ok(!stocke.includes(prep.secret.slice(0, 8)));
  });
});

test("un code sert une fois : le rejeu est refusé", () => {
  avecBase((db, u) => {
    const prep = preparer(db, u);
    const code = codePour(prep.secret, Math.floor(Date.now() / 1000 / 30));
    activer(db, u, code);

    /* Le même code, aussitôt : c'est exactement ce que tenterait quelqu'un qui
       l'a lu par-dessus une épaule. */
    const defi = ouvrirDefi(db, u.id);
    assert.equal(verifierDefi(db, defi, code).refus, "deja_utilise");
  });
});

test("un code de secours ouvre la session, et ne sert qu'une fois", () => {
  avecBase((db, u) => {
    const prep = preparer(db, u);
    const { codes } = activer(db, u, codePour(prep.secret, Math.floor(Date.now() / 1000 / 30)));

    const premier = verifierDefi(db, ouvrirDefi(db, u.id), codes[0]);
    assert.equal(premier.utilisateurId, u.id);
    assert.equal(premier.secours, true);
    assert.equal(codesSecoursRestants(db, u.id), 9);

    assert.equal(verifierDefi(db, ouvrirDefi(db, u.id), codes[0]).refus, "code");
    assert.equal(codesSecoursRestants(db, u.id), 9);
  });
});

test("le défi plafonne les essais", () => {
  avecBase((db, u) => {
    const prep = preparer(db, u);
    activer(db, u, codePour(prep.secret, Math.floor(Date.now() / 1000 / 30)));

    const defi = ouvrirDefi(db, u.id);
    for (let i = 0; i < 6; i++) assert.equal(verifierDefi(db, defi, "000001").refus, "code");
    /* Au septième, le défi est détruit : il faut repasser par le mot de passe. */
    assert.equal(verifierDefi(db, defi, "000001").refus, "trop_essais");
    assert.equal(verifierDefi(db, defi, "000001").refus, "inconnu");
  });
});

test("un défi périmé ne vaut plus rien", () => {
  avecBase((db, u) => {
    const prep = preparer(db, u);
    activer(db, u, codePour(prep.secret, Math.floor(Date.now() / 1000 / 30)));

    const defi = ouvrirDefi(db, u.id);
    db.prepare("update defis_connexion set expires_at = ?").run("2020-01-01T00:00:00.000Z");
    assert.equal(verifierDefi(db, defi, "000000").refus, "expire");
  });
});

test("un défi inconnu est refusé sans révéler pourquoi", () => {
  avecBase((db) => {
    assert.equal(verifierDefi(db, "jeton-invente", "000000").refus, "inconnu");
    assert.equal(verifierDefi(db, null, "000000").refus, "absent");
  });
});

test("désactiver efface le secret et les codes de secours", () => {
  avecBase((db, u) => {
    const prep = preparer(db, u);
    activer(db, u, codePour(prep.secret, Math.floor(Date.now() / 1000 / 30)));

    desactiver(db, u.id);
    const apres = db.prepare("select * from users where id = ?").get(u.id);
    assert.equal(estActif(apres), false);
    assert.equal(apres.totp_secret, null);
    assert.equal(codesSecoursRestants(db, u.id), 0);
  });
});

test("renouveler les codes invalide les anciens", () => {
  avecBase((db, u) => {
    const prep = preparer(db, u);
    const { codes } = activer(db, u, codePour(prep.secret, Math.floor(Date.now() / 1000 / 30)));
    const neufs = renouvelerCodesSecours(db, u.id);

    assert.equal(codesSecoursRestants(db, u.id), 10);
    assert.equal(verifierDefi(db, ouvrirDefi(db, u.id), codes[0]).refus, "code");
    assert.equal(verifierDefi(db, ouvrirDefi(db, u.id), neufs[0]).utilisateurId, u.id);
  });
});

test("le ménage retire les défis périmés et garde les vivants", () => {
  avecBase((db, u) => {
    const autre = compte(db, { email: "serge@vizdata.ci" });
    ouvrirDefi(db, autre);
    ouvrirDefi(db, u.id);
    /* Seul celui d'Awa est périmé : celui de Serge doit survivre au ménage. */
    db.prepare("update defis_connexion set expires_at = ? where user_id = ?")
      .run("2020-01-01T00:00:00.000Z", u.id);

    assert.equal(menage(db), 1);
    assert.equal(db.prepare("select count(*) as n from defis_connexion").get().n, 1);
    assert.ok(db.prepare("select expires_at from defis_connexion").get().expires_at > maintenant());
  });
});

test("ouvrir un défi balaie les périmés au passage", () => {
  avecBase((db, u) => {
    ouvrirDefi(db, u.id);
    db.prepare("update defis_connexion set expires_at = ?").run("2020-01-01T00:00:00.000Z");

    /* Sans ce balayage, la table enflerait indéfiniment : aucune tâche
       planifiée ne tourne sur l'hébergement. */
    const autre = compte(db, { email: "serge@vizdata.ci" });
    ouvrirDefi(db, autre);
    assert.equal(db.prepare("select count(*) as n from defis_connexion").get().n, 1);
  });
});
