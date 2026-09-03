#!/bin/bash
# Configura el arranque automático del backend tras un reinicio del servidor (@reboot)
# y un watchdog cada minuto que lo levanta si se cae (p.ej. por OOM killer).
set -e
CPANEL_USER="$(whoami)"
REPO="/home/${CPANEL_USER}/repo"
PORT="${APP_PORT:-8010}"
REBOOT_CMD="@reboot APP_PORT=${PORT} bash ${REPO}/deploy/start.sh"
WATCH_CMD="* * * * * APP_PORT=${PORT} bash ${REPO}/deploy/backend-watchdog.sh"

( crontab -l 2>/dev/null \
    | grep -v "deploy/start.sh" \
    | grep -v "deploy/backend-watchdog.sh" ; \
  echo "$REBOOT_CMD" ; \
  echo "$WATCH_CMD" ) | crontab -
echo "✅ Autostart + watchdog configurados:"
echo "   $REBOOT_CMD"
echo "   $WATCH_CMD"
