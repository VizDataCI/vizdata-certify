-- ---------------------------------------------------------------------------
-- VALIDATION EN DEUX ÉTAPES (TOTP)
--
-- Un mot de passe seul protège mal un registre qui fait foi : il se devine, il
-- se réutilise d'un service à l'autre, il se lit par-dessus une épaule. Le
-- second facteur ajoute une preuve que l'attaquant distant n'a pas — le
-- téléphone du titulaire.
--
-- Ce qui est stocké, et ce qui ne l'est pas
-- -----------------------------------------
-- `totp_secret` est le secret partagé avec l'application d'authentification.
-- Il ne peut pas être haché : le serveur doit le relire pour recalculer le
-- code attendu. Il est donc CHIFFRÉ, avec une clé qui vit dans un fichier à
-- côté de la base et jamais dans la base elle-même. Une copie de la base,
-- seule, ne permet donc pas de fabriquer des codes.
--
-- Les codes de secours, eux, sont hachés comme des mots de passe : le serveur
-- n'a jamais besoin de les relire, seulement de les reconnaître. C'est aussi
-- ce qui les rend utilisables après une restauration sur une autre machine,
-- là où le secret chiffré, lui, serait perdu avec son fichier de clé.
-- ---------------------------------------------------------------------------

alter table users add column totp_secret text;
alter table users add column totp_actif integer not null default 0
     check (totp_actif in (0, 1));
alter table users add column totp_active_a text;

-- Le dernier pas de temps accepté. Un code vaut trente secondes, et la
-- tolérance d'horloge en couvre quatre-vingt-dix : sans cette mémoire, un code
-- lu par-dessus une épaule resterait rejouable pendant une minute et demie.
alter table users add column totp_dernier_pas integer not null default 0;

-- Un code de secours est à usage unique. On ne le supprime pas quand il sert :
-- la date d'utilisation raconte ce qui s'est passé le jour où le titulaire dit
-- avoir perdu son téléphone.
create table if not exists codes_secours (
  id         text primary key,
  user_id    text not null references users (id) on delete cascade,
  code_hash  text not null,
  utilise_a  text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists codes_secours_user_idx on codes_secours (user_id);

-- Le défi de connexion : entre le mot de passe accepté et le code vérifié, il
-- n'y a pas encore de session. Ce jeton tient cet entre-deux, cinq minutes au
-- plus, et porte le compte de tentatives : sans lui, un code à six chiffres se
-- devinerait par force brute depuis n'importe où.
create table if not exists defis_connexion (
  id         text primary key,
  token_hash text not null unique,
  user_id    text not null references users (id) on delete cascade,
  essais     integer not null default 0,
  expires_at text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists defis_connexion_exp_idx on defis_connexion (expires_at);
