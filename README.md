# VIZDATA CERTIFY

Plateforme de gestion, de délivrance, d'archivage, de partage et de **vérification publique**
des certificats délivrés par VIZDATA.

> **État : application branchée sur Supabase.** Authentification, vérification
> publique, espace certifié et espace administrateur — lectures comme écritures —
> passent par la base. Sans clés, l'application retombe sur un mode démonstration
> autonome. Une limite subsiste : la création d'un titulaire passe par la console
> Supabase, voir « La limite qui subsiste ».

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
| `npm run verifier` | vérifie le contrat avec la base Supabase (voir plus bas) |

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
   vers `/verifier/{jeton}`. Un certificat révoqué ne peut donc jamais apparaître comme
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
importées. En mode démonstration, un titulaire inconnu est créé au passage ; sur la base, il doit exister au préalable et la ligne est refusée sinon.

## Architecture

Aucune dépendance hors React : le QR code, les styles et le routage sont écrits à la main.

```
src/
  main.jsx                  point d'entrée, charge styles.css
  App.jsx                   état applicatif, routage, persistance
  styles.css                feuille de style unique
  lib/
    qr.js                   encodeur QR — Galois Field, Reed-Solomon, versions 1 à 6, 8 masques
    router.js               correspondance URL ↔ écran, historique du navigateur
    supabase.js             client, lecture des clés d'environnement
    auth.js                 connexion, session, réinitialisation du mot de passe
    dates.js                TODAY, formats français
    certificates.js         effectiveStatus, STATUS_META, nextReference, slugify
    series.js               agrégation mensuelle des histogrammes
  data/
    api.js                  tous les échanges avec Supabase
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
                            VerifyResult, PublicProfile, Login, NotFound
    certified/              CertifiedSpace
    admin/                  AdminSpace, Dashboard, Certificates, CertificateDetail,
                            CertificateForm, RevokeModal, Certified, Verifications,
                            Import, Stats, Settings
```

Le routage est fait maison, sans dépendance : `lib/router.js` traduit l'URL en écran et
inversement, `App.jsx` empile les changements dans l'historique du navigateur. L'état
global et les fonctions d'accès descendent en cascade par les props sous le nom `shared`.

L'adresse `certify.vizdata.ci` inscrite dans les QR codes est la cible de production ;
en local, seul le chemin compte.

### Modèle de données

Le modèle de référence est celui de la base Supabase, relevé dans
[docs/schema.md](docs/schema.md) : neuf tables, quatre types énumérés, RLS partout.

Le registre local n'est plus qu'un mode de repli, utilisé quand les clés sont absentes.
Il regroupe `users` · `types` · `certificates` · `verifications` · `shares` ·
`audit_logs` en un objet unique, conservé sous la clé `vizdata_certify_v1` du
`localStorage` et réécrit 400 ms après chaque modification. Au premier chargement — ou
si le stockage est indisponible — le jeu de `buildSeed()` prend le relais.
**Paramètres → Registre → Réinitialiser le registre** revient à cet état initial.

Les deux sources rendent la même forme d'objet, si bien que les écrans ignorent laquelle
les alimente.

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

## Adresses

| Chemin | Écran |
| --- | --- |
| `/` | accueil, recherche par référence |
| `/verifier` | saisie d'une référence |
| `/verifier/{jeton}` | verdict de vérification — **c'est l'adresse imprimée dans le QR code** |
| `/u/{identifiant}` | profil public d'un certifié |
| `/a-propos` | présentation du registre |
| `/connexion` | connexion |
| `/espace` | espace certifié |
| `/administration` | espace administrateur |

Tout autre chemin affiche une page « introuvable » sobre, qui ne dit rien de ce qui
existe ou non à cette adresse.

Une vérification faite par saisie de référence redirige vers `/verifier/{jeton}` : le
lien obtenu est donc partageable tel quel. Le certificat déjà résolu voyage avec la
route, de sorte que la page ne redemande pas ce qu'elle vient d'obtenir — sans quoi une
seconde consultation serait comptée.

## Vérifier le contrat avec la base

```bash
npm run verifier
```

Le script exécute le **vrai** code de `src/data/api.js` contre la **vraie** base, en
position de visiteur anonyme, et contrôle douze points : les fonctions publiques
répondent, les tables restent fermées, les jointures correspondent au schéma, les
écritures sont refusées par les politiques, et les deux fonctions utilitaires durcies
ne sont plus exécutables sans session.

Il ne remplace pas des tests unitaires. Il répond à la question qui casse le plus
souvent en silence : *les requêtes correspondent-elles encore au schéma, et les
politiques tiennent-elles ?* Une colonne renommée, une relation supprimée, une politique
relâchée par mégarde — cela se voit ici et nulle part ailleurs, puisque ni le lint ni le
build ne connaissent votre base.

À lancer après toute modification du schéma, et avant chaque mise en production.

## Déploiement

L'application est un fichier `index.html` unique servi pour toutes les adresses. **Le
serveur doit renvoyer `index.html` sur les chemins inconnus**, faute de quoi
`/verifier/{jeton}` — précisément le lien qui figure sur les certificats — répondra 404.
Vite s'en charge en développement ; en production, cela se configure :

| Hébergeur | Configuration |
| --- | --- |
| Netlify | un fichier `public/_redirects` contenant `/*  /index.html  200` |
| Vercel | `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }` |
| nginx | `try_files $uri $uri/ /index.html;` |
| Apache | `FallbackResource /index.html` |

Pensez aussi à faire pointer `certify.vizdata.ci` vers l'hébergement : c'est le domaine
inscrit en dur dans les QR codes déjà imprimés.

### Aperçus de partage

`index.html` porte des balises Open Graph, mais **statiques** : un lien vers un certificat
précis affichera la carte générique du registre, pas le nom du titulaire ni son statut.
Les robots de LinkedIn et WhatsApp n'exécutent pas le JavaScript, donc ils ne verront
jamais le contenu rendu par React.

Un aperçu par certificat suppose un rendu côté serveur. Deux voies, par ordre de coût :

1. une fonction serverless qui intercepte `/verifier/{jeton}`, appelle
   `verify_certificate` et renvoie une page minimale portant les bonnes balises aux
   robots — le reste du trafic continuant vers l'application ;
2. une migration vers un framework à rendu serveur, qui règle le problème par
   construction mais change la nature du projet.

Il manque également une image de partage : `og:image` n'est pas renseigné, faute de
visuel VIZDATA disponible.

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

La marche à suivre — invitation depuis la console, ou Edge Function pour l'import en
masse — est détaillée dans [docs/creation-titulaires.md](docs/creation-titulaires.md),
avec le code de la fonction et ses pièges.

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

- **Le garde-fou anti-énumération est inerte.** `verification_rate_ok()` existe dans la
  base, mais `verify_certificate()` ne l'appelle pas, et `verifications.ip_hash` n'est
  jamais renseignée — la fonction n'a donc rien à mesurer. Les colonnes `country`,
  `user_agent` et `ip_hash` restent vides sur toute vérification servie par la base.
  Les remplir suppose de lire les en-têtes de la requête côté Postgres
  (`current_setting('request.headers')`) et d'appeler le garde-fou avant de répondre.
- **Créer un titulaire passe par la console Supabase.** Voir
  [docs/creation-titulaires.md](docs/creation-titulaires.md).
- **Les aperçus de partage sont génériques.** Un lien vers un certificat affiche la
  carte du registre, pas le nom du titulaire : les robots sociaux n'exécutent pas le
  JavaScript. Voir « Aperçus de partage ».
- **Le PDF n'est pas un fichier.** « Enregistrer en PDF » ouvre la boîte d'impression du
  navigateur sur une zone mise en forme par `@media print`. La colonne `pdf_url` de la
  base n'est pas alimentée.
- **Les onglets internes ne sont pas dans l'URL.** `/administration` et `/espace`
  ouvrent toujours leur premier onglet ; un lien vers un sous-écran précis n'existe pas.
- **Authentification factice sans clés.** En mode démonstration, aucun mot de passe
  n'est vérifié et la volumétrie des vérifications est tirée au hasard. À ne jamais
  déployer dans cet état.
- **Pas de tests unitaires.** `npm run verifier` couvre le contrat avec la base, pas la
  logique d'interface. Le générateur de QR code et `effectiveStatus()`, en particulier,
  mériteraient des tests : ce sont des fonctions pures, faciles à couvrir, et une
  régression y passerait aujourd'hui inaperçue.
