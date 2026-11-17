# Mettre VIZDATA CERTIFY en production

Ce document manquait. L'hébergement est passé de Vercel à un serveur Scaleway sans que
le dépôt en garde trace, et plus personne ne pouvait remettre le site à jour sans
chercher. Le voici.

La plateforme tient désormais en **un processus Node et un fichier**. Pas de base de
données à administrer, pas de service tiers, pas de clé dans le paquet livré au
navigateur.

```
nginx  :443  ──┐
               ├── certify.vizdata.ci
Node   :4321 ──┘   ├── /api/*        le registre
                   └── le reste      l'application construite
                        │
                        └── /var/lib/vizdata-certify/certify.db
```

## Ce qu'il faut sur le serveur

- **Node 22 ou plus.** `node:sqlite` en dépend, et c'est la seule exigence du projet.
  Vérifiez : `node --version`.
- nginx, déjà en place.
- Un utilisateur système dédié. Le service ne doit pas tourner en `root` : une faille
  dans le serveur donnerait alors la machine entière.

```bash
sudo adduser --system --group --home /var/lib/vizdata-certify vizdata
```

## 1. Déposer le code

```bash
sudo -u vizdata git clone https://github.com/VizDataCI/vizdata-certify.git /opt/vizdata-certify
cd /opt/vizdata-certify
sudo -u vizdata npm ci
sudo -u vizdata npm run build
```

`npm ci` plutôt que `npm install` : il installe exactement ce que décrit
`package-lock.json`, sans jamais résoudre une version différente de celle qui a été
éprouvée.

## 2. Créer la base et le premier administrateur

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

## 3. Le service

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

## 4. nginx

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

## 5. Les sauvegardes

**C'est la partie que personne ne fait, et c'est celle qui a coûté le registre
précédent.**

```bash
sudo -u vizdata env VIZDATA_DB=/var/lib/vizdata-certify/certify.db \
  npm run sauvegarde
```

La copie est faite à chaud, base ouverte, page par page : `cp certify.db` pendant une
écriture produit un fichier incohérent, et on s'en aperçoit le jour où l'on restaure.

Une fois par nuit, dans `/etc/cron.d/vizdata-certify` :

```cron
0 2 * * * vizdata cd /opt/vizdata-certify && VIZDATA_DB=/var/lib/vizdata-certify/certify.db /usr/bin/npm run sauvegarde >/dev/null
```

Les trente dernières sont conservées, les plus anciennes sont retirées
(`VIZDATA_SAUVEGARDES_GARDEES` pour changer ce nombre).

**Une sauvegarde qui reste sur la même machine ne protège que des erreurs humaines.**
Elle ne protège ni d'une panne de disque, ni de la perte du serveur. Copiez-la ailleurs —
un autre serveur, un espace de stockage distant, un disque chez VIZDATA. Un registre de
certifications est une pièce probante ; sa perte ne se rattrape pas.

Restaurer : arrêter le service, remplacer le fichier, redémarrer.

```bash
sudo systemctl stop vizdata-certify
sudo -u vizdata cp /var/lib/vizdata-certify/sauvegardes/certify-2026-11-17-0200.db \
                   /var/lib/vizdata-certify/certify.db
sudo systemctl start vizdata-certify
```

## 6. Mettre à jour

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

## Vérifier que tout va bien

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

## Ce qui peut mal se passer

| Symptôme | Cause habituelle |
| --- | --- |
| « Registre injoignable » dans l'interface | le service Node est arrêté — `systemctl status vizdata-certify` |
| 502 de nginx | même chose, ou `PORT` différent de celui du `proxy_pass` |
| `/verifier/{jeton}` répond 404 au rechargement | nginx ne passe pas tout au registre — voir le `location /` |
| La session ne tient pas | le site est servi en HTTP et en HTTPS selon les pages : le cookie `Secure` n'est alors renvoyé que sur l'une des deux |
| Les invitations ne partent pas | `RESEND_API_KEY` absente ; les liens sont dans `journalctl`, et l'écran Notifications les signale |
| « database is locked » | deux processus écrivent — un service lancé deux fois, ou une commande `npm run base` pendant une écriture |

## Ce que ce déploiement ne fait pas

- **Pas de HTTPS dans Node.** nginx termine TLS ; le registre n'écoute que sur la boucle
  locale.
- **Pas de grappe de processus.** Un seul suffit largement, et SQLite n'aime pas qu'on
  écrive depuis plusieurs processus à la fois. Si le trafic l'imposait un jour, c'est le
  moment où la question du moteur se reposerait.
- **Pas d'aperçu de partage par certificat.** Les robots de LinkedIn et WhatsApp
  n'exécutent pas le JavaScript ; il faudrait que le serveur rende lui-même les balises
  pour `/verifier/{jeton}`. C'est désormais possible — il sert déjà les pages — mais ce
  n'est pas fait.
