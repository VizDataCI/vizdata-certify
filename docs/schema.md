# Schéma Supabase — VIZDATA CERTIFY

> **La source de vérité est désormais le dépôt**, pas la base.
>
> Ce fichier décrit ce que produisent les migrations de `supabase/migrations/`, rejouées
> dans l'ordre des noms de fichiers. Jusqu'en novembre 2026, c'était l'inverse : le
> schéma avait été écrit à la main dans la console SQL et ce document n'en était qu'un
> relevé. Le jour où le projet Supabase a disparu, le schéma a disparu avec lui — et le
> dépôt ne permettait plus de le reconstruire. `20260818_socle.sql` solde cette dette.

## Les migrations, dans l'ordre

| Fichier | Effet |
| --- | --- |
| `20260818_socle.sql` | neuf tables, quatre énumérés, fonctions du chemin public, RLS |
| `20260819_verification_details.sql` | projection étendue des fonctions de vérification |
| `20260819_ecritures_manquantes.sql` | politique d'écriture du journal, `record_share` |
| `20260819_durcissement.sql` | retire `next_reference` et `new_public_token` au rôle PUBLIC |
| `20261106_academie.sql` | cohortes et candidatures de l'académie |
| `20261114_refonte.sql` | domaines, programmes, rôles, modèles, notifications |

Toutes sont **rejouables** : chaque objet est créé « si absent », chaque politique est
supprimée avant d'être recréée, chaque fonction passe par `create or replace`. Elles
s'appliquent donc à un projet vierge comme à un projet qui porte déjà une partie du
schéma, sans rien détruire.

`PROPOSITION_tracabilite_verifications.sql` n'est **pas** une migration : c'est une
proposition, délibérément non appliquée, dont les raisons sont écrites dans le fichier.

## Tables

### Comptes et autorisations

**users** — profils, adossés à l'authentification
```
id uuid                → FK auth.users(id) ON DELETE CASCADE
first_name, last_name, email, phone
avatar_url, linkedin_url, username (unique)
public_profile bool
role user_role                      ADMIN | MANAGER | CERTIFIED
account_status text                 ACTIVE | DISABLED
must_change_password bool           vrai tant que le titulaire n'a pas choisi son mot de passe
permissions jsonb                   autorisations nommées d'un gestionnaire
invited_at, activated_at timestamptz
created_by uuid                     → FK users(id) ON DELETE SET NULL
created_at, updated_at timestamptz
```

L'identifiant est celui du compte d'authentification : **un titulaire ne peut pas
exister sans compte**, et la suppression du compte emporte le profil. C'est ce qui
impose de passer par une fonction Edge pour créer un titulaire — la clé publiable ne
crée pas de compte, et ne doit pas le pouvoir.

`permissions` porte quatre clés booléennes : `creer_titulaires`,
`attribuer_certificats`, `revoquer_certificats`, `exporter_donnees`. Un `ADMIN` les a
toutes, implicitement — elles ne sont lues que pour un `MANAGER`.

### Catalogue

**certification_domains** — premier niveau
```
id uuid, code text (unique), name text, description text
status text, sort_order int
created_at, updated_at timestamptz
```

**certificate_types** — les **programmes**, second niveau
```
id uuid, code text (unique), name text         name = intitulé exact imprimé
description text
domain_id uuid        → FK certification_domains(id)
template_id uuid      → FK certificate_templates(id)
default_duration int, sort_order int, status text
validity_period int                             conservé, plus appliqué
created_at, updated_at timestamptz
```

La table n'a pas été remplacée par une table « programmes » neuve : elle portait déjà
code, intitulé, description, durée et statut, et les certificats délivrés gardent ainsi
leur clé étrangère — donc restent vérifiables. Le domaine n'est qu'une colonne de plus.

**certificate_templates**
```
id uuid, code text (unique), name text, description text
orientation text (landscape), layout jsonb, status text
created_at, updated_at timestamptz
```

`layout` reste un jsonb libre : la mise en page vit dans l'application, et la base n'a
pas à connaître des millimètres. Ce qu'elle doit savoir, c'est quel modèle a servi à
quel certificat.

### Certificats

**certificates**
```
id uuid, reference text (unique), public_token text (unique)
user_id uuid              → FK users(id) ON DELETE RESTRICT
certificate_type_id uuid  → FK certificate_types(id)
issued_by uuid            → FK users(id) ON DELETE SET NULL
template_id uuid          → FK certificate_templates(id)
issue_date date
status certificate_status
duration int, trainer text, signatory text
revoke_reason text
pdf_url, qr_code_url text
expiry_date date          conservée pour les certificats anciens — plus renseignée
score int                 conservé pour les certificats anciens — plus affiché
created_at, updated_at timestamptz
```

`user_id` est en **RESTRICT** : on ne supprime pas un titulaire qui porte des
certificats délivrés, sinon le registre perdrait la trace de ce qu'il a certifié. C'est
pourquoi l'application désactive un compte et ne le supprime jamais.

Aucune contrainte d'unicité sur `(user_id, certificate_type_id)` : un titulaire peut
repasser un programme. Ce qui est unique, c'est la référence.

**skills** — `id uuid, name text (unique), description text`

**certificate_skills** — jointure `(certificate_id, skill_id)`, cascade des deux côtés

### Mesure et traces

**verifications** — `certificate_id, verified_at, source, country, user_agent, ip_hash`
**shares** — `certificate_id, platform, shared_at`
**audit_logs** — `actor_id, action, entity_type, entity_id, metadata jsonb, created_at`
**notifications** — `user_id, recipient, kind, channel, subject, payload, status, error, sent_at`
**settings** — `key text, value jsonb, updated_at`

`notifications.status` vaut `SENT`, `PENDING` ou `FAILED`. Un envoi d'e-mail échoue
silencieusement — quota, domaine non vérifié, fournisseur absent ; sans cette trace,
VIZDATA croirait avoir prévenu quelqu'un qui n'a jamais rien reçu.

## Types énumérés

| Type | Valeurs |
| --- | --- |
| `certificate_status` | `ACTIVE`, `EXPIRED`, `REVOKED`, `CANCELLED` |
| `user_role` | `ADMIN`, `MANAGER`, `CERTIFIED` |
| `verification_source` | `qr`, `reference`, `lien` |
| `share_platform` | `linkedin`, `whatsapp`, `email`, `copy_link` |

`MANAGER` est ajouté **hors transaction** par `20261114_refonte.sql` : Postgres refuse
d'utiliser une valeur d'énuméré ajoutée dans la transaction qui l'ajoute. Partout
ailleurs, le rôle est comparé en texte (`role::text in ('ADMIN','MANAGER')`) pour que
plus aucune expression ne dépende du moment où la valeur a été créée.

## Fonctions

| Fonction | Sécurité | Rôle |
| --- | --- | --- |
| `verify_certificate(p_token, p_source)` | definer | vérification par jeton — le cœur du produit |
| `verify_by_reference(p_reference)` | definer | vérification par référence saisie |
| `public_profile(p_username)` | definer | profil public d'un certifié |
| `record_share(p_token, p_platform)` | definer | comptage d'un partage sans ouvrir la table |
| `is_admin()` | definer | administrateur |
| `is_staff()` | definer | administrateur **ou** gestionnaire actif |
| `has_perm(p_perm)` | definer | une autorisation nommée |
| `guard_user_privileges()` | definer | déclencheur : interdit l'élévation de privilèges |
| `effective_status(c certificates)` | invoker | statut recalculé à la date |
| `next_reference(p_code, p_year)` | invoker | numérotation `VIZ-{ANNÉE}-{CODE}-{NUMÉRO}` |
| `new_public_token()` | invoker | jeton public aléatoire |
| `verification_rate_ok(…)` | invoker | garde-fou anti-énumération — **inerte** |
| `touch_updated_at()` | invoker | déclencheur `updated_at` |

`is_admin()`, `is_staff()` et `has_perm()` sont `security definer` par nécessité : elles
lisent `public.users`, et sous les politiques de cette même table la récursion serait
immédiate.

### Projection publique

`verify_certificate` et `verify_by_reference` renvoient quatorze colonnes :

```
reference, holder_name, certification, domain, issuer, issue_date, status,
revoke_reason, public_token, description, duration, trainer, signatory, skills
```

Ni adresse e-mail, ni téléphone, ni identifiant de compte. Ni **date d'expiration**, ni
**score** : ces deux mentions ont quitté le produit en novembre 2026, et les fonctions
ne les renvoient plus — la page publique ne pourrait donc pas les afficher, quand bien
même elle le voudrait. Le motif de révocation n'est rendu que pour un certificat
révoqué.

`verify_by_reference` délègue à `verify_certificate` par un `select *` : **les deux
signatures doivent changer ensemble.**

### Le déclencheur qui tient les rôles

`guard_user_privileges` s'exécute avant toute mise à jour de `users`. Si l'auteur n'est
pas administrateur, il refuse — code `42501` — toute modification du rôle, des
autorisations, du statut du compte ou de l'adresse e-mail.

Ce n'est pas une redondance de l'interface. La politique `users_self_update` autorise un
gestionnaire à écrire la ligne d'un titulaire ; sans ce déclencheur, il lui suffirait
d'un appel REST sur sa **propre** ligne pour se promouvoir administrateur. L'écran ne
protège rien ; la base, oui.

## Sécurité au niveau des lignes

RLS est active sur les **douze tables**. Ce que voit un visiteur sans session :

| Table | Lecture anonyme |
| --- | --- |
| `certificate_types`, `certification_domains`, `skills` | **autorisée** — rien de personnel, et la page publique affiche le domaine |
| toutes les autres | **fermée** |

Ce verrouillage est voulu : la vérification publique ne passe pas par une lecture de
table mais par des fonctions `security definer`. Ouvrir `certificates` et `users` en
lecture anonyme exposerait toutes les adresses e-mail du registre, là où une fonction ne
rend que la projection publique.

### Les politiques, par table

| Table | Politiques |
| --- | --- |
| `users` | `users_self_select` (soi ou `is_staff`), `users_self_update`, `users_admin_write` (`has_perm('creer_titulaires')`) |
| `certificates` | `certificates_owner_select` (soi ou `is_staff`), `certificates_staff_insert` (`attribuer`), `certificates_staff_update` (`attribuer` ou `revoquer`), `certificates_admin_delete` (`is_admin`) |
| `certificate_types` | `types_read` (public), `types_write` (`is_admin`) |
| `certification_domains` | `domains_read` (public), `domains_write` (`is_admin`) |
| `certificate_templates` | `templates_read` (`is_staff`), `templates_write` (`is_admin`) |
| `skills` | `skills_read` (public), `skills_write` (`is_admin`) |
| `certificate_skills` | `cs_read` (suit le droit de voir le certificat), `cs_write` (`attribuer`) |
| `verifications`, `shares` | lecture `is_staff` ; écriture par fonction `security definer` uniquement |
| `audit_logs` | lecture `is_staff` ; insertion `is_staff` **et** `actor_id = auth.uid()` |
| `notifications` | lecture `is_staff` ou son propre destinataire |
| `settings` | `is_admin` |

L'écriture du journal exige que l'auteur déclaré soit le compte connecté : sans cette
condition, une action pourrait être inscrite au nom d'un autre, et le journal perdrait
sa valeur de preuve.

`certificates` est passée d'une politique `ALL` unique à quatre politiques distinctes.
Une seule n'aurait pas permis de distinguer « attribuer » de « révoquer », alors que ce
sont deux autorisations différentes.

### Le piège des révocations

**`revoke ... from anon` seul ne sert à rien.** Le rôle `anon` hérite de `PUBLIC`, à qui
Postgres accorde `EXECUTE` par défaut sur toute fonction créée. Il faut révoquer
`PUBLIC`, puis ré-accorder explicitement à `authenticated`. C'est ce que fait
`20260819_durcissement.sql` pour `next_reference()` et `new_public_token()` — la
première laissait deviner le nombre de certificats émis pour un code et une année
donnés.

## Ce que le dépôt ne reconstruit pas

Les migrations couvrent la **structure**. Elles ne contiennent aucune donnée délivrée :
les certificats, leurs références et leurs jetons publics ne se reconstituent pas. Un
registre de certifications est une pièce probante — prévoyez une sauvegarde régulière
hors de l'hébergeur, et activez la restauration à un instant donné sur le projet.
