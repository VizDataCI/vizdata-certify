# VIZDATA CERTIFY

Plateforme de gestion, de délivrance, d'archivage, de partage et de **vérification publique**
des certificats délivrés par VIZDATA.

> **État : le code est complet, la base est à rebrancher.**
>
> La plateforme porte l'ensemble du périmètre fonctionnel : catégorisation à deux
> niveaux, trois rôles avec autorisations nommées, attribution en un geste avec
> création du titulaire, certificat A4 paysage, espace personnel, notifications,
> tableau de bord. Tout a été éprouvé à l'usage sur le registre local.
>
> **Le projet Supabase `cwyxvmzodipbdawojpeh` n'existe plus** : son sous-domaine
> renvoie NXDOMAIN sur les résolveurs publics. Le site en ligne affiche donc
> « Registre injoignable » à chaque vérification. Voir « Reconstruire la base ».

## Démarrer

```bash
npm install
npm run demo
```

| Script | Effet |
| --- | --- |
| `npm run dev` | serveur de développement, avec les clés de `.env.local` |
| `npm run demo` | serveur de développement **sans base** — registre local, authentification factice |
| `npm run build` | build de production dans `dist/` |
| `npm run preview` | sert le build de production |
| `npm run lint` | Oxlint |
| `npm test` | tests unitaires (routage, règles métier, rôles, mots de passe, catalogue, QR) |
| `npm run verifier` | vérifie le contrat avec la base Supabase (voir plus bas) |

`npm run demo` lit `.env.demo`, qui neutralise les clés sans toucher à `.env.local` :
Vite charge `.env.<mode>` après `.env.local`, et le dernier chargé l'emporte. C'est le
seul moyen d'éprouver les écrans sans projet Supabase joignable — et de faire une
démonstration hors ligne.

### Comptes de démonstration

Tant que Supabase n'est pas configuré, l'écran de connexion propose trois accès directs
et **le mot de passe est libre** : toute valeur non vide est acceptée dès lors que
l'adresse existe au registre. Ces raccourcis disparaissent dès que l'auth est réelle.

| Rôle | Adresse | Ce qu'il montre |
| --- | --- | --- |
| Administrateur | `admin@vizdata.ci` | tous les écrans |
| Gestionnaire | `gestion@vizdata.ci` | deux autorisations sur quatre — ni catalogue, ni rôles, ni révocation |
| Certifié | `fabrice.boh@vizdata.ci` | espace personnel, trois certifications |

Référence valide pour tester la vérification : `VIZ-2026-EXCEL-AVA-000125`. Les
références du jeu de démonstration sont recalculées à chaque registre vierge, à partir
de dates relatives à aujourd'hui — sans quoi le tableau de bord finirait par s'ouvrir
sur « 0 délivrance sur les trente derniers jours ».

## Principes de conception

Quatre règles structurent tout le reste :

1. **Le statut n'est pas stocké, il est calculé.** `effectiveStatus()` lit la date
   plutôt qu'un champ : aucune tâche planifiée n'est nécessaire pour qu'un certificat
   échu bascule en « Expiré ».
2. **On partage la page de vérification, jamais le fichier.** Le lien diffusé pointe
   vers `/verifier/{jeton}`. Un certificat révoqué ne peut donc jamais apparaître comme
   valide, même si son PDF continue de circuler.
3. **L'autorisation est tenue par la base, pas par l'écran.** Les politiques RLS,
   `has_perm()` et un déclencheur sur `users` décident ; l'interface se contente de ne
   pas proposer ce qu'elle sait refusé. Si les deux divergent, l'écran propose une
   action que la base refuse — désagréable, jamais dangereux. L'inverse serait une faille.
4. **Un certificat atteste d'un acquis.** Ni date d'expiration, ni score : la note
   relève de l'évaluation, pas de l'attestation, et une péremption ferait douter d'un
   acquis qui ne se perd pas. Les colonnes restent en base pour les certificats
   anciens, mais ne sortent plus nulle part.

Les références suivent le format `VIZ-{ANNÉE}-{CODE-PROGRAMME}-{NUMÉRO}`, par exemple
`VIZ-2026-EXCEL-AVA-000125`. Chaque certificat porte en plus un `public_token` opaque,
qui est ce qui figure dans l'URL de vérification et dans le QR code.

## Domaines et programmes

Le registre ne connaissait qu'une liste plate de « types » : `EXCEL`, `PBI`, `DATA`. Or
VIZDATA délivre six certifications Excel distinctes — débutant, intermédiaire, avancé,
expert, tableaux croisés dynamiques, structuration. Un code par domaine ne pouvait pas
les porter.

| Niveau | Table | Porte |
| --- | --- | --- |
| Domaine | `certification_domains` | `EXCEL`, `POWERBI`, `DATA`… |
| Programme | `certificate_types` | l'intitulé exact imprimé, son code unique, sa durée, son modèle |

`certificate_types` **devient** la table des programmes plutôt que d'être doublée par
une table neuve : elle portait déjà code, intitulé, description, durée et statut, et les
certificats délivrés gardent ainsi leur clé étrangère — donc restent vérifiables. Le
domaine n'est qu'une colonne de plus.

Ajouter un domaine ou un programme se fait depuis **Domaines & programmes**, sans
intervention technique. Le code entre dans la référence : l'écran prévient quand un
programme a déjà servi, car le modifier alors désaccorderait les références imprimées.

## Rôles et autorisations

| Rôle | Portée |
| --- | --- |
| `ADMIN` | tous les droits, sans configuration |
| `MANAGER` | ce que l'administrateur lui a accordé, autorisation par autorisation |
| `CERTIFIED` | son espace personnel, ses propres certifications |

Quatre autorisations se règlent une par une pour un gestionnaire :
`creer_titulaires`, `attribuer_certificats`, `revoquer_certificats`, `exporter_donnees`.

Elles sont stockées dans `users.permissions` (jsonb) et appliquées **par la base** :
les politiques RLS appellent `has_perm()`, et le déclencheur `guard_user_privileges`
refuse à quiconque n'est pas administrateur de modifier un rôle, une autorisation, un
statut de compte ou une adresse e-mail — y compris par appel REST direct, hors de toute
interface. Décocher une case retire donc réellement un droit.

Deux verrous valent d'être connus : personne ne peut modifier son propre rôle (sans
quoi le dernier administrateur pourrait se retirer ses droits et verrouiller la
plateforme), et personne ne peut désactiver son propre compte.

## Les trois espaces

**Public — sans compte.** Accueil et recherche par référence, page de vérification
(verdict, titulaire, certification, domaine, date de délivrance, statut, compétences
validées, motif de révocation le cas échéant), **consultation** du certificat, profils
publics `/u/{identifiant}` pour les titulaires qui l'activent.

Consultation seulement : **ni téléchargement, ni partage**. Celui qui vérifie constate
l'authenticité ; il n'a pas à repartir avec l'attestation d'autrui. Diffuser le document
appartient à son titulaire, depuis son espace, et à VIZDATA depuis l'administration. Sur
ce chemin, le document n'est pas monté dans la zone d'impression : il n'y a donc rien à
imprimer — sans prétendre empêcher une capture d'écran, ce qu'aucune application ne peut
faire.

**Espace certifié.** Tableau de bord personnel : nombre de certifications, domaines
couverts, et une carte par certification avec trois actions — consulter, télécharger en
PDF, imprimer — plus le partage et le lien vers la page de vérification. Profil
modifiable, sauf l'adresse e-mail qui identifie le compte. Changement de mot de passe
avec vérification du mot de passe actuel.

**Espace d'administration.** Tableau de bord par période, registre des certificats avec
filtres combinés et pagination, attribution, annuaire des certifiés, catalogue des
domaines et programmes, utilisateurs et rôles, journal des vérifications, notifications
envoyées, import en série, statistiques.

### Attribuer une certification

Trois étapes, dans cet ordre, parce qu'un certificat ne peut pas exister sans titulaire :

1. **Le certifié** — on le cherche par nom ou par adresse. S'il n'existe pas, on le crée
   sur place : son compte d'accès s'ouvre et son invitation part avant que la
   certification ne lui soit attribuée. Si l'adresse est déjà connue, le compte existant
   est réutilisé — un doublon donnerait un second espace personnel, vide.
2. **La certification** — domaine, puis programme.
3. **La délivrance** — date, durée, formateur, signataire, compétences validées.

La référence et le jeton public sont produits par la base, non par le navigateur : deux
administrateurs qui délivrent au même instant ne doivent pas obtenir le même numéro.

### Import en série

Séparateur `;`, `,` ou tabulation, détecté automatiquement.
Colonnes : `NOM`, `PRENOM`, `EMAIL`, `PROGRAMME`, `DATE_DELIVRANCE`.

`PROGRAMME` reprend le **code d'un programme** (`EXCEL-AVA`, `PBI-MOD`…), pas un code de
domaine. Les anciens intitulés `CERTIFICATION` et `DATE_EMISSION` sont acceptés ;
`DATE_EXPIRATION` et `SCORE` sont ignorées, et l'écran le dit plutôt que de faire
silence.

Chaque ligne est analysée avant la moindre écriture : adresse mal formée, programme
inconnu, date invalide, doublon dans le fichier, certification déjà délivrée à ce
titulaire. Les titulaires manquants sont créés et invités. Aucun avis n'est envoyé par
ligne : cinquante messages partis d'un coup finissent en indésirables, et le fournisseur
d'envoi applique des quotas.

## Le certificat

Format **A4 paysage**, gabarit de 1123 × 794 pixels CSS. Ce n'est pas un chiffre
arbitraire : un navigateur imprime le pixel CSS à 96 points par pouce, et 1123 × 794 px
à 96 ppp font exactement 297 × 210 mm.

La conséquence est celle qu'on attend d'un document officiel : **le PDF téléchargé et le
document imprimé ont exactement la mise en page de l'écran.** Le document n'est jamais
remis en page pour l'impression — à l'écran il est réduit par une transformation
d'échelle, sur le papier l'échelle est retirée et le gabarit tombe pile dans la feuille.
Aucune dimension intérieure n'est relative à la fenêtre : une seule suffirait à faire
mentir l'aperçu.

Il est rendu **une seconde fois**, par un portail React, dans `#impression` — un
conteneur frère de l'application, vide et masqué à l'écran. À l'impression, c'est
l'application entière qui disparaît et lui seul qui s'affiche. La recette classique
(`body * { visibility: hidden }` puis réafficher la zone) laisse les éléments masqués
occuper leur place : le nombre de pages dépendait alors de la hauteur de l'écran
sous-jacent. Ici, une page, toujours.

Le basculement n'a lieu **que** lorsqu'un document est réellement monté dans cette zone
— une classe posée sur `<html>` par `ZoneImpression`. Sans ce détail, la règle
s'appliquerait en permanence et un `Ctrl+P` n'importe où dans la plateforme sortirait une
page blanche, y compris sur la page publique de vérification, qu'on peut légitimement
vouloir imprimer comme preuve de consultation. L'orientation de la feuille est injectée
avec le document pour la même raison : une règle `@page` ne se laisse pas conditionner
par une classe.

« Télécharger en PDF » et « Imprimer » ouvrent la même boîte de dialogue — celle du
navigateur — et c'est délibéré : son moteur produit un texte vectoriel, net à tout
agrandissement. Les bibliothèques PDF disponibles côté navigateur passent par une capture
en pixels, plus lourde et floue à l'impression. Ce qui distingue les deux gestes est le
nom proposé pour le fichier : le titre du document est remplacé par la référence, de
sorte que le titulaire enregistre `VIZ-2026-EXCEL-AVA-000125.pdf` et non le titre du site.

## Architecture

Aucune dépendance hors React : le QR code, les styles et le routage sont écrits à la main.

```
src/
  main.jsx                  point d'entrée, charge les feuilles de style
  App.jsx                   état applicatif, routage, persistance
  styles.css                interface
  certificat.css            le document seul — mesures en pixels fixes, règles d'impression
  lib/
    qr.js                   encodage QR (enveloppe autour de la bibliothèque qrcode)
    router.js               correspondance URL ↔ écran, historique du navigateur
    supabase.js             client, lecture des clés d'environnement
    auth.js                 connexion, session, mot de passe
    mot-de-passe.js         exigences du mot de passe, lecture des liens de récupération
    permissions.js          rôles et autorisations — pour l'affichage seulement
    dates.js                TODAY, formats français
    certificates.js         effectiveStatus, STATUS_META, nextReference, slugify
    series.js               agrégation mensuelle des histogrammes
  data/
    api.js                  tous les échanges avec Supabase
    seed.js                 jeu de démonstration (domaines, programmes, comptes, certificats)
    store.js                lecture / écriture / réinitialisation du localStorage
  ui/
    Certificat.jsx          le document, son cadre à l'échelle et sa zone d'impression
    QRCode.jsx              rendu SVG
    VizdataLogo.jsx         logo VIZDATA en SVG
    primitives.jsx          Mark, Badge, Field, Stat, Modal, BarChart
    AppShell.jsx            coquille des espaces authentifiés, navigation de téléphone comprise
  modals/
    CertificateModal.jsx    consultation, téléchargement, impression
    ShareModal.jsx          partage LinkedIn / WhatsApp / e-mail / lien
  screens/
    public/                 PublicShell, Home, About, VerifySearch, VerifyResult,
                            PublicProfile, Login, MotDePasse, NotFound
    certified/              CertifiedSpace
    admin/                  AdminSpace, actions.js, Dashboard, Certificates,
                            CertificateDetail, CertificateForm, RevokeModal,
                            Certified, HolderForm, Catalogue, Utilisateurs,
                            Verifications, Notifications, Import, Stats, Settings
supabase/
  migrations/               le schéma, rejouable sur un projet vierge
  functions/
    inviter-titulaire/      crée le compte d'accès et envoie l'invitation
    notifier/               envoie les avis métier
```

**`screens/admin/actions.js` mérite une mention.** Chaque écran portait sa propre
bifurcation « si le registre distant est configuré, appeler l'API ; sinon, modifier
l'objet local ». Le même raisonnement était donc réécrit dans le formulaire de
certificat, dans les paramètres, dans l'import — avec des divergences inévitables. La
bifurcation est désormais prise une fois : les écrans appellent toujours la même méthode
et ignorent d'où vient la donnée. Les deux régimes se comportent pareil, et la
démonstration reste une démonstration honnête du produit.

Le routage est fait maison, sans dépendance : `lib/router.js` traduit l'URL en écran et
inversement, `App.jsx` empile les changements dans l'historique du navigateur. L'état
global et les fonctions d'accès descendent en cascade par les props sous le nom `shared`.

L'adresse `certify.vizdata.ci` inscrite dans les QR codes est la cible de production ;
en local, seul le chemin compte.

### Modèle de données

Le modèle de référence est celui de la base Supabase, décrit dans
[docs/schema.md](docs/schema.md) : douze tables, RLS partout, et le chemin public servi
par des fonctions `security definer`.

Le registre local n'est qu'un mode de repli, utilisé quand les clés sont absentes. Il
regroupe `users` · `domains` · `types` · `templates` · `certificates` · `verifications`
· `shares` · `audit_logs` · `notifications` en un objet unique, conservé sous la clé
`vizdata_certify_v2` du `localStorage` et réécrit 400 ms après chaque modification.

La clé porte un numéro de version, et ce numéro ne suffit pas : la forme est vérifiée
avant d'être acceptée. Un registre écrit par une version intermédiaire, ou tronqué par
un quota, est écarté au profit du jeu de démonstration plutôt que de laisser
l'application se casser sur un `undefined`.
**Paramètres → Données de démonstration → Réinitialiser** revient à l'état initial.

Les deux sources rendent la même forme d'objet, si bien que les écrans ignorent laquelle
les alimente.

## Authentification

L'application tourne sous deux régimes, selon que les clés Supabase sont présentes.

| | Démonstration | Configuré |
| --- | --- | --- |
| Clés `VITE_SUPABASE_*` | absentes | présentes |
| Mot de passe | non vérifié | vérifié par Supabase |
| Session | perdue au rechargement | persistée et rafraîchie |
| Mot de passe oublié | écran complet, sans envoi réel | lien envoyé par courriel |
| SDK Supabase dans le bundle | éliminé (≈200 ko économisés) | embarqué |

Le profil affiché — prénom, nom, **rôle** — est lu dans la table `users`, dont la clé
primaire référence `auth.users(id)`. Le rôle administrateur découle donc de l'identité
authentifiée et non plus du registre du navigateur : c'est lui que la fonction
`is_admin()` interroge pour appliquer les politiques. Un compte authentifié sans ligne
dans `users` est refusé et immédiatement déconnecté, pour ne pas laisser de session
orpheline.

En mode démonstration, le profil reste cherché dans le registre local par correspondance
d'adresse e-mail.

Il n'y a volontairement pas d'inscription libre : un registre de certifications n'a pas
à laisser n'importe qui se créer un compte. Les titulaires sont invités par
l'administration.

### La réinitialisation du mot de passe

Elle ne fonctionnait pas, et pour une raison qui ne se voyait pas : l'e-mail partait,
le lien était valide, et le mot de passe restait l'ancien. `redirectTo` pointait vers
`window.location.origin` — la page d'accueil. Supabase y ouvrait bien une session de
récupération, puis plus rien : aucun formulaire n'attendait. Le lien n'était pas en
cause ; il n'y avait pas d'arrivée.

La chaîne compte désormais trois pièces :

| Étape | Où |
| --- | --- |
| Demander un lien | `/mot-de-passe-oublie` |
| Recevoir le lien | Supabase, vers `/nouveau-mot-de-passe` |
| Écrire le mot de passe | `/nouveau-mot-de-passe` |

`/nouveau-mot-de-passe` traite les **quatre** états de l'arrivée : le lien est reconnu
mais la session n'est pas encore ouverte ; la session est ouverte et le formulaire
écrit ; Supabase a refusé — lien expiré, déjà utilisé, altéré — et l'on propose d'en
redemander un ; le mot de passe est écrit et on emmène l'utilisateur. Le refus est lu
**avant** que le SDK n'efface le fragment de l'adresse, et dans les deux emplacements
que Supabase a utilisés selon les versions : le fragment et la chaîne de requête.

La même adresse sert de retour aux invitations : un titulaire invité y choisit son
premier mot de passe. Tant qu'il ne l'a pas fait (`users.must_change_password`), toute
connexion l'y ramène.

Deux exigences côté produit : huit caractères avec une lettre et un chiffre — modeste à
dessein, des règles plus sévères poussent à écrire son mot de passe sur un papier — et
la vérification du **mot de passe actuel** lors d'un changement depuis l'espace
personnel. Supabase ne la fait pas : `updateUser` écrit sans rien demander, de sorte
qu'un poste laissé déverrouillé suffirait à prendre le compte.

### Mise en service

1. Créez un projet sur [supabase.com](https://supabase.com) — c'est à vous de le faire,
   la création de compte ne peut pas être déléguée.
2. Rejouez les migrations dans l'ordre des noms de fichiers (voir « Reconstruire la base »).
3. Dans **Project Settings → API Keys**, relevez l'URL du projet et la clé **publiable**
   (`sb_publishable_…`). La clé secrète ne doit jamais entrer dans ce dépôt : elle
   contourne toutes les règles d'accès, et le paquet livré au navigateur est public.
4. Copiez `.env.example` en `.env.local` et renseignez les deux valeurs.
5. Dans **Authentication → URL Configuration**, déclarez `https://certify.vizdata.ci/nouveau-mot-de-passe`
   et `http://localhost:5173/nouveau-mot-de-passe` parmi les **Redirect URLs**. Sans
   cela, Supabase substitue le Site URL et l'on retombe exactement sur le défaut décrit
   plus haut.
6. Déployez les deux fonctions Edge (voir « Les fonctions Edge »).
7. Créez le premier administrateur à la main : invitez-le depuis **Authentication →
   Users**, puis insérez sa ligne dans `public.users` avec `role = 'ADMIN'`. C'est le
   seul compte qui ne peut pas être créé depuis l'application — il n'y a personne pour
   l'inviter.
8. Relancez `npm run dev` : Vite ne relit pas les variables d'environnement à chaud.

## Les fonctions Edge

Deux gestes demandent la clé secrète du projet, qui ne doit jamais approcher un
navigateur. Ils vivent donc côté serveur, et **vérifient eux-mêmes l'autorisation de
l'appelant** en interrogeant la base avec le jeton de celui-ci, donc sous RLS.

| Fonction | Rôle |
| --- | --- |
| `inviter-titulaire` | crée le compte d'authentification, le profil, et envoie l'invitation |
| `notifier` | envoie les avis métier — certification attribuée, profil modifié |

```bash
supabase functions deploy inviter-titulaire
supabase functions deploy notifier
supabase secrets set SITE_URL=https://certify.vizdata.ci
```

`inviter-titulaire` utilise `inviteUserByEmail`, qui crée le compte **et** envoie le
lien : aucun mot de passe n'est produit, donc aucun secret ne circule par courrier. Si
l'adresse existe déjà, le profil existant est renvoyé tel quel — un doublon donnerait
deux espaces personnels à la même personne, dont un vide. Si le courrier ne part pas, le
compte est tout de même créé et l'écran le dit : le titulaire passera par « mot de passe
oublié » plutôt que d'être bloqué.

Si l'insertion du profil échoue après la création du compte, le compte est supprimé :
une session authentifiée sans profil serait refusée à la connexion, et resterait là
indéfiniment.

`notifier` a besoin d'un fournisseur d'envoi — Supabase n'envoie que les courriers
d'authentification. À défaut, il **n'échoue pas** : la notification est inscrite en
attente et l'écran **Notifications** la montre. L'attribution d'un certificat ne doit
pas échouer parce qu'un e-mail n'a pas pu partir ; le certificat est délivré, et déjà
visible dans l'espace du titulaire.

```bash
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set NOTIFY_FROM="VIZDATA CERTIFY <certify@vizdata.ci>"
```

Le destinataire est toujours lu en base, jamais pris dans la requête : sans cela,
l'adresse de la fonction suffirait à envoyer du courrier au nom de VIZDATA à n'importe
qui.

## Adresses

| Chemin | Écran |
| --- | --- |
| `/` | accueil, recherche par référence |
| `/verifier` | saisie d'une référence |
| `/verifier/{jeton}` | verdict de vérification — **c'est l'adresse imprimée dans le QR code** |
| `/u/{identifiant}` | profil public d'un certifié |
| `/a-propos` | présentation du registre |
| `/academie` | page de vente de la formation CITIZEN DATA ANALYST |
| `/connexion` | connexion |
| `/mot-de-passe-oublie` | demande d'un lien de réinitialisation |
| `/nouveau-mot-de-passe` | **adresse de retour des liens Supabase** — invitation et réinitialisation |
| `/espace` | espace certifié |
| `/administration` | espace d'administration |

`/nouveau-mot-de-passe` est inscrite dans la configuration du projet Supabase et dans
des messages déjà envoyés : la changer casserait les liens en circulation. Un test la
fige.

Tout autre chemin affiche une page « introuvable » sobre, qui ne dit rien de ce qui
existe ou non à cette adresse.

Une vérification faite par saisie de référence redirige vers `/verifier/{jeton}` : le
lien obtenu est donc partageable tel quel. Le certificat déjà résolu voyage avec la
route, de sorte que la page ne redemande pas ce qu'elle vient d'obtenir — sans quoi une
seconde consultation serait comptée.

## L'académie CITIZEN DATA ANALYST

`/academie` est la page de vente de la formation Excel + Power BI : huit jours en
présentiel à Abidjan, en cohortes trimestrielles. Elle vit dans la même application que
le registre parce qu'elle partage sa marque, son projet Supabase, son déploiement et son
espace d'administration — mais c'est un second métier, et le code le dit : son contenu,
ses styles et son accès distant sont dans `src/academie/`, ses écrans dans
`src/screens/academie/`, et ses deux écrans d'administration forment leur propre groupe
dans la barre latérale.

### Ce que la page n'invente pas

Trois informations ne sont écrites nulle part dans le code : **les dates de session, le
nombre de places et les tarifs**. Elles vivent dans la table `cohortes`, modifiables
depuis `Administration → Cohortes`. Sans cohorte publiée, la page affiche le programme
sans date et invite à écrire sur WhatsApp — c'est préférable à une date inventée qu'il
faudrait ensuite démentir.

Il n'y a pas non plus de section « témoignages » : il n'y a pas de témoignage à publier.

### Le chemin d'une candidature

1. Le visiteur remplit le formulaire. `validerCandidature()` dit ce qui manque avant
   l'envoi ; les mêmes règles sont écrites en contraintes dans la base, parce que le
   navigateur ne fait jamais autorité.
2. `soumettre_candidature()` — fonction `security definer` — enregistre la ligne et rend
   une référence `CDA-2026-0001`. La table `candidatures` reste **fermée** : ni lecture
   ni écriture directe pour un visiteur, comme `certificates`.
3. La confirmation s'affiche avec la référence.
4. `api/notifier-candidature.mjs` envoie l'alerte à `contact@vizdata.ci` et l'accusé de
   réception au candidat.

L'ordre compte. L'e-mail part **après** la confirmation, et son échec ne fait jamais
échouer la candidature : l'administration la voit dans tous les cas. L'inverse ferait
dépendre une inscription d'un service tiers.

### La fonction de notification ne croit pas ce qu'on lui envoie

Elle ne retient du corps de la requête que la référence, puis **relit la candidature
dans la base** avec la clé de service. Sans cela, le destinataire et le contenu du
message viendraient du client : n'importe qui pourrait faire envoyer, depuis le domaine
de VIZDATA, le message de son choix à l'adresse de son choix. C'est l'erreur classique
de ce genre d'endpoint, et elle est évitée ici par construction.

### Mise en service

1. **Appliquer la migration.** `supabase/migrations/20261106_academie.sql`, depuis le
   SQL Editor de la console Supabase — comme les précédentes. Elle crée `cohortes`,
   `candidatures`, leurs politiques et les deux fonctions publiques.
   Tant qu'elle n'est pas appliquée, le formulaire affiche un message qui la nomme.
2. **Contrôler le contrat.** `npm run verifier` vérifie que `cohorte_publique()` répond,
   que `soumettre_candidature()` refuse une candidature sans engagement, et que les deux
   tables restent fermées à un visiteur anonyme.
3. **Créer la première cohorte** dans `Administration → Cohortes`, puis la publier.
4. **Les e-mails** (facultatif) : renseigner chez l'hébergeur `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` et `RESEND_API_KEY` — voir `.env.example`. Aucune ne porte
   le préfixe `VITE_`, donc aucune n'entre dans le paquet navigateur. La clé de service
   ne doit jamais rejoindre `.env.local` : `npm run build` refuse d'ailleurs de
   construire avec une clé secrète côté client.
5. **Les photographies** : déposer les portraits officiels dans `public/academie/` —
   voir [docs/visuels-academie.md](docs/visuels-academie.md). En leur absence, la page affiche
   les initiales sur un fond de marque — jamais une image cassée, jamais un portrait de
   banque d'images qui ferait passer un inconnu pour un formateur.

### Les couleurs du graphique ne sont pas celles du logo

L'aperçu de tableau de bord du hero est dessiné en SVG. Ses marques de données
utilisent `#1578A6`, `#D9700F` et `#7A4C9E`, et non le bleu, l'orange et le violet
exacts du logo : côte à côte, le bleu et le violet de la charte sont indiscernables pour
une vision deutéranope (ΔE 3,5 — mesuré, pas estimé). Le trio retenu passe les contrôles
de séparation, de bande de clarté et de contraste sur fond blanc. Le logo, lui, reste
intact : il n'est ni redessiné ni recoloré.

## Tests

```bash
npm test
```

107 tests, exécutés par le lanceur intégré de Node — **aucune dépendance de test dans le
projet**. Ils couvrent ce qui est pur et dont la régression serait silencieuse :

- **le routage** — aller-retour entre adresse et écran, encodage des jetons, chemins
  inconnus, et les deux adresses de la chaîne de mot de passe, qui sont inscrites dans
  la configuration Supabase et dans des courriers déjà envoyés ;
- **les règles métier** — `effectiveStatus()`, qui porte le principe « le statut est
  calculé, pas stocké » et doit rester d'accord avec `effective_status()` côté base ;
  la numérotation des références ; les identifiants publics ;
- **les rôles et autorisations** — l'administrateur peut tout, le gestionnaire ce qu'on
  lui a accordé, le gestionnaire sans autorisation rien, et un compte désactivé perd
  l'accès sans perdre son rôle ;
- **le mot de passe** — les exigences, et surtout la lecture du lien de retour :
  invitation, flux PKCE, lien expiré, refus posé en chaîne de requête. C'est la
  correction centrale du cahier des charges, et la seule partie de la chaîne qui ne
  dépende ni du réseau ni du navigateur ;
- **le catalogue et le registre de démonstration** — chaque programme rattaché à un
  domaine, codes uniques, intitulé distinct du code, aucune expiration ni score
  résiduel, références au bon format et uniques, délivrances récentes, trois rôles
  représentés ;
- **les candidatures de l'académie** — normalisation des numéros WhatsApp, validation du
  formulaire, calcul de l'économie du paiement intégral, et surtout l'export CSV : BOM,
  point-virgule, guillemets doublés, point-virgule à l'intérieur d'une motivation. Un
  export qui décale ses colonnes se découvre d'ordinaire dans Excel, devant quelqu'un ;
- **les QR codes** — structure (motifs de repérage, synchronisation, déterminisme) et
  **décodage réel** par jsQR. Les deux sont nécessaires : un encodeur écrit à la main
  passait tous les contrôles de structure et ne produisait aucun code lisible par un
  téléphone. La structure ne prouve pas la lisibilité.

## Vérifier le contrat avec la base

```bash
npm run verifier
```

Le script exécute le **vrai** code de `src/data/api.js` contre la **vraie** base, en
position de visiteur anonyme. Il contrôle que les fonctions publiques répondent, que les
tables sensibles restent fermées — `users`, `certificates`, `notifications`, les modèles
—, que les jointures correspondent au schéma, que `is_admin`, `is_staff` et `has_perm`
répondent faux sans session, que les écritures sont refusées par les politiques, que les
deux fonctions utilitaires durcies ne sont plus exécutables, et que les deux fonctions
Edge sont déployées **et** refusent un appel sans autorisation.

Il ne remplace pas des tests unitaires. Il répond à la question qui casse le plus
souvent en silence : *les requêtes correspondent-elles encore au schéma, et les
politiques tiennent-elles ?* Une colonne renommée, une relation supprimée, une politique
relâchée par mégarde — cela se voit ici et nulle part ailleurs, puisque ni le lint ni le
build ne connaissent votre base.

À lancer après toute modification du schéma, et avant chaque mise en production.

## En production

**https://certify.vizdata.ci** — c'est l'adresse qui compte : elle est inscrite en dur
dans tous les QR codes déjà imprimés.

Relevé le 14 novembre 2026 :

| Constat | Détail |
| --- | --- |
| Hébergement | **nginx sur Scaleway** (51.15.160.8), plus Vercel |
| Routes | les dix répondent 200, repli SPA compris |
| En-têtes de sécurité | les quatre sont appliqués |
| Registre | **inopérant** — « Registre injoignable » à chaque vérification |
| Paquet servi | en retard de plusieurs commits |

Le changement d'hébergeur n'est documenté nulle part dans ce dépôt : **la procédure de
mise à jour du serveur nginx reste à établir et à écrire ici.** Tant qu'elle ne l'est
pas, personne ne peut remettre le site à jour sans accès à ce serveur.

L'ancienne adresse Vercel sert encore un paquet plus ancien encore. Deux sites vivants,
aucun fonctionnel.

### Reconstruire la base

Le projet Supabase `cwyxvmzodipbdawojpeh` n'existe plus — `NXDOMAIN` sur Google DNS
comme sur Cloudflare, alors que `supabase.co` résout normalement. Ce n'est ni un
pare-feu ni une panne passagère.

Le schéma, lui, est désormais reconstructible : il est dans ce dépôt. Sur un projet
vierge, rejouez les migrations **dans l'ordre des noms de fichiers** :

| Fichier | Effet |
| --- | --- |
| `20260818_socle.sql` | neuf tables, quatre énumérés, fonctions du chemin public, RLS |
| `20260819_verification_details.sql` | projection étendue des fonctions de vérification |
| `20260819_ecritures_manquantes.sql` | écriture du journal, `record_share` |
| `20260819_durcissement.sql` | retire deux fonctions utilitaires au rôle PUBLIC |
| `20261106_academie.sql` | cohortes et candidatures |
| `20261114_refonte.sql` | domaines, programmes, rôles, modèles, notifications |

Toutes sont **rejouables** : chaque objet est créé « si absent », chaque politique est
supprimée avant d'être recréée. Elles s'appliquent donc aussi bien à un projet vierge
qu'à un projet qui porte déjà une partie du schéma.

Le socle est une **reconstruction**. Le schéma d'origine avait été écrit à la main dans
la console SQL et n'avait jamais été versionné : seules les migrations qui le faisaient
évoluer étaient suivies. Le jour où le projet a disparu, le schéma a disparu avec lui.
C'est la dette que `20260818_socle.sql` solde — et la leçon vaut d'être retenue : un
schéma qui ne vit que dans une console n'est pas sauvegardé.

**Ce que le dépôt ne peut pas reconstituer, ce sont les certificats délivrés.** Si des
certifications avaient été enregistrées dans ce projet, leurs références et leurs jetons
publics sont perdus, et les QR codes imprimés correspondants ne mèneront plus à rien.

### Sauvegardes

À mettre en place sur le nouveau projet, parce que l'incident ci-dessus se reproduira
autrement :

- **Point-in-time recovery** dans Supabase (offre payante) — c'est la seule protection
  contre une suppression ou une erreur d'écriture.
- Un export régulier hors de Supabase : `supabase db dump --data-only`, conservé
  ailleurs que chez l'hébergeur. Un registre de certifications est une pièce probante ;
  sa perte ne se rattrape pas.
- Les migrations de ce dépôt couvrent la **structure**, jamais les données.

### Deux points à traiter

**La protection de déploiement est désactivée** sur ce projet, ce qui est nécessaire : un
registre dont la vocation est d'être vérifiable sans compte ne peut pas rester derrière
une authentification Vercel. Ce n'est pas la base qui est exposée — seule la clé publiable
circule, et les politiques RLS protègent les données.

**L'ancien projet `vizdata-certify` a été supprimé.** Il était resté bloqué après qu'un
déploiement a été effacé en cours de construction : toute mise en ligne suivante y restait
suspendue indéfiniment, y compris un paquet déjà construit. Le nom est donc de nouveau
disponible pour le projet courant.

### Ce qui n'est pas branché

Le dépôt GitHub n'est pas relié à Vercel : l'application GitHub de Vercel n'a pas accès au
dépôt, qui est privé. Chaque mise en ligne se fait donc à la main :

```bash
npm test && npm run verifier && npx vercel --prod
```

Pour obtenir le déploiement à chaque `git push`, installez
[l'application Vercel](https://github.com/apps/vercel) sur le compte VizDataCI et
donnez-lui accès au dépôt.

## Déploiement sur Vercel

`vercel.json` est déjà dans le dépôt : préréglage Vite, repli SPA, en-têtes de sécurité
et cache long sur les fichiers versionnés. Restent trois choses à faire de votre côté.

### 1. Les variables d'environnement

Dans **Settings → Environment Variables**, pour **Production** *et* **Preview** :

| Nom | Valeur |
| --- | --- |
| `VITE_SUPABASE_URL` | l'URL du projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | la clé **publiable** (`sb_publishable_…`) |

Jamais la clé `service_role` : le paquet livré au navigateur est public par nature, tout
ce qu'il contient est lisible par n'importe qui.

**La construction échoue volontairement** si la clé manque, si son format est mauvais,
ou si le projet Supabase la refuse. Le garde-fou est `scripts/verifier-build.mjs` et il
contrôle trois choses :

1. **Présence** — sans clés, l'application se replierait sur son mode démonstration, où
   la connexion accepte n'importe quel mot de passe.
2. **Format** — une clé `sb_secret_…`, ou un jeton portant le rôle `service_role`, est
   refusée net : embarquée dans un paquet navigateur, elle contournerait toutes les
   politiques RLS.
3. **Validité** — la clé est éprouvée auprès du projet avant de construire quoi que ce
   soit. Ce troisième contrôle a été ajouté après une mise en production où la clé,
   présente mais tronquée au collage, avait produit un déploiement d'apparence saine sur
   lequel chaque vérification répondait « Invalid API key ». Présence ne vaut pas
   validité.

Si le réseau est indisponible, la construction se poursuit avec un avertissement : un
hébergeur injoignable ne doit pas bloquer une mise en production.

### 2. Les adresses de redirection Supabase

C'est l'oubli classique, et il ne se voit qu'au moment où un titulaire demande un
nouveau mot de passe : le lien reçu par courriel le renvoie vers `localhost`.

Dans Supabase, **Authentication → URL Configuration** :

- **Site URL** : `https://certify.vizdata.ci`
- **Redirect URLs** : ajoutez le domaine définitif, l'adresse `*.vercel.app` du projet,
  et `http://localhost:5173` pour le développement.

### 3. Le domaine

Faites pointer `certify.vizdata.ci` vers le projet Vercel. Ce n'est pas cosmétique :
c'est le domaine inscrit en dur dans les QR codes déjà imprimés sur les certificats.

### L'adresse des commits doit être rattachée à GitHub

Vercel **bloque** un déploiement dont l'auteur du commit ne correspond à aucun compte
GitHub — statut `Blocked`, sans journal de construction. Vu de la CLI, le déploiement
reste indéfiniment en `UNKNOWN` et l'adresse répond « Deployment is building » : rien
n'indique la cause, qui n'apparaît que sur la page du déploiement dans le tableau de bord.

L'identité configurée ici convient :

```bash
git config user.email
```

Elle doit renvoyer `148683652+VizDataCI@users.noreply.github.com`, l'adresse de
non-réponse liée au compte GitHub. Ne la remplacez pas par une adresse personnelle qui
n'y serait pas rattachée : les déploiements seraient refusés sans explication lisible.

### Mise en ligne

```bash
npx vercel login
```

```bash
npx vercel --prod
```

La première commande ouvre votre navigateur ; je ne peux pas la lancer à votre place,
et c'est aussi bien. Vous pouvez tout aussi bien connecter le dépôt à Vercel depuis
l'interface, chaque `git push` déclenchant alors un déploiement.

### Avant chaque mise en production

```bash
npm test && npm run verifier && npm run build
```

Les tests couvrent les fonctions pures, `verifier` contrôle que les requêtes
correspondent toujours au schéma et que les politiques tiennent, et le build refuse de
produire un paquet sans clés.

### Autres hébergeurs

Le point à ne pas manquer est partout le même : **renvoyer `index.html` sur les chemins
inconnus**, faute de quoi `/verifier/{jeton}` — précisément le lien imprimé sur les
certificats — répondra 404.

| Hébergeur | Configuration |
| --- | --- |
| Netlify | `public/_redirects` contenant `/*  /index.html  200` |
| nginx | `try_files $uri $uri/ /index.html;` |
| Apache | `FallbackResource /index.html` |

### En-têtes de sécurité

`vercel.json` pose `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy` et `Permissions-Policy`. Le refus d'être affiché dans un cadre n'est
pas décoratif ici : sans lui, un site tiers pourrait incruster une page de vérification
authentique à côté d'un faux nom et faire passer le tout pour une preuve.

Une politique de contenu (`Content-Security-Policy`) manque encore. Elle demande d'être
juste du premier coup, sous peine de casser l'application en production, et n'a pas pu
être éprouvée d'ici. Le squelette à éprouver sur un déploiement de préversion :

```
default-src 'self';
connect-src 'self' https://VOTRE-PROJET.supabase.co;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com;
img-src 'self' data:;
frame-ancestors 'none';
base-uri 'self'
```

`'unsafe-inline'` sur les styles est requis par les styles en ligne des composants ;
les supprimer serait un chantier à part entière.

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

## Ce qui passe par la base

| Écran | Source des données | Écriture |
| --- | --- | --- |
| Connexion | **Supabase** — mot de passe vérifié, profil, rôle et autorisations lus dans `users` | — |
| Accueil, vérification par référence | `verify_by_reference` | consultation enregistrée |
| Vérification par jeton (QR, lien) | `verify_certificate` | consultation enregistrée |
| Profil public | `public_profile` | — |
| Espace certifié | table `certificates`, RLS `certificates_owner_select` | profil, mot de passe |
| Administration | tables, sous RLS | attribution, révocation, catalogue, rôles, import |
| Création d'un titulaire | fonction Edge `inviter-titulaire` | compte, profil, invitation |
| Avis métier | fonction Edge `notifier` | trace dans `notifications` |

Les deux chemins — distant et local — rendent la même forme d'objet : les écrans ne
savent pas d'où viennent les données.

### Écritures

Après chaque écriture, le registre est **redemandé à la base** plutôt que rejoué côté
client : la base seule fait autorité, et elle a pu appliquer une règle ou refuser.
Aucune autorisation n'est vérifiée dans le navigateur — les politiques `is_admin()`
s'en chargent, et une erreur `42501` remonte telle quelle si elles refusent.

La référence et le jeton public sont produits par `next_reference()` et
`new_public_token()` côté base, pour que la numérotation reste cohérente si deux
administrateurs créent un certificat en même temps.

### La limite qui a été levée

`public.users.id` référence `auth.users(id)` : créer un titulaire suppose de créer
d'abord un compte d'authentification, ce que la clé publiable ne permet pas — et ne doit
pas permettre. L'application refusait donc toute adresse inconnue, et demandait d'aller
ouvrir le compte dans la console Supabase avant de revenir : l'attribution était une
opération en deux visites, et l'import en masse écartait purement et simplement les
titulaires nouveaux.

La fonction Edge `inviter-titulaire` lève cette limite sans affaiblir quoi que ce soit :
la clé secrète reste côté serveur, et la fonction vérifie elle-même, sous RLS, que
l'appelant porte l'autorisation `creer_titulaires`.

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
reference, holder_name, certification, domain, issuer, issue_date, status,
revoke_reason, public_token, description, duration, trainer, signatory, skills
```

Les écrans publics ignorent donc d'où viennent les données, et la page de vérification
affiche la même chose dans les deux modes.

Cette projection a bougé deux fois. D'abord pour s'élargir
(`20260819_verification_details.sql`) : elle ne rendait que neuf colonnes, sans les
compétences, sans `duration`, `trainer` ni `signatory`, et sans `public_token` — ce qui
privait de QR code toute vérification faite par saisie de référence. Puis pour se
resserrer (`20261114_refonte.sql`) : `expiry_date` et `score` en sortent, `domain` y
entre. Les deux mentions retirées ne sont donc pas seulement masquées à l'écran — elles
ne quittent plus la base.

`verify_by_reference` délègue à `verify_certificate` par un `select *` : **les deux
signatures doivent changer ensemble**, sous peine de casser la seconde.

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
  `supabase/migrations/PROPOSITION_tracabilite_verifications.sql` les renseigne et
  branche le garde-fou ; elle n'est **pas appliquée**, pour trois raisons qui s'y
  trouvent détaillées — dont celle-ci, qui prime : une entreprise sort souvent par une
  seule adresse IP, et un service RH vérifiant vingt candidats se verrait répondre
  « certificat introuvable », le pire message possible pour un registre officiel.
- **Le registre en ligne est inopérant.** Le projet Supabase n'existe plus. Voir
  « Reconstruire la base ».
- **La procédure de déploiement du serveur nginx n'est pas écrite.** L'hébergement est
  passé de Vercel à Scaleway sans que ce dépôt en garde trace. Tout ce qui suit sur
  Vercel reste exact pour Vercel, et sans objet pour l'hébergement courant.
- **Les aperçus de partage sont génériques.** Un lien vers un certificat affiche la
  carte du registre, pas le nom du titulaire : les robots sociaux n'exécutent pas le
  JavaScript. Voir « Aperçus de partage ».
- **Le PDF n'est pas un fichier produit par le serveur.** « Télécharger en PDF » ouvre la
  boîte d'impression du navigateur. C'est un choix, pas un manque : le moteur
  d'impression produit un texte vectoriel, là où les bibliothèques PDF côté navigateur
  passent par une capture en pixels. La colonne `pdf_url` n'est pas alimentée.
- **Les notifications métier demandent un fournisseur d'envoi.** Sans `RESEND_API_KEY`,
  elles sont inscrites en attente et visibles dans l'écran Notifications ; rien n'est
  envoyé, et rien ne prétend l'avoir été.
- **Les composants ne sont pas testés automatiquement.** Les enchaînements d'écrans ont
  été éprouvés à la main, en mode démonstration, jusqu'à la délivrance d'une
  certification complète — création du titulaire, attribution, vérification publique,
  espace personnel. Ce n'est pas une suite de tests.
- **Les onglets internes ne sont pas dans l'URL.** `/administration` et `/espace`
  ouvrent toujours leur premier onglet ; un lien vers un sous-écran précis n'existe pas.
- **Authentification factice sans clés.** En mode démonstration, aucun mot de passe
  n'est vérifié et la volumétrie des vérifications est tirée au hasard. À ne jamais
  déployer dans cet état.
- **La page de vente n'a pas d'aperçu de partage propre.** Un lien vers `/academie`
  partagé sur WhatsApp ou LinkedIn affiche la carte du registre : le titre et la
  description sont posés en JavaScript, que les robots sociaux n'exécutent pas. Même
  cause et même remède que pour les certificats — un rendu côté serveur.
- **La page de vente charge toute l'application.** Le paquet unique fait 162 ko
  compressés ; un visiteur de `/academie` télécharge donc aussi les écrans
  d'administration et l'encodeur QR, dont il n'a que faire. Un découpage par route
  (`React.lazy`) sur les espaces authentifiés en retirerait environ 13 ko compressés ;
  il n'a pas été fait pour ne pas toucher au routage existant à cette occasion.
- **Les e-mails de candidature dépendent de trois variables d'hébergeur.** Sans elles,
  la candidature est enregistrée et visible dans l'administration, mais aucun message ne
  part — et la page le dit au candidat plutôt que de le laisser croire le contraire.
- **Les composants React ne sont pas testés.** `npm test` couvre les fonctions pures —
  routage, règles métier, encodeur QR — et `npm run verifier` le contrat avec la base.
  Entre les deux, le rendu et les enchaînements d'écrans ne sont vérifiés qu'à la main.
