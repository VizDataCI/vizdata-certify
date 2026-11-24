/* Les sessions ouvertes, et ce qui a été tenté pendant l'absence.
 *
 * Deux défauts se tenaient là, et aucun des deux ne se voyait.
 *
 * Toutes les sessions duraient trente jours, de l'administrateur qui tient le
 * registre entier au titulaire qui vient voir son diplôme deux fois par an :
 * c'était le compte le plus puissant qui restait ouvert le plus longtemps.
 * Et le registre refusait les essais en masse EN SILENCE — on pouvait passer
 * la nuit à essayer des mots de passe sans que personne ne l'apprenne.
 *
 * Ces tests tiennent les deux règles : une session d'administration laissée
 * au repos tombe, celle d'un titulaire ne tombe pas, et le compte visé
 * apprend, en entrant, combien de fois on a essayé sans lui.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { baseNeuve, compte } from "./aide-base.mjs";
import {
  authentifier, attenteAvantEssai, dureesDe, fermerToutesSessions, hacherMotDePasse,
  ouvrirSession, sessionDepuisSecret, sessionsDe,
  BLOCAGE, DELAIS, ECHECS_MAX, INACTIVITE, INACTIVITE_PREAVIS,
} from "../server/comptes.mjs";

const MDP = "Registre2026!";

function monde(role = "ADMIN") {
  const { db, fermer } = baseNeuve();
  const id = compte(db, { email: "cible@vizdata.ci", role, empreinte: hacherMotDePasse(MDP) });
  return { db, fermer, id };
}

/** La ligne du compte visé, telle que la base la porte. */
const lire = (db) => db.prepare("select * from users where email = 'cible@vizdata.ci'").get();

/** Recule le dernier échec, pour simuler du temps écoulé entre deux essais. */
const reculerEchec = (db, secondes) =>
  db.prepare(
    "update users set last_failed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)"
  ).run(`-${secondes} seconds`);

/** Recule la dernière utilisation d'une session, pour simuler l'abandon. */
const reculerVue = (db, secondes) =>
  db.prepare(
    "update sessions set last_seen = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)"
  ).run(`-${secondes} seconds`);

/* --- durée de vie et abandon ---------------------------------------------- */

test("une session laissée au repos tombe", () => {
  const { db, fermer, id } = monde("ADMIN");
  try {
    const { secret } = ouvrirSession(db, id);
    assert.ok(sessionDepuisSecret(db, secret), "elle doit valoir tout de suite");

    /* Neuf minutes : l'écran n'a pas encore averti, la session vaut. */
    reculerVue(db, 9 * 60);
    assert.ok(sessionDepuisSecret(db, secret), "neuf minutes ne suffisent pas");

    /* Onze minutes : l'écran a déconnecté il y a une minute. Le serveur, lui,
       attend sa marge avant de couper — sans elle il tomberait pendant que
       l'écran affiche son préavis, et le compte à rebours mentirait. */
    reculerVue(db, 11 * 60);
    assert.ok(sessionDepuisSecret(db, secret), "la marge du serveur doit tenir");

    /* Treize : au-delà de la marge, plus rien. */
    reculerVue(db, 13 * 60);
    assert.equal(sessionDepuisSecret(db, secret), null);

    /* Et la ligne est supprimée : un cookie qui ne vaut plus rien ne doit pas
       rester en base, où il pourrait un jour être prolongé. */
    const reste = db.prepare("select count(*) as n from sessions where user_id = ?").get(id);
    assert.equal(reste.n, 0);
  } finally { fermer(); }
});

test("la règle vaut pour tous les rôles, titulaire compris", () => {
  const { db, fermer, id } = monde("CERTIFIED");
  try {
    const { secret } = ouvrirSession(db, id);
    /* Dix minutes d'inactivité déconnectent aussi un titulaire. Son espace
       montre son nom, son adresse et ses certificats : laissé ouvert sur un
       poste partagé, il se lit comme n'importe quel autre. */
    reculerVue(db, 13 * 60);
    assert.equal(sessionDepuisSecret(db, secret), null);
  } finally { fermer(); }
});

test("le repos toléré est le même partout, et il annonce sa marge", () => {
  for (const role of ["ADMIN", "MANAGER", "CERTIFIED"]) {
    assert.equal(dureesDe(role).repos, INACTIVITE + 120, role);
  }
  /* Dix minutes, dont les deux dernières annoncées à l'écran. */
  assert.equal(INACTIVITE, 600);
  assert.equal(INACTIVITE_PREAVIS, 120);
});

test("la durée absolue dépend de ce que la session ouvre", () => {
  assert.equal(dureesDe("ADMIN").vie, 7 * 24 * 3600);
  assert.equal(dureesDe("MANAGER").vie, 7 * 24 * 3600);
  assert.equal(dureesDe("CERTIFIED").vie, 30 * 24 * 3600);
  /* Un rôle inconnu est traité au plus strict : une valeur inattendue ne doit
     jamais acheter des droits supplémentaires. */
  assert.deepEqual(dureesDe("INCONNU"), dureesDe("ADMIN"));
  assert.deepEqual(dureesDe(undefined), dureesDe("ADMIN"));
});

test("une session expirée ne vaut plus rien, même au repos zéro", () => {
  const { db, fermer, id } = monde("CERTIFIED");
  try {
    const { secret } = ouvrirSession(db, id, { duree: 1 });
    db.prepare("update sessions set expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 second')").run();
    assert.equal(sessionDepuisSecret(db, secret), null);
  } finally { fermer(); }
});

/* --- tentatives échouées --------------------------------------------------- */

test("un mot de passe faux est compté, une connexion réussie remet à zéro", () => {
  const { db, fermer, id } = monde();
  try {
    /* Les échecs sont espacés à la main : sans cela, le délai progressif
       refuserait le deuxième essai avant même de le compter — ce qui est
       précisément ce qu'il doit faire en conditions réelles. */
    for (let i = 0; i < 3; i++) {
      authentifier(db, "cible@vizdata.ci", "faux");
      reculerEchec(db, 60);
    }
    const apres = db.prepare("select failed_attempts, last_failed_at from users where id = ?").get(id);
    assert.equal(apres.failed_attempts, 3);
    assert.ok(apres.last_failed_at, "la date du dernier échec est gardée");

    /* Le chiffre est rendu à celui qui entre : c'est tout l'intérêt. */
    const { echecs } = ouvrirSession(db, id);
    assert.equal(echecs, 3);
    assert.equal(db.prepare("select failed_attempts from users where id = ?").get(id).failed_attempts, 0);

    /* La date, elle, ne retombe pas : l'écran de sécurité la montre longtemps
       après, et c'est à partir d'une date qu'on s'inquiète à bon escient. */
    assert.ok(db.prepare("select last_failed_at from users where id = ?").get(id).last_failed_at);
  } finally { fermer(); }
});

test("une adresse inconnue ne crée rien", () => {
  const { db, fermer } = monde();
  try {
    for (let i = 0; i < 5; i++) authentifier(db, "personne@ailleurs.ci", "faux");
    /* Compter les adresses inconnues remplirait la base de lignes créées par
       l'extérieur, et dirait à l'attaquant lesquelles existent. */
    const n = db.prepare("select count(*) as n from users").get().n;
    assert.equal(n, 1);
  } finally { fermer(); }
});

/* --- fermer les autres appareils ------------------------------------------- */

test("fermer les autres sessions épargne celle d'où l'on agit", () => {
  const { db, fermer, id } = monde();
  try {
    const ici = ouvrirSession(db, id, { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120" });
    ouvrirSession(db, id, { userAgent: "Mozilla/5.0 (Linux; Android 13) Chrome/120" });
    ouvrirSession(db, id, { userAgent: "Mozilla/5.0 (iPhone) Safari/605" });

    const fermees = fermerToutesSessions(db, id, { sauf: ici.secret });
    assert.equal(fermees, 2);
    assert.ok(sessionDepuisSecret(db, ici.secret), "on ne se coupe pas soi-même");
  } finally { fermer(); }
});

test("la liste marque la session courante et nomme l'appareil", () => {
  const { db, fermer, id } = monde();
  try {
    const ici = ouvrirSession(db, id, { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/120 Safari/537" });
    ouvrirSession(db, id, { userAgent: "Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537" });

    const liste = sessionsDe(db, id, ici.secret);
    assert.equal(liste.length, 2);
    assert.equal(liste.filter((s) => s.courante).length, 1);

    const noms = liste.map((s) => s.appareil);
    assert.ok(noms.includes("Chrome sur Windows"), noms.join(" | "));
    assert.ok(noms.includes("Chrome sur Android"), noms.join(" | "));

    /* Jamais le secret, ni son empreinte : la liste sert à reconnaître une
       session, pas à s'en servir. */
    for (const s of liste) {
      assert.equal(s.token_hash, undefined);
      assert.equal(s.secret, undefined);
    }
  } finally { fermer(); }
});

test("un agent absent ou illisible ne casse rien", () => {
  const { db, fermer, id } = monde();
  try {
    ouvrirSession(db, id, { userAgent: null });
    ouvrirSession(db, id, { userAgent: "curl/8.4.0" });
    const noms = sessionsDe(db, id).map((s) => s.appareil);
    assert.deepEqual([...noms].sort(), ["Appareil inconnu", "Appareil inconnu"]);
  } finally { fermer(); }
});

/* --- blocage et délai progressif ------------------------------------------ */

test("le délai entre deux tentatives s'allonge à chaque échec", () => {
  const { db, fermer } = monde();
  try {
    /* Porte ouverte tant que rien n'a échoué. */
    assert.equal(attenteAvantEssai(lire(db)), null);

    /* Puis l'attente s'allonge : une seconde après le premier échec, deux
       après le deuxième, cinq, quinze. Une seconde ne se remarque pas quand
       on s'est trompé de touche ; quinze rendent l'essai en masse absurde. */
    for (let echecs = 1; echecs < ECHECS_MAX; echecs++) {
      authentifier(db, "cible@vizdata.ci", "faux");
      assert.equal(lire(db).failed_attempts, echecs);

      const attendu = DELAIS[echecs];
      const attente = attenteAvantEssai(lire(db));
      assert.ok(attente, `après ${echecs} échec(s), il faut attendre`);
      assert.equal(attente.motif, "delai");
      assert.ok(attente.secondes > 0 && attente.secondes <= attendu, `${attente.secondes} > ${attendu}`);

      /* Le temps passe : l'attente est purgée et l'essai suivant est permis. */
      reculerEchec(db, attendu + 1);
      assert.equal(attenteAvantEssai(lire(db)), null);
    }
  } finally { fermer(); }
});

test("cinq échecs bloquent le compte un quart d'heure", () => {
  const { db, fermer } = monde();
  try {
    for (let i = 0; i < ECHECS_MAX; i++) {
      authentifier(db, "cible@vizdata.ci", "faux");
      reculerEchec(db, 60);
    }
    assert.equal(lire(db).failed_attempts, ECHECS_MAX);

    /* Et le BON mot de passe ne passe plus : c'est tout l'intérêt, sans quoi
       il suffirait de tomber juste au sixième essai. */
    const refus = authentifier(db, "cible@vizdata.ci", MDP);
    assert.equal(refus.refus, "attendre");
    assert.equal(refus.motif, "blocage");
    assert.ok(refus.secondes > 0 && refus.secondes <= BLOCAGE);
    assert.equal(refus.compte, undefined);
  } finally { fermer(); }
});

test("s'acharner prolonge le blocage, le silence l'efface", () => {
  const { db, fermer } = monde();
  try {
    for (let i = 0; i < ECHECS_MAX; i++) {
      authentifier(db, "cible@vizdata.ci", "faux");
      reculerEchec(db, 60);
    }

    /* Quatorze minutes de silence : il reste une minute. */
    reculerEchec(db, BLOCAGE - 60);
    assert.equal(attenteAvantEssai(lire(db))?.motif, "blocage");

    /* Un quart d'heure franc : l'ardoise est effacée, et le bon mot de passe
       ouvre de nouveau. Sans cette péremption, cinq fautes de frappe étalées
       sur un mois finiraient par bloquer quelqu'un qui n'a rien fait. */
    reculerEchec(db, BLOCAGE + 1);
    assert.equal(attenteAvantEssai(lire(db)), null);
    const ok = authentifier(db, "cible@vizdata.ci", MDP);
    assert.ok(ok.compte, "le compte doit se rouvrir");
    assert.equal(lire(db).failed_attempts, 0);
  } finally { fermer(); }
});

test("le blocage ne vaut que pour le compte visé", () => {
  const { db, fermer } = monde();
  try {
    const voisin = compte(db, { email: "voisin@vizdata.ci", empreinte: hacherMotDePasse(MDP) });
    for (let i = 0; i < ECHECS_MAX; i++) {
      authentifier(db, "cible@vizdata.ci", "faux");
      reculerEchec(db, 60);
    }
    /* Bloquer tout le monde parce qu'on s'acharne sur un compte reviendrait à
       offrir à l'attaquant la fermeture du registre entier. */
    const ok = authentifier(db, "voisin@vizdata.ci", MDP);
    assert.ok(ok.compte);
    assert.equal(ok.compte.id, voisin);
  } finally { fermer(); }
});

/* --- l'écran et le registre doivent dire la même durée --------------------- */

test("les durées du navigateur sont celles du registre", async () => {
  /* Le navigateur ne peut lire ni server/comptes.mjs ni api/lib/Comptes.php :
     les deux durées y sont donc recopiées, dans src/lib/inactivite.js. C'est
     la seule duplication acceptée dans ce produit, et voici ce qui la tient.
     Sans ce test, l'écran pourrait prévenir à huit minutes pendant que le
     serveur coupe à cinq — et le compte à rebours mentirait. */
  const ecran = await import("../src/lib/inactivite.js");
  assert.equal(ecran.INACTIVITE, INACTIVITE);
  assert.equal(ecran.INACTIVITE_PREAVIS, INACTIVITE_PREAVIS);
});

test("le registre PHP annonce les mêmes valeurs que le registre Node", async () => {
  /* Les deux registres sont jumeaux : le PHP sert la production, le Node
     porte les tests. Une règle de sécurité qui ne vaudrait que dans celui
     qu'on éprouve ne protégerait personne. */
  const { readFileSync } = await import("node:fs");
  const php = readFileSync(new URL("../api/lib/Comptes.php", import.meta.url), "utf8");

  const valeur = (nom) => {
    const trouve = php.match(new RegExp(`const ${nom} = (\\d+)`));
    assert.ok(trouve, `${nom} absent du registre PHP`);
    return Number(trouve[1]);
  };
  assert.equal(valeur("INACTIVITE"), INACTIVITE);
  assert.equal(valeur("INACTIVITE_PREAVIS"), INACTIVITE_PREAVIS);
  assert.equal(valeur("ECHECS_MAX"), ECHECS_MAX);
  assert.equal(valeur("BLOCAGE"), BLOCAGE);

  const delais = php.match(/const DELAIS = \[([^\]]+)\]/);
  assert.ok(delais, "DELAIS absent du registre PHP");
  assert.deepEqual(delais[1].split(",").map((n) => Number(n.trim())), DELAIS);
});
