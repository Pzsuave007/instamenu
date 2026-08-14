#!/bin/bash
# Configura el arranque automático del backend tras un reinicio del servidor (crontab @reboot).
set -e
CPANEL_USER="$(whoami)"
REPO="/home/${CPANEL_USER}/repo"
PORT="${APP_PORT:-8010}"
CMD="@reboot APP_PORT=${PORT} bash ${REPO}/deploy/start.sh"

( crontab -l 2>/dev/null | grep -v "deploy/start.sh" ; echo "$CMD" ) | crontab -
echo "✅ Autostart configurado: $CMD"
