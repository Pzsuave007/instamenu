#!/bin/bash
# Publica el build del frontend al public_html.
# TOLERANTE A FALLOS: si no hay build, avisa pero NO tumba el deploy
# (mantiene el frontend anterior). El backend/API nunca se ve afectado por esto.
CPANEL_USER="$(whoami)"
REPO="/home/${CPANEL_USER}/repo"
PUBLIC_HTML="/home/${CPANEL_USER}/public_html"
PORT="${APP_PORT:-8010}"

# Busca el build en frontend/build (Emergent) o en deploy/webrelease (copia persistente).
BUILD=""
for cand in "$REPO/frontend/build" "$REPO/deploy/webrelease"; do
    if [ -d "$cand" ] && [ -f "$cand/index.html" ]; then BUILD="$cand"; break; fi
done

mkdir -p "$PUBLIC_HTML"
# El .htaccess SIEMPRE se (re)escribe con el puerto correcto (proxy /api + SPA + HTTPS).
sed "s|__PORT__|$PORT|g" "$REPO/deploy/htaccess" > "$PUBLIC_HTML/.htaccess"

if [ -z "$BUILD" ]; then
    echo "⚠️  No se encontró build del frontend (ni frontend/build ni deploy/webrelease)."
    echo "    Se mantiene el frontend anterior. El backend/API NO se ve afectado."
else
    rm -rf "$PUBLIC_HTML/static" "$PUBLIC_HTML/index.html" "$PUBLIC_HTML/index.php" \
           "$PUBLIC_HTML/asset-manifest.json" "$PUBLIC_HTML/sw.js"
    cp -r "$BUILD/." "$PUBLIC_HTML/"
    echo "✅ Frontend publicado desde $BUILD"
fi

# Permisos que Apache espera.
find "$PUBLIC_HTML" -type d -exec chmod 755 {} \; 2>/dev/null
find "$PUBLIC_HTML" -type f -exec chmod 644 {} \; 2>/dev/null
exit 0
