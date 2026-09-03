#!/bin/bash
# Red de seguridad: si el backend de InstaMenu se cayó (p.ej. lo mató el OOM killer),
# lo vuelve a levantar. Se corre cada minuto por cron (lo instala setup-autostart.sh).
CPANEL_USER="$(whoami)"
REPO="/home/${CPANEL_USER}/repo"
PROD="/opt/${CPANEL_USER}/backend"
PORT="${APP_PORT:-8010}"

if ! pgrep -f "uvicorn server:app.*--port ${PORT}" >/dev/null; then
    logger "instamenu-backend-watchdog: backend (puerto ${PORT}) caido, reiniciando"
    APP_PORT="${PORT}" bash "${REPO}/deploy/start.sh" >> "${PROD}/backend.log" 2>&1
fi
