/* Routage : correspondance entre adresses et écrans.
 *
 * toRoute et toPath sont des fonctions pures — elles ne touchent pas au
 * navigateur — donc directement exécutables sous Node.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { toRoute, toPath } from "../src/lib/router.js";

test("l'accueil répond à la racine", () => {
  assert.deepEqual(toRoute("/"), { view: "home" });
  assert.equal(toPath({ view: "home" }), "/");
});

test("un jeton dans l'adresse ouvre le verdict de vérification", () => {
  assert.deepEqual(toRoute("/verifier/abc123"), {
    view: "verifyResult",
    token: "abc123",
    source: "lien",
  });
});

test("sans jeton, /verifier ouvre la saisie de référence", () => {
  assert.deepEqual(toRoute("/verifier"), { view: "verify" });
});

test("le profil public accepte un identifiant", () => {
  assert.deepEqual(toRoute("/u/awa-diallo"), { view: "publicProfile", username: "awa-diallo" });
  assert.equal(toPath({ view: "publicProfile", username: "awa-diallo" }), "/u/awa-diallo");
});

test("les jetons et identifiants sont encodés puis décodés", () => {
  const jeton = "a b/c";
  const chemin = toPath({ view: "verifyResult", token: jeton });
  assert.equal(chemin, "/verifier/a%20b%2Fc");
  assert.equal(toRoute(chemin).token, jeton);
});

test("l'espace administrateur ouvre son premier onglet", () => {
  assert.deepEqual(toRoute("/administration"), { view: "admin", page: "dashboard" });
});

test("un chemin inconnu mène à la page introuvable", () => {
  assert.equal(toRoute("/inconnu").view, "notFound");
  assert.equal(toRoute("/verifier/trop/de/segments").view, "verifyResult");
  assert.equal(toRoute("/espace/quelque-chose").view, "notFound");
});

test("aller-retour entre route et chemin", () => {
  for (const route of [
    { view: "home" },
    { view: "verify" },
    { view: "about" },
    { view: "login" },
    { view: "dashboard" },
    { view: "verifyResult", token: "xyz" },
    { view: "publicProfile", username: "kouassi-yao" },
  ]) {
    const retour = toRoute(toPath(route));
    assert.equal(retour.view, route.view, `vue perdue pour ${route.view}`);
  }
});

test("les barres de fin ne changent pas la route", () => {
  assert.equal(toRoute("/a-propos/").view, "about");
  assert.equal(toRoute("//").view, "home");
});
