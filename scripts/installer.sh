#!/usr/bin/env bash
#
# Installation et mise à jour de VIZDATA CERTIFY sur le serveur.
#
#   sudo bash scripts/installer.sh
#
# Conçu pour être relancé sans danger : il installe la première fois, et met à
# jour les suivantes. Trois choses ne sont JAMAIS écrasées, parce qu'une
# réexécution malheureuse coûterait le registre :
#
#   — la base de données ;
#   — la clé de chiffrement des sauvegardes (l'écraser rendrait illisibles
#     toutes les sauvegardes déjà faites) ;
#   — la configuration nginx existante du domaine.
#
# Et une sauvegarde est prise AVANT toute mise à jour, parce qu'une migration
# s'applique au redémarrage et que c'est le moment où l'on veut pouvoir revenir
# en arrière.

set -euo pipefail

# --- réglages ---------------------------------------------------------------
DEPOT="${VIZDATA_DEPOT:-https://github.com/VizDataCI/vizdata-certify.git}"
RACINE="${VIZDATA_RACINE:-/opt/vizdata-certify}"
DONNEES="${VIZDATA_DONNEES:-/var/lib/vizdata-certify}"
UTILISATEUR="${VIZDATA_UTILISATEUR:-vizdata}"
SITE="${VIZDATA_SITE_URL:-https://certify.vizdata.ci}"
PORT="${PORT:-4321}"
ENV_FICHIER="/etc/vizdata-certify.env"

BASE="$DONNEES/certify.db"
SERVICE="vizdata-certify"

# --- affichage --------------------------------------------------------------
titre() { printf '\n\033[1m  %s\033[0m\n' "$1"; }
ok()    { printf '    \033[32m✓\033[0m %s\n' "$1"; }
info()  { printf '      %s\n' "$1"; }
alerte(){ printf '    \033[33m!\033[0m %s\n' "$1"; }
mourir(){ printf '\n\033[31m  ARRÊT : %s\033[0m\n\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || mourir "à lancer avec sudo."

# ============================================================================
titre "1. Ce que le serveur doit savoir faire"
# ============================================================================

command -v git  >/dev/null || mourir "git n'est pas installé."
command -v node >/dev/null || mourir "Node n'est pas installé. Il faut la version 22 ou plus."
command -v npm  >/dev/null || mourir "npm n'est pas installé."

MAJEURE="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$MAJEURE" -lt 22 ]; then
  mourir "Node $(node --version) — il faut la version 22 ou plus.

  Le registre utilise node:sqlite, livré avec Node depuis la 22. C'est la
  seule exigence du projet, et elle n'est pas contournable.

  Sur Debian ou Ubuntu :
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs

  Sur un serveur Plesk, la version du panneau ne vaut que pour les
  applications Node gérées par Plesk : celle-ci tourne en service système et
  demande un Node installé à l'échelle du serveur."
fi
ok "Node $(node --version)"

# ============================================================================
titre "2. L'utilisateur et les dossiers"
# ============================================================================

if id "$UTILISATEUR" >/dev/null 2>&1; then
  ok "utilisateur $UTILISATEUR (déjà présent)"
else
  adduser --system --group --home "$DONNEES" "$UTILISATEUR"
  ok "utilisateur $UTILISATEUR créé"
fi

# Le service ne doit pas tourner en root : une faille dans le serveur donnerait
# alors la machine entière.
mkdir -p "$RACINE" "$DONNEES"
chown -R "$UTILISATEUR:$UTILISATEUR" "$DONNEES"
ok "dossiers : $RACINE (code), $DONNEES (base)"

# ============================================================================
titre "3. Sauvegarder avant de toucher à quoi que ce soit"
# ============================================================================

if [ -f "$BASE" ]; then
  # shellcheck disable=SC1090
  [ -f "$ENV_FICHIER" ] && { set -a; . "$ENV_FICHIER"; set +a; }
  if sudo -u "$UTILISATEUR" env VIZDATA_DB="$BASE" \
       VIZDATA_SAUVEGARDE_CLE="${VIZDATA_SAUVEGARDE_CLE:-}" \
       npm --prefix "$RACINE" run sauvegarde >/dev/null 2>&1; then
    ok "sauvegarde prise avant la mise à jour"
  else
    alerte "la sauvegarde a échoué — la mise à jour continue, mais vérifiez-la ensuite"
  fi
else
  info "aucune base encore : rien à sauvegarder"
fi

# ============================================================================
titre "4. Le code"
# ============================================================================

if [ -d "$RACINE/.git" ]; then
  sudo -u "$UTILISATEUR" git -C "$RACINE" fetch --quiet origin
  sudo -u "$UTILISATEUR" git -C "$RACINE" reset --hard --quiet origin/main
  ok "code mis à jour — $(sudo -u "$UTILISATEUR" git -C "$RACINE" log --oneline -1)"
else
  # Un dossier non vide sans dépôt : on ne l'écrase pas en silence.
  if [ -n "$(ls -A "$RACINE" 2>/dev/null)" ]; then
    mourir "$RACINE n'est pas vide et n'est pas un dépôt git. Déplacez-le, puis relancez."
  fi
  sudo -u "$UTILISATEUR" git clone --quiet "$DEPOT" "$RACINE"
  ok "code déposé — $(sudo -u "$UTILISATEUR" git -C "$RACINE" log --oneline -1)"
fi

cd "$RACINE"
sudo -u "$UTILISATEUR" npm ci --silent
ok "dépendances installées (exactement celles du verrou)"

sudo -u "$UTILISATEUR" npm test >/dev/null 2>&1 \
  && ok "tests au vert" \
  || mourir "des tests échouent. On ne met pas en ligne un registre dont les tests échouent.
  Relancez « npm test » dans $RACINE pour voir lesquels."

sudo -u "$UTILISATEUR" npm run build >/dev/null 2>&1
ok "interface construite"

# ============================================================================
titre "5. La clé de chiffrement des sauvegardes"
# ============================================================================

if [ -f "$ENV_FICHIER" ] && grep -q "VIZDATA_SAUVEGARDE_CLE=" "$ENV_FICHIER"; then
  # On ne la régénère JAMAIS : les sauvegardes déjà faites deviendraient
  # illisibles, et c'est irréversible.
  ok "clé existante conservée ($ENV_FICHIER)"
else
  CLE="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64"))')"
  printf 'VIZDATA_SAUVEGARDE_CLE=%s\n' "$CLE" > "$ENV_FICHIER"
  chown "$UTILISATEUR:$UTILISATEUR" "$ENV_FICHIER"
  chmod 600 "$ENV_FICHIER"
  ok "clé de chiffrement créée"
  alerte "COPIEZ-LA HORS DE CE SERVEUR, MAINTENANT :"
  printf '\n      %s\n\n' "$CLE"
  info "Sans elle, les sauvegardes sont des octets aléatoires. C'est ce qu'on"
  info "demande au chiffrement, et c'est sans appel."
fi

# ============================================================================
titre "6. La base"
# ============================================================================

if [ -f "$BASE" ]; then
  ok "base existante conservée — les migrations s'appliqueront au démarrage"
else
  sudo -u "$UTILISATEUR" env VIZDATA_DB="$BASE" npm run base -- init >/dev/null
  ok "base créée, catalogue de départ posé"
fi

# ============================================================================
titre "7. Le service"
# ============================================================================

cat > "/etc/systemd/system/$SERVICE.service" <<UNITE
[Unit]
Description=VIZDATA CERTIFY — registre des certifications
After=network.target

[Service]
Type=simple
User=$UTILISATEUR
Group=$UTILISATEUR
WorkingDirectory=$RACINE
ExecStart=$(command -v node) server/index.mjs
Restart=always
RestartSec=5

Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=VIZDATA_DB=$BASE
Environment=VIZDATA_SITE_URL=$SITE
EnvironmentFile=-$ENV_FICHIER

# Le service n'a besoin d'écrire que dans le dossier de la base.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DONNEES

[Install]
WantedBy=multi-user.target
UNITE

systemctl daemon-reload
systemctl enable --quiet "$SERVICE"
systemctl restart "$SERVICE"
sleep 2

if systemctl is-active --quiet "$SERVICE"; then
  ok "service démarré sur le port $PORT"
else
  mourir "le service n'a pas démarré. Voir : journalctl -u $SERVICE -n 40 --no-pager"
fi

# ============================================================================
titre "8. La sauvegarde de chaque nuit"
# ============================================================================

cat > "/etc/cron.d/$SERVICE" <<CRON
# Sauvegarde du registre VIZDATA CERTIFY.
# La sortie n'est PAS jetée : cron l'envoie par courrier à l'administrateur
# local, et c'est ainsi qu'on apprend qu'une sauvegarde a échoué.
0 2 * * * $UTILISATEUR cd $RACINE && set -a && . $ENV_FICHIER && set +a && VIZDATA_DB=$BASE $(command -v npm) run sauvegarde
CRON
ok "sauvegarde quotidienne à 2 h"

if ! grep -q "VIZDATA_SAUVEGARDE_DISTANTE" "$ENV_FICHIER" 2>/dev/null; then
  alerte "les sauvegardes restent SUR CE SERVEUR"
  info "Elles protègent d'une fausse manœuvre, pas d'une panne de disque."
  info "Ajoutez dans $ENV_FICHIER une ligne comme :"
  info "  VIZDATA_SAUVEGARDE_DISTANTE='scp {fichier} ailleurs:/sauvegardes/'"
  info "Voir docs/deploiement.md, « L'expédition hors du serveur »."
fi

# ============================================================================
titre "9. Le contrôle"
# ============================================================================

if curl -fs --max-time 10 "http://127.0.0.1:$PORT/api/sante" >/dev/null; then
  ok "le registre répond sur http://127.0.0.1:$PORT"
else
  mourir "le registre ne répond pas. Voir : journalctl -u $SERVICE -n 40 --no-pager"
fi

sudo -u "$UTILISATEUR" env VIZDATA_DB="$BASE" npm run base -- etat 2>/dev/null | sed -n '3,20p'

ADMINS="$(sudo -u "$UTILISATEUR" env VIZDATA_DB="$BASE" node -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.env.VIZDATA_DB, { readOnly: true });
process.stdout.write(String(db.prepare("select count(*) n from users where role = \x27ADMIN\x27 and password_hash is not null").get().n));
db.close();')"

titre "Et maintenant"

if [ "$ADMINS" = "0" ]; then
  info "Aucun administrateur n'a encore de mot de passe. Ouvrez-en un :"
  printf '\n      sudo -u %s env VIZDATA_DB=%s VIZDATA_SITE_URL=%s \\\n        npm --prefix %s run base -- admin direction@vizdata.ci Fabrice BOH\n\n' \
    "$UTILISATEUR" "$BASE" "$SITE" "$RACINE"
  info "La commande imprime un lien : suivez-le pour choisir votre mot de passe."
fi

info "Il reste à faire passer le domaine par le registre. Dans Plesk :"
info "  Sites web & domaines → certify.vizdata.ci → Apache & nginx"
info "  → Directives nginx additionnelles :"
printf '\n      location / {\n          proxy_pass         http://127.0.0.1:%s;\n          proxy_http_version 1.1;\n          proxy_set_header   Host              $host;\n          proxy_set_header   X-Real-IP         $remote_addr;\n          proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;\n          proxy_set_header   X-Forwarded-Proto $scheme;\n      }\n\n' "$PORT"
info "Décochez « Servir les fichiers statiques directement par nginx » :"
info "sinon nginx répondra 404 sur /verifier/{jeton}, l'adresse imprimée"
info "dans les QR codes."
printf '\n'
