-- REFONTE FONCTIONNELLE — novembre 2026.
--
-- Ce que cette migration change, et pourquoi
-- ------------------------------------------
--
-- 1. CATÉGORISATION À DEUX NIVEAUX. Le registre ne connaissait qu'une liste
--    plate de « types de certification » : EXCEL, PBI, DATA. Or VIZDATA délivre
--    plusieurs certifications dans un même domaine — Excel débutant,
--    intermédiaire, avancé, expert, tableaux croisés dynamiques. Un code par
--    domaine ne suffit donc pas.
--
--    Plutôt que de créer une table parallèle, `certificate_types` DEVIENT la
--    table des programmes : elle portait déjà code, intitulé, description,
--    durée et statut. On lui ajoute le domaine. Les certificats déjà délivrés
--    gardent leur clé étrangère et restent vérifiables — c'est la raison
--    décisive de ne pas repartir d'une table neuve.
--
--    Domaine  = EXCEL, POWER BI, DATA…      (certification_domains)
--    Programme = « Excel — Niveau avancé »   (certificate_types)
--
-- 2. TROIS RÔLES. `user_role` ne connaissait qu'ADMIN et CERTIFIED. Le
--    gestionnaire arrive, avec des autorisations que l'administrateur accorde
--    une par une (`users.permissions`). Un gestionnaire ne peut pas se promouvoir
--    administrateur : un déclencheur l'en empêche côté base, pas côté écran.
--
-- 3. CYCLE DE VIE DU COMPTE. `account_status`, `must_change_password`,
--    `invited_at`, `activated_at` : un titulaire est invité, active son compte,
--    choisit son mot de passe, et peut être désactivé sans être supprimé —
--    supprimer effacerait les certificats délivrés.
--
-- 4. MODÈLES DE CERTIFICAT. `certificate_templates`, référencés par le
--    programme (modèle par défaut) et par le certificat (modèle utilisé). Un
--    certificat délivré doit continuer à s'imprimer comme au jour de sa
--    délivrance, même si le modèle du programme change ensuite.
--
-- 5. NOTIFICATIONS. Une table qui garde la trace de ce qui a été envoyé.
--    L'envoi lui-même appartient aux Edge Functions : la clé secrète n'a
--    aucune raison d'approcher le navigateur.
--
-- 6. L'EXPIRATION ET LE SCORE SORTENT DU CHEMIN PUBLIC. Les deux colonnes
--    restent en base — effacer des données délivrées serait une faute — mais
--    `verify_certificate` ne les renvoie plus. Le domaine, lui, y entre : la
--    page publique doit l'afficher.
--
--    Conséquence assumée : un certificat créé à partir de maintenant n'a pas de
--    date d'expiration, donc ne basculera jamais en « Expiré ». Les certificats
--    anciens qui en portent une continuent d'être traités par
--    `effective_status` — on ne réécrit pas le passé.
--
-- Rejouable, comme le socle : chaque objet est créé « si absent ».

-- L'ajout d'une valeur à un type énuméré est volontairement HORS transaction.
-- Postgres refuse d'utiliser une valeur ajoutée dans la transaction qui
-- l'ajoute ; la sortir du bloc lève la contrainte. Partout plus bas, le rôle
-- est comparé en texte (`role::text`) plutôt que casté vers l'énuméré : ainsi
-- aucune de ces expressions ne dépend du moment où la valeur a été créée.
alter type public.user_role add value if not exists 'MANAGER';

begin;

-- ============================================================================
-- 1. DOMAINES DE CERTIFICATION
-- ============================================================================

create table if not exists public.certification_domains (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text not null default '',
  status      text not null default 'ACTIVE',
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================================
-- 2. MODÈLES DE CERTIFICAT
-- ============================================================================
-- `layout` reste un jsonb libre : la mise en page vit dans l'application, et la
-- base n'a pas à connaître des millimètres. Ce qu'elle doit savoir, c'est quel
-- modèle a servi à quel certificat.

create table if not exists public.certificate_templates (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text not null default '',
  orientation text not null default 'landscape',
  layout      jsonb not null default '{}'::jsonb,
  status      text not null default 'ACTIVE',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into public.certificate_templates (code, name, description, orientation)
values ('VIZDATA-PAYSAGE-2026',
        'VIZDATA — A4 paysage',
        'Modèle institutionnel officiel : format A4 paysage, logo VIZDATA, QR code de vérification.',
        'landscape')
on conflict (code) do nothing;

-- ============================================================================
-- 3. LE PROGRAMME — certificate_types enrichi
-- ============================================================================

alter table public.certificate_types
  add column if not exists domain_id   uuid references public.certification_domains(id),
  add column if not exists template_id uuid references public.certificate_templates(id),
  add column if not exists sort_order  integer not null default 100;

comment on table public.certificate_types is
  'Programmes de certification. Le domaine est porté par domain_id ; le nom est l''intitulé exact imprimé sur le certificat.';
comment on column public.certificate_types.validity_period is
  'Conservé pour les certificats anciens. N''est plus appliqué : les certificats délivrés depuis novembre 2026 sont sans expiration.';

-- Domaines de départ. Les quatre premiers viennent du besoin exprimé ; AUTRES
-- recueille les programmes existants qu'aucun ne réclame, pour qu'aucun
-- programme ne reste orphelin et que l'administrateur puisse les reclasser.
insert into public.certification_domains (code, name, description, sort_order) values
  ('EXCEL',   'Excel',             'Tableur, analyse et structuration des données sous Microsoft Excel.', 10),
  ('POWERBI', 'Power BI',          'Modélisation, analyse et visualisation sous Microsoft Power BI.',     20),
  ('DATA',    'Data & Analyse',    'Analyse de données, visualisation et restitution.',                   30),
  ('AUTRES',  'Autres programmes', 'Programmes non encore rattachés à un domaine.',                      900)
on conflict (code) do nothing;

-- Rattachement des programmes déjà enregistrés. Correspondance explicite sur
-- les cinq codes connus du registre ; tout autre code tombe dans AUTRES.
update public.certificate_types t
   set domain_id = d.id
  from public.certification_domains d
 where t.domain_id is null
   and d.code = case upper(t.code)
                  when 'EXCEL'  then 'EXCEL'
                  when 'EXPERT' then 'EXCEL'
                  when 'PBI'    then 'POWERBI'
                  when 'DATA'   then 'DATA'
                  when 'VIZ'    then 'DATA'
                  else 'AUTRES'
                end;

-- Modèle par défaut pour les programmes qui n'en ont pas.
update public.certificate_types t
   set template_id = m.id
  from public.certificate_templates m
 where t.template_id is null
   and m.code = 'VIZDATA-PAYSAGE-2026';

-- Sur un registre vierge seulement, les programmes d'amorçage. Sur un registre
-- qui porte déjà des programmes, rien n'est inséré : une migration n'a pas à
-- ajouter des certifications que personne n'a décidé de délivrer.
insert into public.certificate_types (domain_id, template_id, code, name, description, default_duration, validity_period, status, sort_order)
select d.id, m.id, v.code, v.name, v.description, v.duree, null, 'ACTIVE', v.rang
  from (values
    ('EXCEL',   'EXCEL-DEB',  'Excel — Niveau débutant',                     'Prise en main du tableur, saisie, calculs et mise en forme.',                    20, 10),
    ('EXCEL',   'EXCEL-INT',  'Excel — Niveau intermédiaire',                'Formules, fonctions de recherche, mise en forme conditionnelle, graphiques.',    25, 20),
    ('EXCEL',   'EXCEL-AVA',  'Excel — Niveau avancé',                       'Fonctions imbriquées, bases de données, consolidation et automatisation.',       30, 30),
    ('EXCEL',   'EXCEL-EXP',  'Excel — Expert',                              'Maîtrise experte du tableur : modélisation, Power Query, outils d''analyse.',     40, 40),
    ('EXCEL',   'EXCEL-TCD',  'Excel — Tableaux croisés dynamiques',         'Conception et exploitation des tableaux croisés dynamiques.',                    15, 50),
    ('EXCEL',   'EXCEL-STR',  'Excel — Structuration et analyse des données','Structuration des données, nettoyage, analyse et restitution.',                  25, 60),
    ('POWERBI', 'PBI-INI',    'Power BI — Initiation',                       'Découverte de Power BI Desktop, premiers rapports.',                             20, 10),
    ('POWERBI', 'PBI-ANA',    'Power BI — Analyse et visualisation',         'Visuels, interactions, mise en récit des données.',                              25, 20),
    ('POWERBI', 'PBI-MOD',    'Power BI — Modélisation des données',         'Modèle en étoile, relations, mesures DAX.',                                      30, 30),
    ('POWERBI', 'PBI-AVA',    'Power BI — Niveau avancé',                    'DAX avancé, performance, sécurité au niveau des lignes, publication.',           35, 40)
  ) as v(domaine, code, name, description, duree, rang)
  join public.certification_domains d on d.code = v.domaine
  join public.certificate_templates m on m.code = 'VIZDATA-PAYSAGE-2026'
 where not exists (select 1 from public.certificate_types)
on conflict (code) do nothing;

-- ============================================================================
-- 4. CYCLE DE VIE ET AUTORISATIONS DU COMPTE
-- ============================================================================

alter table public.users
  add column if not exists account_status       text    not null default 'ACTIVE',
  add column if not exists must_change_password boolean not null default false,
  add column if not exists permissions          jsonb   not null default '{}'::jsonb,
  add column if not exists phone                text,
  add column if not exists invited_at           timestamptz,
  add column if not exists activated_at         timestamptz,
  add column if not exists created_by           uuid references public.users(id) on delete set null;

comment on column public.users.account_status is 'ACTIVE ou DISABLED. Un compte désactivé ne se connecte plus ; ses certificats restent vérifiables.';
comment on column public.users.permissions is
  'Autorisations accordées à un gestionnaire, par clé booléenne : creer_titulaires, attribuer_certificats, revoquer_certificats, exporter_donnees. Un ADMIN les a toutes, implicitement.';

-- `is_staff()` : administration au sens large. Comparaison en texte pour ne pas
-- dépendre du moment où 'MANAGER' a été ajouté à l'énuméré.
create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
set search_path to 'public'
as $$
  select exists (
    select 1 from public.users u
     where u.id = auth.uid()
       and u.role::text in ('ADMIN', 'MANAGER')
       and u.account_status = 'ACTIVE'
  );
$$;

-- `has_perm()` : une autorisation nommée. L'administrateur les a toutes ; le
-- gestionnaire n'a que celles que l'administrateur a cochées.
create or replace function public.has_perm(p_perm text)
returns boolean
language sql
security definer
stable
set search_path to 'public'
as $$
  select exists (
    select 1 from public.users u
     where u.id = auth.uid()
       and u.account_status = 'ACTIVE'
       and (
         u.role::text = 'ADMIN'
         or (u.role::text = 'MANAGER' and coalesce((u.permissions ->> p_perm)::boolean, false))
       )
  );
$$;

grant execute on function public.is_staff() to authenticated;
grant execute on function public.has_perm(text) to authenticated;

-- Un gestionnaire ne doit pas pouvoir se promouvoir, ni élargir ses propres
-- autorisations, ni se réactiver. La politique UPDATE de `users` l'autorise à
-- écrire la ligne d'un titulaire : sans ce déclencheur, il lui suffirait d'un
-- appel REST sur sa propre ligne. L'écran ne protège rien ; la base, oui.
create or replace function public.guard_user_privileges()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Seul un administrateur peut changer un rôle.' using errcode = '42501';
  end if;
  if new.permissions is distinct from old.permissions then
    raise exception 'Seul un administrateur peut modifier des autorisations.' using errcode = '42501';
  end if;
  if new.account_status is distinct from old.account_status then
    raise exception 'Seul un administrateur peut activer ou désactiver un compte.' using errcode = '42501';
  end if;
  -- L'adresse e-mail identifie le compte : elle ne se change pas depuis
  -- l'espace personnel. Seul un administrateur en a le droit.
  if new.email is distinct from old.email then
    raise exception 'Seul un administrateur peut changer une adresse e-mail.' using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists users_guard_privileges on public.users;
create trigger users_guard_privileges before update on public.users
  for each row execute function public.guard_user_privileges();

-- ============================================================================
-- 5. ATTRIBUTION : QUI A DÉLIVRÉ, AVEC QUEL MODÈLE
-- ============================================================================

alter table public.certificates
  add column if not exists issued_by   uuid references public.users(id) on delete set null,
  add column if not exists template_id uuid references public.certificate_templates(id);

comment on column public.certificates.issued_by is 'Membre de l''administration qui a attribué la certification.';
comment on column public.certificates.template_id is
  'Modèle utilisé à la délivrance. Figé : un certificat s''imprime comme au jour où il a été délivré.';
comment on column public.certificates.expiry_date is
  'Conservée pour les certificats anciens. N''est plus renseignée ni affichée : hors de la projection publique depuis novembre 2026.';
comment on column public.certificates.score is
  'Conservé pour les certificats anciens. N''est plus affiché, ni dans l''espace du titulaire, ni sur le document, ni publiquement.';

update public.certificates c
   set template_id = m.id
  from public.certificate_templates m
 where c.template_id is null
   and m.code = 'VIZDATA-PAYSAGE-2026';

-- Un même titulaire peut recevoir plusieurs fois le même programme (repasser un
-- niveau, par exemple) : aucune contrainte d'unicité sur (user_id, type). Ce
-- qui est unique, c'est la référence du certificat — déjà garantie par le socle.
create index if not exists certificates_issued_by_idx on public.certificates (issued_by);

-- ============================================================================
-- 6. NOTIFICATIONS
-- ============================================================================
-- Trace de ce qui a été envoyé. L'envoi appartient à une Edge Function : la clé
-- secrète ne doit jamais approcher le navigateur.

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.users(id) on delete cascade,
  recipient  text not null,
  kind       text not null,
  channel    text not null default 'email',
  subject    text not null default '',
  payload    jsonb not null default '{}'::jsonb,
  status     text not null default 'PENDING',
  error      text,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id);
create index if not exists notifications_when_idx on public.notifications (created_at desc);

comment on column public.notifications.kind is
  'INVITATION, CERTIFICAT_ATTRIBUE, MOT_DE_PASSE, PROFIL_MODIFIE.';

-- ============================================================================
-- 7. POLITIQUES — le gestionnaire entre en scène
-- ============================================================================

alter table public.certification_domains  enable row level security;
alter table public.certificate_templates  enable row level security;
alter table public.notifications          enable row level security;

-- Référentiels : lisibles sans session (la page publique affiche le domaine),
-- modifiables par l'administrateur seul — c'est de la configuration.
drop policy if exists domains_read on public.certification_domains;
create policy domains_read on public.certification_domains
  for select to anon, authenticated using (true);

drop policy if exists domains_write on public.certification_domains;
create policy domains_write on public.certification_domains
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists templates_read on public.certificate_templates;
create policy templates_read on public.certificate_templates
  for select to authenticated using (public.is_staff());

drop policy if exists templates_write on public.certificate_templates;
create policy templates_write on public.certificate_templates
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- users : le gestionnaire lit l'annuaire et peut créer un titulaire si
-- l'autorisation lui a été donnée. Le déclencheur ci-dessus borne ce qu'il peut
-- écrire sur une ligne existante.
drop policy if exists users_self_select on public.users;
create policy users_self_select on public.users
  for select to authenticated
  using (id = auth.uid() or public.is_staff());

drop policy if exists users_admin_write on public.users;
create policy users_admin_write on public.users
  for insert to authenticated
  with check (public.has_perm('creer_titulaires'));

drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users
  for update to authenticated
  using (id = auth.uid() or public.is_staff())
  with check (id = auth.uid() or public.is_staff());

-- certificates : la lecture pour toute l'administration, l'écriture selon
-- l'autorisation. Une seule politique ALL ne permettrait pas de distinguer
-- « attribuer » de « révoquer » ; d'où quatre politiques.
drop policy if exists certificates_admin_all on public.certificates;

drop policy if exists certificates_owner_select on public.certificates;
create policy certificates_owner_select on public.certificates
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

drop policy if exists certificates_staff_insert on public.certificates;
create policy certificates_staff_insert on public.certificates
  for insert to authenticated
  with check (public.has_perm('attribuer_certificats'));

drop policy if exists certificates_staff_update on public.certificates;
create policy certificates_staff_update on public.certificates
  for update to authenticated
  using (public.has_perm('attribuer_certificats') or public.has_perm('revoquer_certificats'))
  with check (public.has_perm('attribuer_certificats') or public.has_perm('revoquer_certificats'));

drop policy if exists certificates_admin_delete on public.certificates;
create policy certificates_admin_delete on public.certificates
  for delete to authenticated
  using (public.is_admin());

-- Compétences liées : lecture élargie à l'administration, écriture à qui
-- attribue.
drop policy if exists cs_read on public.certificate_skills;
create policy cs_read on public.certificate_skills
  for select to authenticated
  using (exists (
    select 1 from public.certificates c
     where c.id = certificate_id
       and (c.user_id = auth.uid() or public.is_staff())
  ));

drop policy if exists cs_write on public.certificate_skills;
create policy cs_write on public.certificate_skills
  for all to authenticated
  using (public.has_perm('attribuer_certificats'))
  with check (public.has_perm('attribuer_certificats'));

-- Mesure et journal : lecture pour l'administration.
drop policy if exists verif_admin_read on public.verifications;
create policy verif_admin_read on public.verifications
  for select to authenticated using (public.is_staff());

drop policy if exists shares_admin_read on public.shares;
create policy shares_admin_read on public.shares
  for select to authenticated using (public.is_staff());

drop policy if exists audit_admin_read on public.audit_logs;
create policy audit_admin_read on public.audit_logs
  for select to authenticated using (public.is_staff());

-- L'auteur déclaré doit être le compte connecté : sans cette condition, une
-- action pourrait être inscrite au nom d'un autre, et le journal perdrait sa
-- valeur de preuve.
drop policy if exists audit_admin_insert on public.audit_logs;
create policy audit_admin_insert on public.audit_logs
  for insert to authenticated
  with check (public.is_staff() and actor_id = auth.uid());

drop policy if exists notifications_staff_read on public.notifications;
create policy notifications_staff_read on public.notifications
  for select to authenticated
  using (public.is_staff() or user_id = auth.uid());

-- Les types restent de la configuration : administrateur seul.
drop policy if exists types_write on public.certificate_types;
create policy types_write on public.certificate_types
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- 8. CHEMIN PUBLIC — nouvelle projection
-- ============================================================================
-- L'expiration et le score sortent ; le domaine entre.
--
-- `verify_by_reference` délègue à `verify_certificate` par un « select * » : les
-- deux signatures changent donc ensemble, sous peine de casser la seconde.
-- Changer le type de retour impose de supprimer avant de recréer, et les droits
-- d'exécution disparaissent avec la fonction — ils sont réattribués à la fin.

drop function if exists public.verify_by_reference(text);
drop function if exists public.verify_certificate(text, public.verification_source);

create function public.verify_certificate(
  p_token  text,
  p_source public.verification_source default 'qr'::public.verification_source
)
returns table(
  reference     text,
  holder_name   text,
  certification text,
  domain        text,
  issuer        text,
  issue_date    date,
  status        public.certificate_status,
  revoke_reason text,
  public_token  text,
  description   text,
  duration      integer,
  trainer       text,
  signatory     text,
  skills        text[]
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cert public.certificates;
begin
  select * into v_cert from public.certificates c where c.public_token = p_token;
  if not found then
    return;
  end if;

  insert into public.verifications (certificate_id, source) values (v_cert.id, p_source);

  return query
    select
      v_cert.reference,
      u.first_name || ' ' || u.last_name,
      t.name,
      coalesce(d.name, ''),
      'VIZDATA'::text,
      v_cert.issue_date,
      public.effective_status(v_cert),
      case when public.effective_status(v_cert) = 'REVOKED' then v_cert.revoke_reason else null end,
      v_cert.public_token,
      t.description,
      v_cert.duration,
      v_cert.trainer,
      v_cert.signatory,
      coalesce(
        (select array_agg(s.name order by s.name)
           from public.certificate_skills cs
           join public.skills s on s.id = cs.skill_id
          where cs.certificate_id = v_cert.id),
        '{}'::text[]
      )
    from public.users u
    join public.certificate_types t on t.id = v_cert.certificate_type_id
    left join public.certification_domains d on d.id = t.domain_id
   where u.id = v_cert.user_id;
end;
$function$;

create function public.verify_by_reference(p_reference text)
returns table(
  reference     text,
  holder_name   text,
  certification text,
  domain        text,
  issuer        text,
  issue_date    date,
  status        public.certificate_status,
  revoke_reason text,
  public_token  text,
  description   text,
  duration      integer,
  trainer       text,
  signatory     text,
  skills        text[]
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token text;
begin
  select c.public_token into v_token
    from public.certificates c
   where upper(c.reference) = upper(trim(p_reference));

  if v_token is null then
    return;
  end if;

  return query select * from public.verify_certificate(v_token, 'reference');
end;
$function$;

grant execute on function public.verify_certificate(text, public.verification_source) to anon, authenticated;
grant execute on function public.verify_by_reference(text) to anon, authenticated;

-- Le profil public gagne le domaine lui aussi.
drop function if exists public.public_profile(text);

create function public.public_profile(p_username text)
returns table(
  holder_name   text,
  certification text,
  domain        text,
  reference     text,
  issue_date    date,
  public_token  text
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
      coalesce(d.name, ''),
      c.reference,
      c.issue_date,
      c.public_token
    from public.users u
    join public.certificates c on c.user_id = u.id
    join public.certificate_types t on t.id = c.certificate_type_id
    left join public.certification_domains d on d.id = t.domain_id
   where u.username = p_username
     and u.public_profile = true
     and u.account_status = 'ACTIVE'
     and public.effective_status(c) = 'ACTIVE'
   order by c.issue_date desc;
end;
$function$;

grant execute on function public.public_profile(text) to anon, authenticated;

-- ============================================================================
-- 9. DÉCLENCHEURS DE FRAÎCHEUR
-- ============================================================================

drop trigger if exists domains_touch on public.certification_domains;
create trigger domains_touch before update on public.certification_domains
  for each row execute function public.touch_updated_at();

drop trigger if exists templates_touch on public.certificate_templates;
create trigger templates_touch before update on public.certificate_templates
  for each row execute function public.touch_updated_at();

commit;
