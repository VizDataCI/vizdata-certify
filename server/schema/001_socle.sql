-- ===========================================================================
-- VIZDATA CERTIFY : socle de la base SQLite.
--
-- Pourquoi SQLite
-- ---------------
-- Le registre vivait dans un projet Supabase qui a cessé d'exister sans
-- préavis. Le schéma n'était écrit nulle part ailleurs, et tout ce qu'il
-- portait a disparu avec lui. La leçon n'est pas « il fallait sauvegarder » :
-- c'est que la base doit appartenir à VIZDATA.
--
-- Une base SQLite est un fichier. Il ne s'évapore pas pour inactivité, il se
-- sauvegarde en le copiant : à chaud, base ouverte, grâce à l'API de
-- sauvegarde de Node , il se déplace d'un serveur à l'autre sans migration,
-- et il n'a ni démon à tenir, ni limite de connexions, ni palier tarifaire.
-- Pour la charge d'un organisme de formation : quelques centaines de
-- certificats par an, des vérifications en lecture : il est très largement
-- dimensionné.
--
-- Ce que le passage à SQLite fait perdre, et comment on le compense
-- ----------------------------------------------------------------
-- Postgres portait l'autorisation DANS la base : RLS, `security definer`,
-- `has_perm()`. SQLite n'a rien de tel. L'autorisation remonte donc dans
-- l'API : un seul module, `server/autorisations.mjs`, par lequel passe toute
-- écriture, et qui est éprouvé par des tests exhaustifs. C'est un recul en
-- défense en profondeur, assumé ; c'est un progrès en vérifiabilité, car les
-- politiques RLS n'ont jamais pu être testées sans projet vivant.
--
-- Ce que la base garde, elle, et qu'aucune application ne peut contourner :
-- les clés étrangères, les contraintes d'unicité et les CHECK. Un statut hors
-- liste, une référence en double, un certificat sans titulaire : refusés ici,
-- quoi que fasse le code au-dessus.
--
-- Conventions de typage
-- ---------------------
-- SQLite n'a ni uuid, ni booléen, ni date, ni énuméré, ni jsonb. On s'en passe
-- sans rien perdre d'essentiel :
--
--   identifiants  TEXT portant un uuid v4 (crypto.randomUUID)
--   booléens      INTEGER 0 / 1, borné par un CHECK
--   horodatages   TEXT ISO-8601 UTC : se trient dans l'ordre chronologique
--   dates         TEXT 'AAAA-MM-JJ', validées par date(x) IS NOT NULL
--   énumérés      TEXT + CHECK ... IN (...)
--   json          TEXT + CHECK json_valid(x)
--
-- Les clés étrangères sont désactivées par défaut dans SQLite : `PRAGMA
-- foreign_keys = ON` est posé à chaque ouverture par server/db.mjs. Sans lui,
-- tout ce qui suit serait décoratif.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. COMPTES
-- ---------------------------------------------------------------------------

-- Une seule table là où Supabase en avait deux, `auth.users` pour l'identité
-- et `public.users` pour le profil. La séparation imposait une fonction
-- privilégiée pour créer le moindre titulaire ; ici, le mot de passe est une
-- colonne de plus.
--
-- `password_hash` porte un scrypt au format « scrypt$N$r$p$sel$empreinte ».
-- Jamais un mot de passe en clair, jamais un mot de passe réversible. La
-- colonne est nulle tant que la personne n'a pas choisi le sien : un compte
-- invité existe avant d'avoir un mot de passe, et ne peut pas se connecter.
create table if not exists users (
  id                   text primary key,
  email                text not null unique collate nocase,
  password_hash        text,
  first_name           text not null default '',
  last_name            text not null default '',
  phone                text,
  avatar_url           text,
  linkedin_url         text not null default '',
  username             text unique collate nocase,
  public_profile       integer not null default 0 check (public_profile in (0, 1)),

  role                 text not null default 'CERTIFIED'
                       check (role in ('ADMIN', 'MANAGER', 'CERTIFIED')),
  account_status       text not null default 'ACTIVE'
                       check (account_status in ('ACTIVE', 'DISABLED')),
  must_change_password integer not null default 1 check (must_change_password in (0, 1)),

  -- Autorisations accordées à un gestionnaire, par clé booléenne :
  -- creer_titulaires, attribuer_certificats, revoquer_certificats,
  -- exporter_donnees. Un ADMIN les a toutes, implicitement.
  permissions          text not null default '{}' check (json_valid(permissions)),

  invited_at           text,
  activated_at         text,
  last_login_at        text,
  created_by           text references users (id) on delete set null,
  created_at           text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at           text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists users_role_idx   on users (role);
create index if not exists users_statut_idx on users (account_status);

-- Sessions de connexion.
--
-- Le cookie ne porte pas l'identifiant de session mais un secret aléatoire,
-- dont seule l'empreinte est stockée. Si le fichier de base fuitait, les
-- sessions en cours ne seraient pas réutilisables : même raisonnement que
-- pour les mots de passe.
create table if not exists sessions (
  id         text primary key,
  token_hash text not null unique,
  user_id    text not null references users (id) on delete cascade,
  expires_at text not null,
  user_agent text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists sessions_user_idx    on sessions (user_id);
create index if not exists sessions_expires_idx on sessions (expires_at);

-- Liens à usage unique : invitation d'un titulaire, réinitialisation de mot de
-- passe. Ils remplacent les liens signés de Supabase.
--
-- Trois garde-fous, parce qu'un lien de réinitialisation est une clé du compte :
-- seule l'empreinte du jeton est conservée, le lien expire, et `used_at`
-- interdit de s'en servir deux fois. Le troisième compte autant que les autres :
-- un lien qui traîne dans une boîte de réception reste valable des années sans lui.
create table if not exists jetons (
  id         text primary key,
  token_hash text not null unique,
  user_id    text not null references users (id) on delete cascade,
  kind       text not null check (kind in ('INVITATION', 'REINITIALISATION')),
  expires_at text not null,
  used_at    text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists jetons_user_idx on jetons (user_id, kind);

-- ---------------------------------------------------------------------------
-- 2. CATALOGUE : domaines, programmes, modèles
-- ---------------------------------------------------------------------------

-- Premier niveau : EXCEL, POWERBI, DATA…
create table if not exists certification_domains (
  id          text primary key,
  code        text not null unique collate nocase,
  name        text not null,
  description text not null default '',
  status      text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  sort_order  integer not null default 100,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists certificate_templates (
  id          text primary key,
  code        text not null unique collate nocase,
  name        text not null,
  description text not null default '',
  orientation text not null default 'landscape' check (orientation in ('landscape', 'portrait')),
  layout      text not null default '{}' check (json_valid(layout)),
  status      text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Second niveau : le programme. `name` est l'intitulé exact imprimé sur le
-- certificat ; `code` entre dans la référence et ne doit plus changer dès
-- qu'un certificat a été délivré.
--
-- La table garde le nom `certificate_types` qu'elle portait sous Postgres.
-- Renommer aurait été plus joli et sans intérêt : c'est la même chose, et la
-- continuité de nom facilite la lecture des deux schémas côte à côte.
create table if not exists certificate_types (
  id               text primary key,
  domain_id        text references certification_domains (id) on delete set null,
  template_id      text references certificate_templates (id) on delete set null,
  code             text not null unique collate nocase,
  name             text not null,
  description      text not null default '',
  default_duration integer not null default 20 check (default_duration > 0),
  sort_order       integer not null default 100,
  status           text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists types_domain_idx on certificate_types (domain_id);

create table if not exists skills (
  id          text primary key,
  name        text not null unique collate nocase,
  description text not null default ''
);

-- ---------------------------------------------------------------------------
-- 3. CERTIFICATS
-- ---------------------------------------------------------------------------

-- `user_id` est en RESTRICT : on ne supprime pas un titulaire qui porte des
-- certificats délivrés, sinon le registre perdrait la trace de ce qu'il a
-- certifié. C'est pourquoi l'application désactive un compte et ne le supprime
-- jamais.
--
-- Pas de contrainte d'unicité en base sur (user_id, certificate_type_id), mais
-- une règle appliquée à l'attribution : un même programme ne se délivre qu'une
-- fois à la même personne TANT QU'UN CERTIFICAT EST EN VIGUEUR. Deux
-- certificats actifs pour le même parcours ne veulent rien dire : lequel
-- ferait foi ?
--
-- La règle vit dans le code et non dans un index unique, parce qu'elle porte
-- sur le statut : un certificat révoqué ou annulé ne barre pas la route, sinon
-- une révocation par erreur fermerait le programme à quelqu'un pour toujours.
-- Un index unique, lui, ne sait pas lire un statut.
--
-- Ce qui est unique en base, c'est la référence.
--
-- `expiry_date` et `score` ne sont plus renseignés depuis novembre 2026 : un
-- certificat atteste d'un acquis, et la note relève de l'évaluation. Les
-- colonnes existent pour recevoir les certificats anciens lors d'une reprise
-- de données ; rien ne les expose.
create table if not exists certificates (
  id                  text primary key,
  reference           text not null unique collate nocase,
  public_token        text not null unique,
  user_id             text not null references users (id) on delete restrict,
  certificate_type_id text not null references certificate_types (id) on delete restrict,
  issued_by           text references users (id) on delete set null,
  template_id         text references certificate_templates (id) on delete set null,

  issue_date          text not null check (date(issue_date) is not null),
  status              text not null default 'ACTIVE'
                      check (status in ('ACTIVE', 'EXPIRED', 'REVOKED', 'CANCELLED')),
  duration            integer check (duration is null or duration > 0),
  trainer             text not null default '',
  signatory           text not null default '',
  revoke_reason       text not null default '',
  pdf_url             text,
  qr_code_url         text,

  expiry_date         text check (expiry_date is null or date(expiry_date) is not null),
  score               integer check (score is null or (score between 0 and 100)),

  created_at          text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  -- Une révocation sans motif laisse le titulaire et son employeur sans
  -- explication, alors que le motif s'affiche sur la page publique.
  constraint certificats_revocation_motivee
    check (status <> 'REVOKED' or length(trim(revoke_reason)) > 0)
);

create index if not exists certificates_user_idx  on certificates (user_id);
create index if not exists certificates_type_idx  on certificates (certificate_type_id);
create index if not exists certificates_issue_idx on certificates (issue_date desc);

create table if not exists certificate_skills (
  certificate_id text not null references certificates (id) on delete cascade,
  skill_id       text not null references skills (id) on delete cascade,
  primary key (certificate_id, skill_id)
);

-- ---------------------------------------------------------------------------
-- 4. MESURE ET TRACES
-- ---------------------------------------------------------------------------

create table if not exists verifications (
  id             text primary key,
  certificate_id text not null references certificates (id) on delete cascade,
  verified_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  source         text not null default 'qr' check (source in ('qr', 'reference', 'lien')),
  country        text,
  user_agent     text,
  ip_hash        text
);

create index if not exists verifications_cert_idx on verifications (certificate_id);
create index if not exists verifications_when_idx on verifications (verified_at desc);

create table if not exists shares (
  id             text primary key,
  certificate_id text not null references certificates (id) on delete cascade,
  platform       text not null check (platform in ('linkedin', 'whatsapp', 'email', 'copy_link')),
  shared_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists shares_cert_idx on shares (certificate_id);

-- Le journal garde l'identifiant de l'auteur ET son nom au moment de l'acte.
-- Sous Postgres, seul l'identifiant était conservé : un compte supprimé
-- laissait des lignes «, » sans auteur lisible. Un journal qui perd le nom de
-- qui a agi perd sa valeur de preuve.
create table if not exists audit_logs (
  id          integer primary key autoincrement,
  actor_id    text references users (id) on delete set null,
  actor_name  text not null default '',
  action      text not null,
  entity_type text not null default 'certificate',
  entity_id   text,
  metadata    text not null default '{}' check (json_valid(metadata)),
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists audit_when_idx  on audit_logs (created_at desc);
create index if not exists audit_actor_idx on audit_logs (actor_id);

-- Un envoi d'e-mail échoue en silence : quota, domaine non vérifié,
-- fournisseur absent. Sans cette trace, VIZDATA croirait avoir prévenu
-- quelqu'un qui n'a jamais rien reçu.
create table if not exists notifications (
  id         text primary key,
  user_id    text references users (id) on delete cascade,
  recipient  text not null,
  kind       text not null,
  channel    text not null default 'email',
  subject    text not null default '',
  payload    text not null default '{}' check (json_valid(payload)),
  status     text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED')),
  error      text,
  sent_at    text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists notifications_user_idx   on notifications (user_id);
create index if not exists notifications_when_idx   on notifications (created_at desc);
create index if not exists notifications_statut_idx on notifications (status);

create table if not exists settings (
  key        text primary key,
  value      text not null check (json_valid(value)),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- 5. ACADÉMIE : cohortes et candidatures
-- ---------------------------------------------------------------------------
-- Second métier dans la même application : des candidatures à une formation,
-- pas des certificats délivrés. Les tables vivent dans la même base, parce
-- qu'une seconde base serait une seconde chose à sauvegarder et à perdre.

create table if not exists cohortes (
  id              text primary key,
  libelle         text not null,
  date_debut      text check (date_debut is null or date(date_debut) is not null),
  date_fin        text check (date_fin is null or date(date_fin) is not null),
  lieu            text not null default 'Abidjan, Côte d''Ivoire',
  places          integer check (places is null or places > 0),
  tarif_integral  integer not null default 500000 check (tarif_integral > 0),
  tarif_echelonne integer not null default 600000 check (tarif_echelonne > 0),
  statut          text not null default 'BROUILLON'
                  check (statut in ('BROUILLON', 'OUVERTE', 'COMPLETE', 'CLOTUREE')),
  publiee         integer not null default 0 check (publiee in (0, 1)),
  note_publique   text not null default '',
  created_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  -- Une session sans dates est admise : « prochaine session, nous contacter ».
  -- Une fin avant le début est une faute de saisie, pas une information.
  constraint cohortes_dates_coherentes
    check (date_fin is null or date_debut is null or date_fin >= date_debut)
);

create table if not exists candidatures (
  id              text primary key,
  reference       text not null unique collate nocase,
  cohorte_id      text references cohortes (id) on delete set null,
  nom             text not null check (length(trim(nom)) between 2 and 120),
  whatsapp        text not null check (length(trim(whatsapp)) between 6 and 32),
  email           text not null check (email like '%_@_%._%'),
  profession      text not null check (length(trim(profession)) between 2 and 160),
  entreprise      text not null default '',
  niveau          text not null check (niveau in ('DEBUTANT', 'INTERMEDIAIRE', 'AVANCE')),
  motivation      text not null default '' check (length(motivation) <= 2000),
  formule         text not null check (formule in ('INTEGRAL', 'ECHELONNE')),
  disponible      integer not null check (disponible in (0, 1)),
  consent_contact integer not null check (consent_contact in (0, 1)),
  statut          text not null default 'NOUVEAU'
                  check (statut in ('NOUVEAU', 'CONTACTE', 'ATTENTE_PAIEMENT', 'INSCRIT', 'ANNULE')),
  notes           text not null default '',
  source          text not null default 'page-academie',
  created_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  -- Les deux engagements sont exigés par la base, et pas seulement par le
  -- formulaire : un appel direct à l'API ne doit pas pouvoir enregistrer une
  -- candidature sans consentement au contact.
  constraint candidatures_engagements check (disponible = 1 and consent_contact = 1)
);

create index if not exists candidatures_statut_idx  on candidatures (statut);
create index if not exists candidatures_cohorte_idx on candidatures (cohorte_id);
create index if not exists candidatures_when_idx    on candidatures (created_at desc);

-- ---------------------------------------------------------------------------
-- 6. FRAÎCHEUR
-- ---------------------------------------------------------------------------
-- SQLite n'a pas de « before update » : on écrit des déclencheurs « after »,
-- qui réécrivent la ligne. La garde `when new.updated_at = old.updated_at`
-- évite la récursion : sans elle, la mise à jour déclenchée relancerait le
-- déclencheur indéfiniment.

create trigger if not exists users_touch after update on users
  when new.updated_at = old.updated_at
begin
  update users set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.id;
end;

create trigger if not exists domains_touch after update on certification_domains
  when new.updated_at = old.updated_at
begin
  update certification_domains set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.id;
end;

create trigger if not exists templates_touch after update on certificate_templates
  when new.updated_at = old.updated_at
begin
  update certificate_templates set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.id;
end;

create trigger if not exists types_touch after update on certificate_types
  when new.updated_at = old.updated_at
begin
  update certificate_types set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.id;
end;

create trigger if not exists certificates_touch after update on certificates
  when new.updated_at = old.updated_at
begin
  update certificates set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.id;
end;

create trigger if not exists cohortes_touch after update on cohortes
  when new.updated_at = old.updated_at
begin
  update cohortes set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.id;
end;

create trigger if not exists candidatures_touch after update on candidatures
  when new.updated_at = old.updated_at
begin
  update candidatures set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.id;
end;

-- ---------------------------------------------------------------------------
-- 7. VUES DE LECTURE
-- ---------------------------------------------------------------------------
-- La projection publique du certificat, en un seul endroit. Elle ne contient
-- ni adresse e-mail, ni téléphone, ni identifiant de compte, ni date
-- d'expiration, ni score. Ce n'est pas une barrière, SQLite n'en offre pas
-- mais une définition : si une colonne privée devait apparaître sur la page de
-- vérification, il faudrait l'ajouter ici, ce qui se voit en relecture.
--
-- Le statut EFFECTIF n'est pas calculé ici : il l'est en JavaScript, par
-- `effectiveStatus()`, déjà écrit et testé. Sous Postgres la règle était
-- dédoublée (une fois en SQL, une fois dans le navigateur) et les deux
-- pouvaient diverger. Une seule mise en œuvre vaut mieux.
create view if not exists v_certificats_publics as
select
  c.id                       as id,
  c.reference                as reference,
  c.public_token             as public_token,
  u.first_name || ' ' || u.last_name as holder_name,
  u.username                 as holder_username,
  t.name                     as certification,
  t.code                     as program_code,
  t.description              as description,
  coalesce(d.name, '')       as domain,
  'VIZDATA'                  as issuer,
  c.issue_date               as issue_date,
  c.status                   as status,
  c.revoke_reason            as revoke_reason,
  c.duration                 as duration,
  c.trainer                  as trainer,
  c.signatory                as signatory,
  c.expiry_date              as expiry_date,
  c.created_at               as created_at
from certificates c
join users u on u.id = c.user_id
join certificate_types t on t.id = c.certificate_type_id
left join certification_domains d on d.id = t.domain_id;
