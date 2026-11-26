# Schéma de la base, VIZDATA CERTIFY

La base est un fichier SQLite. Son schéma est `server/schema/001_socle.sql`, appliqué
automatiquement à l'ouverture : par `server/db.mjs` dans l'implémentation Node, par
`api/lib/Base.php` dans celle en PHP. **Un seul fichier de schéma pour les deux** : du
SQLite standard, sans rien de propre à un langage. Deux copies d'un schéma finissent
toujours par diverger, et c'est la base qui fait autorité, pas le code au-dessus.

> **La source de vérité est le dépôt**, pas la base.
>
> Ce fut l'inverse pendant un an : le schéma vivait dans la console SQL d'un projet
> hébergé, et ce document n'en était qu'un relevé. Le jour où le projet a cessé
> d'exister, le schéma a disparu avec lui. C'est la raison d'être de tout ce qui suit.

## Pourquoi SQLite

| | Ce que c'était | Ce que c'est |
| --- | --- | --- |
| Hébergement | projet chez un tiers | un fichier sur le serveur VIZDATA |
| Disparition possible | oui : c'est arrivé | non, sauf à effacer le fichier |
| Sauvegarde | formule payante | `npm run sauvegarde`, à chaud |
| Démon à tenir |, | aucun |
| Limite de connexions | oui | aucune |
| Autorisation | RLS, dans la base | l'API, et elle est testée |

Pour la charge d'un organisme de formation : quelques centaines de certificats par an,
des vérifications en lecture, SQLite est très largement dimensionné. Le mode WAL permet
aux lectures et aux écritures de ne pas s'attendre.

**Ce que le passage fait perdre :** l'autorisation ne vit plus dans la base. Postgres la
tenait par RLS, `security definer` et `has_perm()` ; elle remonte dans
`server/autorisations.mjs` et `api/lib/Autorisations.php`. C'est un recul en défense en
profondeur, assumé, et un
progrès en vérifiabilité : les politiques RLS n'ont jamais pu être éprouvées faute de
projet vivant, alors que ce module est couvert par 31 tests, plus 35 tests d'intégration
qui vérifient qu'il est bien câblé sur chaque route.

**Ce que la base garde**, et qu'aucune application ne peut contourner : les clés
étrangères, les contraintes d'unicité et les CHECK. Un statut hors liste, une référence
en double, un certificat sans titulaire, une révocation sans motif : refusés par le
moteur, quoi que fasse le code au-dessus.

## Conventions de typage

SQLite n'a ni uuid, ni booléen, ni date, ni énuméré, ni jsonb. On s'en passe sans rien
perdre d'essentiel :

| Besoin | Représentation |
| --- | --- |
| identifiant | `TEXT` portant un uuid v4 (`crypto.randomUUID`) |
| booléen | `INTEGER` 0 / 1, borné par un CHECK |
| horodatage | `TEXT` ISO-8601 UTC : se trie dans l'ordre chronologique |
| date | `TEXT` `'AAAA-MM-JJ'`, validée par `date(x) is not null` |
| énuméré | `TEXT` + `CHECK ... IN (...)` |
| json | `TEXT` + `CHECK json_valid(x)` |

## Les pragmas, qui ne sont pas des réglages d'optimisation

Posés à **chaque** ouverture, par `server/db.mjs` comme par `api/lib/Base.php` : ils ne
sont pas stockés dans le
fichier :

| Pragma | Ce qu'il change |
| --- | --- |
| `foreign_keys = ON` | **SQLite ignore les clés étrangères par défaut.** Sans lui, chaque `references` de ce schéma est un commentaire. |
| `journal_mode = WAL` | les lectures ne bloquent plus les écritures |
| `busy_timeout = 5000` | on patiente au lieu d'échouer sur « database is locked » |
| `synchronous = NORMAL` | compromis recommandé avec WAL |

Le premier est vérifié après coup, pas supposé : une base ouverte sans intégrité
référentielle refuse de démarrer.

## Tables

### Comptes

**users** : une seule table là où il y en avait deux (`auth.users` pour l'identité,
`public.users` pour le profil). La séparation imposait une fonction privilégiée pour
créer le moindre titulaire ; ici, le mot de passe est une colonne.

```
id                   text (uuid)
email                text unique, collate nocase
password_hash        text          scrypt$N$r$p$sel$empreinte : null tant qu'il n'est pas choisi
first_name, last_name, phone, avatar_url, linkedin_url
username             text unique, collate nocase
public_profile       0 / 1
role                 ADMIN | MANAGER | CERTIFIED
account_status       ACTIVE | DISABLED
must_change_password 0 / 1
permissions          json : creer_titulaires, attribuer_certificats,
                            revoquer_certificats, exporter_donnees
invited_at, activated_at, last_login_at, created_by, created_at, updated_at
```

`password_hash` est nul tant que la personne n'a pas choisi son mot de passe : un compte
invité existe avant d'en avoir un, et ne peut pas se connecter.

**sessions**, `token_hash`, `user_id`, `expires_at`, `user_agent`, `last_seen`.
**jetons** : liens à usage unique : `token_hash`, `kind` (INVITATION | REINITIALISATION),
`expires_at`, `used_at`.

Dans les deux cas, **seule l'empreinte du secret est stockée**. Le fichier de base est
copié pour les sauvegardes : s'il contenait des jetons utilisables, toute sauvegarde
égarée donnerait accès aux comptes.

### Catalogue

**certification_domains**, `code`, `name`, `description`, `status`, `sort_order`.

**certificate_types** : les **programmes**. `domain_id`, `template_id`, `code` (unique,
entre dans la référence), `name` (l'intitulé exact imprimé), `description`,
`default_duration`, `sort_order`, `status`.

La table garde le nom qu'elle portait sous Postgres : c'est la même chose, et la
continuité facilite la lecture des deux schémas côte à côte.

**certificate_templates**, `code`, `name`, `orientation`, `layout` (json libre : la mise
en page vit dans l'application, la base n'a pas à connaître des millimètres).

**skills**, `name` unique.

### Certificats

```
id, reference (unique), public_token (unique)
user_id              → users(id)              ON DELETE RESTRICT
certificate_type_id  → certificate_types(id)  ON DELETE RESTRICT
issued_by            → users(id)              ON DELETE SET NULL
template_id          → certificate_templates(id)
issue_date, status, duration, trainer, signatory, revoke_reason
expiry_date, score   conservés pour une reprise de données : plus renseignés, plus exposés
```

Deux contraintes valent d'être connues :

- `user_id` est en **RESTRICT** : on ne supprime pas un titulaire qui porte des
  certificats délivrés, sinon le registre perdrait la trace de ce qu'il a certifié.
  C'est pourquoi l'application désactive un compte et ne le supprime jamais.
- `certificats_revocation_motivee` : `status = 'REVOKED'` exige un motif non vide. Il
  s'affiche sur la page publique ; une révocation muette laisserait le titulaire et son
  employeur sans explication.

Aucune unicité sur `(user_id, certificate_type_id)` : un titulaire peut repasser un
programme. Ce qui est unique, c'est la référence.

**certificate_skills** : jointure, cascade des deux côtés.

### Mesure et traces

**verifications** · **shares** · **audit_logs** · **notifications** · **settings**

`audit_logs` garde l'identifiant de l'auteur **et son nom au moment de l'acte**. Sous
Postgres, seul l'identifiant était conservé : un compte supprimé laissait des lignes sans
auteur lisible, et un journal qui perd le nom de qui a agi perd sa valeur de preuve.

`notifications.status` vaut `SENT`, `PENDING` ou `FAILED`. Un envoi d'e-mail échoue en
silence : quota, domaine non vérifié, fournisseur absent ; sans cette trace, VIZDATA
croirait avoir prévenu quelqu'un qui n'a jamais rien reçu.

### Académie

**cohortes** et **candidatures**, dans la même base : une seconde base serait une
seconde chose à sauvegarder, et à perdre.

`candidatures_engagements` exige `disponible = 1 and consent_contact = 1` : un appel
direct à l'API ne doit pas pouvoir enregistrer une candidature sans consentement au
contact.

## La vue publique

`v_certificats_publics` est la projection unique du chemin public. Elle ne contient ni
adresse e-mail, ni téléphone, ni identifiant de compte, ni score, ni date d'expiration.

Ce n'est pas une barrière (SQLite n'en offre pas) mais une **définition** : si une
colonne privée devait apparaître sur la page de vérification, il faudrait l'ajouter ici,
ce qui se voit en relecture et casse un test.

Le statut **effectif** n'y est pas calculé : il l'est en JavaScript, par
`effectiveStatus()`. Sous Postgres la règle était dédoublée : une fois en SQL, une fois
dans le navigateur, et les deux pouvaient diverger.

## Déclencheurs

Sept déclencheurs `after update` tiennent `updated_at`. SQLite n'a pas de `before
update` : la garde `when new.updated_at = old.updated_at` évite la récursion : sans
elle, la mise à jour déclenchée relancerait le déclencheur indéfiniment.

## Migrations

`server/schema/*.sql`, appliqués dans l'ordre des noms et enregistrés dans la table
`migrations`. Chaque fichier est joué dans une transaction : s'il échoue à mi-parcours,
la base reste dans l'état d'avant et n'est pas marquée comme migrée. **Une migration à
moitié appliquée est la pire des situations** : elle ne se rejoue pas, et elle ne
fonctionne pas.

Pour en ajouter une : créez `server/schema/002_quelque-chose.sql`. Elle sera appliquée au
prochain démarrage : et, en production, au premier appel suivant le téléversement du
paquet, qui recopie `server/schema/` dans `api/schema/`.

## L'ancienne base

`supabase/` est conservé tel quel : les six migrations Postgres, les deux fonctions Edge,
et le socle reconstruit en novembre 2026. C'est l'histoire de la base précédente, pas une
documentation de celle-ci. Rien dans le code ne les lit plus.

Si des certificats avaient été délivrés dans ce projet et qu'une sauvegarde en
réapparaissait, la reprise se ferait par un script d'import vers les tables décrites
ici : les deux schémas se correspondent table pour table, aux conventions de typage près.
