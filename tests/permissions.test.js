/* Rôles et autorisations, côté affichage.
 *
 * Ces règles ne protègent rien : elles décident ce qu'un écran montre. La
 * sécurité est tenue par la base — politiques RLS, `has_perm()`, `is_admin()`,
 * et le déclencheur qui empêche un gestionnaire d'élargir ses propres droits.
 *
 * Elles doivent néanmoins dire la même chose que la base. Si l'écran est plus
 * permissif, il propose des actions que la base refusera : désagréable. S'il
 * l'est moins, il cache des actions permises : frustrant. Le cas réellement
 * grave serait qu'une règle ici fasse CROIRE à une protection — d'où le test
 * du gestionnaire sans autorisation, qui ne doit rien pouvoir.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTORISATIONS,
  estAdmin,
  estAdministration,
  peut,
  libelleRole,
  resumeAutorisations,
} from "../src/lib/permissions.js";

const admin = { role: "ADMIN", permissions: {} };
const gestionnaireComplet = {
  role: "MANAGER",
  permissions: Object.fromEntries(AUTORISATIONS.map((a) => [a.cle, true])),
};
const gestionnaireLimite = { role: "MANAGER", permissions: { attribuer_certificats: true } };
const gestionnaireNu = { role: "MANAGER", permissions: {} };
const certifie = { role: "CERTIFIED", permissions: {} };

test("l'administrateur a tous les droits, sans configuration", () => {
  assert.ok(estAdmin(admin));
  assert.ok(estAdministration(admin));
  for (const a of AUTORISATIONS) {
    assert.ok(peut(admin, a.cle), `l'administrateur devrait pouvoir ${a.cle}`);
  }
});

test("le gestionnaire n'a que ce qui lui a été accordé", () => {
  assert.ok(!estAdmin(gestionnaireLimite));
  assert.ok(estAdministration(gestionnaireLimite));
  assert.ok(peut(gestionnaireLimite, "attribuer_certificats"));
  assert.ok(!peut(gestionnaireLimite, "revoquer_certificats"));
  assert.ok(!peut(gestionnaireLimite, "creer_titulaires"));
});

test("un gestionnaire sans autorisation ne peut rien", () => {
  for (const a of AUTORISATIONS) {
    assert.ok(!peut(gestionnaireNu, a.cle), `ne devrait pas pouvoir ${a.cle}`);
  }
});

test("le certifié n'appartient pas à l'administration", () => {
  assert.ok(!estAdmin(certifie));
  assert.ok(!estAdministration(certifie));
  assert.ok(!peut(certifie, "attribuer_certificats"));
});

test("un visiteur sans session ne peut rien", () => {
  assert.ok(!estAdmin(null));
  assert.ok(!estAdministration(null));
  assert.ok(!peut(null, "attribuer_certificats"));
  assert.ok(!peut(undefined, "creer_titulaires"));
});

test("un compte désactivé perd l'accès à l'administration", () => {
  /* Le compte garde son rôle — on ne rétrograde pas quelqu'un qu'on suspend —
     mais il ne doit plus rien pouvoir. La base applique la même règle :
     `is_staff()` et `has_perm()` exigent account_status = 'ACTIVE'. */
  const suspendu = { ...admin, account_status: "DISABLED" };
  assert.ok(!estAdministration(suspendu));
  assert.ok(!peut(suspendu, "attribuer_certificats"));
});

test("une autorisation inconnue est refusée plutôt qu'ignorée", () => {
  assert.ok(!peut(gestionnaireComplet, "supprimer_le_registre"));
});

test("les libellés de rôle sont lisibles, y compris pour un rôle inattendu", () => {
  assert.equal(libelleRole("ADMIN"), "Administrateur");
  assert.equal(libelleRole("MANAGER"), "Gestionnaire");
  assert.equal(libelleRole("CERTIFIED"), "Certifié");
  assert.equal(libelleRole("ROLE_INCONNU"), "ROLE_INCONNU");
  assert.equal(libelleRole(null), "Rôle inconnu");
});

test("le résumé des autorisations distingue les trois cas", () => {
  assert.equal(resumeAutorisations(admin), "Tous les droits");
  assert.equal(resumeAutorisations(gestionnaireComplet), "Toutes les autorisations");
  assert.equal(resumeAutorisations(gestionnaireNu), "Aucune autorisation");
  assert.match(resumeAutorisations(gestionnaireLimite), /Attribuer/);
  assert.equal(resumeAutorisations(certifie), "Sans objet");
});

test("chaque autorisation porte un libellé et une explication", () => {
  /* Une case à cocher sans explication ne se décide pas : l'administrateur
     doit savoir ce qu'il accorde. */
  for (const a of AUTORISATIONS) {
    assert.ok(a.cle && a.label && a.detail, `autorisation incomplète : ${a.cle}`);
    assert.match(a.cle, /^[a-z_]+$/, `clé non conforme : ${a.cle}`);
  }
});
