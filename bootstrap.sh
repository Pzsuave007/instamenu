#!/bin/bash
set -e
# Ejecuta esto UNA vez en un servidor nuevo (como root):
#   curl -sSL https://raw.githubusercontent.com/Pzsuave007/instamenu/main/bootstrap.sh | bash
REPO_URL="https://github.com/Pzsuave007/instamenu.git"
CPANEL_USER="instamenuapp"
REPO="/home/${CPANEL_USER}/repo"

[ "$EUID" -ne 0 ] && { echo "❌ Corre esto como root"; exit 1; }
git config --global --add safe.directory '*'

if [ ! -d "$REPO/.git" ]; then
    rm -rf "$REPO"
    git clone "$REPO_URL" "$REPO"
fi
chown -R "$CPANEL_USER:$CPANEL_USER" "$REPO"
bash "$REPO/deploy.sh"
