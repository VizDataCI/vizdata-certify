# VIZDATA CERTIFY

Plateforme de gestion, de délivrance, d'archivage, de partage et de **vérification
publique** des certificats délivrés par VIZDATA.

> **État : complet, et prêt à être déployé.**
>
> La base est un fichier SQLite sur le serveur VIZDATA. Le registre précédent : un projet
> hébergé chez un tiers : a cessé d'exister sans préavis, emportant un schéma qui n'était
> écrit nulle part ailleurs. Tout ce qui suit découle de cette leçon : **la base doit
> appartenir à VIZDATA.**
>
> Le registre existe en **deux implémentations**, qui servent le même schéma et les mêmes
> routes, à la sauvegarde près : **PHP** (`api/`) pour un hébergement mutualisé sans ligne
> de commande, c'est celle de `certify.vizdata.ci` ; **Node** (`server/`) pour un serveur
> dont on a la main. L'interface ne sait pas laquelle elle a en face.
>
> Marche à suivre : [docs/deploiement.md](docs/deploiement.md).

## Démarrer

Deux processus en développement : le registre, et l'interface.

```bash
npm install
npm run base -- init
npm run base -- admin votre@adresse.ci
```

```bash
npm run serveur
```

```bash
npm run dev
```

Puis `http://localhost:5173`, et le lien imprimé par la commande `admin` pour choisir
votre mot de passe. Vite redirige `/api` vers le registre : sans ce mandataire, le cookie
de session viendrait d'une autre origine que la page et ne serait jamais renvoyé.

Pour tout voir sans rien installer : `npm run demo`, qui tourne seul, sans base ni
serveur.

| Script | Effet |
| --- | --- |
| `npm run serveur` | le registre, API et application construite, port 4321 |
| `npm run dev` | l'interface en développement, port 5173 |
| `npm run demo` | l'interface **sans base** : registre local, authentification factice |
| `npm run base -- init` | crée la base et le catalogue de départ |
| `npm run base -- admin <email>` | ouvre ou promeut un administrateur |
| `npm run base -- etat` | ce que contient la base |
| `npm run base -- menage` | retire sessions et jetons périmés |
| `npm run sauvegarde` | copie la base **à chaud**, la vérifie, la chiffre, l'expédie |
| `npm run restaurer -- <fichier>` | montre une sauvegarde ; `--oui` la restaure |
| `npm run build` | construit l'interface dans `dist/` |
| `npm test` | 220 tests, sans aucune dépendance de test |
| `npm run lint` | Oxlint |
| `npm run php` | contrôle de surface des fichiers PHP : à défaut de `php -l` |
| `npm run paquet` | l'archive à téléverser : interface construite + registre PHP |

### Comptes de démonstration

`npm run demo` lit `.env.demo`, qui pose `VITE_MODE_DEMO=1` sans toucher à quoi que ce
soit d'autre. L'écran de connexion propose alors trois accès directs et **le mot de passe
est libre**.

| Rôle | Adresse | Ce qu'il montre |
| --- | --- | --- |
| Administrateur | `admin@vizdata.ci` | tous les écrans |
| Gestionnaire | `gestion@vizdata.ci` | deux autorisations sur quatre : ni catalogue, ni rôles, ni révocation |
| Certifié | `fabrice.boh@vizdata.ci` | espace personnel, plusieurs certifications |

Référence valide pour tester la vérification : `VIZ-2026-EXCEL-AVA-000125`. Les
références du jeu de démonstration sont recalculées à chaque registre vierge, à partir de
dates relatives à aujourd'hui : sans quoi le tableau de bord finirait par s'ouvrir sur
« 0 délivrance sur les trente derniers jours ».

Ce mode ne doit jamais être mis en ligne : la connexion y accepte n'importe quel mot de
passe. `scripts/verifier-build.mjs` refuse de construire avec cette variable, sauf
`npm run build -- --mode demo` explicite.

## Principes de conception

Quatre règles structurent tout le reste :

1. **Le statut n'est pas stocké, il est calculé.** `effectiveStatus()` lit la date
   plutôt qu'un champ : aucune tâche planifiée n'est nécessaire pour qu'un certificat
   échu bascule en « Expiré ».
2. **On partage la page de vérification, jamais le fichier.** Le lien diffusé pointe
   vers `/verifier/{jeton}`. Un certificat révoqué ne peut donc jamais apparaître comme
   valide, même si son PDF continue de circuler.
3. **L'autorisation est tenue par le serveur, pas par l'écran.** Un seul module décide
   `server/autorisations.mjs` , et il lève au lieu de rendre un booléen, parce qu'un
   booléen se laisse oublier. L'interface se contente de ne pas proposer ce qu'elle sait
   refusé. Si les deux divergent, l'écran propose une action que le serveur refuse :
   désagréable, jamais dangereux. L'inverse serait une faille.
4. **Un certificat atteste d'un acquis.** Ni date d'expiration, ni score : la note
   relève de l'évaluation, pas de l'attestation, et une péremption ferait douter d'un
   acquis qui ne se perd pas. Les colonnes restent en base pour les certificats
   anciens, mais ne sortent plus nulle part.

Les références suivent le format `VIZ-{ANNÉE}-{CODE-PROGRAMME}-{NUMÉRO}`, par exemple
`VIZ-2026-EXCEL-AVA-000125`. Chaque certificat porte en plus un `public_token` opaque,
qui est ce qui figure dans l'URL de vérification et dans le QR code.

## La scène de l'accueil

Le fond de la page d'accueil joue une séquence de remise de diplômes : des silhouettes
levant leur toque devant un coucher de soleil. Elle est dans le dépôt, et **la page
reste complète même si les fichiers disparaissent**.

| Fichier | Rôle | Ce qui est en place |
|---|---|---|
| `accueil-graduation.mp4` | la séquence | H.264, 1600 × 900, 12,4 s, muette, **832 Ko** |
| `accueil-graduation.jpg` | l'affiche | la première image du plan, **42 Ko** |

Trois niveaux, et la page se tient à chacun :

1. **Aucun fichier** : le champ de nuit VIZDATA avec sa vignette.
2. **L'affiche seule** : l'image fixe s'affiche.
3. **La vidéo** : la séquence joue, muette et en boucle.

**D'où vient le plan.** Pexels, « People Waving their Graduation Cap », olia danilevich,
[pexels.com/video/8061028](https://www.pexels.com/video/people-waving-their-graduation-cap-8061028/).
Licence Pexels : usage commercial libre, sans attribution. Elle est citée ici parce
qu'un registre de certification se doit de savoir d'où vient ce qu'il affiche, pas
parce qu'elle l'exige. Le contre-jour n'est pas qu'un parti esthétique : personne n'est
identifiable, donc la page ne promet le visage de personne.

**La boucle est un palindrome**, c'est-à-dire que le plan joue à l'endroit puis à
l'envers. Monté bout à bout il sautait deux fois, sur les bras qui se lèvent et sur la
caméra qui se resserre : mesuré en SSIM, le raccord d'une boucle simple tombait à 0,69,
là où le palindrome tient 0,97, soit l'écart d'un réencodage. Pour refaire le plan :

```
ffmpeg -ss 2.4 -to 8.6 -i source.mp4 -an -filter_complex \
  "[0:v]scale=1600:900:flags=lanczos,setpts=PTS-STARTPTS,split[f][r];\
   [r]reverse,trim=start_frame=1,setpts=PTS-STARTPTS[rv];\
   [f][rv]concat=n=2:v=1:a=0[v]" -map "[v]" -c:v libx264 -profile:v high \
  -pix_fmt yuv420p -crf 32 -preset veryslow -g 50 -movflags +faststart out.mp4
```

**Pourquoi un MP4 et non un GIF.** Le même plan en GIF pèserait huit à douze mégaoctets
et ne connaîtrait que 256 couleurs : ce ciel y deviendrait des bandes, et le décodage
retomberait sur le processeur. En H.264 il pèse 832 Ko, garde ses dégradés, et se
décode par la puce vidéo. Sur une connexion abidjanaise, c'est la différence entre une
page qui s'ouvre et une page qu'on abandonne.

**Et pas de WebM non plus.** Réencodé en VP9, ce plan montait à 1,2 Mo, soit *plus* que
le H.264 : le VP9 gagne sur du détail, pas sur un ciel lisse. Une source `.webm` servie
en premier aurait donc fait télécharger le fichier le plus lourd aux navigateurs qui la
préfèrent, ce qui est l'inverse du but.

**Le cadrage et le voile.** Le tiers gauche reste calme : c'est là que le titre se pose.
Sous 860 px le voile redevient uniforme, parce que le texte y occupe toute la largeur
et se retrouverait là où le dégradé s'éclaircit. Contraste au pire cas, mesuré sur cinq
images du plan et sur les rectangles des glyphes : **5,0:1 sur téléphone, 4,8:1 sur
tablette, 5,5:1 sur bureau**, de 375 px à 1920 px, soit au-dessus du seuil AA de 4,5
partout. Et la séquence ne joue pas pour qui a demandé moins d'animations : l'affiche
la remplace.

**Si le plan est remplacé.** Les deux fichiers ne portent pas d'empreinte dans leur nom,
donc `.htaccess` leur donne une semaine de cache et non un an. Pour qu'un nouveau plan
se propage tout de suite, renommer les deux fichiers et leurs trois références :
`Home.jsx` (l'affiche et la source) et `styles.css` (le repli sans animation).

## Domaines et programmes

Le registre ne connaissait qu'une liste plate de « types » : `EXCEL`, `PBI`, `DATA`. Or
VIZDATA délivre six certifications Excel distinctes : débutant, intermédiaire, avancé,
expert, tableaux croisés dynamiques, structuration. Un code par domaine ne pouvait pas
les porter.

| Niveau | Table | Porte |
| --- | --- | --- |
| Domaine | `certification_domains` | `EXCEL`, `POWERBI`, `DATA`… |
| Programme | `certificate_types` | l'intitulé exact imprimé, son code unique, sa durée, son modèle |

`certificate_types` **devient** la table des programmes plutôt que d'être doublée par
une table neuve : elle portait déjà code, intitulé, description, durée et statut, et les
certificats délivrés gardent ainsi leur clé étrangère, donc restent vérifiables. Le
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

Elles sont stockées dans `users.permissions` et appliquées **par le serveur**, sur chaque
route, avant toute écriture. Rôle, autorisations, statut de compte et adresse e-mail sont
réservés à l'administrateur : un gestionnaire qui enverrait une requête HTTP sur sa propre
fiche en y glissant `role: 'ADMIN'` est refusé. Décocher une case retire donc réellement
un droit, y compris hors de toute interface.

Deux verrous valent d'être connus : personne ne peut modifier son propre rôle (sans
quoi le dernier administrateur pourrait se retirer ses droits et verrouiller la
plateforme), et personne ne peut désactiver son propre compte.

## Les trois espaces

**Public : sans compte.** Accueil et recherche par référence, page de vérification
(verdict, titulaire, certification, domaine, date de délivrance, statut, compétences
validées, motif de révocation le cas échéant), **consultation** du certificat, profils
publics `/u/{identifiant}` pour les titulaires qui l'activent.

Consultation seulement : **ni téléchargement, ni partage**. Celui qui vérifie constate
l'authenticité ; il n'a pas à repartir avec l'attestation d'autrui. Diffuser le document
appartient à son titulaire, depuis son espace, et à VIZDATA depuis l'administration. Sur
ce chemin, le document n'est pas monté dans la zone d'impression : il n'y a donc rien à
imprimer : sans prétendre empêcher une capture d'écran, ce qu'aucune application ne peut
faire.

**Espace certifié.** Tableau de bord personnel : nombre de certifications, domaines
couverts, et une carte par certification avec trois actions : consulter, télécharger en
PDF, imprimer : plus le partage et le lien vers la page de vérification. Profil
modifiable, sauf l'adresse e-mail qui identifie le compte. Changement de mot de passe
avec vérification du mot de passe actuel.

**Espace d'administration.** Tableau de bord par période, registre des certificats avec
filtres combinés et pagination, attribution, annuaire des certifiés, catalogue des
domaines et programmes, utilisateurs et rôles, journal des vérifications, notifications
envoyées, import en série, statistiques.

### Attribuer une certification

Trois étapes, dans cet ordre, parce qu'un certificat ne peut pas exister sans titulaire :

1. **Le certifié** : on le cherche par nom ou par adresse. S'il n'existe pas, on le crée
   sur place : son compte d'accès s'ouvre et son invitation part avant que la
   certification ne lui soit attribuée. Si l'adresse est déjà connue, le compte existant
   est réutilisé : un doublon donnerait un second espace personnel, vide.
2. **La certification** : domaine, puis programme.
3. **La délivrance** : date, durée, formateur, signataire, compétences validées.

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
remis en page pour l'impression : à l'écran il est réduit par une transformation
d'échelle, sur le papier l'échelle est retirée et le gabarit tombe pile dans la feuille.
Aucune dimension intérieure n'est relative à la fenêtre : une seule suffirait à faire
mentir l'aperçu.

Il est rendu **une seconde fois**, par un portail React, dans `#impression` : un
conteneur frère de l'application, vide et masqué à l'écran. À l'impression, c'est
l'application entière qui disparaît et lui seul qui s'affiche. La recette classique
(`body * { visibility: hidden }` puis réafficher la zone) laisse les éléments masqués
occuper leur place : le nombre de pages dépendait alors de la hauteur de l'écran
sous-jacent. Ici, une page, toujours.

Le basculement n'a lieu **que** lorsqu'un document est réellement monté dans cette zone
 une classe posée sur `<html>` par `ZoneImpression`. Sans ce détail, la règle
s'appliquerait en permanence et un `Ctrl+P` n'importe où dans la plateforme sortirait une
page blanche, y compris sur la page publique de vérification, qu'on peut légitimement
vouloir imprimer comme preuve de consultation. L'orientation de la feuille est injectée
avec le document pour la même raison : une règle `@page` ne se laisse pas conditionner
par une classe.

« Télécharger en PDF » et « Imprimer » ouvrent la même boîte de dialogue : celle du
navigateur, et c'est délibéré : son moteur produit un texte vectoriel, net à tout
agrandissement. Les bibliothèques PDF disponibles côté navigateur passent par une capture
en pixels, plus lourde et floue à l'impression. Ce qui distingue les deux gestes est le
nom proposé pour le fichier : le titre du document est remplacé par la référence, de
sorte que le titulaire enregistre `VIZ-2026-EXCEL-AVA-000125.pdf` et non le titre du site.

## Architecture

Trois dépendances en tout : React, React-DOM, et `qrcode`. Aucune des deux
implémentations du registre n'en a : `node:http` et `node:sqlite` sont livrés avec Node,
et la version PHP n'utilise que PDO SQLite, OpenSSL et cURL.

Les deux lisent le **même** fichier de schéma. C'est délibéré : le langage au-dessus
compte moins que la définition de la vérité, et deux copies d'un schéma finissent
toujours par diverger.

```
api/                        le registre, en PHP : celui qui tourne en production
  index.php                 routes, cookies, limitation, masquage des erreurs
  config.exemple.php        le modèle de configuration ; config.php reste sur le serveur
  lib/Base.php              ouverture SQLite, pragmas, migrations
  lib/Comptes.php           mots de passe, sessions, liens à usage unique
  lib/Autorisations.php     qui a le droit de quoi : le remplaçant de RLS
  lib/Registre.php          les opérations du registre
  lib/Academie.php          cohortes et candidatures
  lib/Courrier.php          invitation, réinitialisation, avis, candidature
  lib/Chiffrement.php       AES-256-GCM des sauvegardes
  lib/Sauvegarde.php        copie à chaud, vérification, chiffrement, purge

server/                     le registre, en Node : pour un serveur dont on a la main
  index.mjs                 serveur HTTP, routes, fichiers statiques
  db.mjs                    ouverture SQLite, pragmas, migrations
  schema/001_socle.sql      le schéma, LA source, lue aussi par la version PHP
  comptes.mjs               mots de passe, sessions, liens à usage unique
  autorisations.mjs         qui a le droit de quoi : le remplaçant de RLS
  registre.mjs              les opérations du registre
  academie.mjs              cohortes et candidatures
  courrier.mjs              invitation, réinitialisation, avis

src/
  main.jsx                  point d'entrée
  App.jsx                   état applicatif, routage, persistance
  styles.css                interface
  certificat.css            le document seul : mesures fixes, règles d'impression
  lib/
    registre.js             le client : un fetch, un cookie
    auth.js                 connexion, session, mot de passe
    mot-de-passe.js         exigences, lecture du lien : partagé avec le serveur
    permissions.js          rôles et autorisations : partagé avec le serveur
    router.js               correspondance URL ↔ écran
    qr.js                   encodage QR
    certificates.js         effectiveStatus, nextReference, slugify
    dates.js, series.js
  data/
    api.js                  carnet d'adresses du registre
    seed.js, store.js       le registre de démonstration
  ui/
    Certificat.jsx          le document, son cadre à l'échelle, sa zone d'impression
    QRCode.jsx, VizdataLogo.jsx, primitives.jsx, AppShell.jsx
  modals/                   CertificateModal, ShareModal
  screens/
    public/                 accueil, vérification, profil public, connexion, mot de passe
    certified/              espace du titulaire
    admin/                  AdminSpace, actions.js, et les douze écrans
    academie/               page de vente

scripts/
  base.mjs                  administration de la base en ligne de commande
  sauvegarde.mjs            copie à chaud
  verifier-build.mjs        refuse de construire une démonstration par mégarde

supabase/                   l'ANCIENNE base : histoire, plus lue par personne
```

**Deux modules sont partagés entre le navigateur et le serveur** :
`src/lib/permissions.js` et `src/lib/mot-de-passe.js`. Ce n'est pas une commodité. Si le
serveur redéclarait sa propre liste d'autorisations, ou ses propres exigences de mot de
passe, l'écran finirait par cacher une action que le serveur accepte : ou, bien pire, par
en proposer une qu'il refuse. En les important, la divergence devient impossible.

**`screens/admin/actions.js` mérite une mention.** Chaque écran portait sa propre
bifurcation « si le registre distant est configuré, appeler l'API ; sinon, modifier
l'objet local ». Le même raisonnement était donc réécrit dans le formulaire de
certificat, dans les paramètres, dans l'import : avec des divergences inévitables. La
bifurcation est prise une fois : les écrans appellent toujours la même méthode et
ignorent d'où vient la donnée.

### Le registre

Un processus, un fichier, aucune dépendance. Il sert l'API **et** l'application
construite : même origine, donc pas de CORS à configurer, et un cookie de session qui
fonctionne sans rien de particulier.

Ce qui tient la sécurité, dans l'ordre :

1. La session est lue au début de chaque requête, depuis un cookie **HttpOnly**, donc    inaccessible au JavaScript de la page, ce qui met les sessions hors de portée d'une
   injection dans l'interface. **SameSite=Lax** ferme la falsification de requête
   inter-site sans qu'il faille gérer de jeton anti-CSRF.
2. Chaque route déclare si elle est publique. **Une route qui ne le déclare pas exige une
   session** : l'oubli penche du bon côté.
3. L'autorisation fine est demandée à `server/autorisations.mjs`, **qui lève au lieu de
   rendre un booléen**. Une fonction qui rend `false` se laisse oublier, `if (peut(…))`
   sans `else` est une faille muette. Une fonction qui lève interrompt la route.
4. Les erreurs inattendues ne sortent jamais telles quelles : elles sont journalisées
   côté serveur et répondues en « une erreur interne ». Un message de SQLite renseignerait
   sur le schéma.
5. La connexion et la demande de réinitialisation sont limitées en débit, par adresse
   **et** par client. Supabase s'en chargeait ; plus personne ne le fait à notre place.

### Modèle de données

Le schéma complet est décrit dans [docs/schema.md](docs/schema.md). Dix-sept tables, une
vue, sept déclencheurs.

Ce que la base refuse, aucune application ne peut le contourner : clés étrangères,
unicité, CHECK. Un statut hors liste, une référence en double, un certificat sans
titulaire, une révocation sans motif : refusés par le moteur.

Deux contraintes structurent le produit :

- `certificates.user_id` est en **RESTRICT** : on ne supprime pas un titulaire qui porte
  des certificats délivrés. C'est pourquoi l'application désactive un compte et ne le
  supprime jamais.
- `certificats_revocation_motivee` exige un motif pour toute révocation. Il s'affiche sur
  la page publique ; une révocation muette laisserait le titulaire et son employeur sans
  explication.

Le **registre local** reste comme mode de repli, utilisé par `npm run demo`. Il regroupe
les mêmes collections en un objet unique, conservé sous la clé `vizdata_certify_v2` du
`localStorage`. La clé porte un numéro de version, et ce numéro ne suffit pas : la forme
est vérifiée avant d'être acceptée, sinon un registre écrit par une version intermédiaire
ferait planter les écrans sur un `undefined`.

## Authentification

| | Démonstration | Registre |
| --- | --- | --- |
| Déclenché par | `npm run demo` | tout le reste |
| Mot de passe | non vérifié | scrypt, vérifié par le serveur |
| Session | perdue au rechargement | cookie HttpOnly, trente jours |
| Mot de passe oublié | écran complet, sans envoi réel | lien envoyé par courrier |
| Clé dans le paquet livré | aucune | **aucune** |

### Le navigateur ne détient plus aucun secret

C'est le changement le plus important, et il mérite d'être dit clairement.

Avec Supabase, le paquet livré au navigateur devait embarquer la clé publiable du projet.
Tout un garde-fou de construction existait pour éviter qu'une clé **secrète** s'y glisse
par mégarde : garde-fou ajouté après trois incidents réels : une clé absente, une clé
secrète livrée au navigateur, une clé tronquée au collage qui avait produit un
déploiement d'apparence saine sur lequel chaque vérification répondait « Invalid API
key ».

Ces trois incidents ne peuvent plus se produire. Les identifiants du registre ne quittent
pas le serveur, et la session est un cookie que la page ne peut même pas lire. Une
catégorie entière d'accidents a disparu avec la dépendance qui l'apportait, et avec
elle 217 ko de paquet.

### Les mots de passe

**scrypt**, livré avec Node, avec un sel par mot de passe et les paramètres de calcul
inscrits dans chaque empreinte, au format `scrypt$N$r$p$sel$empreinte`.

Trois décisions, et leurs raisons :

- **scrypt plutôt qu'un hachage rapide.** SHA-256 sur un mot de passe se casse à des
  milliards d'essais par seconde sur une carte graphique. scrypt est lent *et* gourmand
  en mémoire, ce qui rend l'attaque matérielle coûteuse.
- **Un sel par mot de passe.** Sans sel, deux personnes ayant le même mot de passe ont la
  même empreinte, et une table précalculée les casse toutes les deux d'un coup.
- **Les paramètres stockés avec l'empreinte.** Le coût devra être relevé dans quelques
  années ; en l'inscrivant dans chaque empreinte, les anciens mots de passe restent
  vérifiables pendant que les nouveaux coûtent plus cher. Sans cela, relever le coût
  invaliderait tous les comptes d'un coup.

La comparaison est à temps constant. Comparer deux empreintes avec `===` s'arrête au
premier octet différent, et la durée de la réponse renseigne alors sur le nombre d'octets
corrects. L'attaque est réelle, et l'éviter ne coûte rien.

Le calcul est effectué **même lorsque l'adresse est inconnue** : sans cela, une réponse
immédiate trahirait l'absence du compte.

### La réinitialisation du mot de passe

Elle ne fonctionnait pas, et pour une raison qui ne se voyait pas : l'e-mail partait, le
lien était valide, et le mot de passe restait l'ancien. L'adresse de retour visait la
page d'accueil, où aucun formulaire n'attendait. Le lien n'était pas en cause ; il n'y
avait pas d'arrivée.

| Étape | Où |
| --- | --- |
| Demander un lien | `/mot-de-passe-oublie` |
| Recevoir le lien | par courrier, vers `/nouveau-mot-de-passe?jeton=…` |
| Écrire le mot de passe | `/nouveau-mot-de-passe` |

Le mécanisme a maigri en même temps qu'il était réparé. Le lien porte un secret dans son
adresse, l'écran l'envoie au serveur avec le nouveau mot de passe, et **c'est le serveur
qui tranche** : valide, expiré, ou déjà utilisé. Plus de session à attendre, plus de
fragment à lire avant qu'un SDK ne l'efface, plus de quatre états dont trois venaient de
l'URL.

Trois garde-fous, parce qu'un lien de réinitialisation est une clé du compte :

- **Seule l'empreinte du jeton est stockée.** Le fichier de base est copié pour les
  sauvegardes ; s'il contenait des jetons utilisables, toute sauvegarde égarée donnerait
  accès aux comptes.
- **Le lien expire** : une heure pour une réinitialisation, sept jours pour une
  invitation, **et ne sert qu'une fois.** Sans cela, un lien qui traîne dans une boîte
  de réception reste une clé, des années durant.
- **Demander un second lien invalide le premier.** Deux liens valides en circulation,
  c'est une porte de plus, et la plus ancienne est celle qui a eu le plus de temps pour
  être lue par quelqu'un d'autre.

Le secret est **retiré de la barre d'adresse** dès qu'il est lu. Sinon il reste dans
l'historique du navigateur, sur une capture d'écran, et dans l'en-tête `Referer` de la
première requête vers un site tiers.

Changer de mot de passe depuis l'espace personnel exige **le mot de passe actuel**, et
**ferme les sessions des autres appareils** : c'est exactement ce qu'on fait quand on
soupçonne que le compte est compromis.

### Les courriers

Quatre messages : invitation, réinitialisation, certification attribuée, profil modifié.
Un seul gabarit, en tableaux : ce qui survit aux clients de messagerie, qui ignorent
flexbox et une bonne part du CSS.

Sans `RESEND_API_KEY`, l'envoi **n'échoue pas** : la notification est inscrite en attente,
l'écran Notifications la montre, et le lien est imprimé dans la console du serveur : ce
qui rend la chaîne d'invitation éprouvable sans compte tiers. Attribuer un certificat ne
doit pas échouer parce qu'un e-mail n'a pas pu partir : le certificat est délivré, et
déjà visible dans l'espace du titulaire.

Le destinataire est toujours lu en base, jamais pris dans la requête : sans cela,
l'adresse de l'API suffirait à envoyer du courrier au nom de VIZDATA à n'importe qui.

## L'académie CITIZEN DATA ANALYST

`/academie` est la page de vente de la formation Excel + Power BI : huit jours en
présentiel à Abidjan, en cohortes trimestrielles. Elle vit dans la même application que
le registre parce qu'elle partage sa marque, sa base, son déploiement et son
espace d'administration, mais c'est un second métier, et le code le dit : son contenu,
ses styles et son accès distant sont dans `src/academie/`, ses écrans dans
`src/screens/academie/`, et ses deux écrans d'administration forment leur propre groupe
dans la barre latérale.

### Ce que la page n'invente pas

Trois informations ne sont écrites nulle part dans le code : **les dates de session, le
nombre de places et les tarifs**. Elles vivent dans la table `cohortes`, modifiables
depuis `Administration → Cohortes`. Sans cohorte publiée, la page affiche le programme
sans date et invite à écrire sur WhatsApp : c'est préférable à une date inventée qu'il
faudrait ensuite démentir.

Il n'y a pas non plus de section « témoignages » : il n'y a pas de témoignage à publier.

### Le chemin d'une candidature

1. Le visiteur remplit le formulaire. `validerCandidature()` dit ce qui manque avant
   l'envoi ; les mêmes règles sont écrites en contraintes dans la base, parce que le
   navigateur ne fait jamais autorité.
2. `POST /api/academie/candidature` enregistre la ligne et rend une référence
   `CDA-2026-0001`. **Aucune route publique ne lit cette table** : une candidature porte
   un nom, un numéro de téléphone et une adresse e-mail. Les deux engagements du
   candidat sont exigés par la base autant que par le formulaire, et trois candidatures
   par adresse et par jour suffisent : au-delà, le formulaire public servirait à remplir
   la table.
3. Le même appel envoie **l'accusé de réception au candidat** et **l'alerte à VIZDATA**,
   puis rend le verdict de l'accusé.
4. La confirmation s'affiche avec la référence, et dit si l'accusé est parti.

L'ordre compte. Les courriers partent **après** l'enregistrement, et leur échec ne fait
jamais échouer la candidature : l'administration la voit dans tous les cas. L'inverse
ferait dépendre une inscription d'un service d'envoi.

### Les courriers partent du serveur, et c'est tout l'intérêt

Un envoi demande une clé d'API, et une clé d'API dans un paquet navigateur est une clé
publique. Le registre compose donc les deux messages lui-même, dans la requête qui
enregistre la candidature. Il y avait auparavant un appel séparé depuis le navigateur
vers une fonction de notification : au-delà de la clé, cette séparation laissait un cas
gênant : candidature enregistrée, second appel perdu, candidat sans accusé et VIZDATA
sans alerte. Un seul aller-retour supprime ce cas.

Seul le booléen « parti / pas parti » revient au navigateur. La raison d'un échec parle
du fournisseur et de la configuration : elle reste dans la table `notifications`, que
l'administration consulte.

### Mise en service

1. **Rien à migrer** : les tables `cohortes` et `candidatures` font partie du socle,
   appliqué au premier démarrage du serveur.
2. **Créer la première cohorte** dans `Administration → Cohortes`, puis la publier.
   Sans cohorte publiée, la page affiche le programme sans date : c'est préférable à une
   date inventée qu'il faudrait ensuite démentir.
3. **Les e-mails** (facultatif) : `RESEND_API_KEY` sur le serveur. Aucune variable du
   registre ne porte le préfixe `VITE_`, donc aucune n'entre dans le paquet livré au
   navigateur.
4. **Les photographies** : déposer les portraits officiels dans `public/academie/`
   voir [docs/visuels-academie.md](docs/visuels-academie.md). En leur absence, la page
   affiche les initiales sur un fond de marque : jamais une image cassée, jamais un
   portrait de banque d'images qui ferait passer un inconnu pour un formateur.

### Les couleurs du graphique ne sont pas celles du logo

L'aperçu de tableau de bord du hero est dessiné en SVG. Ses marques de données
utilisent `#1578A6`, `#D9700F` et `#7A4C9E`, et non le bleu, l'orange et le violet
exacts du logo : côte à côte, le bleu et le violet de la charte sont indiscernables pour
une vision deutéranope (ΔE 3,5 : mesuré, pas estimé). Le trio retenu passe les contrôles
de séparation, de bande de clarté et de contraste sur fond blanc. Le logo, lui, reste
intact : il n'est ni redessiné ni recoloré.

## Adresses

| Chemin | Écran |
| --- | --- |
| `/` | accueil, recherche par référence |
| `/verifier` | saisie d'une référence |
| `/verifier/{jeton}` | verdict de vérification, **c'est l'adresse imprimée dans le QR code** |
| `/u/{identifiant}` | profil public d'un certifié |
| `/a-propos` | présentation du registre |
| `/academie` | page de vente de la formation CITIZEN DATA ANALYST |
| `/connexion` | connexion |
| `/mot-de-passe-oublie` | demande d'un lien de réinitialisation |
| `/nouveau-mot-de-passe` | **arrivée des liens d'invitation et de réinitialisation** |
| `/espace` | espace certifié |
| `/administration` | espace d'administration |

`/nouveau-mot-de-passe` figure dans des messages déjà envoyés : la changer casserait les
liens en circulation. Un test la fige.

Tout autre chemin affiche une page « introuvable » sobre, qui ne dit rien de ce qui
existe ou non à cette adresse.

Une vérification faite par saisie de référence redirige vers `/verifier/{jeton}` : le
lien obtenu est donc partageable tel quel. Le certificat déjà résolu voyage avec la
route, de sorte que la page ne redemande pas ce qu'elle vient d'obtenir : sans quoi une
seconde consultation serait comptée.

### L'API

| Méthode | Chemin | Accès |
| --- | --- | --- |
| GET | `/api/verifier/{jeton}` | public |
| GET | `/api/verifier?reference=` | public |
| GET | `/api/profil/{identifiant}` | public |
| POST | `/api/partage` | public |
| POST · GET · DELETE | `/api/session` | public |
| POST | `/api/mot-de-passe/oubli` · `/definir` | public |
| POST | `/api/mot-de-passe/changer` | session |
| GET | `/api/mes-certificats` | session |
| PATCH | `/api/moi` | session |
| GET | `/api/registre` | administration |
| POST | `/api/titulaires` | `creer_titulaires` |
| PATCH | `/api/comptes/{id}` | selon le champ écrit |
| POST · PATCH | `/api/certificats` | `attribuer_certificats` |
| POST | `/api/certificats/{id}/statut` | `revoquer_certificats` |
| POST · PATCH | `/api/domaines` · `/api/programmes` | administrateur |
| GET | `/api/academie/cohorte` | public |
| POST | `/api/academie/candidature` | public |
| le reste de `/api/academie/*` | | administration |

Une méthode inadaptée répond **405** et nomme la bonne, plutôt que de parler d'adresse
inconnue : la table des routes n'est pas un secret, elle est dans le paquet servi au
navigateur.

## Tests

```bash
npm test
```

**220 tests**, exécutés par le lanceur intégré de Node : aucune dépendance de test dans
le projet.

| Ce qui est couvert | Pourquoi |
| --- | --- |
| **Autorisations** (31) | le remplaçant de RLS. Si ce module se trompe, rien ne rattrape l'erreur. |
| **Serveur, de bout en bout** (35) | un vrai processus, une vraie base, de vraies requêtes avec cookies |
| **Comptes** (25) | mots de passe, sessions, liens à usage unique |
| **Schéma** (14) | ce que la base refuse, quoi que fasse le code au-dessus |
| **Catalogue et démonstration** | programmes rattachés, codes uniques, aucun score résiduel |
| **Routage** | aller-retour adresse ↔ écran ; les deux adresses de la chaîne de mot de passe |
| **Mot de passe** | exigences, lecture du lien, effacement du secret de l'adresse |
| **QR codes** | structure **et** décodage réel par jsQR |
| **Académie** | validation, calcul des tarifs, export CSV |

Trois remarques sur ce choix de couverture.

**Ces tests couvrent l'implémentation Node, pas la PHP.** Il n'y a pas d'interpréteur
PHP sur la machine de développement : `npm run php` ne contrôle que la surface des
fichiers (délimiteurs, chaînes, absence de `?>` final) et le dit. Ce qui tient les deux
implémentations ensemble, c'est le **schéma partagé** : les tests de schéma (14) valent
pour les deux, puisque c'est la base qui refuse. Le reste du registre PHP se vérifie sur
le serveur, en traversant l'application : connexion, délivrance, vérification publique,
sauvegarde, restauration. C'est une couverture plus faible, et il faut le savoir plutôt
que de l'ignorer.

**Les tests d'autorisation sont ce que la migration fait gagner.** Les politiques RLS de
Postgres étaient plus sûres par construction (elles vivaient dans la base) mais elles
n'ont jamais pu être éprouvées, faute de projet vivant. L'autorisation est passée d'un
endroit sûr et invérifiable à un endroit ordinaire et entièrement vérifié. Les tests
unitaires disent que la serrure fonctionne ; les tests d'intégration disent qu'elle est
posée sur la porte.

**Les QR codes sont testés deux fois.** Un encodeur écrit à la main passait jadis tous
les contrôles de structure sans produire un seul code lisible par un téléphone. La
structure ne prouve pas la lisibilité.

## En production

Tout est dans **[docs/deploiement.md](docs/deploiement.md)** : nginx, systemd,
sauvegardes, mise à jour, et ce qui peut mal se passer.

En résumé, sur `certify.vizdata.ci` : **PHP 8.4 et un fichier SQLite** au-dessus du
dossier web. `npm run paquet` produit l'archive, le gestionnaire de fichiers du panneau la
décompresse, et une tâche planifiée sauvegarde chaque nuit. Pas de base à administrer, pas
de service tiers, pas de clé dans le paquet livré au navigateur.

La voie Node : un service derrière nginx, un fichier dans `/var/lib/vizdata-certify/`
reste décrite dans le même document, pour un serveur dont on a la main.

### Déploiement par Git

Déposer une archive à la main suppose d'être devant la bonne machine, connecté au
panneau, et de ne pas se tromper de domaine. Plesk sait tirer une branche tout seul.

```bash
npm run production     # construit, puis réécrit la branche production
git push origin production
```

La branche `production` ne contient **que le résultat** : l'interface construite à la
racine, le registre PHP dans `api/`. Pas de JSX, pas de `vite.config.js`, rien que
l'hébergement ne sache lire. Elle est réécrite par `scripts/branche-production.mjs` et
ne se modifie jamais à la main.

Elle apporte au passage ce qui manquait le plus : **`git log production` dit ce qui est
en ligne**, et chaque commit nomme celui de `main` dont il sort. Jusqu'ici la seule
façon de le savoir était de télécharger les fichiers du serveur et de les comparer.

Le script refuse de travailler sur un arbre modifié. Une branche de production
fabriquée à partir de fichiers non commités ne correspondrait à aucun état du dépôt,
et le jour où il faut comprendre ce qui tourne, la trace mènerait à un commit qui ne
contient pas ce qui a été déployé.

**Mise en place, une seule fois, dans Plesk.** Domaine `certify.vizdata.ci`, puis Git :
dépôt distant `https://github.com/VizDataCI/vizdata-certify.git`, branche `production`,
dossier cible `httpdocs`. Le dépôt étant privé, Plesk affiche une clé publique SSH :
elle se colle dans GitHub, *Settings, Deploy keys*, en lecture seule, et l'adresse du
dépôt passe alors en SSH.

**Trois points à vérifier après la toute première mise en ligne**, parce qu'ils ne se
voient pas tant qu'ils ne sont pas cassés :

| À vérifier | Pourquoi |
|---|---|
| `api/config.php` est toujours là | Il n'est dans **aucune** branche, et pour cause : il porte la clé de chiffrement des sauvegardes. Un `git reset --hard` ne supprime pas les fichiers non suivis, donc il survit, mais cela se constate plutôt que cela ne se suppose. S'il disparaissait, le registre perdrait le chemin de la base et ses clés. |
| `certify.vizdata.ci/.git/config` répond **404** | Un `.git` servi par le web, c'est l'historique entier téléchargeable, donc toute clé qui y aurait séjourné un jour. Le `.htaccess` bloque `/.git` et `/.env`, mais la règle demande `mod_alias`, et un module absent ne se signale pas. |
| Le site répond, et `/api/sante` rend du JSON | La vérification habituelle. |

La base, elle, ne risque rien : elle vit dans `certify-registre/`, **au-dessus** de
`httpdocs`, hors d'atteinte d'un déploiement comme d'un visiteur.

La voie de l'archive reste disponible et décrite ci-dessus. Elle dépanne le jour où
GitHub est injoignable, ou pour un déploiement depuis une machine qui n'a pas le dépôt.

### Sauvegardes

**C'est la partie que personne ne fait, et c'est celle qui a coûté le registre
précédent.**

```bash
npm run sauvegarde
```

Quatre choses en une commande, et chacune répond à une façon précise de perdre le
registre.

| | Ce que ça évite |
| --- | --- |
| **À chaud** | `cp certify.db` pendant une écriture produit un fichier incohérent, SQLite tient une partie des données dans un journal séparé, et la copie peut attraper l'un sans l'autre. On s'en aperçoit le jour de la restauration. |
| **Vérifiée** | une sauvegarde jamais relue est un espoir. Celle-ci est rouverte, contrôlée page par page, et l'on s'assure qu'elle contient bien les tables du registre. En cas de doute, **rien n'est laissé en place** : un fichier inexploitable rassure à tort. |
| **Chiffrée** | elle contient noms, téléphones et empreintes de mots de passe. AES-256-GCM, clé dérivée par scrypt, paramètres inscrits dans le fichier pour qu'il reste lisible dans cinq ans. |
| **Expédiée** | l'étape « pense à la copier ailleurs » ne se fait jamais. Elle est confiée à une commande que le script lance lui-même : scp, rclone, ou un `git push` vers un dépôt privé. |

Le script **refuse d'expédier une sauvegarde non chiffrée** : régler un problème de
disponibilité en créant une fuite serait un mauvais échange.

Et l'autre moitié, celle que personne n'écrit :

```bash
npm run restaurer -- <fichier>
```

Sans `--oui`, elle ne touche à rien : elle déchiffre, vérifie, et affiche ce que contient
la sauvegarde **en regard de ce que contient la base actuelle**. On voit ce qu'on
s'apprête à remplacer. Avec `--oui`, la base en place est d'abord mise de côté : restaurer
la mauvaise sauvegarde est une erreur banale, la rendre irréversible serait une faute.

Tout cela est éprouvé par des tests qui détruisent réellement une base et la restaurent,
puis vérifient qu'on peut encore s'y connecter. Voir
[docs/deploiement.md](docs/deploiement.md) pour la mise en place.

### En-têtes de sécurité

Le registre pose `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy` et `Permissions-Policy` sur chaque réponse. Le refus d'être affiché
dans un cadre n'est pas décoratif : sans lui, un site tiers pourrait incruster une page
de vérification authentique à côté d'un faux nom et faire passer le tout pour une preuve.

Une politique de contenu (`Content-Security-Policy`) manque encore. Elle demande d'être
juste du premier coup, sous peine de casser l'application en production. Le squelette à
éprouver :

```
default-src 'self';
connect-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com;
img-src 'self' data:;
frame-ancestors 'none';
base-uri 'self'
```

`connect-src 'self'` suffit désormais : plus aucun domaine tiers n'est contacté.

### Aperçus de partage

`index.html` porte des balises Open Graph **statiques** : un lien vers un certificat
précis affiche la carte générique du registre, pas le nom du titulaire. Les robots de
LinkedIn et WhatsApp n'exécutent pas le JavaScript.

C'est désormais réparable sans changer de nature : le serveur rend déjà les pages. Il
suffirait qu'il reconnaisse `/verifier/{jeton}`, appelle `verifierParJeton` et injecte
les balises avant d'envoyer `index.html`. Ce n'est pas fait.

## L'ancienne base

`supabase/` est conservé tel quel : six migrations Postgres, deux fonctions Edge, et le
socle reconstruit en novembre 2026 après la disparition du projet. **Rien dans le code ne
les lit plus.** C'est l'histoire de la base précédente, gardée parce qu'un registre ne
jette pas ses archives, et parce que les deux schémas se correspondent table pour table,
si des données devaient un jour en être reprises.

## Limites connues

- **Les notifications métier demandent un fournisseur d'envoi.** Sans `RESEND_API_KEY`,
  elles sont inscrites en attente et visibles dans l'écran Notifications ; rien n'est
  envoyé, et rien ne prétend l'avoir été. Les liens d'invitation restent lisibles dans
  le journal du serveur.
- **Un seul processus.** SQLite n'aime pas qu'on écrive depuis plusieurs processus à la
  fois, et un seul suffit largement à cette charge. Si le trafic l'imposait un jour,
  c'est le moment où la question du moteur se reposerait.
- **Les aperçus de partage sont génériques.** Voir plus haut.
- **Le PDF n'est pas un fichier produit par le serveur.** « Télécharger en PDF » ouvre la
  boîte d'impression du navigateur. C'est un choix, pas un manque : le moteur
  d'impression produit un texte vectoriel, là où les bibliothèques PDF côté navigateur
  passent par une capture en pixels.
- **Les onglets internes ne sont pas dans l'URL.** `/administration` et `/espace` ouvrent
  toujours leur premier onglet.
- **Authentification factice en démonstration.** À ne jamais déployer dans cet état : le
  garde-fou de construction le refuse.
- **La page de vente charge toute l'application.** Un visiteur de `/academie` télécharge
  aussi les écrans d'administration. Un découpage par route (`React.lazy`) en retirerait
  une part ; il n'a pas été fait pour ne pas toucher au routage à cette occasion.
- **Les composants ne sont pas testés automatiquement.** Les enchaînements d'écrans ont
  été éprouvés à la main, dans un navigateur, contre le vrai serveur et la vraie base
  invitation du premier administrateur, création d'une certifiée, attribution,
  vérification publique, document A4. Ce n'est pas une suite de tests.
