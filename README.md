# VIZDATA CERTIFY

Plateforme de gestion, de délivrance, d'archivage, de partage et de **vérification publique**
des certificats délivrés par VIZDATA.

> **État : migration vers Supabase en cours.** Tout ce qui se lit vient de la
> base : authentification, vérification publique, espace certifié, espace
> administrateur. Les **écritures de l'administration** ne sont pas encore
> migrées et restent inopérantes une fois Supabase configuré.
> Voir « Où en est la migration » plus bas.

## Démarrer

```bash
npm install
npm run dev
```

| Script | Effet |
| --- | --- |
| `npm run dev` | serveur de développement Vite |
| `npm run build` | build de production dans `dist/` |
| `npm run preview` | sert le build de production |
| `npm run lint` | Oxlint |

### Comptes de démonstration

Tant que Supabase n'est pas configuré, l'écran de connexion propose deux accès directs
et **le mot de passe est libre** : toute valeur non vide est acceptée dès lors que
l'adresse existe au registre. Ces raccourcis disparaissent dès que l'auth est réelle.

| Rôle | Adresse |
| --- | --- |
| Administrateur | `admin@vizdata.ci` |
| Certifié | `fabrice.boh@vizdata.ci` |

Référence de certificat valide pour tester la vérification : `VIZ-2026-EXCEL-000125`.

## Principes de conception

Deux règles structurent tout le reste :

1. **Le statut n'est pas stocké, il est calculé.** `effectiveStatus()` recalcule
   l'expiration à la date du jour : un certificat échu bascule seul en « Expiré »,
   sans intervention ni tâche planifiée.
2. **On partage la page de vérification, jamais le fichier.** Le lien diffusé pointe
   vers `/verify/{token}`. Un certificat révoqué ne peut donc jamais apparaître comme
   valide, même si son PDF continue de circuler.

Les références suivent le format `VIZ-{ANNÉE}-{CODE}-{NUMÉRO}`, par exemple
`VIZ-2026-EXCEL-000125`. Chaque certificat porte en plus un `public_token` opaque,
qui est ce qui figure dans l'URL de vérification et dans le QR code.

## Les trois espaces

**Public — sans compte.** Accueil et recherche par référence, page de vérification
(verdict, titulaire, dates, score, compétences validées, motif de révocation le cas
échéant), consultation et impression du certificat, profils publics `/u/{username}`
pour les titulaires qui l'activent.

**Espace certifié.** Mes certificats, téléchargement PDF, partage (LinkedIn, WhatsApp,
e-mail, copie de lien), profil et visibilité publique.

**Espace administrateur.** Tableau de bord, gestion des certificats avec filtres,
révocation motivée, annuaire des certifiés, journal des vérifications, **import CSV
en masse** avec analyse préalable ligne à ligne, statistiques, et paramétrage des
types de certification.

### Import CSV

Séparateur `;`, `,` ou tabulation, détecté automatiquement.
Colonnes requises : `NOM`, `PRENOM`, `EMAIL`, `CERTIFICATION`, `DATE_EMISSION`.
Facultatives : `DATE_EXPIRATION`, `SCORE`.

`CERTIFICATION` doit reprendre le **code** d'un type existant (`EXCEL`, `PBI`, `DATA`,
`EXPERT`, `VIZ`, ou tout code ajouté depuis les paramètres). Chaque ligne est validée
avant écriture : adresse mal formée, code inconnu, date invalide, doublon dans le
fichier, ou certificat déjà présent au registre. Seules les lignes saines sont
importées ; les titulaires inconnus sont créés au passage.

## Architecture

Aucune dépendance hors React : le QR code, les styles et le routage sont écrits à la main.

```
src/
  main.jsx                  point d'entrée, charge styles.css
  App.jsx                   état applicatif, routage, persistance
  styles.css                feuille de style unique
  lib/
    qr.js                   encodeur QR — Galois Field, Reed-Solomon, versions 1 à 6, 8 masques
    dates.js                TODAY, formats français
    certificates.js         effectiveStatus, STATUS_META, nextReference, slugify
    series.js               agrégation mensuelle des histogrammes
  data/
    seed.js                 jeu de démonstration (types, titulaires, certificats)
    store.js                lecture / écriture / réinitialisation du localStorage
  ui/
    QRCode.jsx              rendu SVG
    VizdataLogo.jsx         logo VIZDATA en SVG
    primitives.jsx          Mark, Badge, Field, Stat, Modal, BarChart
    AppShell.jsx            coquille des espaces authentifiés
  modals/
    CertificateModal.jsx    certificat imprimable
    ShareModal.jsx          partage LinkedIn / WhatsApp / e-mail / lien
  screens/
    public/                 PublicShell, Home, About, VerifySearch,
                            VerifyResult, PublicProfile, Login
    certified/              CertifiedSpace
    admin/                  AdminSpace, Dashboard, Certificates, CertificateDetail,
                            CertificateForm, RevokeModal, Certified, Verifications,
                            Import, Stats, Settings
```

Le routage est fait maison : un `switch` sur `route.view` dans `App.jsx`, sans routeur ni
URL réelle. L'état global (`db`) et les fonctions d'accès sont passés en cascade par les
props sous le nom `shared` — c'est la première chose qu'un vrai backend viendra remplacer.

L'adresse `certify.vizdata.ci` affichée dans l'interface et dans les QR codes est la
cible de production, elle ne correspond à rien en local.

### Modèle de données

`users` · `types` · `certificates` · `verifications` · `shares` · `audit_logs`.
L'ensemble forme un objet unique conservé sous la clé `vizdata_certify_v1` du
`localStorage`, réécrit 400 ms après chaque modification. Au premier chargement — ou
si le stockage est indisponible — le jeu de démonstration de `buildSeed()` prend le
relais. **Paramètres → Registre → Réinitialiser le registre** revient à cet état initial.

Le PDF n'est pas généré : « Enregistrer en PDF » ouvre la boîte d'impression du
navigateur sur une zone mise en forme par `@media print`.

## Authentification

L'application tourne sous deux régimes, selon que les clés Supabase sont présentes.

| | Démonstration | Configuré |
| --- | --- | --- |
| Clés `VITE_SUPABASE_*` | absentes | présentes |
| Mot de passe | non vérifié | vérifié par Supabase |
| Session | perdue au rechargement | persistée et rafraîchie |
| Mot de passe oublié | message factice | lien envoyé par courriel |
| SDK Supabase dans le bundle | éliminé (≈200 ko économisés) | embarqué |

Le profil affiché — prénom, nom, **rôle** — est lu dans la table `users`, dont la clé
primaire référence `auth.users(id)`. Le rôle administrateur découle donc de l'identité
authentifiée et non plus du registre du navigateur : c'est lui que la fonction
`is_admin()` interroge pour appliquer les politiques. Un compte authentifié sans ligne
dans `users` est refusé et immédiatement déconnecté, pour ne pas laisser de session
orpheline.

En mode démonstration, le profil reste cherché dans le registre local par correspondance
d'adresse e-mail.

### Mise en service

1. Créez un projet sur [supabase.com](https://supabase.com) — c'est à vous de le faire,
   la création de compte ne peut pas être déléguée.
2. Dans **Project Settings → API**, relevez l'URL du projet et la clé `anon` **publique**.
   La clé `service_role` ne doit jamais entrer dans ce dépôt : elle contourne toutes les
   règles d'accès et le front est public par nature.
3. Copiez `.env.example` en `.env.local` et renseignez les deux valeurs.
4. Créez les comptes dans **Authentication → Users**, avec exactement les mêmes adresses
   que celles du registre — c'est l'adresse qui fait la jointure.
5. Relancez `npm run dev` : Vite ne relit pas les variables d'environnement à chaud.

Il n'y a volontairement pas d'inscription libre : un registre de certifications
n'a pas à laisser n'importe qui se créer un compte. Les titulaires sont invités
depuis la console Supabase.

## Où en est la migration

Le projet Supabase `cwyxvmzodipbdawojpeh` porte le schéma complet : 9 tables, RLS active
sur toutes, 15 politiques, et 9 fonctions dont trois `security definer` qui servent le
chemin public. Le détail est relevé dans [docs/schema.md](docs/schema.md).

| Écran | Source des données | Écriture |
| --- | --- | --- |
| Connexion | **Supabase** — mot de passe vérifié, profil et rôle lus dans `users` | — |
| Accueil, vérification par référence | **Supabase** — `verify_by_reference` | consultation enregistrée |
| Vérification par jeton (QR, lien) | **Supabase** — `verify_certificate` | consultation enregistrée |
| Profil public | **Supabase** — `public_profile` | — |
| Espace certifié | **Supabase** — table `certificates`, RLS `certificates_owner_select` | profil modifiable |
| Espace administrateur | **Supabase** | création, modification, révocation, types, import |

L'application est donc hybride le temps de la migration. Les deux chemins rendent la même
forme d'objet : les écrans publics ne savent pas d'où viennent les données.

### Écritures

Après chaque écriture, le registre est **redemandé à la base** plutôt que rejoué côté
client : la base seule fait autorité, et elle a pu appliquer une règle ou refuser.
Aucune autorisation n'est vérifiée dans le navigateur — les politiques `is_admin()`
s'en chargent, et une erreur `42501` remonte telle quelle si elles refusent.

La référence et le jeton public sont produits par `next_reference()` et
`new_public_token()` côté base, pour que la numérotation reste cohérente si deux
administrateurs créent un certificat en même temps.

### La limite qui subsiste

`public.users.id` référence `auth.users(id)` : **créer un titulaire suppose de créer
d'abord un compte d'authentification**, ce que la clé publiable ne permet pas — et ne
doit pas permettre. En mode Supabase :

- le formulaire refuse une adresse inconnue et explique qu'il faut ouvrir le compte
  depuis la console ;
- l'import CSV marque les lignes concernées « Titulaire inconnu du registre » et ne
  les crée pas.

Lever cette limite demande une Edge Function détenant la clé secrète, qui créerait le
compte d'authentification et le profil en une seule opération.

### Durcissement

`next_reference()` et `new_public_token()` étaient exécutables **sans session** : la
première laissait deviner le nombre de certificats émis pour un code et une année donnés.
`supabase/migrations/20260819_durcissement.sql` les a fermées.

Le piège, à retenir pour toute fonction : **`revoke ... from anon` seul ne sert à rien.**
Le rôle `anon` hérite de `PUBLIC`, à qui Postgres accorde `EXECUTE` par défaut sur toute
fonction créée. Il faut révoquer `PUBLIC`, puis ré-accorder à `authenticated` — dont
l'administration a besoin pour numéroter les certificats qu'elle crée.

Vérifié : les deux fonctions répondent désormais `42501 permission denied` sans session,
tandis que `verify_certificate`, `verify_by_reference`, `public_profile` et `record_share`
continuent de répondre normalement.

### Une seule forme d'objet, deux sources

Les fonctions publiques et le registre local rendent le même objet :

```
reference, holder_name, certification, issuer, issue_date, expiry_date, score,
status, revoke_reason, public_token, description, duration, trainer, signatory, skills
```

Les écrans publics ignorent donc d'où viennent les données, et la page de vérification
affiche la même chose dans les deux modes : compétences validées, certificat imprimable,
QR code et partage.

Cette égalité a demandé d'étendre les fonctions de vérification — voir
`supabase/migrations/20260819_verification_details.sql`. Elles ne renvoyaient au départ
que neuf colonnes, sans les compétences, sans `duration`, `trainer` ni `signatory`, et
sans `public_token`, ce qui privait de QR code toute vérification faite par saisie de
référence.

Une seule différence subsiste, et elle est voulue : le **comptage des partages** n'existe
qu'en mode démonstration. La table `shares` n'accepte aucune écriture anonyme, et il
n'était pas souhaitable de la lui ouvrir pour un compteur.

### Le statut, désormais calculé par la base

`effective_status(c certificates)` reprend côté Postgres la règle que le prototype tenait
dans le navigateur : un certificat échu bascule seul en « Expiré ». L'interface n'a plus
à recalculer quoi que ce soit sur le chemin public — elle affiche le statut que la source
lui donne.

## Limites connues

- **Authentification factice tant que Supabase n'est pas configuré.** Voir plus haut :
  sans clés, aucun mot de passe n'est vérifié. À ne pas exposer publiquement ainsi.
- **Le rôle vient du registre local, pas du jeton.** Un administrateur est reconnu
  parce que le registre du navigateur le dit. Cela ne protège rien tant que les données
  ne sont pas passées côté serveur avec des règles d'accès.
- **Les titulaires créés depuis l'administration n'ont pas de compte Supabase.**
  Ils figurent au registre et leurs certificats sont vérifiables, mais ils ne peuvent
  pas se connecter tant qu'ils n'ont pas été invités depuis la console.
- **Aucun backend.** Les données ne quittent pas le navigateur : rien n'est partagé
  entre deux postes, et un lien de vérification n'est pas résoluble par un tiers.
- **Volumétrie des vérifications et partages simulée** au premier lancement (`Math.random()`).
- `src/assets/` contient encore `react.svg` et `vite.svg`, hérités du gabarit Vite,
  ainsi que `hero.png`, actuellement référencé nulle part.
