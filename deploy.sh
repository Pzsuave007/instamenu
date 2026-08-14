#!/bin/bash
set -e
# ============ AJUSTA ESTAS 4 VARIABLES ============
REPO_URL="https://github.com/Pzsuave007/instamenu.git"
CPANEL_USER="instamenuapp"
PORT=8010
DOMAIN="instamenuapp.com"
# ===================================================
REPO="/home/${CPANEL_USER}/repo"
PROD="/opt/${CPANEL_USER}/backend"
MEDIA="/opt/${CPANEL_USER}/media"

[ "$EUID" -ne 0 ] && { echo "❌ Corre este script como root"; exit 1; }
git config --global --add safe.directory '*' 2>/dev/null || true

as_user() { su -s /bin/bash -l "$CPANEL_USER" -c "$1"; }

if [ ! -d "$PROD/venv" ]; then
    echo ">>> INSTALACIÓN POR PRIMERA VEZ"
    if [ ! -d "$REPO/.git" ]; then
        rm -rf "$REPO" && git clone "$REPO_URL" "$REPO"
    fi
    chown -R "$CPANEL_USER:$CPANEL_USER" "$REPO"
    chmod 711 "/home/$CPANEL_USER"
    mkdir -p "$PROD" "$MEDIA"
    chown -R "$CPANEL_USER:$CPANEL_USER" "/opt/$CPANEL_USER"
    if [ ! -f "$PROD/.env" ]; then
        cp "$REPO/deploy/backend.env.production.example" "$PROD/.env"
        sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 64)|" "$PROD/.env"
        sed -i "s|^MEDIA_STORAGE_DIR=.*|MEDIA_STORAGE_DIR=${MEDIA}|" "$PROD/.env"
        chown "$CPANEL_USER:$CPANEL_USER" "$PROD/.env"
        chmod 600 "$PROD/.env"
        echo "  ⚠️  IMPORTANTE: edita $PROD/.env y cambia ADMIN_PASSWORD por una contraseña fuerte."
    fi
    as_user "APP_PORT=$PORT APP_DOMAIN=$DOMAIN bash $REPO/deploy/install_server.sh"
    as_user "APP_PORT=$PORT bash $REPO/deploy/setup-autostart.sh"
else
    echo ">>> ACTUALIZACIÓN"
    chown -R "$CPANEL_USER:$CPANEL_USER" "$REPO"
    as_user "APP_PORT=$PORT APP_DOMAIN=$DOMAIN bash $REPO/deploy/fix.sh"
fi

sleep 2
if curl -sf "http://localhost:$PORT/api/" >/dev/null; then
    echo "  ✅ Backend OK en el puerto $PORT"
else
    echo "  ❌ El backend no responde. Últimas líneas del log:"
    tail -n 20 "$PROD/backend.log" 2>/dev/null
    exit 1
fi
echo "🎉 Listo: https://$DOMAIN/login"
