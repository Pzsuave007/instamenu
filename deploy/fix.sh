#!/bin/bash
# Corre como el usuario de cPanel (lo invoca deploy.sh). Actualizaciones.
set -e
CPANEL_USER="$(whoami)"
REPO="/home/${CPANEL_USER}/repo"
PROD="/opt/${CPANEL_USER}/backend"

echo ">>> Actualizando dependencias del backend"
"$PROD/venv/bin/pip" install -r "$REPO/deploy/requirements.prod.txt"

ln -sf "$PROD/.env" "$REPO/backend/.env"

echo ">>> Reiniciando el backend (lo más crítico primero)"
bash "$REPO/deploy/start.sh"

echo ">>> Republicando el frontend (no crítico: si falla, el backend sigue arriba)"
bash "$REPO/deploy/publish_frontend.sh" || echo "⚠️ publish_frontend tuvo un problema; el backend sigue arriba"

echo ">>> Sincronizando autostart (@reboot) + watchdog con el puerto actual"
bash "$REPO/deploy/setup-autostart.sh"
echo "✅ Actualización completada"
