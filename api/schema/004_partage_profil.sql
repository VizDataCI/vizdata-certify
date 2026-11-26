-- ---------------------------------------------------------------------------
-- L'AJOUT AU PROFIL LINKEDIN, COMPTÉ À PART
--
-- Partager publie un message dans un fil : il descend et disparaît. Ajouter la
-- certification au profil l'inscrit durablement, avec sa référence et son lien
-- de vérification. Ce ne sont pas les mêmes gestes, et l'un vaut bien plus que
-- l'autre pour VIZDATA : il faut pouvoir les compter séparément.
--
-- La colonne `platform` portait une contrainte fermée sur quatre valeurs. En
-- SQLite, une contrainte CHECK ne se modifie pas : la table se reconstruit.
-- D'où ce détour, qui est la manière documentée de faire.
--
-- Rien n'est perdu : les partages déjà enregistrés sont recopiés tels quels.
-- ---------------------------------------------------------------------------

create table shares_nouveau (
  id             text primary key,
  certificate_id text not null references certificates (id) on delete cascade,
  platform       text not null
                 check (platform in ('linkedin', 'linkedin_profil', 'whatsapp', 'email', 'copy_link')),
  shared_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

insert into shares_nouveau (id, certificate_id, platform, shared_at)
  select id, certificate_id, platform, shared_at from shares;

drop table shares;

alter table shares_nouveau rename to shares;
