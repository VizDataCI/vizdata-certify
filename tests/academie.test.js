/* Règles des candidatures à l'académie.
 *
 * Ces fonctions décident si une candidature part, et à quoi ressemble le
 * fichier que l'équipe ouvre dans Excel. Les éprouver à la main suppose de
 * remplir un formulaire à chaque modification ; ici, c'est instantané.
 *
 * Aucun accès réseau : candidature.js est volontairement sans dépendance.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  economie, montant, normaliserCandidature, normaliserWhatsapp, nomFichierExport,
  parStatut, tarifsDe, validerCandidature, versCsv,
} from "../src/academie/candidature.js";

const COMPLETE = {
  nom: "  KOUASSI   Adjoua ",
  whatsapp: "05 04 38 35 32",
  email: " Adjoua.Kouassi@Exemple.CI ",
  profession: "Contrôleur de gestion",
  entreprise: "",
  niveau: "INTERMEDIAIRE",
  motivation: "Mes rapports mensuels me prennent trois jours.",
  formule: "INTEGRAL",
  disponible: true,
  consent: true,
};

/* --- numéro WhatsApp ------------------------------------------------------ */

test("un numéro ivoirien local reçoit l'indicatif +225", () => {
  assert.equal(normaliserWhatsapp("05 04 38 35 32"), "+2250504383532");
  assert.equal(normaliserWhatsapp("0504383532"), "+2250504383532");
});

test("un indicatif déjà présent est conservé, sous toutes ses écritures", () => {
  assert.equal(normaliserWhatsapp("+225 05 04 38 35 32"), "+2250504383532");
  assert.equal(normaliserWhatsapp("00225-05-04-38-35-32"), "+2250504383532");
});

test("un numéro étranger n'est pas rapatrié en Côte d'Ivoire", () => {
  assert.equal(normaliserWhatsapp("+33 6 12 34 56 78"), "+33612345678");
});

test("une saisie vide ne produit pas d'indicatif orphelin", () => {
  assert.equal(normaliserWhatsapp(""), "");
  assert.equal(normaliserWhatsapp("   "), "");
  assert.equal(normaliserWhatsapp(null), "");
});

/* --- validation ----------------------------------------------------------- */

test("une candidature complète passe", () => {
  assert.deepEqual(validerCandidature(COMPLETE), {});
});

test("les champs obligatoires sont exigés un par un", () => {
  const fautes = validerCandidature({ ...COMPLETE, nom: "", email: "pas-une-adresse", profession: " " });
  assert.ok(fautes.nom);
  assert.ok(fautes.email);
  assert.ok(fautes.profession);
  assert.equal(fautes.whatsapp, undefined);
});

test("les deux engagements sont bloquants", () => {
  const sansDispo = validerCandidature({ ...COMPLETE, disponible: false });
  const sansAccord = validerCandidature({ ...COMPLETE, consent: false });
  assert.ok(sansDispo.disponible);
  assert.ok(sansAccord.consent);
});

test("un niveau ou une formule hors référentiel est refusé", () => {
  const fautes = validerCandidature({ ...COMPLETE, niveau: "EXPERT", formule: "GRATUIT" });
  assert.ok(fautes.niveau);
  assert.ok(fautes.formule);
});

test("la motivation est bornée, comme la colonne qui la reçoit", () => {
  assert.ok(validerCandidature({ ...COMPLETE, motivation: "a".repeat(2001) }).motivation);
  assert.deepEqual(validerCandidature({ ...COMPLETE, motivation: "a".repeat(2000) }), {});
});

/* --- normalisation -------------------------------------------------------- */

test("la candidature partante est nettoyée", () => {
  const propre = normaliserCandidature(COMPLETE);
  assert.equal(propre.nom, "KOUASSI Adjoua");
  assert.equal(propre.email, "adjoua.kouassi@exemple.ci");
  assert.equal(propre.whatsapp, "+2250504383532");
  assert.equal(propre.entreprise, "");
  assert.equal(propre.disponible, true);
});

test("une motivation trop longue est coupée plutôt que refusée par la base", () => {
  const propre = normaliserCandidature({ ...COMPLETE, motivation: "x".repeat(2500) });
  assert.equal(propre.motivation.length, 2000);
});

/* --- montants ------------------------------------------------------------- */

test("les montants sont écrits en francs CFA, par milliers séparés", () => {
  assert.equal(montant(500000), "500 000 FCFA");
  assert.equal(montant(300000), "300 000 FCFA");
});

test("un montant absent ne produit pas « NaN FCFA »", () => {
  assert.equal(montant(undefined), "Non chiffré");
  assert.equal(montant("abc"), "Non chiffré");
});

test("l'économie du paiement intégral se calcule, elle n'est pas écrite en dur", () => {
  assert.equal(economie({ integral: 500000, echelonne: 600000 }), 100000);
  /* Tarifs égaux : aucune économie à annoncer, et surtout pas un nombre négatif. */
  assert.equal(economie({ integral: 600000, echelonne: 600000 }), 0);
  assert.equal(economie({ integral: 700000, echelonne: 600000 }), 0);
});

test("les tarifs de la cohorte publiée l'emportent sur les montants de repli", () => {
  const repli = { integral: 500000, echelonne: 600000 };
  assert.deepEqual(tarifsDe(null, repli), repli);
  assert.deepEqual(
    tarifsDe({ tarif_integral: 550000, tarif_echelonne: 650000 }, repli),
    { integral: 550000, echelonne: 650000 }
  );
});

/* --- export --------------------------------------------------------------- */

const LIGNES = [
  {
    reference: "CDA-2026-0001",
    created_at: "2026-11-06T09:14:22.000Z",
    nom: "KOUASSI Adjoua",
    whatsapp: "+2250504383532",
    email: "adjoua.kouassi@exemple.ci",
    profession: "Contrôleur de gestion",
    entreprise: "SODECI",
    niveau: "INTERMEDIAIRE",
    formule: "ECHELONNE",
    statut: "CONTACTE",
    cohorte_id: "c1",
    motivation: "Je veux arrêter de refaire le même rapport ; c'est trois jours par mois.",
    notes: "",
  },
];

test("l'export porte les libellés lisibles, pas les clés de la base", () => {
  const csv = versCsv(LIGNES, { libelleCohorte: () => "Cohorte T1 2027" });
  assert.ok(csv.includes("Intermédiaire"));
  assert.ok(csv.includes("Paiement en deux fois"));
  assert.ok(csv.includes("Contacté"));
  assert.ok(csv.includes("Cohorte T1 2027"));
  assert.ok(!csv.includes("ATTENTE_PAIEMENT"));
});

test("l'export s'ouvre dans Excel sans réglage : BOM, point-virgule, CRLF", () => {
  const csv = versCsv(LIGNES);
  assert.ok(csv.startsWith("﻿"), "le BOM manque, les accents s'afficheraient de travers");
  assert.ok(csv.split("\r\n")[0].slice(1).startsWith("REFERENCE;DATE_CANDIDATURE;"));
});

test("un point-virgule dans une motivation ne décale pas les colonnes", () => {
  const csv = versCsv(LIGNES);
  const ligne = csv.split("\r\n")[1];
  assert.ok(ligne.includes('"Je veux arrêter de refaire le même rapport ; c\'est trois jours par mois."'));
  /* Treize colonnes, donc douze séparateurs hors champ protégé. */
  const horsGuillemets = ligne.replace(/"[^"]*"/g, "");
  assert.equal(horsGuillemets.split(";").length - 1, 12);
});

test("un guillemet dans une valeur est doublé", () => {
  const csv = versCsv([{ ...LIGNES[0], entreprise: 'Groupe "Alpha"' }]);
  assert.ok(csv.includes('"Groupe ""Alpha"""'));
});

test("la date d'export est celle du jour, au format du nom de fichier", () => {
  assert.equal(
    nomFichierExport(new Date("2026-11-06T23:00:00Z")),
    "candidatures-citizen-data-analyst-2026-11-06.csv"
  );
});

/* --- comptage ------------------------------------------------------------- */

test("le tableau de suivi compte les cinq statuts, y compris les vides", () => {
  const compte = parStatut([
    { statut: "NOUVEAU" }, { statut: "NOUVEAU" }, { statut: "INSCRIT" }, { statut: "INCONNU" },
  ]);
  assert.deepEqual(compte, {
    NOUVEAU: 2, CONTACTE: 0, ATTENTE_PAIEMENT: 0, INSCRIT: 1, ANNULE: 0,
  });
});
