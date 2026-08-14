#!/bin/bash
# Copia el build del frontend (generado en Emergent y commiteado al repo) al public_html.
set -e
CPANEL_USER="$(whoami)"
REPO="/home/${CPANEL_USER}/repo"
PUBLIC_HTML="/home/${CPANEL_USER}/public_html"
PORT="${APP_PORT:-8010}"
BUILD="$REPO/frontend/build"

if [ ! -d "$BUILD" ]; then
    echo "❌ No existe $BUILD."
    echo "   En Emergent corre 'yarn build' y haz commit de frontend/build/ antes de desplegar."
    exit 1
fi

mkdir -p "$PUBLIC_HTML"
# Borra assets/entrypoints viejos para que no eclipsen al React (sin tocar el resto).
rm -rf "$PUBLIC_HTML/static" "$PUBLIC_HTML/index.html" "$PUBLIC_HTML/index.php" \
       "$PUBLIC_HTML/asset-manifest.json" "$PUBLIC_HTML/sw.js"
cp -r "$BUILD/." "$PUBLIC_HTML/"

# .htaccess con el puerto correcto (proxy /api + fallback SPA + force HTTPS)
sed "s|__PORT__|$PORT|g" "$REPO/deploy/htaccess" > "$PUBLIC_HTML/.htaccess"

# Permisos que Apache espera.
find "$PUBLIC_HTML" -type d -exec chmod 755 {} \;
find "$PUBLIC_HTML" -type f -exec chmod 644 {} \;
echo "✅ Frontend publicado en $PUBLIC_HTML"
