#!/bin/bash
# Red de seguridad: si el backend de InstaMenu se cayó (p.ej. lo mató el OOM killer),
# lo vuelve a levantar. Se corre cada minuto por cron (lo instala setup-autostart.sh).
# Rutas derivadas de la ubicacion real del script (funciona con sudo o como root).
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CPANEL_USER="$(basename "$(dirname "$REPO")")"
PROD="/opt/${CPANEL_USER}/backend"
PORT="${APP_PORT:-8010}"

if ! pgrep -f "uvicorn server:app.*--port ${PORT}" >/dev/null; then
    logger "instamenu-backend-watchdog: backend (puerto ${PORT}) caido, reiniciando"
    APP_PORT="${PORT}" bash "${REPO}/deploy/start.sh" >> "${PROD}/backend.log" 2>&1
fi
