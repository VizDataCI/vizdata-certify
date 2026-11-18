# Mettre VIZDATA CERTIFY en production

Il y a **deux déploiements possibles**, et ce qui tranche n'est pas une préférence
d'architecture : c'est ce que l'hébergement sait exécuter.

| | Voie 1 — PHP | Voie 2 — Node |
| --- | --- | --- |
| Hébergement | mutualisé, panneau seul | serveur à soi, accès SSH |
| Ce qui tourne | PHP 8.4 + SQLite | un service Node + SQLite |
| Installation | déposer une archive | une commande |
| **Celle de VIZDATA** | **oui** | — |

Les deux servent le **même schéma** — `server/schema/001_socle.sql`, du SQLite standard —
et exposent les **mêmes routes** — à deux près : la voie PHP ajoute
`POST /api/sauvegarde` et `GET /api/sauvegardes`, pour sauvegarder sans ligne de
commande. Sur la voie Node, c'est `npm run sauvegarde` et une tâche cron, ce qui vaut
mieux. L'interface ne sait pas laquelle elle a en face ; la carte « Sauvegardes » de
l'administration n'apparaît que là où ces deux routes existent.

## Pourquoi VIZDATA est sur la voie PHP

`certify.vizdata.ci` est hébergé sur un mutualisé Plesk (`web17.vename.ci`). Trois faits,
vérifiés sur la machine plutôt que lus dans une documentation :

- **pas d'extension Node.js** dans le panneau ;
- **accès SSH refusé** — « Forbidden » sur ce compte ;
- **PHP 8.4.27** en fpm-fcgi, avec `pdo_sqlite`, SQLite 3.40.1, `openssl`, `curl`, et un
  dossier **inscriptible hors du dossier web**.

Un serveur Node avait été écrit et éprouvé — il reste dans `server/`, utilisable sur la
voie 2. Il ne peut pas tourner là. **Un registre qui fonctionne sur l'hébergement qu'on a
vaut mieux qu'un registre parfait sur une machine qu'on n'a pas.**

```
Apache (Plesk)  ──┐
                  ├── certify.vizdata.ci
PHP-FPM 8.4     ──┘   ├── /api/*     api/index.php      le registre
                      └── le reste   index.html         l'application construite
                                       │
                                       └── ../certify-registre/certify.db
                                           ../certify-registre/sauvegardes/
```

La base est **au-dessus** du dossier web. Ce n'est pas un détail d'organisation : servie
par erreur, elle livrerait d'un coup toutes les adresses, tous les téléphones et toutes
les empreintes de mots de passe du registre.

## Voie 1 — PHP sur un hébergement mutualisé

Aucune dépendance à installer sur le serveur : ni composer, ni `node_modules`. Le registre
n'utilise que ce que PHP a déjà.

### 1. Fabriquer le paquet

```powershell
npm run paquet
```

Produit `paquet/vizdata-certify.zip` — environ 190 ko. La commande enchaîne trois choses,
et **s'arrête à la première qui ne va pas** :

1. `npm run php` — contrôle de surface des fichiers PHP : délimiteurs équilibrés, chaînes
   fermées, aucun `?>` final. Il n'y a pas d'interpréteur PHP sur la machine de
   développement, donc pas de `php -l` ; ce contrôle attrape la classe d'erreurs la plus
   fréquente quand on écrit sans interpréteur, et il ne prétend pas faire plus.
2. `npm run build` — l'interface, dont le `.htaccess`.
3. l'archive, **relue** après écriture : noms à barres obliques, fichiers indispensables
   présents, `.htaccess` compris.

Ce dernier point vient d'une panne réelle : `Compress-Archive` écrit des **antislashes**
dans les noms. Décompressée sur le serveur — Linux —, l'archive donne des fichiers nommés
`api\lib\Base.php` à la racine, le site répond 404 partout, et rien n'indique pourquoi.
L'archive avait « réussi ». Le paquet écrit donc son zip lui-même, et le relit.

Le paquet ne contient **ni base, ni sauvegarde, ni clé**. Une archive se copie, se
transfère et s'oublie dans un dossier de téléchargement : elle ne doit porter aucune
donnée personnelle.

### 2. Déposer et décompresser

Dans **Gestionnaire de fichiers**, ouvrez le dossier du domaine — là où se trouvent
`index.html` et `assets/`. Téléversez l'archive, puis « Extraire les fichiers » en
autorisant le remplacement.

Après extraction, la racine contient :

```
index.html   assets/   .htaccess   api/   favicon.svg   robots.txt   …
```

Supprimez ensuite l'archive téléversée : laissée là, elle est **téléchargeable par
n'importe qui**.

### 3. Le dossier de la base, hors du dossier web

Remontez d'un niveau — au-dessus de `certify.vizdata.ci` — et créez `certify-registre`.
C'est tout : les sous-dossiers et le fichier de base sont créés au premier appel.

### 4. `config.php`

Copiez `api/config.exemple.php` en `api/config.php` et renseignez :

| Clé | Ce qu'on y met |
| --- | --- |
| `CHEMIN_BASE` | `…/certify-registre/certify.db` |
| `DOSSIER_SAUVEGARDES` | `…/certify-registre/sauvegardes` |
| `SITE_URL` | `https://certify.vizdata.ci`, sans barre finale |
| `SAUVEGARDE_CLE` | une longue valeur aléatoire — **copie à conserver ailleurs** |
| `JETON_SAUVEGARDE` | pour la tâche planifiée de l'étape 7 |
| `JETON_INSTALLATION` | le temps de l'étape 5, puis vidé |
| `RESEND_API_KEY` | facultatif ; sans lui, les courriers partent par `mail()` |

Pour produire une valeur aléatoire, sans rien installer :

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

**`config.php` n'est pas dans le dépôt, et ne doit jamais y entrer.** Il porte la clé de
chiffrement des sauvegardes. Perdre cette clé, c'est perdre toutes les sauvegardes déjà
faites : elles deviennent des octets aléatoires, ce qui est exactement ce qu'on demande au
chiffrement, et c'est sans appel.

### 5. Le premier administrateur

C'est le seul compte que l'application ne peut pas créer elle-même : il n'y a personne
pour l'inviter, et il n'y a pas de ligne de commande.

```powershell
curl.exe -X POST https://certify.vizdata.ci/api/installation -H "Content-Type: application/json" -d '{\"jeton\":\"VOTRE_JETON\",\"email\":\"direction@vizdata.ci\",\"prenom\":\"Fabrice\",\"nom\":\"BOH\"}'
```

La réponse contient un **lien d'activation** : suivez-le pour choisir votre mot de passe.
Aucun mot de passe permanent n'est produit, ni envoyé en clair — jamais, nulle part dans
cette application.

Le point d'installation refuse dès qu'un compte existe. **Videz quand même
`JETON_INSTALLATION`** : une porte fermée vaut mieux qu'une porte qui se verrouille toute
seule.

### 6. Vérifier

```
https://certify.vizdata.ci/api/sante
```

Réponse attendue : `{"etat":"ok","registre":"sqlite","moteur":"php"}`

Puis, dans l'application : se connecter, créer un domaine, un programme, un titulaire, et
délivrer une certification d'essai. **Ouvrir ensuite l'adresse publique de vérification**
et constater que la page affiche le certificat sans date d'expiration ni score.

Une installation qu'on n'a pas traversée de bout en bout n'est pas une installation
vérifiée : `/api/sante` dit seulement que PHP répond et que la base s'ouvre.

### 7. Les sauvegardes

**Outils & paramètres → Tâches planifiées → Ajouter une tâche**, type « Récupérer une
URL », tous les jours à 3 h :

```
https://certify.vizdata.ci/api/sauvegarde?jeton=VOTRE_JETON_SAUVEGARDE
```

La copie est prise à chaud par `VACUUM INTO` — jamais par une copie de fichier, qui
donnerait une base à moitié écrite —, **vérifiée** par `pragma integrity_check`, chiffrée
en AES-256-GCM, et déposée dans `certify-registre/sauvegardes`. Les trente dernières sont
gardées.

**Téléchargez-en une de temps en temps.** Une sauvegarde qui ne quitte jamais le serveur
protège des fausses manœuvres, pas d'une panne de disque ni de la perte du compte.

Le même bouton existe dans **Administration → Paramètres**, pour une sauvegarde immédiate
avant une manipulation délicate.

### Trois choses à ne jamais faire sur cet hébergement

| | Pourquoi |
| --- | --- |
| déposer la base dans le dossier web | elle devient téléchargeable, et avec elle tout le registre |
| laisser le zip sur le serveur | il contient l'application, pas des secrets, mais il n'a rien à y faire |
| mettre `config.php` dans le dépôt | la clé de chiffrement partirait sur GitHub |

### Mettre à jour

`npm run paquet`, déposer, extraire en remplaçant. `config.php` n'est pas dans l'archive :
il survit. Les migrations du schéma s'appliquent au premier appel suivant, dans une
transaction — une migration à moitié appliquée serait la pire des situations, elle ne se
rejoue pas et elle ne fonctionne pas.

Prenez une sauvegarde **avant**, par le bouton de l'administration.

### Ce qui peut mal se passer, voie PHP

| Symptôme | Cause habituelle |
| --- | --- |
| `/api/sante` renvoie du **HTML** | la règle `/api` du `.htaccess` n'est pas appliquée : `mod_rewrite` inactif pour ce domaine, ou `.htaccess` absent — c'est un fichier caché, le gestionnaire de fichiers le masque parfois |
| « Une erreur interne est survenue » | passez `DEBOGUAGE` à `true` dans `config.php`, relancez l'appel, **remettez-le à `false`** |
| erreur sur la base au premier appel | `certify-registre` n'existe pas, ou n'est pas inscriptible par PHP |
| `/verifier/{jeton}` répond 404 au rechargement | le repli SPA du `.htaccess` ne s'applique pas — même cause que la première ligne |
| la session ne tient pas | le site est atteint tantôt en HTTP, tantôt en HTTPS : le cookie `Secure` n'est renvoyé que sur l'une des deux. Forcez HTTPS dans Plesk |
| les courriers ne partent pas | sans `RESEND_API_KEY`, `mail()` ne rend aucun verdict. L'écran **Notifications** montre ce qui n'est pas parti, avec le lien d'invitation en clair pour le transmettre à la main |
| « database is locked » | deux écritures simultanées au-delà des 5 secondes d'attente ; sur ce volume, cela signale plutôt une sauvegarde lancée en boucle |

## Deuxième voie — Node sur un serveur à soi

Tout ce qui suit concerne un serveur dont on a la main : un VPS, une machine Scaleway, un
Plesk avec accès SSH. Rien n'y est nécessaire pour `certify.vizdata.ci`, qui est sur la
voie 1.

La plateforme tient alors en **un processus Node et un fichier**.

```
nginx  :443  ──┐
               ├── certify.vizdata.ci
Node   :4321 ──┘   ├── /api/*        le registre
                   └── le reste      l'application construite
                        │
                        └── /var/lib/vizdata-certify/certify.db
```

### En une commande

Sur le serveur, en SSH :

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/VizDataCI/vizdata-certify/main/scripts/installer.sh)"
```

Ou, si le code est déjà là :

```bash
sudo bash /opt/vizdata-certify/scripts/installer.sh
```

Le script installe la première fois et met à jour les suivantes. Il est **conçu pour
être relancé** : trois choses ne sont jamais écrasées, parce qu'une réexécution
malheureuse coûterait le registre.

| Jamais écrasé | Pourquoi |
| --- | --- |
| la base | évidemment |
| la clé de chiffrement | la régénérer rendrait illisibles **toutes** les sauvegardes déjà faites, irréversiblement |
| la configuration nginx du domaine | elle sert peut-être déjà autre chose |

Il prend une sauvegarde **avant** toute mise à jour, refuse de mettre en ligne si les
tests échouent, et s'arrête net si Node est trop ancien.

Le reste de ce document explique ce qu'il fait, pour le jour où il faudra le faire à la
main ou comprendre ce qui ne va pas.

### Sur un Plesk dont on a l'accès SSH

Si le panneau donne SSH et permet d'installer Node à l'échelle du serveur, le registre
Node peut tourner derrière nginx de Plesk. Deux choses décident de tout.

**La version de Node du panneau ne compte pas.** L'extension Node.js de Plesk gère ses
propres applications avec sa propre version ; le registre, lui, tourne en service système
et demande un **Node 22 ou plus installé à l'échelle du serveur** — `node:sqlite` en
dépend, et c'est la seule exigence non contournable de cette voie.
```bash
node --version    # doit répondre v22 ou plus
```

Si c'est en dessous :

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### Faire passer le domaine par le registre

Plesk gère lui-même la configuration nginx du domaine : on n'édite pas les fichiers à la
main, ils seraient réécrits. On passe par le panneau.

**Sites web & domaines → certify.vizdata.ci → Apache & nginx → Directives nginx
additionnelles :**

```nginx
location / {
    proxy_pass         http://127.0.0.1:4321;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
}
```

Puis **décochez « Servir les fichiers statiques directement par nginx »**. C'est le
réglage qu'on oublie : laissé coché, nginx cherche un fichier pour `/verifier/{jeton}`,
n'en trouve pas, et répond 404 — précisément sur l'adresse imprimée dans les QR codes.

`X-Forwarded-For` n'est pas décoratif : c'est ce que le registre utilise pour limiter les
tentatives de connexion. Sans cet en-tête, toutes les requêtes semblent venir de nginx, et
la limitation s'appliquerait à tout le monde d'un coup.

Le certificat TLS reste géré par Plesk (Let's Encrypt). Le registre n'écoute que sur la
boucle locale et ne voit jamais le trafic extérieur directement.

### Ce qu'il faut sur le serveur

- **Node 22 ou plus.** `node:sqlite` en dépend, et c'est la seule exigence du projet.
  Vérifiez : `node --version`.
- nginx, déjà en place.
- Un utilisateur système dédié. Le service ne doit pas tourner en `root` : une faille
  dans le serveur donnerait alors la machine entière.

```bash
sudo adduser --system --group --home /var/lib/vizdata-certify vizdata
```

### 1. Déposer le code

```bash
sudo -u vizdata git clone https://github.com/VizDataCI/vizdata-certify.git /opt/vizdata-certify
cd /opt/vizdata-certify
sudo -u vizdata npm ci
sudo -u vizdata npm run build
```

`npm ci` plutôt que `npm install` : il installe exactement ce que décrit
`package-lock.json`, sans jamais résoudre une version différente de celle qui a été
éprouvée.

### 2. Créer la base et le premier administrateur

```bash
sudo -u vizdata env VIZDATA_DB=/var/lib/vizdata-certify/certify.db \
  npm run base -- init
```

```bash
sudo -u vizdata env VIZDATA_DB=/var/lib/vizdata-certify/certify.db \
  VIZDATA_SITE_URL=https://certify.vizdata.ci \
  npm run base -- admin direction@vizdata.ci Fabrice BOH
```

La commande imprime un lien valable sept jours et une seule fois. **Aucun mot de passe
n'est produit** : la personne choisit le sien en suivant le lien. Transmettez-le par un
canal sûr — il ouvre le compte.

C'est le seul compte que l'application ne peut pas créer elle-même : il n'y a personne
pour l'inviter.

### 3. Le service

`/etc/systemd/system/vizdata-certify.service` :

```ini
[Unit]
Description=VIZDATA CERTIFY — registre des certifications
After=network.target

[Service]
Type=simple
User=vizdata
Group=vizdata
WorkingDirectory=/opt/vizdata-certify
ExecStart=/usr/bin/node server/index.mjs
Restart=always
RestartSec=5

Environment=NODE_ENV=production
Environment=PORT=4321
Environment=VIZDATA_DB=/var/lib/vizdata-certify/certify.db
Environment=VIZDATA_SITE_URL=https://certify.vizdata.ci
# Facultatif — sans cela, les courriers ne partent pas et sont tracés « en attente ».
# Environment=RESEND_API_KEY=re_...
# Environment=NOTIFY_FROM=VIZDATA CERTIFY <certify@vizdata.ci>

# Le service n'a besoin d'écrire que dans le dossier de la base.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/vizdata-certify

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vizdata-certify
sudo systemctl status vizdata-certify
```

Les quatre directives de durcissement ne sont pas décoratives : `ProtectSystem=strict`
rend tout le système de fichiers en lecture seule sauf `ReadWritePaths`. Une faille dans
le serveur ne peut donc rien écrire ailleurs que dans le dossier de la base.

### 4. nginx

```nginx
server {
    listen 443 ssl http2;
    server_name certify.vizdata.ci;

    ssl_certificate     /etc/letsencrypt/live/certify.vizdata.ci/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/certify.vizdata.ci/privkey.pem;

    # Tout passe au registre : il sert l'API et l'application, et pose lui-même
    # le repli SPA. Partager le travail entre nginx et Node ferait deux endroits
    # où le repli peut être oublié — et c'est /verifier/{jeton}, l'adresse
    # imprimée sur les certificats, qui répondrait 404.
    location / {
        proxy_pass         http://127.0.0.1:4321;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name certify.vizdata.ci;
    return 301 https://$host$request_uri;
}
```

`X-Forwarded-For` compte : c'est ce que le registre utilise pour limiter les tentatives
de connexion. Sans cet en-tête, toutes les requêtes semblent venir de nginx, et la
limitation s'appliquerait à tout le monde d'un coup.

Les en-têtes de sécurité sont posés par le registre lui-même — inutile de les répéter
ici, et les répéter différemment serait pire.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 5. Les sauvegardes

**C'est la partie que personne ne fait, et c'est celle qui a coûté le registre
précédent.**

```bash
npm run sauvegarde
```

Quatre choses en une commande, et chacune répond à une façon précise de perdre le
registre.

| Étape | Ce qu'elle évite |
| --- | --- |
| **À chaud** | `cp certify.db` pendant une écriture produit un fichier incohérent — on s'en aperçoit le jour de la restauration |
| **Vérifiée** | une sauvegarde jamais relue est un espoir ; celle-ci est rouverte et contrôlée page par page |
| **Chiffrée** | elle contient noms, téléphones et empreintes de mots de passe, et elle doit quitter le serveur |
| **Expédiée** | l'étape « pense à la copier ailleurs » ne se fait jamais |

Si la vérification échoue, **rien n'est laissé en place** : un fichier inexploitable
rassurerait à tort.

#### La clé de chiffrement

```bash
openssl rand -base64 32
```

Mettez-la dans `/etc/vizdata-certify.env`, lisible du seul utilisateur `vizdata` :

```bash
printf 'VIZDATA_SAUVEGARDE_CLE=%s\n' "$(openssl rand -base64 32)" | sudo tee /etc/vizdata-certify.env
sudo chown vizdata:vizdata /etc/vizdata-certify.env
sudo chmod 600 /etc/vizdata-certify.env
```

**Conservez-en une copie ailleurs que sur ce serveur, et ailleurs que dans ce dépôt.**
Un gestionnaire de mots de passe, un coffre, une enveloppe. Sans elle, les sauvegardes
sont des octets aléatoires — c'est exactement ce qu'on demande au chiffrement, et c'est
sans appel.

#### L'expédition hors du serveur

`VIZDATA_SAUVEGARDE_DISTANTE` reçoit une commande, où `{fichier}` est remplacé par le
chemin de la sauvegarde. N'importe quel outil déjà présent fait l'affaire :

```bash
# vers un autre serveur
VIZDATA_SAUVEGARDE_DISTANTE='scp {fichier} sauvegardes@autre-machine:/sauvegardes/vizdata/'

# vers un espace de stockage compatible S3 (Scaleway, par exemple)
VIZDATA_SAUVEGARDE_DISTANTE='rclone copy {fichier} scaleway:vizdata-sauvegardes/'
```

**Le script REFUSE d'expédier une sauvegarde non chiffrée.** Régler un problème de
disponibilité en créant une fuite serait un mauvais échange.

#### Un dépôt GitHub privé comme destination

C'est une destination légitime — gratuite, hors du serveur, versionnée — **à condition
que les sauvegardes soient chiffrées**, ce dont le script se charge. Jamais dans le dépôt
du code : un dépôt **privé et distinct**, qui ne contient que des fichiers chiffrés.

```bash
sudo -u vizdata git clone git@github.com:VizDataCI/vizdata-sauvegardes.git \
  /var/lib/vizdata-certify/depot-sauvegardes
```

```bash
VIZDATA_SAUVEGARDE_DISTANTE='cd /var/lib/vizdata-certify/depot-sauvegardes && cp {fichier} . && git add -A && git commit -q -m "sauvegarde $(date -I)" && git push -q'
```

Deux précautions : la clé SSH du serveur doit être une **clé de déploiement en écriture**
sur ce dépôt et sur lui seul ; et le dépôt doit rester **privé**, même si les fichiers
sont chiffrés — un chiffrement public est un chiffrement qu'on invite à casser.

#### Tous les soirs

Dans `/etc/cron.d/vizdata-certify` :

```cron
0 2 * * * vizdata cd /opt/vizdata-certify && set -a && . /etc/vizdata-certify.env && set +a && VIZDATA_DB=/var/lib/vizdata-certify/certify.db /usr/bin/npm run sauvegarde
```

Ne redirigez pas la sortie vers `/dev/null` : cron envoie la sortie par courrier à
l'administrateur local, et c'est ainsi qu'on apprend qu'une sauvegarde a échoué. Une
sauvegarde silencieusement en échec, c'est un serveur qu'on croit protégé et qui ne
l'est pas.

Les trente dernières sont conservées sur place (`VIZDATA_SAUVEGARDES_GARDEES`).

### 6. Restaurer

Une sauvegarde qu'on ne sait pas restaurer n'est pas une sauvegarde. Essayez-le **une
fois, maintenant**, pendant que rien ne presse — pas le jour où le registre est à
l'arrêt.

```bash
npm run restaurer -- /var/lib/vizdata-certify/sauvegardes/certify-2026-11-17-0200.db.chiffre
```

Sans `--oui`, la commande ne touche à rien : elle déchiffre, vérifie, et affiche ce que
contient la sauvegarde **en regard de ce que contient la base actuelle**. On voit ce
qu'on s'apprête à remplacer.

```bash
sudo systemctl stop vizdata-certify
npm run restaurer -- <fichier> --oui
sudo systemctl start vizdata-certify
```

Arrêter le service d'abord : sinon il écrit dans la base qu'on remplace.

Trois précautions sont prises pour vous :

- la base actuelle est **mise de côté** avant d'être écrasée — restaurer la mauvaise
  sauvegarde est une erreur banale, la rendre irréversible serait une faute ;
- les fichiers `-wal` et `-shm` de l'ancienne base sont **supprimés** — les laisser
  ferait rejouer par SQLite un journal étranger sur la base restaurée, et corromprait
  précisément ce qu'on vient de récupérer ;
- la base restaurée est **relue** et son contenu affiché.

### 7. Mettre à jour

```bash
cd /opt/vizdata-certify
sudo -u vizdata env VIZDATA_DB=/var/lib/vizdata-certify/certify.db npm run sauvegarde
sudo -u vizdata git pull
sudo -u vizdata npm ci
sudo -u vizdata npm test
sudo -u vizdata npm run build
sudo systemctl restart vizdata-certify
```

Sauvegarder **avant**, pas après : une migration ajoutée par la mise à jour s'applique au
redémarrage, et c'est le moment où l'on veut pouvoir revenir en arrière.

`npm test` avant `npm run build` : il ne sert à rien de construire un paquet dont les
tests échouent.

### Vérifier que tout va bien

```bash
curl -s https://certify.vizdata.ci/api/sante
```

```bash
cd /opt/vizdata-certify && sudo -u vizdata env VIZDATA_DB=/var/lib/vizdata-certify/certify.db npm run base -- etat
```

```bash
sudo journalctl -u vizdata-certify -n 50 --no-pager
```

Et surtout, le contrôle qui compte vraiment : **ouvrir
`https://certify.vizdata.ci/verifier` et vérifier un certificat réel.** C'est ce qu'un
employeur fera, et c'est la seule chose que le produit promet.

### Ce qui peut mal se passer

| Symptôme | Cause habituelle |
| --- | --- |
| « Registre injoignable » dans l'interface | le service Node est arrêté — `systemctl status vizdata-certify` |
| 502 de nginx | même chose, ou `PORT` différent de celui du `proxy_pass` |
| `/verifier/{jeton}` répond 404 au rechargement | nginx ne passe pas tout au registre — voir le `location /` |
| La session ne tient pas | le site est servi en HTTP et en HTTPS selon les pages : le cookie `Secure` n'est alors renvoyé que sur l'une des deux |
| Les invitations ne partent pas | `RESEND_API_KEY` absente ; les liens sont dans `journalctl`, et l'écran Notifications les signale |
| « database is locked » | deux processus écrivent — un service lancé deux fois, ou une commande `npm run base` pendant une écriture |

### Ce que ce déploiement ne fait pas

- **Pas de HTTPS dans Node.** nginx termine TLS ; le registre n'écoute que sur la boucle
  locale.
- **Pas de grappe de processus.** Un seul suffit largement, et SQLite n'aime pas qu'on
  écrive depuis plusieurs processus à la fois. Si le trafic l'imposait un jour, c'est le
  moment où la question du moteur se reposerait.
- **Pas d'aperçu de partage par certificat.** Les robots de LinkedIn et WhatsApp
  n'exécutent pas le JavaScript ; il faudrait que le serveur rende lui-même les balises
  pour `/verifier/{jeton}`. C'est désormais possible — il sert déjà les pages — mais ce
  n'est pas fait.
