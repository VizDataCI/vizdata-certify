/* L'académie CITIZEN DATA ANALYST.
 *
 * Second métier dans la même application : des candidatures à une formation,
 * pas des certificats délivrés. Les deux partagent la base — une seconde base
 * serait une seconde chose à sauvegarder, et à perdre.
 *
 * Ce que la page publique peut faire, et rien de plus
 * ---------------------------------------------------
 * Lire la cohorte publiée, et déposer une candidature. Elle ne lit jamais la
 * table : une candidature contient un nom, un numéro de téléphone et une
 * adresse e-mail, et ouvrir la lecture donnerait à n'importe quel visiteur la
 * liste des candidats. Les tarifs d'une cohorte encore en brouillon ne sortent
 * pas non plus.
 *
 * Sous Postgres, cette séparation était tenue par RLS et deux fonctions
 * `security definer`. Ici, elle est tenue par le fait qu'aucune route publique
 * ne lit ces tables — ce qui se vérifie en lisant la table des routes, et qui
 * est éprouvé par les tests.
 */

import { uid, enTransaction, entier } from "./db.mjs";

/* --- page publique -------------------------------------------------------- */

/**
 * La cohorte annoncée au public, ou `null`.
 *
 * `null` est un cas normal, pas une panne : tant qu'aucune session n'est
 * publiée, la page affiche le programme et les tarifs de référence sans
 * annoncer de date. C'est préférable à une date inventée.
 *
 * La projection est explicite : `notes` et les champs internes d'une cohorte
 * n'ont rien à faire sur une page de vente.
 */
function cohortePubliee(db) {
  const ligne = db
    .prepare(
      `select id, libelle, date_debut, date_fin, lieu, places,
              tarif_integral, tarif_echelonne, statut, note_publique
         from cohortes
        where publiee = 1 and statut in ('OUVERTE', 'COMPLETE')
        order by date_debut
        limit 1`
    )
    .get();
  return ligne ?? null;
}

/** Référence lisible, à citer au téléphone : CDA-2026-0001. */
function prochaineReferenceCandidature(db, annee) {
  const prefixe = `CDA-${annee}-`;
  const ligne = db
    .prepare(
      `select max(cast(substr(reference, ?) as integer)) as n
         from candidatures
        where reference like ? || '%'
          and substr(reference, ?) glob '[0-9]*'`
    )
    .get(prefixe.length + 1, prefixe, prefixe.length + 1);
  return prefixe + String((ligne?.n ?? 0) + 1).padStart(4, "0");
}

/**
 * Enregistre une candidature et rend sa référence.
 *
 * Les deux engagements — disponibilité et consentement au contact — sont
 * exigés ici ET par la base. Le double contrôle n'est pas une redondance : le
 * formulaire peut être contourné par un appel direct, et une candidature sans
 * consentement au contact n'a pas le droit d'exister.
 */
function soumettreCandidature(db, c, source = "page-academie") {
  const requis = ["nom", "whatsapp", "email", "profession", "niveau", "formule"];
  for (const champ of requis) {
    if (!String(c[champ] ?? "").trim()) throw new Error(`Le champ « ${champ} » est obligatoire.`);
  }
  if (!c.disponible || !c.consent) {
    throw new Error("La disponibilité et l'accord pour être recontacté sont obligatoires.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c.email))) {
    throw new Error("L'adresse e-mail n'est pas valide.");
  }

  return enTransaction(db, () => {
    /* Garde-fou contre l'envoi répété : trois candidatures par adresse et par
       jour suffisent largement à corriger une faute de frappe, et empêchent
       qu'un formulaire public ne serve à remplir la table. */
    const recentes = db
      .prepare("select count(*) as n from candidatures where email = ? collate nocase and created_at > datetime('now', '-1 day')")
      .get(String(c.email).trim().toLowerCase());
    if (recentes.n >= 3) {
      throw new Error("Trop de candidatures déposées avec cette adresse aujourd'hui. Écrivez-nous sur WhatsApp.");
    }

    const cohorte = cohortePubliee(db);
    const reference = prochaineReferenceCandidature(db, new Date().getFullYear());

    db.prepare(
      `insert into candidatures
         (id, reference, cohorte_id, nom, whatsapp, email, profession, entreprise,
          niveau, motivation, formule, disponible, consent_contact, source)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`
    ).run(
      uid(),
      reference,
      cohorte?.id ?? null,
      String(c.nom).trim(),
      String(c.whatsapp).trim(),
      String(c.email).trim().toLowerCase(),
      String(c.profession).trim(),
      String(c.entreprise ?? "").trim(),
      c.niveau,
      String(c.motivation ?? "").slice(0, 2000),
      c.formule,
      String(source).slice(0, 60)
    );

    return reference;
  });
}

/* --- administration ------------------------------------------------------- */

function listerCandidatures(db) {
  return db
    .prepare(
      `select id, reference, cohorte_id, nom, whatsapp, email, profession, entreprise,
              niveau, motivation, formule, statut, notes, source, created_at, updated_at
         from candidatures
        order by created_at desc`
    )
    .all();
}

function listerCohortes(db) {
  return db
    .prepare("select * from cohortes order by (date_debut is null), date_debut desc")
    .all()
    .map((c) => ({ ...c, publiee: c.publiee === 1 }));
}

const CHAMPS_CANDIDATURE = ["statut", "notes", "cohorte_id"];

function majCandidature(db, id, champs) {
  const retenus = Object.entries(champs).filter(([c]) => CHAMPS_CANDIDATURE.includes(c));
  if (!retenus.length) throw new Error("Rien à modifier.");
  db.prepare(`update candidatures set ${retenus.map(([c]) => `${c} = ?`).join(", ")} where id = ?`)
    .run(...retenus.map(([, v]) => v), id);
  return db.prepare("select * from candidatures where id = ?").get(id);
}

const CHAMPS_COHORTE = [
  "libelle", "date_debut", "date_fin", "lieu", "places",
  "tarif_integral", "tarif_echelonne", "statut", "note_publique", "publiee",
];

function enregistrerCohorte(db, { id, ...champs }) {
  const retenus = Object.entries(champs).filter(([c]) => CHAMPS_COHORTE.includes(c));
  const valeurs = retenus.map(([c, v]) => (c === "publiee" ? entier(v) : v === "" ? null : v));

  if (id) {
    if (!retenus.length) throw new Error("Rien à modifier.");
    db.prepare(`update cohortes set ${retenus.map(([c]) => `${c} = ?`).join(", ")} where id = ?`).run(...valeurs, id);
    return db.prepare("select * from cohortes where id = ?").get(id);
  }

  const nouveau = uid();
  const colonnes = retenus.map(([c]) => c);
  db.prepare(
    `insert into cohortes (id${colonnes.length ? ", " + colonnes.join(", ") : ""})
     values (?${colonnes.length ? ", " + colonnes.map(() => "?").join(", ") : ""})`
  ).run(nouveau, ...valeurs);
  return db.prepare("select * from cohortes where id = ?").get(nouveau);
}

/**
 * Publie une cohorte et dépublie les autres.
 *
 * `cohortePubliee` ne rend qu'une ligne : laisser deux cohortes publiées ne
 * casserait rien, mais la page afficherait la première par date sans que
 * l'administration comprenne pourquoi. On rend l'intention explicite.
 */
function publierCohorte(db, id) {
  return enTransaction(db, () => {
    db.prepare("update cohortes set publiee = 0 where id <> ?").run(id);
    db.prepare("update cohortes set publiee = 1, statut = 'OUVERTE' where id = ?").run(id);
    return db.prepare("select * from cohortes where id = ?").get(id);
  });
}

/** Supprime une cohorte. Les candidatures rattachées sont conservées — la clé
 *  étrangère est en SET NULL : on ne perd pas un candidat parce qu'une session
 *  a été annulée. */
function supprimerCohorte(db, id) {
  return db.prepare("delete from cohortes where id = ?").run(id).changes > 0;
}

export {
  cohortePubliee,
  prochaineReferenceCandidature,
  soumettreCandidature,
  listerCandidatures,
  listerCohortes,
  majCandidature,
  enregistrerCohorte,
  publierCohorte,
  supprimerCohorte,
};
