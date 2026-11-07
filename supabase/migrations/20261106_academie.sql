-- Académie CITIZEN DATA ANALYST : cohortes et candidatures.
--
-- La page de vente publique doit faire trois choses que le registre de
-- certificats ne sait pas faire : annoncer une session, recueillir une
-- candidature sans compte, et laisser l'administration suivre le prospect
-- jusqu'à son inscription.
--
-- Deux principes commandent ce qui suit.
--
-- 1. Les candidatures sont des données personnelles. La table reste fermée :
--    aucune lecture anonyme, aucune lecture par un titulaire certifié. Seule
--    une fonction `security definer` peut y écrire, et seul un administrateur
--    peut la lire. Le même raisonnement que pour `certificates` — ouvrir la
--    table en insertion anonyme donnerait aussi la lecture à qui sait lire une
--    requête REST.
--
-- 2. Les dates de session, le nombre de places et les tarifs ne sont pas
--    inscrits dans le code. Ils vivent dans `cohortes`, modifiables depuis
--    l'administration. La page publique lit la cohorte publiée par une
--    fonction, et n'affiche rien quand il n'y en a pas : mieux vaut une page
--    sans date qu'une date inventée.
--
-- À appliquer depuis la console Supabase (SQL Editor), comme les précédentes.

begin;

/* --- types énumérés ------------------------------------------------------
   Les cinq statuts du tableau de suivi demandé : Nouveau, Contacté, En attente
   de paiement, Inscrit, Annulé. Contraints par la base, et non par le
   navigateur : un statut hors liste est refusé par Postgres. */

create type public.candidature_statut as enum (
  'NOUVEAU', 'CONTACTE', 'ATTENTE_PAIEMENT', 'INSCRIT', 'ANNULE'
);

create type public.niveau_excel as enum ('DEBUTANT', 'INTERMEDIAIRE', 'AVANCE');

create type public.formule_paiement as enum ('INTEGRAL', 'ECHELONNE');

create type public.cohorte_statut as enum ('BROUILLON', 'OUVERTE', 'COMPLETE', 'CLOTUREE');

/* --- cohortes -------------------------------------------------------------
   Une ligne par session trimestrielle. `publiee` sépare ce que
   l'administration prépare de ce que le visiteur voit : une cohorte se
   construit en brouillon, puis s'ouvre.

   Les tarifs sont portés par la cohorte, pas par la page : une hausse de prix
   à la session suivante ne demande donc aucune mise en production. */

create table public.cohortes (
  id                uuid primary key default gen_random_uuid(),
  libelle           text not null,
  date_debut        date,
  date_fin          date,
  lieu              text not null default 'Abidjan, Côte d''Ivoire',
  places            integer check (places is null or places > 0),
  tarif_integral    integer not null default 500000 check (tarif_integral > 0),
  tarif_echelonne   integer not null default 600000 check (tarif_echelonne > 0),
  statut            public.cohorte_statut not null default 'BROUILLON',
  publiee           boolean not null default false,
  note_publique     text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  /* Une cohorte sans date peut être publiée — la page affiche alors
     « prochaine session : nous contacter ». En revanche une fin avant le
     début est une faute de saisie, pas une information. */
  constraint cohortes_dates_coherentes check (date_fin is null or date_debut is null or date_fin >= date_debut)
);

create index cohortes_publiee_idx on public.cohortes (publiee, date_debut);

/* --- candidatures ---------------------------------------------------------
   `reference` donne au candidat et à l'administration un identifiant commun à
   citer au téléphone ou sur WhatsApp : CDA-2026-0001.

   `cohorte_id` est renseignée à la soumission avec la cohorte publiée du
   moment, et conservée même si la cohorte est clôturée ensuite : c'est la
   session pour laquelle la personne a candidaté. */

create table public.candidatures (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique,
  cohorte_id      uuid references public.cohortes (id) on delete set null,
  nom             text not null check (length(btrim(nom)) between 2 and 120),
  whatsapp        text not null check (length(btrim(whatsapp)) between 6 and 32),
  email           text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  profession      text not null check (length(btrim(profession)) between 2 and 160),
  entreprise      text not null default '',
  niveau          public.niveau_excel not null,
  motivation      text not null default '',
  formule         public.formule_paiement not null,
  disponible      boolean not null,
  consent_contact boolean not null,
  statut          public.candidature_statut not null default 'NOUVEAU',
  notes           text not null default '',
  source          text not null default 'page-academie',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  /* Les deux cases du formulaire sont obligatoires. Les refuser ici, et pas
     seulement dans le navigateur, évite qu'un appel direct à la fonction
     enregistre une candidature sans consentement au contact. */
  constraint candidatures_engagements check (disponible and consent_contact),
  constraint candidatures_motivation_bornee check (length(motivation) <= 2000)
);

create index candidatures_statut_idx on public.candidatures (statut, created_at desc);
create index candidatures_cohorte_idx on public.candidatures (cohorte_id);
create index candidatures_email_idx on public.candidatures (lower(email));

/* `touch_updated_at()` existe déjà dans le projet : elle sert aux tables du
   registre. On la réutilise plutôt que d'en écrire une seconde. */
create trigger cohortes_touch
  before update on public.cohortes
  for each row execute function public.touch_updated_at();

create trigger candidatures_touch
  before update on public.candidatures
  for each row execute function public.touch_updated_at();

/* --- politiques -----------------------------------------------------------
   RLS activé, et aucune politique de lecture hors administration. Sans
   politique, une table RLS ne rend rien : le défaut est donc le bon.

   Les cohortes ne sont pas ouvertes en lecture anonyme non plus, bien que leur
   contenu soit public : la page passe par `cohorte_publique()`, qui ne rend que
   la session publiée. Une lecture directe exposerait les brouillons — les
   tarifs de la session suivante, par exemple. */

alter table public.cohortes enable row level security;
alter table public.candidatures enable row level security;

create policy cohortes_admin_all
  on public.cohortes for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy candidatures_admin_all
  on public.candidatures for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

/* --- cohorte publiée ------------------------------------------------------
   Projection publique : ni les brouillons, ni `note_privee`, ni les compteurs
   internes. Une seule ligne au plus — la plus proche dans le temps. */

create function public.cohorte_publique()
returns table (
  id              uuid,
  libelle         text,
  date_debut      date,
  date_fin        date,
  lieu            text,
  places          integer,
  places_restantes integer,
  tarif_integral  integer,
  tarif_echelonne integer,
  statut          public.cohorte_statut,
  note_publique   text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    c.id,
    c.libelle,
    c.date_debut,
    c.date_fin,
    c.lieu,
    c.places,
    /* Les places restantes se déduisent des inscrits, elles ne sont pas
       saisies : un compteur tenu à la main se désynchronise toujours. */
    case
      when c.places is null then null
      else greatest(0, c.places - (
        select count(*) from public.candidatures k
        where k.cohorte_id = c.id and k.statut = 'INSCRIT'
      ))::integer
    end,
    c.tarif_integral,
    c.tarif_echelonne,
    c.statut,
    c.note_publique
  from public.cohortes c
  where c.publiee and c.statut in ('OUVERTE', 'COMPLETE')
  order by c.date_debut nulls last, c.created_at
  limit 1;
$function$;

grant execute on function public.cohorte_publique() to anon, authenticated;

/* --- numérotation ---------------------------------------------------------
   CDA-{ANNÉE}-{NUMÉRO}. La numérotation est annuelle et continue : le numéro
   se déduit du plus grand déjà attribué dans l'année, pas d'un comptage des
   lignes — une candidature supprimée ne doit pas faire réattribuer sa place. */

create function public.next_candidature_reference(p_year integer)
returns text
language sql
stable
as $function$
  select 'CDA-' || p_year::text || '-' || lpad((
    coalesce(max(substring(c.reference from 10)::integer), 0) + 1
  )::text, 4, '0')
  from public.candidatures c
  where c.reference like 'CDA-' || p_year::text || '-%'
    and substring(c.reference from 10) ~ '^[0-9]+$';
$function$;

revoke execute on function public.next_candidature_reference(integer) from public;
revoke execute on function public.next_candidature_reference(integer) from anon;

/* --- soumission d'une candidature ----------------------------------------
   Seule porte d'écriture ouverte au visiteur. Elle valide, numérote, rattache
   la cohorte publiée, et rend la référence attribuée.

   Deux garde-fous, pour qu'un formulaire public ne devienne pas un robinet :

   - renvoi de candidature : une même adresse qui revalide le formulaire dans
     les dix minutes retrouve sa référence au lieu de créer un doublon. C'est
     le cas réel du double clic ou du rechargement, et l'administration n'a pas
     à trier des doublons.

   - débit global : au-delà de 60 candidatures en une heure, la fonction
     refuse. Le chiffre est très au-dessus d'une cohorte réelle, et très en
     dessous de ce que produit un script. */

create function public.soumettre_candidature(
  p_nom         text,
  p_whatsapp    text,
  p_email       text,
  p_profession  text,
  p_niveau      public.niveau_excel,
  p_formule     public.formule_paiement,
  p_disponible  boolean,
  p_consent     boolean,
  p_entreprise  text default '',
  p_motivation  text default '',
  p_source      text default 'page-academie'
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_reference text;
  v_cohorte   uuid;
  v_recente   text;
  v_essai     integer;
begin
  if not (coalesce(p_disponible, false) and coalesce(p_consent, false)) then
    raise exception 'La disponibilité et l''accord de contact sont obligatoires.'
      using errcode = 'check_violation';
  end if;

  if (select count(*) from public.candidatures where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Trop de candidatures reçues en ce moment. Réessayez dans quelques minutes.';
  end if;

  select c.reference into v_recente
  from public.candidatures c
  where lower(c.email) = lower(btrim(p_email))
    and c.created_at > now() - interval '10 minutes'
  order by c.created_at desc
  limit 1;

  if v_recente is not null then
    return v_recente;
  end if;

  select id into v_cohorte from public.cohorte_publique();

  /* La référence se calcule à partir du maximum existant : deux soumissions
     simultanées peuvent viser le même numéro. La contrainte d'unicité est là
     pour l'empêcher d'aboutir ; on recalcule alors et on réessaie, au lieu de
     renvoyer une erreur au candidat pour une collision d'une milliseconde. */
  for v_essai in 1..5 loop
    v_reference := public.next_candidature_reference(extract(year from now())::integer);
    begin
      insert into public.candidatures (
        reference, cohorte_id, nom, whatsapp, email, profession, entreprise,
        niveau, motivation, formule, disponible, consent_contact, source
      ) values (
        v_reference,
        v_cohorte,
        btrim(p_nom),
        btrim(p_whatsapp),
        lower(btrim(p_email)),
        btrim(p_profession),
        btrim(coalesce(p_entreprise, '')),
        p_niveau,
        left(btrim(coalesce(p_motivation, '')), 2000),
        p_formule,
        true,
        true,
        left(coalesce(p_source, 'page-academie'), 60)
      );
      return v_reference;
    exception when unique_violation then
      /* numéro pris entre le calcul et l'insertion : on repart */
    end;
  end loop;

  raise exception 'Numérotation des candidatures indisponible. Réessayez.';
end;
$function$;

grant execute on function public.soumettre_candidature(
  text, text, text, text, public.niveau_excel, public.formule_paiement,
  boolean, boolean, text, text, text
) to anon, authenticated;

commit;

-- Après application, créer la première cohorte depuis l'administration
-- (Administration → Cohortes). Aucune date, aucun tarif et aucun nombre de
-- places ne sont insérés ici : ce sont des informations que VIZDATA fournit,
-- pas que la migration devine.
