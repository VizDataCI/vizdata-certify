/* La chaîne de mot de passe : ce qui en relève du navigateur.
 *
 * Ces tests existent à cause d'un défaut réel et durable : l'e-mail de
 * réinitialisation partait, le lien fonctionnait, et le mot de passe ne
 * changeait jamais. L'adresse de retour pointait vers l'accueil, où aucun
 * formulaire n'attendait.
 *
 * Les règles éprouvées ici sont les seules de toute la chaîne qui ne
 * dépendent ni du réseau ni du DOM. Le serveur importe le MÊME module : l'écran
 * et le registre exigent donc exactement la même chose d'un mot de passe, et
 * il est impossible qu'ils divergent.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { qualiteMotDePasse, jetonDansAdresse, effacerJetonDeLAdresse } from "../src/lib/mot-de-passe.js";

/* --- exigences du mot de passe ------------------------------------------- */

test("un mot de passe trop court est refusé", () => {
  assert.match(qualiteMotDePasse("Viz2026"), /huit caractères/);
  assert.match(qualiteMotDePasse(""), /huit caractères/);
  assert.match(qualiteMotDePasse(undefined), /huit caractères/);
});

test("un mot de passe sans chiffre est refusé", () => {
  assert.match(qualiteMotDePasse("VizdataCertify"), /chiffre/);
});

test("un mot de passe sans lettre est refusé", () => {
  assert.match(qualiteMotDePasse("20262026"), /lettre/);
});

test("un mot de passe conforme passe", () => {
  assert.equal(qualiteMotDePasse("VizData2026"), "");
  assert.equal(qualiteMotDePasse("a1234567"), "");
});

/* --- lecture du lien reçu par courrier ----------------------------------- */

test("le secret est lu dans la chaîne de requête", () => {
  assert.equal(
    jetonDansAdresse("https://certify.vizdata.ci/nouveau-mot-de-passe?jeton=abc-123_XYZ"),
    "abc-123_XYZ"
  );
});

test("le secret est aussi lu dans le fragment", () => {
  /* Certaines passerelles de messagerie réécrivent les liens : un fragment
     survit parfois là où une chaîne de requête est tronquée. Le lire aux deux
     endroits évite un « lien invalide » inexplicable. */
  assert.equal(jetonDansAdresse("https://certify.vizdata.ci/nouveau-mot-de-passe#jeton=abc-123"), "abc-123");
});

test("une adresse ouverte à la main ne porte aucun secret", () => {
  assert.equal(jetonDansAdresse("https://certify.vizdata.ci/nouveau-mot-de-passe"), null);
  assert.equal(jetonDansAdresse("https://certify.vizdata.ci/nouveau-mot-de-passe?autre=1"), null);
});

test("une adresse illisible ne fait pas tomber l'écran", () => {
  assert.equal(jetonDansAdresse("pas une adresse"), null);
  assert.equal(jetonDansAdresse(""), null);
  assert.equal(jetonDansAdresse(undefined), null);
});

test("le secret est retiré de la barre d'adresse", () => {
  /* Un jeton qui reste affiché part dans l'historique du navigateur, sur une
     capture d'écran, et dans l'en-tête Referer de la première requête vers un
     site tiers. */
  let remplacee = null;
  const historique = { replaceState: (_e, _t, url) => { remplacee = url; } };
  const emplacement = { href: "https://certify.vizdata.ci/nouveau-mot-de-passe?jeton=secret&autre=1" };

  effacerJetonDeLAdresse(historique, emplacement);
  assert.equal(remplacee, "/nouveau-mot-de-passe?autre=1");
  assert.ok(!remplacee.includes("secret"));
});

test("sans secret dans l'adresse, rien n'est réécrit", () => {
  let appelee = false;
  effacerJetonDeLAdresse(
    { replaceState: () => { appelee = true; } },
    { href: "https://certify.vizdata.ci/espace" }
  );
  assert.equal(appelee, false);
});
