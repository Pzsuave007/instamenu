#!/bin/bash
# Corre como el usuario de cPanel (lo invoca deploy.sh). Actualizaciones.
set -e
CPANEL_USER="$(whoami)"
REPO="/home/${CPANEL_USER}/repo"
PROD="/opt/${CPANEL_USER}/backend"

echo ">>> Actualizando dependencias del backend"
"$PROD/venv/bin/pip" install -r "$REPO/deploy/requirements.prod.txt"

ln -sf "$PROD/.env" "$REPO/backend/.env"

echo ">>> Republicando el frontend"
bash "$REPO/deploy/publish_frontend.sh"

echo ">>> Reiniciando el backend"
bash "$REPO/deploy/start.sh"
echo "✅ Actualización completada"
