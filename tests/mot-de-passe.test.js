/* La chaîne de réinitialisation du mot de passe.
 *
 * Ces tests existent à cause d'un défaut réel et durable : l'e-mail de
 * réinitialisation partait, le lien fonctionnait, et le mot de passe ne
 * changeait jamais. L'adresse de retour pointait vers l'accueil, où aucun
 * formulaire n'attendait. Pire, un lien expiré n'affichait rien
 * d'intelligible — l'utilisateur ne savait pas qu'il devait en redemander un.
 *
 * Les deux règles éprouvées ici sont les seules de toute la chaîne qui ne
 * dépendent ni du réseau ni du navigateur. Le reste — l'envoi, l'ouverture de
 * session, l'écriture — appartient à Supabase.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { qualiteMotDePasse, etatLienRecuperation } from "../src/lib/mot-de-passe.js";

/* --- exigences du mot de passe ------------------------------------------ */

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

/* --- lecture du lien de retour ------------------------------------------
   Les adresses sont celles que Supabase produit réellement. */

test("un lien de récupération valide est reconnu", () => {
  const r = etatLienRecuperation(
    "https://certify.vizdata.ci/nouveau-mot-de-passe#access_token=eyJhbGciOi&expires_in=3600&refresh_token=abc&token_type=bearer&type=recovery"
  );
  assert.equal(r.etat, "accepte");
  assert.equal(r.type, "recovery");
});

test("le flux PKCE place le code en chaîne de requête", () => {
  const r = etatLienRecuperation("https://certify.vizdata.ci/nouveau-mot-de-passe?code=7f3a-91bd");
  assert.equal(r.etat, "accepte");
});

test("une invitation est reconnue comme un lien valide", () => {
  /* Un titulaire invité arrive par le même chemin, avec type=invite : il doit
     pouvoir choisir son mot de passe, pas se voir refuser le lien. */
  const r = etatLienRecuperation("https://certify.vizdata.ci/nouveau-mot-de-passe#access_token=eyJ&type=invite");
  assert.equal(r.etat, "accepte");
  assert.equal(r.type, "invite");
});

test("un lien expiré le dit, et dit quoi faire", () => {
  const r = etatLienRecuperation(
    "https://certify.vizdata.ci/nouveau-mot-de-passe#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"
  );
  assert.equal(r.etat, "refuse");
  assert.equal(r.expire, true);
  assert.match(r.message, /expiré/);
});

test("un refus sans code d'expiration remonte la description de Supabase, lisible", () => {
  const r = etatLienRecuperation(
    "https://certify.vizdata.ci/nouveau-mot-de-passe#error=access_denied&error_description=Email+link+is+invalid"
  );
  assert.equal(r.etat, "refuse");
  assert.equal(r.expire, false);
  /* Les « + » de l'encodage ne doivent pas rester à l'écran. */
  assert.ok(!r.message.includes("+"), `message non décodé : ${r.message}`);
});

test("une adresse ouverte à la main ne porte aucun lien", () => {
  assert.equal(etatLienRecuperation("https://certify.vizdata.ci/nouveau-mot-de-passe").etat, "aucun");
});

test("un refus posé en chaîne de requête est lu comme un refus", () => {
  /* Supabase a placé l'erreur tantôt dans le fragment, tantôt dans la requête,
     selon les versions. Lire un seul des deux emplacements ferait passer un
     lien refusé pour une arrivée normale — et le formulaire s'ouvrirait sur
     une session inexistante. */
  const r = etatLienRecuperation("https://certify.vizdata.ci/nouveau-mot-de-passe?error=access_denied&error_code=otp_expired");
  assert.equal(r.etat, "refuse");
  assert.equal(r.expire, true);
});
