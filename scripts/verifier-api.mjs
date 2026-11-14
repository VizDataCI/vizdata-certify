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
  if (r.notifications.length > 0) throw new Error("les notifications sont lisibles sans session");
  if (r.templates.length > 0) throw new Error("les modèles de certificat sont lisibles sans session");
  if (r.types.length === 0) throw new Error("les programmes ne sont plus lisibles publiquement");
  return `users, certificates, notifications et modèles fermés ; ${r.types.length} programmes et ${r.skills.length} compétences ouverts`;
});
await verifier("fetchDomains", async () => {
  /* Les domaines sont lisibles sans session, et c'est voulu : la page publique
     de vérification affiche le domaine du certificat. */
  const r = await api.fetchDomains();
  if (!Array.isArray(r)) throw new Error("réponse inattendue");
  if (r.length === 0) throw new Error("aucun domaine — la migration de refonte n'est pas appliquée");
  return `${r.length} domaines lisibles publiquement`;
});
await verifier("fetchPrograms", async () => {
  /* La jointure vers certification_domains est celle dont dépend tout le
     catalogue : si la clé étrangère disparaît, PostgREST refuse l'imbrication. */
  const r = await api.fetchPrograms();
  if (!Array.isArray(r)) throw new Error("réponse inattendue");
  const rattaches = r.filter((t) => t.certification_domains).length;
  return `${r.length} programmes, dont ${rattaches} rattachés à un domaine`;
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

console.log("\nAutorisations — un visiteur sans session n'en a aucune\n");
for (const [nom, params] of [
  ["is_admin", {}],
  ["is_staff", {}],
  ["has_perm", { p_perm: "attribuer_certificats" }],
  ["has_perm", { p_perm: "creer_titulaires" }],
]) {
  await verifier(`${nom}${params.p_perm ? `(${params.p_perm})` : "()"}`, async () => {
    const { supabase } = await import("../" + SORTIE.replace(/\\/g, "/") + "/supabase.js");
    const { data, error } = await supabase.rpc(nom, params);
    if (error) throw new Error(error.message);
    if (data !== false) throw new Error(`répond ${JSON.stringify(data)} à un visiteur anonyme`);
    return "faux, comme attendu";
  });
}

console.log("\nÉcritures — doivent être bornées par les politiques\n");
await doitEtreRefuse("createCertificate", () =>
  api.createCertificate(
    {
      code: "EXCEL-AVA",
      user_id: INEXISTANT,
      certificate_type_id: INEXISTANT,
      issue_date: "2026-01-01",
      duration: 1,
      trainer: "contrôle",
      signatory: "contrôle",
    },
    [],
  ),
);
await doitEtreRefuse("createProgram", () =>
  api.createProgram({ code: "CONTROLE", name: "contrôle", description: "", default_duration: 1, status: "ACTIVE" }),
);
await doitEtreRefuse("createDomain", () =>
  api.createDomain({ code: "CONTROLE", name: "contrôle", description: "", status: "ACTIVE" }),
);
await doitEtreRefuse("setAccountRole", () => api.setAccountRole(INEXISTANT, "ADMIN", {}));
/* Le journal ne lève pas : il ne doit jamais faire échouer l'acte qu'il
   journalise. Son refus se lit dans la valeur renvoyée. */
await verifier("logAction", async () => {
  const r = await api.logAction(INEXISTANT, "CONTROLE", INEXISTANT, "");
  if (r.ok) throw new Error("le journal accepte une écriture sans session");
  return "refusé sans lever d'exception, comme prévu";
});

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

console.log("\nFonctions Edge — déployées, et fermées sans autorisation\n");
/* Un appel sans session porte la clé publiable comme jeton : la fonction doit
   répondre, puis refuser. Les deux comptent — une fonction non déployée
   donnerait une erreur de transport, et c'est précisément ce qu'on veut
   distinguer d'un refus d'autorisation. */
await verifier("inviter-titulaire", async () => {
  try {
    await api.inviteHolder({ email: "controle@exemple.ci", first_name: "Contrôle", last_name: "Contrôle" });
  } catch (e) {
    if (/injoignable|functions deploy/i.test(e.message)) throw new Error("fonction non déployée");
    if (/autorisation|Authentification/i.test(e.message)) return "déployée, et refuse sans autorisation";
    throw new Error("refusée, mais pour une autre raison : " + e.message);
  }
  throw new Error("un titulaire a été créé sans session — vérifiez le contrôle d'autorisation");
});
await verifier("notifier", async () => {
  /* `notifier` n'est volontairement pas une fonction qui lève : elle rend
     { envoye: false, raison } pour qu'un avis manqué n'interrompe jamais une
     délivrance. C'est donc la raison qu'on lit. */
  const r = await api.notifier("CERTIFICAT_ATTRIBUE", INEXISTANT, {});
  if (r.envoye) throw new Error("un courrier est parti sans session");
  if (/injoignable|functions deploy/i.test(r.raison || "")) throw new Error("fonction non déployée");
  return "déployée, et refuse sans autorisation";
});

console.log("\nAcadémie — candidatures et cohortes\n");
await verifier("cohorte_publique", async () => {
  const { supabase } = await import("../" + SORTIE.replace(/\\/g, "/") + "/supabase.js");
  const { data, error } = await supabase.rpc("cohorte_publique");
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) throw new Error("réponse inattendue");
  return data.length ? `cohorte publiée : ${data[0].libelle}` : "aucune cohorte publiée";
});
/* On appelle la vraie fonction d'écriture, mais avec un engagement à faux :
   elle doit refuser avant toute insertion. Le contrat est donc éprouvé sans
   déposer de candidature de contrôle dans la table. */
await verifier("soumettre_candidature sans engagement", async () => {
  const { supabase } = await import("../" + SORTIE.replace(/\\/g, "/") + "/supabase.js");
  const { data, error } = await supabase.rpc("soumettre_candidature", {
    p_nom: "Contrôle",
    p_whatsapp: "+2250000000000",
    p_email: "controle@exemple.ci",
    p_profession: "Contrôle",
    p_niveau: "DEBUTANT",
    p_formule: "INTEGRAL",
    p_disponible: false,
    p_consent: false,
  });
  if (!error) throw new Error(`candidature acceptée sans engagement — référence ${data} à supprimer`);
  if (!/obligatoire/i.test(error.message)) throw new Error("refusée, mais pour une autre raison : " + error.message);
  return "refusée comme prévu, aucune ligne créée";
});
await verifier("candidatures fermées", async () => {
  const { supabase } = await import("../" + SORTIE.replace(/\\/g, "/") + "/supabase.js");
  const { data, error } = await supabase.from("candidatures").select("reference");
  if (error) return "lecture refusée : " + error.code;
  if (data?.length) throw new Error("des candidatures sortent sans session — données personnelles exposées");
  return "aucune ligne pour un visiteur anonyme";
});
await verifier("cohortes fermées", async () => {
  const { supabase } = await import("../" + SORTIE.replace(/\\/g, "/") + "/supabase.js");
  const { data, error } = await supabase.from("cohortes").select("libelle, tarif_integral");
  if (error) return "lecture refusée : " + error.code;
  if (data?.length) throw new Error("les cohortes en brouillon sont lisibles publiquement");
  return "aucune ligne pour un visiteur anonyme";
});

rmSync(SORTIE, { recursive: true, force: true });

console.log(echecs === 0 ? "\nContrat respecté.\n" : `\n${echecs} vérification(s) en échec.\n`);
process.exit(echecs === 0 ? 0 : 1);
