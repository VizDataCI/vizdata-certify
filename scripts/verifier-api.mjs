/* Vérifie le contrat entre l'application et le projet Supabase.
 *
 * Ce script exécute le vrai code de src/data/api.js contre la vraie base, en
 * position de visiteur anonyme. Il ne remplace pas des tests unitaires : il
 * répond à la question qui casse le plus souvent en silence — « les requêtes
 * correspondent-elles encore au schéma, et les politiques tiennent-elles ? »
 *
 * Un nom de colonne disparu, une relation renommée, une politique relâchée par
 * mégarde : tout cela se voit ici et nulle part ailleurs.
 *
 *   npm run verifier
 *
 * Seule la lecture des variables d'environnement Vite est neutralisée, pour que
 * les modules soient importables hors du navigateur.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const SORTIE = join("node_modules", ".verifier-api");

function preparerCopie() {
  let env;
  try {
    env = readFileSync(".env.local", "utf8");
  } catch {
    console.error("Aucun .env.local : rien à vérifier. Copiez .env.example et renseignez les clés.");
    process.exit(2);
  }

  const url = env.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
  const cle = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
  if (!url || !cle) {
    console.error("VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY manquante dans .env.local.");
    process.exit(2);
  }

  mkdirSync(SORTIE, { recursive: true });
  writeFileSync(
    join(SORTIE, "supabase.js"),
    readFileSync("src/lib/supabase.js", "utf8")
      .replace("import.meta.env.VITE_SUPABASE_URL", JSON.stringify(url))
      .replace("import.meta.env.VITE_SUPABASE_ANON_KEY", JSON.stringify(cle)),
  );
  writeFileSync(
    join(SORTIE, "api.js"),
    readFileSync("src/data/api.js", "utf8").replace('"../lib/supabase.js"', '"./supabase.js"'),
  );
}

let echecs = 0;

async function verifier(intitule, execution) {
  try {
    const message = await execution();
    console.log("  ok     " + intitule + (message ? " — " + message : ""));
  } catch (e) {
    console.log("  ÉCHEC  " + intitule + " — " + e.message);
    echecs++;
  }
}

/** Attend que l'appel soit refusé par les politiques, pas par une erreur de syntaxe. */
async function doitEtreRefuse(intitule, execution) {
  await verifier(intitule, async () => {
    try {
      await execution();
    } catch (e) {
      if (/row-level security|permission denied|violates/i.test(e.message)) return "refusé comme prévu";
      throw new Error("refusé, mais pour une autre raison : " + e.message);
    }
    throw new Error("l'appel est passé alors qu'il devait être refusé");
  });
}

preparerCopie();
const api = await import("../" + SORTIE.replace(/\\/g, "/") + "/api.js");
const INEXISTANT = "00000000-0000-0000-0000-000000000000";

console.log("\nChemin public — doit répondre sans session\n");
await verifier("verify_certificate", async () => {
  const r = await api.verifyByToken("jeton-de-controle", "lien");
  if (r !== null) throw new Error("un jeton inventé a renvoyé un certificat");
  return "jeton inconnu → null";
});
await verifier("verify_by_reference", async () => {
  await api.verifyByReference("REFERENCE-DE-CONTROLE");
  return "répond";
});
await verifier("public_profile", async () => {
  const r = await api.publicProfile("profil-de-controle");
  if (!Array.isArray(r)) throw new Error("réponse inattendue");
  return "répond";
});
await verifier("record_share", async () => {
  await api.recordShare("jeton-de-controle", "email");
  return "accepté, sans effet sur un jeton inconnu";
});

console.log("\nLectures — les requêtes doivent rester conformes au schéma\n");
await verifier("fetchRegistry", async () => {
  const r = await api.fetchRegistry();
  if (r.users.length > 0) throw new Error("la table users est lisible sans session");
  if (r.certificates.length > 0) throw new Error("la table certificates est lisible sans session");
  if (r.types.length === 0) throw new Error("les types ne sont plus lisibles publiquement");
  return `users et certificates fermés, ${r.types.length} types et ${r.skills.length} compétences ouverts`;
});
await verifier("fetchMyCertificates", async () => {
  const r = await api.fetchMyCertificates("Contrôle");
  if (r.length > 0) throw new Error("des certificats sortent sans session");
  return "jointures acceptées, aucune ligne";
});
await verifier("fetchProfile", async () => {
  const r = await api.fetchProfile(INEXISTANT);
  if (r !== null) throw new Error("un profil est sorti");
  return "aucun profil";
});

console.log("\nÉcritures — doivent être bornées par les politiques\n");
await doitEtreRefuse("createCertificate", () =>
  api.createCertificate(
    {
      code: "EXCEL",
      user_id: INEXISTANT,
      certificate_type_id: INEXISTANT,
      issue_date: "2026-01-01",
      expiry_date: null,
      score: 1,
      duration: 1,
      trainer: "contrôle",
      signatory: "contrôle",
    },
    [],
  ),
);
await doitEtreRefuse("createType", () =>
  api.createType({ code: "CONTROLE", name: "contrôle", description: "", default_duration: 1, validity_period: null, status: "ACTIVE" }),
);
await doitEtreRefuse("logAction", () => api.logAction(INEXISTANT, "CONTROLE", INEXISTANT, ""));

console.log("\nDurcissement — ces fonctions ne doivent plus être publiques\n");
await doitEtreRefuse("next_reference", async () => {
  const { supabase } = await import("../" + SORTIE.replace(/\\/g, "/") + "/supabase.js");
  const { error } = await supabase.rpc("next_reference", { p_code: "EXCEL", p_year: 2026 });
  if (error) throw new Error(error.message);
});
await doitEtreRefuse("new_public_token", async () => {
  const { supabase } = await import("../" + SORTIE.replace(/\\/g, "/") + "/supabase.js");
  const { error } = await supabase.rpc("new_public_token");
  if (error) throw new Error(error.message);
});

rmSync(SORTIE, { recursive: true, force: true });

console.log(echecs === 0 ? "\nContrat respecté.\n" : `\n${echecs} vérification(s) en échec.\n`);
process.exit(echecs === 0 ? 0 : 1);
