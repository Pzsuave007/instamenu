#!/bin/bash
# Crea/recrea la cuenta DEMO para el revisor de Amazon (idempotente, seguro).
# Uso:  bash /home/USUARIO/repo/deploy/seed_demo.sh
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CPANEL_USER="$(basename "$(dirname "$REPO")")"
PROD="/opt/${CPANEL_USER}/backend"
cd "$REPO/backend" || exit 1
"$PROD/venv/bin/python" scripts/seed_demo.py
