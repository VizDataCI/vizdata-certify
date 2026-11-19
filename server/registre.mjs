/* Les opérations du registre.
 *
 * Tout ce que l'application demande à la base, en un seul module : la
 * vérification publique, l'espace du titulaire, les lectures et les écritures
 * de l'administration. Les routes HTTP au-dessus ne font que traduire une
 * requête en appel de fonction, et un résultat en JSON.
 *
 * Deux règles tenues ici, et nulle part ailleurs
 * ----------------------------------------------
 * 1. LA NUMÉROTATION EST ATOMIQUE. `prochaineReference` lit le dernier numéro
 *    et écrit le suivant dans la même transaction que l'insertion du
 *    certificat. Deux administrateurs qui délivrent au même instant ne peuvent
 *    donc pas obtenir la même référence — ce que seule la base garantissait
 *    sous Postgres, via une fonction.
 * 2. LA PROJECTION PUBLIQUE EST UNIQUE. Elle passe par la vue
 *    `v_certificats_publics`, qui ne contient ni adresse e-mail, ni score, ni
 *    date d'expiration. Une colonne privée ne peut apparaître sur la page de
 *    vérification que si quelqu'un l'ajoute à la vue, ce qui se voit en
 *    relecture.
 */

import { uid, maintenant, jour, enTransaction, json, entier } from "./db.mjs";
import { normaliserCompte } from "./comptes.mjs";
import { effectiveStatus, slugify } from "../src/lib/certificates.js";

/* --- helpers -------------------------------------------------------------- */

/** Jeton public : il voyage dans le QR code imprimé, donc il doit être
 *  imprévisible. L'alphabet exclut les caractères qu'on confond à la lecture
 *  (l, o, 0, 1) pour qu'un jeton reste recopiable à la main. */
function nouveauJetonPublic() {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  const octets = new Uint8Array(14);
  globalThis.crypto.getRandomValues(octets);
  for (const o of octets) s += chars[o % chars.length];
  return s;
}

/** Applique le statut calculé à une ligne de certificat. */
const avecStatut = (c) => (c ? { ...c, status: effectiveStatus(c) } : c);

/** Compétences d'un certificat, par leur nom. */
function competencesDe(db, certificatId) {
  return db
    .prepare(
      `select s.name from certificate_skills cs
         join skills s on s.id = cs.skill_id
        where cs.certificate_id = ?
        order by s.name`
    )
    .all(certificatId)
    .map((r) => r.name);
}

/* --- chemin public -------------------------------------------------------- */

/**
 * Vérification par jeton public. La consultation est enregistrée.
 *
 * Le jeton inconnu rend `null` sans rien dire de plus : un message distinguant
 * « jeton mal formé » de « jeton inexistant » aiderait à énumérer le registre.
 */
function verifierParJeton(db, jeton, source = "qr", trace = {}) {
  const ligne = db.prepare("select * from v_certificats_publics where public_token = ?").get(String(jeton || ""));
  if (!ligne) return null;

  db.prepare(
    "insert into verifications (id, certificate_id, source, country, user_agent, ip_hash) values (?, ?, ?, ?, ?, ?)"
  ).run(uid(), ligne.id, ["qr", "reference", "lien"].includes(source) ? source : "qr", trace.pays ?? null, trace.agent ?? null, trace.empreinteIp ?? null);

  return projectionPublique(db, ligne);
}

/** Vérification par référence saisie. */
function verifierParReference(db, reference, trace = {}) {
  const ligne = db
    .prepare("select * from v_certificats_publics where reference = ? collate nocase")
    .get(String(reference || "").trim());
  if (!ligne) return null;
  return verifierParJeton(db, ligne.public_token, "reference", trace);
}

/** Ce qui sort vraiment vers le visiteur. */
function projectionPublique(db, ligne) {
  const statut = effectiveStatus(ligne);
  return {
    reference: ligne.reference,
    holder_name: ligne.holder_name,
    certification: ligne.certification,
    domain: ligne.domain,
    program_code: ligne.program_code,
    issuer: ligne.issuer,
    issue_date: ligne.issue_date,
    status: statut,
    /* Le motif n'a de sens que pour un certificat révoqué, et n'a rien à faire
       dans la réponse autrement. */
    revoke_reason: statut === "REVOKED" ? ligne.revoke_reason : null,
    public_token: ligne.public_token,
    description: ligne.description,
    duration: ligne.duration,
    trainer: ligne.trainer,
    signatory: ligne.signatory,
    skills: competencesDe(db, ligne.id),
  };
}

/** Certifications en vigueur d'un titulaire au profil public.
 *
 *  Un profil fermé, un compte désactivé et un identifiant inconnu rendent tous
 *  trois une liste vide : l'absence de réponse ne doit pas renseigner sur
 *  l'existence d'un compte. */
function profilPublic(db, identifiant) {
  const lignes = db
    .prepare(
      `select v.* from v_certificats_publics v
         join users u on u.username = v.holder_username
        where u.username = ? collate nocase
          and u.public_profile = 1
          and u.account_status = 'ACTIVE'
        order by v.issue_date desc`
    )
    .all(String(identifiant || ""));

  return lignes
    .filter((l) => effectiveStatus(l) === "ACTIVE")
    .map((l) => ({
      holder_name: l.holder_name,
      certification: l.certification,
      domain: l.domain,
      reference: l.reference,
      issue_date: l.issue_date,
      public_token: l.public_token,
    }));
}

/** Comptabilise un partage à partir du jeton public. */
function enregistrerPartage(db, jeton, plateforme) {
  const ligne = db.prepare("select id from certificates where public_token = ?").get(String(jeton || ""));
  if (!ligne) return false;
  if (!["linkedin", "whatsapp", "email", "copy_link"].includes(plateforme)) return false;
  db.prepare("insert into shares (id, certificate_id, platform) values (?, ?, ?)").run(uid(), ligne.id, plateforme);
  return true;
}

/* --- espace du titulaire -------------------------------------------------- */

/** Certificats d'un compte, dans la forme commune aux deux chemins. */
function certificatsDe(db, utilisateurId) {
  const lignes = db
    .prepare("select * from v_certificats_publics where id in (select id from certificates where user_id = ?) order by issue_date desc")
    .all(utilisateurId);
  return lignes.map((l) => ({ ...projectionPublique(db, l), id: l.id, created_at: l.created_at }));
}

/* --- registre d'administration -------------------------------------------- */

/**
 * Tout ce dont les écrans d'administration ont besoin, en une réponse.
 *
 * Un appel plutôt que douze : les écrans croisent sans cesse certificats,
 * titulaires, programmes et domaines, et un registre d'organisme de formation
 * tient largement en mémoire. Le découper imposerait une mécanique de
 * chargement partiel pour aucun gain mesurable.
 */
function registreComplet(db, { pourAdmin = false } = {}) {
  const certificats = db.prepare("select * from certificates order by created_at desc").all();

  /* Les compétences sont rapatriées à plat puis regroupées : une requête par
     certificat ferait autant d'allers-retours que de lignes. */
  const parCertificat = new Map();
  for (const l of db.prepare("select certificate_id, skill_id from certificate_skills").all()) {
    if (!parCertificat.has(l.certificate_id)) parCertificat.set(l.certificate_id, []);
    parCertificat.get(l.certificate_id).push(l.skill_id);
  }

  const programmes = db
    .prepare(
      `select t.*, d.id as domaine_id, d.code as domaine_code, d.name as domaine_nom
         from certificate_types t
         left join certification_domains d on d.id = t.domain_id
        order by t.sort_order, t.name`
    )
    .all()
    .map((t) => ({
      ...t,
      /* La forme imbriquée que PostgREST renvoyait : les écrans la lisent
         déjà ainsi, inutile de les réécrire. */
      certification_domains: t.domaine_id ? { id: t.domaine_id, code: t.domaine_code, name: t.domaine_nom } : null,
    }));

  return {
    users: db
      .prepare("select id, email, first_name, last_name, phone, username, linkedin_url, public_profile, totp_actif, role, account_status, must_change_password, permissions, invited_at, activated_at, last_login_at, created_at from users order by created_at desc")
      .all()
      .map((u) => ({ ...u, public_profile: u.public_profile === 1, totp_actif: u.totp_actif === 1, must_change_password: u.must_change_password === 1, permissions: json(u.permissions) })),
    domains: db.prepare("select * from certification_domains order by sort_order, name").all(),
    types: programmes,
    templates: pourAdmin ? db.prepare("select * from certificate_templates order by name").all() : [],
    skills: db.prepare("select * from skills order by name").all(),
    certificates: certificats.map((c) => ({ ...c, skills: parCertificat.get(c.id) || [] })),
    verifications: db.prepare("select * from verifications order by verified_at desc limit 500").all(),
    shares: db.prepare("select * from shares").all(),
    audit_logs: db
      .prepare("select id, actor_id, actor_name as actor, action, entity_type, entity_id, metadata, created_at from audit_logs order by created_at desc limit 200")
      .all()
      .map((l) => ({ ...l, metadata: json(l.metadata, {}).valeur ?? "" })),
    notifications: db.prepare("select * from notifications order by created_at desc limit 200").all(),
  };
}

/* --- journal -------------------------------------------------------------- */

/**
 * Inscrit une action au journal.
 *
 * Le nom de l'auteur est figé au moment de l'acte, en plus de son identifiant.
 * Sous Postgres seul l'identifiant était conservé : un compte supprimé laissait
 * des lignes sans auteur lisible, et un journal qui perd le nom de qui a agi
 * perd sa valeur de preuve.
 */
function journaliser(db, acteur, action, { entite = "certificate", entiteId = null, valeur = "" } = {}) {
  db.prepare(
    `insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, metadata)
     values (?, ?, ?, ?, ?, ?)`
  ).run(
    acteur?.id ?? null,
    acteur ? `${acteur.first_name} ${acteur.last_name}`.trim() : "Public",
    action,
    entite,
    entiteId,
    JSON.stringify({ valeur })
  );
}

/* --- écritures : certificats ---------------------------------------------- */

/**
 * Prochaine référence pour un programme et une année.
 *
 * Appelée DANS la transaction d'insertion : lue et consommée sans fenêtre où
 * un second administrateur pourrait lire le même numéro.
 */
function prochaineReference(db, code, annee) {
  const prefixe = `VIZ-${annee}-${String(code).toUpperCase()}-`;
  const ligne = db
    .prepare(
      `select max(cast(substr(reference, ?) as integer)) as n
         from certificates
        where reference like ? || '%'
          and substr(reference, ?) glob '[0-9]*'`
    )
    .get(prefixe.length + 1, prefixe, prefixe.length + 1);

  const suivant = (ligne?.n ?? 0) + 1;
  return prefixe + String(suivant).padStart(6, "0");
}

/** Délivre un certificat. */
function creerCertificat(db, acteur, { user_id, certificate_type_id, issue_date, duration, trainer, signatory, skills = [] }) {
  return enTransaction(db, () => {
    const programme = db.prepare("select * from certificate_types where id = ?").get(certificate_type_id);
    if (!programme) throw new Error("Programme de certification inconnu.");
    const titulaire = db.prepare("select id from users where id = ?").get(user_id);
    if (!titulaire) throw new Error("Titulaire inconnu.");

    const date = issue_date || jour();
    const reference = prochaineReference(db, programme.code, date.slice(0, 4));
    const id = uid();

    db.prepare(
      `insert into certificates
         (id, reference, public_token, user_id, certificate_type_id, issued_by, template_id,
          issue_date, status, duration, trainer, signatory)
       values (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`
    ).run(
      id,
      reference,
      nouveauJetonPublic(),
      user_id,
      certificate_type_id,
      acteur?.id ?? null,
      programme.template_id,
      date,
      Number(duration) || programme.default_duration,
      trainer || "",
      signatory || ""
    );

    remplacerCompetences(db, id, skills);
    journaliser(db, acteur, "CERTIFICATE_CREATED", { entiteId: id, valeur: reference });

    return avecStatut(db.prepare("select * from certificates where id = ?").get(id));
  });
}

/** Remplace les compétences liées à un certificat. */
function remplacerCompetences(db, certificatId, skillIds) {
  db.prepare("delete from certificate_skills where certificate_id = ?").run(certificatId);
  if (!skillIds?.length) return;
  const inserer = db.prepare("insert or ignore into certificate_skills (certificate_id, skill_id) values (?, ?)");
  for (const skill of skillIds) inserer.run(certificatId, skill);
}

const CHAMPS_CERTIFICAT = ["certificate_type_id", "issue_date", "duration", "trainer", "signatory"];

function majCertificat(db, acteur, id, champs, skills) {
  return enTransaction(db, () => {
    const existant = db.prepare("select * from certificates where id = ?").get(id);
    if (!existant) throw new Error("Certificat introuvable.");

    const retenus = Object.entries(champs).filter(([c]) => CHAMPS_CERTIFICAT.includes(c));
    if (retenus.length) {
      db.prepare(`update certificates set ${retenus.map(([c]) => `${c} = ?`).join(", ")} where id = ?`)
        .run(...retenus.map(([, v]) => v), id);
    }
    if (skills) remplacerCompetences(db, id, skills);

    journaliser(db, acteur, "CERTIFICATE_UPDATED", { entiteId: id, valeur: existant.reference });
    return avecStatut(db.prepare("select * from certificates where id = ?").get(id));
  });
}

/** Révoque ou annule. Le motif est exigé par la base pour une révocation. */
function changerStatutCertificat(db, acteur, id, statut, motif) {
  return enTransaction(db, () => {
    const existant = db.prepare("select * from certificates where id = ?").get(id);
    if (!existant) throw new Error("Certificat introuvable.");
    if (!["ACTIVE", "REVOKED", "CANCELLED"].includes(statut)) throw new Error("Statut inconnu.");

    db.prepare("update certificates set status = ?, revoke_reason = ? where id = ?")
      .run(statut, statut === "ACTIVE" ? "" : motif || "", id);

    journaliser(db, acteur, statut === "REVOKED" ? "CERTIFICATE_REVOKED" : statut === "CANCELLED" ? "CERTIFICATE_CANCELLED" : "CERTIFICATE_RESTORED", {
      entiteId: id,
      valeur: existant.reference,
    });
    return avecStatut(db.prepare("select * from certificates where id = ?").get(id));
  });
}

/* --- écritures : catalogue ------------------------------------------------ */

const CHAMPS_DOMAINE = ["code", "name", "description", "status", "sort_order"];
const CHAMPS_PROGRAMME = ["domain_id", "template_id", "code", "name", "description", "default_duration", "sort_order", "status"];

function creerDomaine(db, acteur, champs) {
  const id = uid();
  db.prepare(
    "insert into certification_domains (id, code, name, description, status, sort_order) values (?, ?, ?, ?, ?, ?)"
  ).run(id, String(champs.code).toUpperCase().trim(), champs.name, champs.description || "", champs.status || "ACTIVE", Number(champs.sort_order) || 100);
  journaliser(db, acteur, "DOMAIN_CREATED", { entite: "domain", entiteId: id, valeur: champs.code });
  return db.prepare("select * from certification_domains where id = ?").get(id);
}

function majDomaine(db, acteur, id, champs) {
  const retenus = Object.entries(champs).filter(([c]) => CHAMPS_DOMAINE.includes(c));
  if (!retenus.length) throw new Error("Rien à modifier.");
  db.prepare(`update certification_domains set ${retenus.map(([c]) => `${c} = ?`).join(", ")} where id = ?`)
    .run(...retenus.map(([c, v]) => (c === "code" ? String(v).toUpperCase().trim() : v)), id);
  journaliser(db, acteur, "DOMAIN_UPDATED", { entite: "domain", entiteId: id, valeur: champs.code || "" });
  return db.prepare("select * from certification_domains where id = ?").get(id);
}

function creerProgramme(db, acteur, champs) {
  const id = uid();
  db.prepare(
    `insert into certificate_types (id, domain_id, template_id, code, name, description, default_duration, sort_order, status)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    champs.domain_id || null,
    champs.template_id || null,
    String(champs.code).toUpperCase().trim(),
    champs.name,
    champs.description || "",
    Number(champs.default_duration) || 20,
    Number(champs.sort_order) || 100,
    champs.status || "ACTIVE"
  );
  journaliser(db, acteur, "PROGRAM_CREATED", { entite: "program", entiteId: id, valeur: champs.code });
  return db.prepare("select * from certificate_types where id = ?").get(id);
}

function majProgramme(db, acteur, id, champs) {
  const retenus = Object.entries(champs).filter(([c]) => CHAMPS_PROGRAMME.includes(c));
  if (!retenus.length) throw new Error("Rien à modifier.");
  db.prepare(`update certificate_types set ${retenus.map(([c]) => `${c} = ?`).join(", ")} where id = ?`)
    .run(...retenus.map(([c, v]) => (c === "code" ? String(v).toUpperCase().trim() : v)), id);
  journaliser(db, acteur, "PROGRAM_UPDATED", { entite: "program", entiteId: id, valeur: champs.code || "" });
  return db.prepare("select * from certificate_types where id = ?").get(id);
}

/* --- écritures : comptes -------------------------------------------------- */

/** Identifiant public unique, dérivé du nom. */
function identifiantLibre(db, prenom, nom, secours) {
  const base = slugify(`${prenom} ${nom}`) || slugify(secours.split("@")[0]) || "titulaire";
  let candidat = base;
  for (let essai = 2; essai < 200; essai++) {
    if (!db.prepare("select id from users where username = ? collate nocase").get(candidat)) return candidat;
    candidat = `${base}-${essai}`;
  }
  return `${base}-${uid().slice(0, 6)}`;
}

/**
 * Crée un titulaire, ou retrouve celui qui porte déjà cette adresse.
 *
 * Le doublon n'est pas une erreur : c'est le cas courant quand on attribue une
 * seconde certification à quelqu'un. Créer un second compte lui donnerait un
 * second espace personnel, vide, et ses certificats seraient répartis entre
 * les deux.
 */
function creerTitulaire(db, acteur, { email, first_name, last_name, phone = null, role = "CERTIFIED" }) {
  const adresse = String(email || "").trim().toLowerCase();

  /* `normaliserCompte` et non un étalement de la ligne : celle-ci porte
     `password_hash`, et l'étaler le renverrait à l'appelant. Sur une adresse
     déjà connue — le cas courant, puisqu'on réutilise le compte existant —
     cela signifierait livrer l'empreinte du mot de passe du titulaire à tout
     gestionnaire capable de taper son adresse. */
  const existant = db.prepare("select * from users where email = ? collate nocase").get(adresse);
  if (existant) {
    return { titulaire: normaliserCompte(existant), existe: true };
  }

  return enTransaction(db, () => {
    const id = uid();
    db.prepare(
      `insert into users (id, email, first_name, last_name, phone, username, role, account_status, must_change_password, invited_at, created_by)
       values (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?)`
    ).run(id, adresse, first_name.trim(), last_name.trim(), phone, identifiantLibre(db, first_name, last_name, adresse), role, maintenant(), acteur?.id ?? null);

    journaliser(db, acteur, "HOLDER_CREATED", { entite: "user", entiteId: id, valeur: adresse });
    return { titulaire: normaliserCompte(db.prepare("select * from users where id = ?").get(id)), existe: false };
  });
}

const CHAMPS_COMPTE = ["first_name", "last_name", "phone", "linkedin_url", "public_profile", "avatar_url", "role", "permissions", "account_status", "email"];

/** Écrit les champs déjà autorisés par `exigerEcritureCompte`. */
function majCompte(db, acteur, id, champs) {
  const retenus = Object.entries(champs).filter(([c]) => CHAMPS_COMPTE.includes(c));
  if (!retenus.length) throw new Error("Rien à modifier.");

  const valeurs = retenus.map(([c, v]) => {
    if (c === "public_profile") return entier(v);
    if (c === "permissions") return JSON.stringify(v || {});
    if (c === "email") return String(v).trim().toLowerCase();
    return v;
  });

  db.prepare(`update users set ${retenus.map(([c]) => `${c} = ?`).join(", ")} where id = ?`).run(...valeurs, id);

  const noms = retenus.map(([c]) => c);
  const action = noms.includes("role") || noms.includes("permissions")
    ? "ROLE_CHANGED"
    : noms.includes("account_status")
      ? (champs.account_status === "DISABLED" ? "ACCOUNT_DISABLED" : "ACCOUNT_ENABLED")
      : noms.includes("email")
        ? "EMAIL_CHANGED"
        : "HOLDER_UPDATED";

  const ligne = db.prepare("select * from users where id = ?").get(id);
  journaliser(db, acteur, action, { entite: "user", entiteId: id, valeur: ligne.email });
  return normaliserCompte(ligne);
}

/* --- notifications -------------------------------------------------------- */

function tracerNotification(db, { user_id = null, recipient, kind, subject = "", payload = {}, status = "PENDING", error = null }) {
  const id = uid();
  db.prepare(
    `insert into notifications (id, user_id, recipient, kind, subject, payload, status, error, sent_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, user_id, recipient, kind, subject, JSON.stringify(payload), status, error, status === "SENT" ? maintenant() : null);
  return id;
}

export {
  nouveauJetonPublic,
  verifierParJeton,
  verifierParReference,
  profilPublic,
  enregistrerPartage,
  certificatsDe,
  registreComplet,
  journaliser,
  prochaineReference,
  creerCertificat,
  majCertificat,
  changerStatutCertificat,
  remplacerCompetences,
  creerDomaine,
  majDomaine,
  creerProgramme,
  majProgramme,
  creerTitulaire,
  majCompte,
  tracerNotification,
  identifiantLibre,
};
