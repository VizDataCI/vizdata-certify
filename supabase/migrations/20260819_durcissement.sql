-- Retire l'exécution publique de deux fonctions utilitaires.
--
-- next_reference() laisse deviner le nombre de certificats émis pour un code et
-- une année donnés ; new_public_token() n'a aucune raison d'être appelée sans
-- session. Ni l'une ni l'autre ne sert au chemin public, qui passe par
-- verify_certificate, verify_by_reference et public_profile.
--
-- Attention : « revoke ... from anon » seul serait sans effet. Le rôle anon
-- hérite de PUBLIC, à qui Postgres accorde EXECUTE par défaut sur toute
-- fonction créée. Il faut donc révoquer PUBLIC, puis ré-accorder explicitement
-- à authenticated — dont l'espace d'administration a besoin pour numéroter les
-- certificats qu'il crée.

begin;

revoke execute on function public.next_reference(text, integer) from public;
revoke execute on function public.next_reference(text, integer) from anon;
grant execute on function public.next_reference(text, integer) to authenticated;

revoke execute on function public.new_public_token() from public;
revoke execute on function public.new_public_token() from anon;
grant execute on function public.new_public_token() to authenticated;

commit;
