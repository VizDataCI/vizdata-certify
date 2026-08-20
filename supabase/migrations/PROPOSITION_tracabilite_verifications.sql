-- PROPOSITION — délibérément non appliquée. Lisez les réserves avant de l'exécuter.
--
-- CONSTAT
--
-- La base contient verification_rate_ok(p_ip_hash, p_window, p_max), pensée pour
-- freiner l'énumération de jetons. Elle n'est appelée par aucune fonction, et
-- verifications.ip_hash n'est jamais renseignée : le garde-fou n'a rien à
-- mesurer. Les colonnes country et user_agent restent vides elles aussi, si
-- bien que l'écran « Vérifications » affiche des cases vides.
--
-- Cette migration renseigne ces colonnes et branche le garde-fou.
--
-- POURQUOI ELLE N'A PAS ÉTÉ APPLIQUÉE
--
-- 1. Faux positifs. Une entreprise entière sort souvent par une seule adresse IP.
--    Un service RH qui vérifie les certificats de vingt candidats atteindrait le
--    seuil de 30 par minute et se verrait répondre « certificat introuvable » —
--    le pire message possible pour un registre officiel, puisqu'il laisse croire
--    que le certificat est faux. Si vous branchez ce garde-fou, prévoyez un
--    message distinct pour ce cas, côté application.
--
-- 2. Données personnelles. Une empreinte d'adresse IP reste une donnée
--    personnelle au sens du RGPD, même hachée. La conserver suppose une durée de
--    conservation définie, une mention dans le registre des traitements, et une
--    purge. La dernière instruction ci-dessous en propose une, à planifier.
--
-- 3. Le sel doit exister avant. md5(ip) seul n'anonymise rien : l'espace des
--    adresses IPv4 se parcourt en quelques minutes. Le sel est donc lu dans la
--    table settings, et la migration échoue franchement s'il est absent.
--
-- AVANT D'EXÉCUTER : poser le sel, une fois pour toutes.
--
--   insert into public.settings (key, value)
--   values ('verification_salt', to_jsonb(encode(gen_random_bytes(32), 'hex')));

begin;

create or replace function public.verify_certificate(
  p_token text,
  p_source verification_source default 'qr'::verification_source
)
returns table(
  reference text, holder_name text, certification text, issuer text,
  issue_date date, expiry_date date, score integer,
  status certificate_status, revoke_reason text,
  public_token text, description text, duration integer,
  trainer text, signatory text, skills text[]
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cert public.certificates;
  v_entetes json;
  v_ip text;
  v_agent text;
  v_pays text;
  v_sel text;
  v_empreinte text;
begin
  select (s.value #>> '{}') into v_sel from public.settings s where s.key = 'verification_salt';
  if v_sel is null then
    raise exception 'Sel de hachage absent : insérez la clé verification_salt dans settings.';
  end if;

  /* PostgREST expose les en-têtes de la requête. Le paramètre « true » évite
     une erreur lorsque la fonction est appelée hors d'un contexte HTTP. */
  v_entetes := nullif(current_setting('request.headers', true), '')::json;
  v_ip := split_part(coalesce(v_entetes ->> 'x-forwarded-for', ''), ',', 1);
  v_agent := left(coalesce(v_entetes ->> 'user-agent', ''), 300);
  v_pays := upper(left(coalesce(v_entetes ->> 'cf-ipcountry', ''), 2));
  v_empreinte := encode(digest(v_sel || coalesce(v_ip, ''), 'sha256'), 'hex');

  if v_ip <> '' and not public.verification_rate_ok(v_empreinte) then
    /* Retour vide : à l'application de distinguer ce cas d'un jeton inconnu. */
    return;
  end if;

  select * into v_cert from public.certificates c where c.public_token = p_token;
  if not found then
    return;
  end if;

  insert into public.verifications (certificate_id, source, country, user_agent, ip_hash)
  values (v_cert.id, p_source, nullif(v_pays, ''), nullif(v_agent, ''), v_empreinte);

  return query
    select
      v_cert.reference,
      u.first_name || ' ' || u.last_name,
      t.name,
      'VIZDATA'::text,
      v_cert.issue_date,
      v_cert.expiry_date,
      case when public.effective_status(v_cert) = 'ACTIVE' then v_cert.score else null end,
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
    from public.users u, public.certificate_types t
    where u.id = v_cert.user_id
      and t.id = v_cert.certificate_type_id;
end;
$function$;

commit;

-- digest() vient de pgcrypto. Si l'extension n'est pas installée :
--   create extension if not exists pgcrypto with schema extensions;
-- et ajoutez « extensions » au search_path de la fonction.

-- PURGE — à planifier une fois la durée de conservation arrêtée.
-- L'empreinte disparaît, la statistique de consultation est conservée.
--
--   update public.verifications
--      set ip_hash = null, user_agent = null
--    where verified_at < now() - interval '12 months'
--      and ip_hash is not null;
