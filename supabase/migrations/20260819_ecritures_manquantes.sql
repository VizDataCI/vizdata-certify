-- PROPOSITION — non appliquée. Deux manques bloquent la migration des écritures.
--
-- 1. audit_logs n'a qu'une politique SELECT (audit_admin_read). L'historique
--    ne peut donc pas être écrit : chaque création, modification ou révocation
--    devrait pourtant y laisser une trace.
--
-- 2. shares n'a qu'une politique SELECT (shares_admin_read). Le comptage des
--    partages est donc impossible.
--
-- Pour audit_logs, une politique INSERT réservée aux administrateurs suffit, en
-- exigeant que l'auteur déclaré soit bien le compte connecté : sans cette
-- seconde condition, un administrateur pourrait inscrire une action au nom d'un
-- autre, ce qui viderait l'historique de sa valeur de preuve.
--
-- Pour shares, ouvrir la table en écriture serait une erreur : le partage se
-- déclenche depuis la page publique, donc sans session. Une politique INSERT
-- pour « anon » laisserait n'importe qui gonfler les compteurs. On reprend donc
-- le procédé déjà retenu pour les vérifications : une fonction security definer
-- qui résout le certificat par son jeton et n'écrit rien d'autre.

begin;

create policy audit_admin_insert
  on public.audit_logs
  for insert
  to authenticated
  with check (public.is_admin() and actor_id = auth.uid());

create function public.record_share(p_token text, p_platform share_platform)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  select c.id into v_id from public.certificates c where c.public_token = p_token;
  if not found then
    return;
  end if;
  insert into public.shares (certificate_id, platform) values (v_id, p_platform);
end;
$function$;

grant execute on function public.record_share(text, share_platform) to anon, authenticated;

commit;

-- Reste un point que le SQL ne peut pas régler : public.users.id référence
-- auth.users(id). Créer un titulaire depuis l'administration suppose donc de
-- créer d'abord un compte d'authentification, ce que la clé publiable ne permet
-- pas — et ne doit pas permettre. Deux issues :
--   * inviter les titulaires depuis la console Supabase, puis leur rattacher
--     des certificats depuis l'application ;
--   * ou passer par une Edge Function détenant la clé secrète, qui crée le
--     compte et le profil en une fois.
-- Tant que l'une des deux n'est pas en place, le formulaire de certificat et
-- l'import CSV ne peuvent viser que des titulaires déjà enregistrés.
