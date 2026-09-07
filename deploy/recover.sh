#!/bin/bash
# ============================================================================
# recover.sh  ·  Recuperacion TOTAL de InstaMenu con UN solo comando.
#
#   Uso:   sudo bash /home/USUARIO/repo/deploy/recover.sh
#   (o sin sudo si no tienes permisos: bash deploy/recover.sh)
#
# Hace todo: levanta MongoDB -> reinicia el backend -> republica el frontend
# -> y VERIFICA que responda. Si algo falla, te muestra el error real.
# NO borra datos. Es seguro correrlo las veces que quieras.
# ============================================================================

# Nos ubicamos por la posicion REAL del script (.../home/USUARIO/repo/deploy/recover.sh),
# asi funciona igual con sudo, como root, o como el usuario de cPanel.
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CPANEL_USER="$(basename "$(dirname "$REPO")")"
PROD="/opt/${CPANEL_USER}/backend"
PORT="${APP_PORT:-8010}"

echo "=================== RECUPERACION INSTAMENU ==================="
echo "Usuario: $CPANEL_USER | Puerto: $PORT | Fecha: $(date)"
echo
echo "----- RAM antes -----"
free -h
echo

# ---------------------------------------------------------------- 1) MONGO
echo ">>> [1/4] Asegurando MongoDB..."
if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl restart mongod 2>/dev/null || systemctl restart mongod 2>/dev/null || true
    sleep 3
fi
if pgrep -x mongod >/dev/null; then
    echo "    OK  Mongo esta corriendo (PID $(pgrep -x mongod | tr '\n' ' '))"
else
    echo "    !!  Mongo no arranco por systemd. Intentando arranque directo..."
    sudo -u mongod mongod --config /etc/mongod.conf --fork 2>/dev/null \
        || mongod --config /etc/mongod.conf --fork 2>/dev/null \
        || echo "    XX  No pude arrancar Mongo. Revisa /var/log/mongodb/mongod.log"
    sleep 3
    pgrep -x mongod >/dev/null && echo "    OK  Mongo arranco directo."
fi
echo

# -------------------------------------------------------------- 2) BACKEND
echo ">>> [2/4] Reiniciando backend (uvicorn)..."
pkill -f "uvicorn server:app.*--port ${PORT}" 2>/dev/null || true
sleep 1
# El backend lee su configuracion desde este symlink.
ln -sf "$PROD/.env" "$REPO/backend/.env" 2>/dev/null || true
if [ ! -d "$REPO/backend" ]; then
    echo "    XX  No existe $REPO/backend  (revisa que hiciste git pull)"; exit 1
fi
cd "$REPO/backend" || exit 1
nohup "$PROD/venv/bin/uvicorn" server:app --host 127.0.0.1 --port "$PORT" \
    >> "$PROD/backend.log" 2>&1 &
sleep 4
if pgrep -f "uvicorn server:app.*--port ${PORT}" >/dev/null; then
    echo "    OK  Proceso backend levantado."
else
    echo "    !!  El proceso no quedo vivo (probablemente Mongo caido). Sigo y verifico abajo."
fi
echo

# ------------------------------------------------------------- 3) FRONTEND
echo ">>> [3/4] Republicando frontend (no critico)..."
bash "$REPO/deploy/publish_frontend.sh" 2>/dev/null \
    && echo "    OK  Frontend publicado." \
    || echo "    !!  Frontend no se publico; el backend NO se ve afectado."
# Reactiva el arranque automatico + watchdog (por si se perdio).
bash "$REPO/deploy/setup-autostart.sh" 2>/dev/null || true
echo

# --------------------------------------------------------- 4) VERIFICACION
echo ">>> [4/4] Verificando que el backend responda..."
sleep 2
CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/" 2>/dev/null)
echo
if [ "$CODE" = "200" ]; then
    echo "============================================================"
    echo "  OK  TODO LISTO. El backend responde 200 en el puerto ${PORT}."
    echo "      Pidele al cliente que RECARGUE la pagina y reintente."
    echo "============================================================"
else
    echo "============================================================"
    echo "  XX  El backend NO responde (codigo: ${CODE:-sin respuesta})."
    echo "      Aqui abajo esta el ERROR REAL (mandame una foto de esto):"
    echo "------------------------------------------------------------"
    tail -n 30 "$PROD/backend.log" 2>/dev/null
    echo "============================================================"
fi
echo
echo "----- RAM despues -----"
free -h
echo "=================== FIN ==================="
