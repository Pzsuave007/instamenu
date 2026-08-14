#!/bin/bash
# Corre como el usuario de cPanel (lo invoca deploy.sh). Primera instalación.
set -e
CPANEL_USER="$(whoami)"
REPO="/home/${CPANEL_USER}/repo"
PROD="/opt/${CPANEL_USER}/backend"

echo ">>> Creando entorno virtual de Python"
python3 -m venv "$PROD/venv"
"$PROD/venv/bin/pip" install --upgrade pip
"$PROD/venv/bin/pip" install -r "$REPO/deploy/requirements.prod.txt"

echo ">>> Enlazando el .env de producción al backend"
ln -sf "$PROD/.env" "$REPO/backend/.env"

echo ">>> Publicando el frontend"
bash "$REPO/deploy/publish_frontend.sh"

echo ">>> Arrancando el backend"
bash "$REPO/deploy/start.sh"
echo "✅ Instalación del servidor completada"
