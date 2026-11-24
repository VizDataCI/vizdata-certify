/* Mots de passe, sessions et liens à usage unique.
 *
 * Tout ce que Supabase faisait et qu'il faut désormais faire correctement
 * soi-même. Chaque test correspond à une propriété de sécurité précise, pas à
 * une ligne de code : si la mise en œuvre change, ces tests doivent continuer
 * de passer tels quels.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { baseNeuve, compte } from "./aide-base.mjs";
import {
  hacherMotDePasse,
  verifierMotDePasse,
  ouvrirSession,
  sessionDepuisSecret,
  fermerSession,
  fermerToutesSessions,
  creerJeton,
  consommerJeton,
  authentifier,
  definirMotDePasse,
  menage,
  empreinteJeton,
} from "../server/comptes.mjs";
import { uid } from "../server/db.mjs";

/* --- mots de passe -------------------------------------------------------- */

test("le mot de passe n'est jamais stocké en clair", () => {
  const empreinte = hacherMotDePasse("VizData2026");
  assert.ok(!empreinte.includes("VizData2026"), "le mot de passe se lit dans l'empreinte");
  assert.match(empreinte, /^scrypt\$\d+\$\d+\$\d+\$[\w-]+\$[\w-]+$/);
});

test("deux mots de passe identiques donnent deux empreintes différentes", () => {
  /* Sans sel par mot de passe, une table précalculée casserait d'un coup tous
     les comptes partageant le même mot de passe. */
  assert.notEqual(hacherMotDePasse("VizData2026"), hacherMotDePasse("VizData2026"));
});

test("l'empreinte porte ses paramètres de calcul", () => {
  /* Le coût devra être relevé dans quelques années. En l'inscrivant dans
     chaque empreinte, les anciens mots de passe restent vérifiables pendant
     que les nouveaux coûtent plus cher — sans quoi relever le coût
     invaliderait tous les comptes d'un coup. */
  const ancienne = hacherMotDePasse("VizData2026", { N: 16384, r: 8, p: 1, longueur: 32, maxmem: 96 * 1024 * 1024 });
  assert.ok(ancienne.startsWith("scrypt$16384$8$1$"));
  assert.ok(verifierMotDePasse("VizData2026", ancienne), "une empreinte au coût ancien n'est plus vérifiable");
});

test("un mot de passe faux, vide ou voisin est refusé", () => {
  const empreinte = hacherMotDePasse("VizData2026");
  assert.ok(verifierMotDePasse("VizData2026", empreinte));
  assert.ok(!verifierMotDePasse("VizData2027", empreinte));
  assert.ok(!verifierMotDePasse("vizdata2026", empreinte));
  assert.ok(!verifierMotDePasse("", empreinte));
  assert.ok(!verifierMotDePasse("VizData2026 ", empreinte));
});

test("une empreinte illisible refuse, elle n'accepte pas", () => {
  /* Le défaut doit toujours être le refus. Une empreinte tronquée par une
     reprise de données ne doit pas ouvrir le compte à n'importe quoi. */
  for (const dechet of ["", "x", "scrypt$", "scrypt$a$b$c$d$e", "bcrypt$10$abcdef", null, undefined, 42]) {
    assert.ok(!verifierMotDePasse("VizData2026", dechet), `empreinte acceptée : ${String(dechet)}`);
  }
});

/* --- authentification ----------------------------------------------------- */

test("l'adresse est reconnue quelle que soit la casse", () => {
  const { db, fermer } = baseNeuve();
  try {
    compte(db, { email: "fabrice@vizdata.ci", empreinte: hacherMotDePasse("VizData2026") });
    assert.ok(authentifier(db, "FABRICE@VIZDATA.CI", "VizData2026").compte);
    assert.ok(authentifier(db, "  fabrice@vizdata.ci  ", "VizData2026").compte);
  } finally {
    fermer();
  }
});

test("une adresse inconnue et un mot de passe faux se ressemblent", () => {
  /* Distinguer les deux cas dirait à un attaquant quelles adresses sont
     inscrites au registre. Le refus doit donc être le même mot. */
  const { db, fermer } = baseNeuve();
  try {
    compte(db, { email: "connu@vizdata.ci", empreinte: hacherMotDePasse("VizData2026") });
    assert.equal(authentifier(db, "inconnu@vizdata.ci", "VizData2026").refus, "identifiants");
    assert.equal(authentifier(db, "connu@vizdata.ci", "mauvais").refus, "identifiants");
  } finally {
    fermer();
  }
});

test("un compte sans mot de passe ne se connecte pas", () => {
  /* Un titulaire invité existe avant d'avoir choisi son mot de passe. Tant
     qu'il ne l'a pas fait, son compte ne doit s'ouvrir d'aucune façon. */
  const { db, fermer } = baseNeuve();
  try {
    compte(db, { email: "invite@vizdata.ci", empreinte: null });

    const vide = authentifier(db, "invite@vizdata.ci", "");
    assert.equal(vide.refus, "identifiants");
    assert.equal(vide.compte, undefined);

    /* Le second essai vient aussitôt après le premier : il tombe désormais
       sous le délai progressif, qui s'allonge à chaque échec. Le refus n'est
       plus le même — mais ce que le test tient est inchangé, et c'est le seul
       point qui compte : le compte ne s'ouvre d'aucune façon. */
    const ensuite = authentifier(db, "invite@vizdata.ci", "VizData2026");
    assert.ok(["identifiants", "attendre"].includes(ensuite.refus), ensuite.refus);
    assert.equal(ensuite.compte, undefined);
  } finally {
    fermer();
  }
});

test("un compte désactivé est distingué, et refusé", () => {
  const { db, fermer } = baseNeuve();
  try {
    compte(db, { email: "suspendu@vizdata.ci", statut: "DISABLED", empreinte: hacherMotDePasse("VizData2026") });
    assert.equal(authentifier(db, "suspendu@vizdata.ci", "VizData2026").refus, "desactive");
  } finally {
    fermer();
  }
});

test("le compte renvoyé ne porte jamais l'empreinte du mot de passe", () => {
  /* Cet objet est sérialisé en JSON dans les réponses HTTP. Une empreinte qui
     s'y glisserait partirait vers le navigateur. */
  const { db, fermer } = baseNeuve();
  try {
    compte(db, { email: "f@vizdata.ci", empreinte: hacherMotDePasse("VizData2026") });
    const { compte: vu } = authentifier(db, "f@vizdata.ci", "VizData2026");
    assert.ok(!("password_hash" in vu));
    assert.ok(!JSON.stringify(vu).includes("scrypt$"));
    assert.equal(vu.a_un_mot_de_passe, true);
  } finally {
    fermer();
  }
});

/* --- sessions ------------------------------------------------------------- */

test("une session ouverte reconnaît son porteur", () => {
  const { db, fermer } = baseNeuve();
  try {
    const id = compte(db, { email: "f@vizdata.ci" });
    const { secret } = ouvrirSession(db, id);
    assert.equal(sessionDepuisSecret(db, secret).id, id);
  } finally {
    fermer();
  }
});

test("le secret de session n'est pas stocké, seulement son empreinte", () => {
  const { db, fermer } = baseNeuve();
  try {
    const id = compte(db, { email: "f@vizdata.ci" });
    const { secret } = ouvrirSession(db, id);
    const ligne = db.prepare("select token_hash from sessions").get();
    assert.notEqual(ligne.token_hash, secret, "le secret est stocké tel quel");
    assert.equal(ligne.token_hash, empreinteJeton(secret));
  } finally {
    fermer();
  }
});

test("un secret inventé n'ouvre rien", () => {
  const { db, fermer } = baseNeuve();
  try {
    compte(db, { email: "f@vizdata.ci" });
    for (const faux of ["", null, undefined, "nimporte-quoi", "a".repeat(43)]) {
      assert.equal(sessionDepuisSecret(db, faux), null, `secret accepté : ${String(faux)}`);
    }
  } finally {
    fermer();
  }
});

test("une session expirée n'ouvre plus rien, et disparaît", () => {
  const { db, fermer } = baseNeuve();
  try {
    const id = compte(db, { email: "f@vizdata.ci" });
    const { secret } = ouvrirSession(db, id, { duree: -10 });
    assert.equal(sessionDepuisSecret(db, secret), null);
    assert.equal(db.prepare("select count(*) n from sessions").get().n, 0, "la session périmée traîne encore");
  } finally {
    fermer();
  }
});

test("la déconnexion ferme la session, et elle seule", () => {
  const { db, fermer } = baseNeuve();
  try {
    const id = compte(db, { email: "f@vizdata.ci" });
    const ordinateur = ouvrirSession(db, id);
    const telephone = ouvrirSession(db, id);

    fermerSession(db, ordinateur.secret);
    assert.equal(sessionDepuisSecret(db, ordinateur.secret), null);
    assert.ok(sessionDepuisSecret(db, telephone.secret), "la seconde session a été fermée aussi");
  } finally {
    fermer();
  }
});

test("changer de mot de passe déconnecte les autres appareils", () => {
  /* C'est exactement ce qu'on fait quand on soupçonne que le compte est
     compromis : si l'autre session survivait, le geste ne servirait à rien. */
  const { db, fermer } = baseNeuve();
  try {
    const id = compte(db, { email: "f@vizdata.ci", empreinte: hacherMotDePasse("Ancien2026") });
    const courante = ouvrirSession(db, id);
    const autre = ouvrirSession(db, id);

    definirMotDePasse(db, id, "Nouveau2026", { sauf: courante.secret });

    assert.ok(sessionDepuisSecret(db, courante.secret), "la session courante a été fermée");
    assert.equal(sessionDepuisSecret(db, autre.secret), null, "l'autre appareil est resté connecté");
    assert.ok(authentifier(db, "f@vizdata.ci", "Nouveau2026").compte);
    assert.equal(authentifier(db, "f@vizdata.ci", "Ancien2026").refus, "identifiants");
  } finally {
    fermer();
  }
});

test("définir un mot de passe lève l'obligation d'en choisir un", () => {
  const { db, fermer } = baseNeuve();
  try {
    const id = compte(db, { email: "invite@vizdata.ci" });
    db.prepare("update users set must_change_password = 1 where id = ?").run(id);
    definirMotDePasse(db, id, "VizData2026");
    const ligne = db.prepare("select must_change_password, activated_at from users where id = ?").get(id);
    assert.equal(ligne.must_change_password, 0);
    assert.ok(ligne.activated_at, "la date d'activation n'a pas été posée");
  } finally {
    fermer();
  }
});

test("fermer toutes les sessions n'affecte que le compte visé", () => {
  const { db, fermer } = baseNeuve();
  try {
    const moi = compte(db, { email: "moi@vizdata.ci" });
    const autre = compte(db, { email: "autre@vizdata.ci" });
    const maSession = ouvrirSession(db, moi);
    const saSession = ouvrirSession(db, autre);

    fermerToutesSessions(db, moi);
    assert.equal(sessionDepuisSecret(db, maSession.secret), null);
    assert.ok(sessionDepuisSecret(db, saSession.secret), "la session d'un autre compte a été fermée");
  } finally {
    fermer();
  }
});

/* --- liens à usage unique ------------------------------------------------- */

test("un lien de réinitialisation ne sert qu'une fois", () => {
  /* Sans cela, un lien qui traîne dans une boîte de réception reste une clé du
     compte, des années durant. */
  const { db, fermer } = baseNeuve();
  try {
    const id = compte(db, { email: "f@vizdata.ci" });
    const { secret } = creerJeton(db, id, "REINITIALISATION");
    assert.equal(consommerJeton(db, secret, "REINITIALISATION").utilisateurId, id);
    assert.equal(consommerJeton(db, secret, "REINITIALISATION").refus, "deja_utilise");
  } finally {
    fermer();
  }
});

test("un lien expiré est refusé pour ce qu'il est", () => {
  const { db, fermer } = baseNeuve();
  try {
    const id = compte(db, { email: "f@vizdata.ci" });
    const { secret } = creerJeton(db, id, "REINITIALISATION");
    db.prepare("update jetons set expires_at = '2020-01-01T00:00:00.000Z'").run();
    assert.equal(consommerJeton(db, secret, "REINITIALISATION").refus, "expire");
  } finally {
    fermer();
  }
});

test("demander un second lien invalide le premier", () => {
  /* Deux liens valides en circulation, c'est une porte de plus — et la plus
     ancienne est celle qui a eu le plus de temps pour être lue par
     quelqu'un d'autre. */
  const { db, fermer } = baseNeuve();
  try {
    const id = compte(db, { email: "f@vizdata.ci" });
    const premier = creerJeton(db, id, "REINITIALISATION");
    const second = creerJeton(db, id, "REINITIALISATION");

    assert.equal(consommerJeton(db, premier.secret, "REINITIALISATION").refus, "inconnu");
    assert.equal(consommerJeton(db, second.secret, "REINITIALISATION").utilisateurId, id);
  } finally {
    fermer();
  }
});

test("un lien d'invitation ne vaut pas un lien de réinitialisation", () => {
  const { db, fermer } = baseNeuve();
  try {
    const id = compte(db, { email: "f@vizdata.ci" });
    const { secret } = creerJeton(db, id, "INVITATION");
    assert.equal(consommerJeton(db, secret, "REINITIALISATION").refus, "inconnu");
    assert.equal(consommerJeton(db, secret, "INVITATION").utilisateurId, id);
  } finally {
    fermer();
  }
});

test("un jeton inventé est refusé", () => {
  const { db, fermer } = baseNeuve();
  try {
    assert.equal(consommerJeton(db, "invente", "REINITIALISATION").refus, "inconnu");
    assert.equal(consommerJeton(db, "", "REINITIALISATION").refus, "absent");
  } finally {
    fermer();
  }
});

test("supprimer un compte emporte ses sessions et ses jetons", () => {
  const { db, fermer } = baseNeuve();
  try {
    const id = compte(db, { email: "ephemere@vizdata.ci" });
    ouvrirSession(db, id);
    creerJeton(db, id, "INVITATION");

    db.prepare("delete from users where id = ?").run(id);
    assert.equal(db.prepare("select count(*) n from sessions").get().n, 0);
    assert.equal(db.prepare("select count(*) n from jetons").get().n, 0);
  } finally {
    fermer();
  }
});

test("le ménage retire ce qui est périmé et laisse le reste", () => {
  const { db, fermer } = baseNeuve();
  try {
    const id = compte(db, { email: "f@vizdata.ci" });
    const vivante = ouvrirSession(db, id);
    ouvrirSession(db, id, { duree: -10 });
    creerJeton(db, id, "INVITATION");
    db.prepare("insert into jetons (id, token_hash, user_id, kind, expires_at) values (?, ?, ?, 'REINITIALISATION', '2020-01-01T00:00:00.000Z')")
      .run(uid(), "empreinte-perimee", id);

    const bilan = menage(db);
    assert.equal(bilan.sessions, 1);
    assert.equal(bilan.jetons, 1);
    assert.ok(sessionDepuisSecret(db, vivante.secret), "la session valide a été emportée");
    assert.equal(db.prepare("select count(*) n from jetons").get().n, 1);
  } finally {
    fermer();
  }
});
