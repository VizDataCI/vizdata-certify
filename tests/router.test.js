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

test("la page de vente de l'académie a sa propre adresse", () => {
  assert.deepEqual(toRoute("/academie"), { view: "academie" });
  assert.equal(toPath({ view: "academie" }), "/academie");
});

/* Les deux temps de la réinitialisation du mot de passe.
 *
 * L'adresse de /nouveau-mot-de-passe est celle que Supabase utilise comme
 * retour des liens d'invitation et de réinitialisation. Elle est donc inscrite
 * dans des messages déjà envoyés et dans la configuration du projet : la
 * changer casserait les liens en circulation. Ce test la fige. */
test("la demande de réinitialisation a son adresse", () => {
  assert.deepEqual(toRoute("/mot-de-passe-oublie"), { view: "forgotPassword" });
  assert.equal(toPath({ view: "forgotPassword" }), "/mot-de-passe-oublie");
});

test("l'adresse de retour des liens Supabase est /nouveau-mot-de-passe", () => {
  assert.deepEqual(toRoute("/nouveau-mot-de-passe"), { view: "newPassword" });
  assert.equal(toPath({ view: "newPassword" }), "/nouveau-mot-de-passe");
});

/* L'espace du titulaire s'atteint par la vue « dashboard », pas par « espace ».
 *
 * Le nom de la vue et celui du chemin diffèrent, et c'est un piège : trois
 * liens de l'administration ont été écrits avec « espace », la vue inconnue
 * est retombée sur l'accueil, et le bouton « Ma sécurité » ramenait à la page
 * d'accueil sans que rien ne le signale.
 *
 * Ce test fige le nom de la vue, et le suivant fige le repli silencieux comme
 * un comportement connu plutôt que subi. */
test("l'espace du titulaire répond au nom de vue « dashboard »", () => {
  assert.equal(toPath({ view: "dashboard" }), "/espace");
  assert.deepEqual(toRoute("/espace"), { view: "dashboard" });
});

test("une vue inconnue retombe sur l'accueil, et ne prétend pas mener ailleurs", () => {
  assert.equal(toPath({ view: "espace" }), "/");
  assert.equal(toPath({ view: "nimporte-quoi" }), "/");
});

/* L'onglet voyage avec la route sans changer l'adresse : l'espace a trois
   onglets et une seule adresse, et un lien direct vers la sécurité ne doit pas
   inventer un chemin qui n'existe pas côté serveur. */
test("l'onglet demandé ne modifie pas le chemin", () => {
  assert.equal(toPath({ view: "dashboard", tab: "settings" }), "/espace");
});
