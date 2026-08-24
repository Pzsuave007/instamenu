#!/bin/bash
# Blinda MongoDB en un VPS para que NO se caiga (o se levante solo si se cae).
# Aplica: auto-reinicio (systemd), arranque en boot, swap, límite de cache (anti-OOM),
# menos prioridad para el OOM killer, y un watchdog por cron como red de seguridad.
#
# Uso:  sudo bash harden_mongo.sh
set -e

if [ "$(id -u)" -ne 0 ]; then
  echo "❌ Debes correrlo como root:  sudo bash harden_mongo.sh"
  exit 1
fi

CONF="/etc/mongod.conf"
LOG="/var/log/mongodb/mongod.log"
[ -f "$LOG" ] || LOG="/var/log/mongodb.log"

echo ">>> 1/6  RAM detectada y cálculo de límite de cache para MongoDB"
RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
# Cache de WiredTiger ~35% de la RAM (mínimo 0.25 GB). Evita que Mongo consuma toda la RAM.
CACHE_GB=$(awk "BEGIN{v=($RAM_MB*0.35)/1024; if(v<0.25)v=0.25; printf \"%.2f\", v}")
echo "    RAM = ${RAM_MB} MB  ->  cacheSizeGB = ${CACHE_GB}"

echo ">>> 2/6  Ajustando ${CONF} (límite de cache)"
if [ -f "$CONF" ]; then
  cp "$CONF" "${CONF}.bak.$(date +%s)"
  python3 - "$CONF" "$CACHE_GB" <<'PY'
import sys, re
path, cache = sys.argv[1], sys.argv[2]
txt = open(path).read()
lines = txt.splitlines()
# Elimina cualquier bloque storage/wiredTiger previo que hayamos puesto y lo reescribimos limpio.
out, skip = [], False
for ln in lines:
    if re.match(r'^\s*storage:\s*$', ln):
        skip = True
        continue
    if skip and (ln.startswith(' ') or ln.strip()==''):
        # dentro del bloque storage: lo saltamos salvo dbPath que preservamos
        m = re.search(r'dbPath:\s*(.+)', ln)
        if m:
            out.append(('__DBPATH__', m.group(1).strip()))
        continue
    skip = False
    out.append(ln)
dbpath = None
clean = []
for x in out:
    if isinstance(x, tuple):
        dbpath = x[1]
    else:
        clean.append(x)
block = ["storage:"]
if dbpath:
    block.append(f"  dbPath: {dbpath}")
block += ["  wiredTiger:", "    engineConfig:", f"      cacheSizeGB: {cache}"]
newtxt = "\n".join(clean).rstrip() + "\n" + "\n".join(block) + "\n"
open(path, "w").write(newtxt)
print("    mongod.conf actualizado (respaldo .bak creado)")
PY
else
  echo "    ⚠️ No existe $CONF — se omite el límite de cache."
fi

echo ">>> 3/6  Auto-reinicio de mongod (systemd Restart=always) + arranque en boot"
if systemctl list-unit-files 2>/dev/null | grep -q '^mongod'; then
  mkdir -p /etc/systemd/system/mongod.service.d
  cat > /etc/systemd/system/mongod.service.d/override.conf <<'EOF'
[Service]
Restart=always
RestartSec=3
# Que el kernel NO elija a mongod primero cuando falte memoria
OOMScoreAdjust=-500
EOF
  systemctl daemon-reload
  systemctl enable mongod 2>/dev/null || true
  systemctl restart mongod
  sleep 3
  systemctl is-active mongod && echo "    ✅ mongod activo con auto-reinicio"
else
  echo "    ⚠️ mongod no es servicio systemd — el watchdog (paso 6) se encargará."
fi

echo ">>> 4/6  Swap (colchón de memoria para evitar OOM)"
if [ "$(swapon --show | wc -l)" -eq 0 ]; then
  SWAPSZ=2G
  echo "    No hay swap. Creando ${SWAPSZ} en /swapfile ..."
  fallocate -l $SWAPSZ /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "    ✅ Swap de ${SWAPSZ} activo"
else
  echo "    ✅ Ya hay swap configurado"
fi

echo ">>> 5/6  Reduciendo la agresividad del uso de swap (swappiness=10)"
sysctl -w vm.swappiness=10 >/dev/null || true
grep -q 'vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf

echo ">>> 6/6  Watchdog (red de seguridad): revisa cada minuto que mongod esté vivo"
cat > /usr/local/bin/instamenu-mongo-watchdog.sh <<'EOF'
#!/bin/bash
# Si mongod no está corriendo, lo levanta.
if ! pgrep -x mongod >/dev/null; then
  logger "instamenu-watchdog: mongod caído, reiniciando"
  systemctl start mongod 2>/dev/null || mongod --config /etc/mongod.conf --fork 2>/dev/null
fi
EOF
chmod +x /usr/local/bin/instamenu-mongo-watchdog.sh
( crontab -l 2>/dev/null | grep -v 'instamenu-mongo-watchdog' ; \
  echo '* * * * * /usr/local/bin/instamenu-mongo-watchdog.sh' ) | crontab -
echo "    ✅ Watchdog instalado (cron cada minuto)"

echo
echo "======================================================="
echo "✅ LISTO. MongoDB ahora se auto-reinicia y tiene colchón de memoria."
echo "   - Auto-reinicio:  systemctl status mongod"
echo "   - Watchdog:       cada minuto vía cron"
echo "   - Cache limitada: ${CACHE_GB} GB (anti-OOM)"
echo "   - Swap:           activo"
echo "======================================================="
