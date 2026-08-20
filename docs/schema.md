# Schéma Supabase — projet `vizdata-certify`

Relevé le 19 août 2026 depuis le projet `cwyxvmzodipbdawojpeh` (workspace VIZDATA, plan Free),
par introspection en lecture seule de `information_schema` et des catalogues Postgres.

> Ce fichier est un relevé, pas la source de vérité. La source de vérité est la base.
> Pour le régénérer proprement et le versionner, voir « Récupérer le schéma » plus bas.

## Tables (schéma `public`)

**users** — profils, adossés à l'authentification
```
id uuid            → FK auth.users(id) ON DELETE CASCADE
first_name text, last_name text, email text
avatar_url text, linkedin_url text, username text
public_profile bool
role user_role
created_at timestamptz, updated_at timestamptz
```

**certificate_types**
```
id uuid, code text, name text, description text
default_duration int4, validity_period int4
status text
created_at timestamptz, updated_at timestamptz
```

**certificates**
```
id uuid, reference text, public_token text
user_id uuid              → FK users(id) ON DELETE RESTRICT
certificate_type_id uuid  → FK certificate_types(id)
issue_date date, expiry_date date
status certificate_status
score int4, duration int4
trainer text, signatory text
pdf_url text, qr_code_url text
revoke_reason text
created_at timestamptz, updated_at timestamptz
```

**skills** — `id uuid, name text, description text`

**certificate_skills** — table de jointure
```
certificate_id uuid → FK certificates(id) ON DELETE CASCADE
skill_id uuid       → FK skills(id) ON DELETE CASCADE
```

**verifications**
```
id uuid, certificate_id uuid → FK certificates(id) ON DELETE CASCADE
verified_at timestamptz, source verification_source
country text, user_agent text, ip_hash text
```

**shares**
```
id uuid, certificate_id uuid → FK certificates(id) ON DELETE CASCADE
platform share_platform, shared_at timestamptz
```

**audit_logs**
```
id int8
actor_id uuid → FK users(id) ON DELETE SET NULL
action text, entity_type text, entity_id uuid
metadata jsonb, created_at timestamptz
```

**settings** — `key text, value jsonb, updated_at timestamptz`

## Types énumérés

| Type | Valeurs |
| --- | --- |
| `certificate_status` | `ACTIVE`, `EXPIRED`, `REVOKED`, `CANCELLED` |
| `user_role` | `ADMIN`, `CERTIFIED` |
| `verification_source` | `qr`, `reference`, `lien` |
| `share_platform` | `linkedin`, `whatsapp`, `email`, `copy_link` |

Ces valeurs correspondent exactement à celles du prototype, à une exception près :
`verifications.source` et `shares.platform` sont désormais contraints par la base.

## Sécurité

RLS est **activé sur les neuf tables**, avec **15 politiques**.

| Table | Politiques |
| --- | --- |
| `certificates` | `certificates_admin_all` (ALL), `certificates_owner_select` (SELECT) |
| `users` | `users_admin_write` (INSERT), `users_self_select` (SELECT), `users_self_update` (UPDATE) |
| `certificate_types` | `types_read` (SELECT), `types_write` (ALL) |
| `skills` | `skills_read` (SELECT), `skills_write` (ALL) |
| `certificate_skills` | `cs_read` (SELECT), `cs_write` (ALL) |
| `verifications` | `verif_admin_read` (SELECT) |
| `shares` | `shares_admin_read` (SELECT) |
| `audit_logs` | `audit_admin_read` (SELECT) |
| `settings` | `settings_admin` (ALL) |

### Ce que voit un visiteur non connecté

Vérifié le 19 août 2026 par appels réels à l'API REST avec la clé publiable :

| Table | Lecture anonyme |
| --- | --- |
| `certificate_types`, `skills` | **autorisée** — les 5 types et les 10 compétences sortent |
| `users` | **bloquée** — la table contient 1 ligne, l'API en renvoie 0 |
| `certificates`, `certificate_skills`, `verifications`, `shares` | 0 ligne renvoyée, mais ces tables sont vides : le blocage est déduit des politiques, pas mesuré |

Ce verrouillage est **voulu** : la vérification publique ne passe pas par une lecture de
table, mais par des fonctions `security definer`. C'est la bonne conception — ouvrir
`certificates` et `users` en lecture anonyme exposerait toutes les adresses e-mail du
registre, alors qu'une fonction ne rend que la projection publique.

## Fonctions

| Fonction | Sécurité | Rôle |
| --- | --- | --- |
| `verify_certificate(p_token text, p_source verification_source = 'qr')` | definer | vérification par jeton — le cœur du produit |
| `verify_by_reference(p_reference text)` | definer | vérification par référence saisie |
| `public_profile(p_username text)` | definer | profil public d'un certifié |
| `is_admin()` | definer | utilisé par les politiques |
| `effective_status(c certificates)` | invoker | statut recalculé à la date, côté base |
| `next_reference(p_code text, p_year int)` | invoker | numérotation `VIZ-{ANNÉE}-{CODE}-{NUMÉRO}` |
| `new_public_token()` | invoker | jeton public aléatoire |
| `verification_rate_ok(p_ip_hash text, p_window interval = 1 min, p_max int = 30)` | invoker | garde-fou anti-énumération |
| `touch_updated_at()` | invoker | déclencheur `updated_at` |

Les trois fonctions publiques sont appelables sans session — vérifié le 19 août 2026 :
`verify_certificate`, `verify_by_reference` et `public_profile` répondent HTTP 200 avec la
clé publiable, et `is_admin()` renvoie `false` pour un visiteur anonyme.

`effective_status` place côté base la règle « le statut n'est pas stocké, il est calculé »
que le prototype tenait dans le navigateur. `verification_rate_ok` répond à un risque que
le prototype ignorait : l'énumération de jetons.

### Projection publique

Depuis la migration `supabase/migrations/20260819_verification_details.sql`,
`verify_certificate` et `verify_by_reference` renvoient 15 colonnes :

```
reference, holder_name, certification, issuer, issue_date, expiry_date, score,
status, revoke_reason, public_token, description, duration, trainer, signatory, skills
```

Les six dernières ont été ajoutées pour que la page publique affiche les compétences
validées et reconstitue le certificat imprimable, et pour qu'une vérification faite par
saisie de référence puisse afficher son QR code.

L'adresse e-mail du titulaire reste hors de la projection, et les tables restent fermées
à la lecture anonyme. Le score est masqué hors `ACTIVE`, le motif hors `REVOKED`.

`verify_by_reference` délègue à `verify_certificate` par un `select *` : les deux
signatures doivent donc être modifiées ensemble, sous peine de casser la seconde.

### Migrations appliquées

| Fichier | Effet |
| --- | --- |
| `20260819_verification_details.sql` | porte `verify_certificate` et `verify_by_reference` de 9 à 15 colonnes |
| `20260819_ecritures_manquantes.sql` | politique `audit_admin_insert` + fonction `record_share` |

Après la seconde, le registre compte **16 politiques** et **10 fonctions**.
`record_share(p_token, p_platform)` est `security definer` et appelable sans session :
elle résout le certificat par son jeton et insère la ligne, sans que la table `shares`
soit ouverte en écriture. Vérifié : l'appel répond 204, l'insertion directe est refusée
avec le code 42501.

### Certificat de test

`supabase/seed_certificat_test.sql` crée `VIZ-2026-EXCEL-000001`, rattaché au premier
titulaire du registre, avec trois compétences. Il a servi à prouver le cas passant de la
vérification publique, puis **a été supprimé** — avec, en cascade, les consultations et
le partage que les tests avaient enregistrés. Le script reste disponible pour rejouer la
démonstration.

### Durcissement

`20260819_durcissement.sql` retire `next_reference()` et `new_public_token()` du rôle
`PUBLIC` et les réserve à `authenticated`. Révoquer `anon` seul aurait été sans effet :
ce rôle hérite de `PUBLIC`, à qui Postgres accorde `EXECUTE` par défaut.
