/* Analyse des clés Supabase.
 *
 * C'est la logique qui autorise ou refuse une mise en production. Le cas qui
 * compte le plus est le refus d'une clé secrète : un paquet navigateur est
 * public, et une clé service_role qui s'y trouverait contournerait toutes les
 * politiques RLS du registre.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { analyserCle } from "../scripts/cle-supabase.mjs";

/** Fabrique un JWT non signé portant le rôle demandé. */
const jeton = (role) => {
  const partie = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${partie({ alg: "HS256" })}.${partie({ role, iss: "supabase" })}.signature`;
};

test("une clé publiable complète est acceptée", () => {
  const r = analyserCle("sb_publishable_4h3QzsZ6eswQ-Q0riPl6qw_bmanMXnY");
  assert.equal(r.format, "publiable");
  assert.equal(r.role, "anon");
  assert.equal(r.danger, null);
});

test("une clé secrète est refusée", () => {
  const r = analyserCle("sb_secret_BaFz5quelquechose");
  assert.equal(r.format, "secrète");
  assert.match(r.danger, /RLS/);
});

test("un jeton legacy anon est accepté", () => {
  const r = analyserCle(jeton("anon"));
  assert.equal(r.format, "legacy");
  assert.equal(r.role, "anon");
  assert.equal(r.danger, null);
});

test("un jeton legacy service_role est refusé", () => {
  const r = analyserCle(jeton("service_role"));
  assert.equal(r.role, "service_role");
  assert.match(r.danger, /RLS/);
});

test("une clé publiable tronquée est refusée", () => {
  /* Le cas réellement rencontré : une invite masquée n'avait retenu qu'un
     fragment du collage, et le déploiement répondait « Invalid API key ». */
  const r = analyserCle("sb_publishable_4h3");
  assert.match(r.danger, /tronqué/);
});

test("une valeur vide est refusée", () => {
  assert.match(analyserCle("").danger, /absente/);
  assert.match(analyserCle("   ").danger, /absente/);
  assert.match(analyserCle(undefined).danger, /absente/);
});

test("un format inconnu est refusé", () => {
  const r = analyserCle("ma-cle-a-moi");
  assert.equal(r.format, "inconnu");
  assert.match(r.danger, /sb_publishable_/);
});

test("les espaces autour de la clé sont tolérés", () => {
  const r = analyserCle("  sb_publishable_4h3QzsZ6eswQ-Q0riPl6qw_bmanMXnY\n");
  assert.equal(r.danger, null);
});
