-- Étend la projection publique des fonctions de vérification.
--
-- Contexte : la page de vérification affiche les compétences validées et propose
-- le certificat imprimable, qui a besoin de la durée, du formateur et du
-- signataire. Ces champs ne sortaient pas des fonctions, et le QR code était
-- impossible à construire depuis une vérification par référence, faute de
-- public_token.
--
-- Le corps de verify_certificate est repris tel quel — enregistrement de la
-- consultation, score masqué hors ACTIVE, motif masqué hors REVOKED, statut
-- calculé par effective_status. Seule la projection s'élargit.
--
-- verify_by_reference délègue à verify_certificate par un « select * » : les
-- deux signatures doivent donc changer ensemble, sinon la seconde casse.
--
-- Changer le type de retour impose de supprimer avant de recréer ; les droits
-- d'exécution disparaissent avec la fonction et sont donc réattribués à la fin.

begin;

drop function if exists public.verify_by_reference(text);
drop function if exists public.verify_certificate(text, verification_source);

create function public.verify_certificate(
  p_token text,
  p_source verification_source default 'qr'::verification_source
)
returns table(
  reference text,
  holder_name text,
  certification text,
  issuer text,
  issue_date date,
  expiry_date date,
  score integer,
  status certificate_status,
  revoke_reason text,
  public_token text,
  description text,
  duration integer,
  trainer text,
  signatory text,
  skills text[]
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

create function public.verify_by_reference(p_reference text)
returns table(
  reference text,
  holder_name text,
  certification text,
  issuer text,
  issue_date date,
  expiry_date date,
  score integer,
  status certificate_status,
  revoke_reason text,
  public_token text,
  description text,
  duration integer,
  trainer text,
  signatory text,
  skills text[]
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

grant execute on function public.verify_certificate(text, verification_source) to anon, authenticated;
grant execute on function public.verify_by_reference(text) to anon, authenticated;

commit;
