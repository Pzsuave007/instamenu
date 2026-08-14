#!/bin/bash
# Reinicia el backend uvicorn en el puerto de esta app. Usado por deploy y por crontab @reboot.
CPANEL_USER="$(whoami)"
REPO="/home/${CPANEL_USER}/repo"
PROD="/opt/${CPANEL_USER}/backend"
PORT="${APP_PORT:-8010}"

# Detiene cualquier instancia previa en este puerto.
pkill -f "uvicorn server:app.*--port ${PORT}" 2>/dev/null || true
sleep 1

cd "$REPO/backend"
nohup "$PROD/venv/bin/uvicorn" server:app --host 127.0.0.1 --port "$PORT" \
    >> "$PROD/backend.log" 2>&1 &
sleep 2
if pgrep -f "uvicorn server:app.*--port ${PORT}" >/dev/null; then
    echo "✅ Backend corriendo en 127.0.0.1:${PORT} (log: $PROD/backend.log)"
else
    echo "❌ El backend no arrancó. Revisa $PROD/backend.log"
    tail -n 20 "$PROD/backend.log" 2>/dev/null
    exit 1
fi
