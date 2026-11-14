-- SOCLE DU REGISTRE — reconstruction.
--
-- Pourquoi ce fichier existe
-- --------------------------
-- Le schéma de base du registre a été créé à la main dans la console SQL de
-- Supabase, en août 2026. Il n'a jamais été versionné : seules les trois
-- migrations qui l'ont fait évoluer se trouvent dans le dépôt. Le jour où le
-- projet `cwyxvmzodipbdawojpeh` a cessé d'exister, le schéma a disparu avec lui
-- et le dépôt ne permettait plus de le reconstituer.
--
-- Ce fichier répare cette dette. Il recrée le socle tel que docs/schema.md le
-- relève au 19 août 2026 : neuf tables, quatre types énumérés, les fonctions du
-- chemin public et les politiques RLS. À partir de maintenant, un projet
-- Supabase vierge devient un registre VIZDATA CERTIFY complet en rejouant les
-- migrations dans l'ordre des noms de fichiers.
--
-- Il est volontairement rejouable
-- -------------------------------
-- Chaque objet est créé « si absent », chaque politique est supprimée avant
-- d'être recréée, chaque fonction passe par « create or replace ». Le fichier
-- peut donc être appliqué sur un projet vierge comme sur un projet qui porte
-- déjà le socle, sans rien détruire. C'est la seule façon de rendre le dépôt
-- utilisable dans les deux situations : reconstruire, ou remettre d'aplomb.
--
-- Deux écarts assumés par rapport au relevé
-- -----------------------------------------
-- 1. `cs_read` ne rend les compétences que pour un certificat que le compte a
--    le droit de voir. Le relevé décrivait une lecture ouverte, dont le blocage
--    n'avait jamais été mesuré (la table était vide). Ouvrir cette table en
--    lecture anonyme ne sert à rien : le chemin public passe par
--    `verify_certificate`, qui agrège les compétences lui-même.
-- 2. `users_self_update` autorise aussi l'administrateur. Sans cela, aucun
--    écran d'administration ne peut corriger le nom d'un titulaire.
--
-- L'ordre compte : types, tables, fonctions utilitaires, déclencheurs,
-- politiques, puis fonctions du chemin public — ces dernières référencent les
-- tables et les types.

begin;

-- ============================================================================
-- 1. TYPES ÉNUMÉRÉS
-- ============================================================================

do $$ begin
  create type public.certificate_status as enum ('ACTIVE', 'EXPIRED', 'REVOKED', 'CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.user_role as enum ('ADMIN', 'CERTIFIED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.verification_source as enum ('qr', 'reference', 'lien');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.share_platform as enum ('linkedin', 'whatsapp', 'email', 'copy_link');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 2. TABLES
-- ============================================================================

-- Profils applicatifs. L'identifiant est celui du compte d'authentification :
-- un titulaire ne peut donc pas exister sans compte, et la suppression du
-- compte emporte le profil.
create table if not exists public.users (
  id             uuid primary key references auth.users(id) on delete cascade,
  first_name     text not null default '',
  last_name      text not null default '',
  email          text not null,
  avatar_url     text,
  linkedin_url   text,
  username       text unique,
  public_profile boolean not null default false,
  role           public.user_role not null default 'CERTIFIED',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.certificate_types (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name             text not null,
  description      text not null default '',
  default_duration integer not null default 20,
  validity_period  integer,
  status           text not null default 'ACTIVE',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Le certificat est la pièce maîtresse. `user_id` est en RESTRICT : on ne
-- supprime pas un titulaire qui porte des certificats délivrés, sinon le
-- registre perdrait la trace de ce qu'il a certifié.
create table if not exists public.certificates (
  id                  uuid primary key default gen_random_uuid(),
  reference           text not null unique,
  public_token        text not null unique,
  user_id             uuid not null references public.users(id) on delete restrict,
  certificate_type_id uuid not null references public.certificate_types(id),
  issue_date          date not null default current_date,
  expiry_date         date,
  status              public.certificate_status not null default 'ACTIVE',
  score               integer,
  duration            integer,
  trainer             text not null default '',
  signatory           text not null default '',
  pdf_url             text,
  qr_code_url         text,
  revoke_reason       text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists certificates_user_idx  on public.certificates (user_id);
create index if not exists certificates_type_idx  on public.certificates (certificate_type_id);
create index if not exists certificates_token_idx on public.certificates (public_token);

create table if not exists public.skills (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text not null default ''
);

create table if not exists public.certificate_skills (
  certificate_id uuid not null references public.certificates(id) on delete cascade,
  skill_id       uuid not null references public.skills(id) on delete cascade,
  primary key (certificate_id, skill_id)
);

create table if not exists public.verifications (
  id             uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references public.certificates(id) on delete cascade,
  verified_at    timestamptz not null default now(),
  source         public.verification_source not null default 'qr',
  country        text,
  user_agent     text,
  ip_hash        text
);

create index if not exists verifications_cert_idx on public.verifications (certificate_id);
create index if not exists verifications_when_idx on public.verifications (verified_at desc);

create table if not exists public.shares (
  id             uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references public.certificates(id) on delete cascade,
  platform       public.share_platform not null,
  shared_at      timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id          bigserial primary key,
  actor_id    uuid references public.users(id) on delete set null,
  action      text not null,
  entity_type text not null default 'certificate',
  entity_id   uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_when_idx on public.audit_logs (created_at desc);

create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 3. FONCTIONS UTILITAIRES
-- ============================================================================

-- `is_admin()` est appelée par presque toutes les politiques. Elle doit être
-- `security definer` : sans cela, elle lirait `public.users` sous les
-- politiques de cette même table, et la récursion serait immédiate.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path to 'public'
as $$
  select exists (
    select 1 from public.users u
     where u.id = auth.uid() and u.role = 'ADMIN'
  );
$$;

-- Le statut n'est pas une donnée stockée mais une lecture de la date. Stocker
-- « EXPIRED » obligerait à repasser sur la table chaque nuit ; le calculer rend
-- la vérité immédiate.
create or replace function public.effective_status(c public.certificates)
returns public.certificate_status
language sql
immutable
as $$
  select case
    when c.status in ('REVOKED', 'CANCELLED') then c.status
    when c.expiry_date is not null and c.expiry_date < current_date then 'EXPIRED'::public.certificate_status
    else 'ACTIVE'::public.certificate_status
  end;
$$;

-- Numérotation VIZ-{ANNÉE}-{CODE}-{NUMÉRO sur 6 chiffres}. Le calcul est fait
-- côté base pour que deux administrateurs qui délivrent au même instant
-- n'obtiennent pas le même numéro.
create or replace function public.next_reference(p_code text, p_year integer)
returns text
language plpgsql
set search_path to 'public'
as $function$
declare
  v_prefix text := 'VIZ-' || p_year || '-' || upper(p_code) || '-';
  v_next   integer;
begin
  select coalesce(max(substring(c.reference from char_length(v_prefix) + 1)::integer), 0) + 1
    into v_next
    from public.certificates c
   where c.reference like v_prefix || '%'
     and substring(c.reference from char_length(v_prefix) + 1) ~ '^[0-9]+$';

  return v_prefix || lpad(v_next::text, 6, '0');
end;
$function$;

-- Jeton public : il voyage dans le QR code imprimé, donc il doit être
-- imprévisible. L'alphabet exclut les caractères qu'on confond à la lecture
-- (l, o, 0, 1) pour qu'un jeton reste recopiable à la main.
create or replace function public.new_public_token()
returns text
language plpgsql
as $function$
declare
  v_chars text := 'abcdefghijkmnpqrstuvwxyz23456789';
  v_out   text := '';
  i       integer;
begin
  for i in 1..14 loop
    v_out := v_out || substr(v_chars, 1 + floor(random() * char_length(v_chars))::integer, 1);
  end loop;
  return v_out;
end;
$function$;

-- Garde-fou contre l'énumération de jetons. Déclaré, mais encore inerte : rien
-- ne l'appelle, faute d'un `ip_hash` renseigné côté client. Voir
-- supabase/migrations/PROPOSITION_tracabilite_verifications.sql.
create or replace function public.verification_rate_ok(
  p_ip_hash text,
  p_window  interval default '1 minute',
  p_max     integer default 30
)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select coalesce(count(*), 0) < p_max
    from public.verifications v
   where v.ip_hash = p_ip_hash
     and v.verified_at > now() - p_window;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

-- ============================================================================
-- 4. DÉCLENCHEURS
-- ============================================================================

drop trigger if exists users_touch on public.users;
create trigger users_touch before update on public.users
  for each row execute function public.touch_updated_at();

drop trigger if exists types_touch on public.certificate_types;
create trigger types_touch before update on public.certificate_types
  for each row execute function public.touch_updated_at();

drop trigger if exists certificates_touch on public.certificates;
create trigger certificates_touch before update on public.certificates
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 5. SÉCURITÉ AU NIVEAU DES LIGNES
-- ============================================================================
-- RLS est activé sur les neuf tables. Aucune n'est lisible par un visiteur
-- anonyme, à deux exceptions près — les types et les compétences, qui ne
-- contiennent rien de personnel.

alter table public.users              enable row level security;
alter table public.certificate_types  enable row level security;
alter table public.certificates       enable row level security;
alter table public.skills             enable row level security;
alter table public.certificate_skills enable row level security;
alter table public.verifications      enable row level security;
alter table public.shares             enable row level security;
alter table public.audit_logs         enable row level security;
alter table public.settings           enable row level security;

-- users : chacun lit sa ligne, l'administrateur lit tout.
drop policy if exists users_self_select on public.users;
create policy users_self_select on public.users
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists users_admin_write on public.users;
create policy users_admin_write on public.users
  for insert to authenticated
  with check (public.is_admin());

-- certificates : l'administrateur fait tout, le titulaire lit les siens.
drop policy if exists certificates_admin_all on public.certificates;
create policy certificates_admin_all on public.certificates
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists certificates_owner_select on public.certificates;
create policy certificates_owner_select on public.certificates
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Référentiels : lisibles sans session, modifiables par l'administration.
drop policy if exists types_read on public.certificate_types;
create policy types_read on public.certificate_types
  for select to anon, authenticated using (true);

drop policy if exists types_write on public.certificate_types;
create policy types_write on public.certificate_types
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists skills_read on public.skills;
create policy skills_read on public.skills
  for select to anon, authenticated using (true);

drop policy if exists skills_write on public.skills;
create policy skills_write on public.skills
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- certificate_skills : les compétences suivent le droit de voir le certificat.
drop policy if exists cs_read on public.certificate_skills;
create policy cs_read on public.certificate_skills
  for select to authenticated
  using (exists (
    select 1 from public.certificates c
     where c.id = certificate_id
       and (c.user_id = auth.uid() or public.is_admin())
  ));

drop policy if exists cs_write on public.certificate_skills;
create policy cs_write on public.certificate_skills
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Mesure et journal : lecture réservée à l'administration. L'écriture passe par
-- des fonctions `security definer`, jamais par la table.
drop policy if exists verif_admin_read on public.verifications;
create policy verif_admin_read on public.verifications
  for select to authenticated using (public.is_admin());

drop policy if exists shares_admin_read on public.shares;
create policy shares_admin_read on public.shares
  for select to authenticated using (public.is_admin());

drop policy if exists audit_admin_read on public.audit_logs;
create policy audit_admin_read on public.audit_logs
  for select to authenticated using (public.is_admin());

drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- 6. CHEMIN PUBLIC
-- ============================================================================
-- La vérification ne lit aucune table : elle appelle une fonction. C'est ce qui
-- permet de garder `users` et `certificates` fermés tout en rendant un verdict
-- à un visiteur sans session. L'adresse e-mail du titulaire ne sort jamais.
--
-- La projection définitive de `verify_certificate` est posée par la migration
-- 20261114_02_refonte.sql. Celle écrite ici est l'historique, en neuf colonnes,
-- conservée pour que le socle soit cohérent s'il est appliqué seul.

create or replace function public.public_profile(p_username text)
returns table(
  holder_name  text,
  certification text,
  reference    text,
  issue_date   date,
  public_token text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
    select
      u.first_name || ' ' || u.last_name,
      t.name,
      c.reference,
      c.issue_date,
      c.public_token
    from public.users u
    join public.certificates c on c.user_id = u.id
    join public.certificate_types t on t.id = c.certificate_type_id
   where u.username = p_username
     and u.public_profile = true
     and public.effective_status(c) = 'ACTIVE'
   order by c.issue_date desc;
end;
$function$;

grant execute on function public.public_profile(text) to anon, authenticated;

-- `next_reference` et `new_public_token` ne servent qu'à l'administration.
-- Révoquer `anon` seul serait sans effet : ce rôle hérite de PUBLIC, à qui
-- Postgres accorde EXECUTE par défaut. Voir 20260819_durcissement.sql.
revoke execute on function public.next_reference(text, integer) from public;
revoke execute on function public.new_public_token() from public;
grant  execute on function public.next_reference(text, integer) to authenticated;
grant  execute on function public.new_public_token() to authenticated;

commit;
