#!/bin/bash
# Diagnóstico SOLO-LECTURA del servidor. No cambia nada.
# Uso:  sudo bash diagnose_server.sh
echo "=================== DIAGNÓSTICO INSTAMENU ==================="
echo "Fecha: $(date)"
echo
echo "----- MEMORIA RAM / SWAP -----"
free -h
echo
echo "----- DISCO -----"
df -h / 2>/dev/null | tail -n +1
echo
echo "----- ¿mongod está corriendo? -----"
if pgrep -x mongod >/dev/null; then
  echo "SÍ, mongod está vivo (PID $(pgrep -x mongod | tr '\n' ' '))"
else
  echo "NO, mongod NO está corriendo ❌"
fi
echo
echo "----- systemd: estado de mongod -----"
systemctl status mongod --no-pager 2>/dev/null | head -n 12 || echo "mongod NO es un servicio systemd (o no hay systemd)"
echo
echo "----- ¿mongod arranca al bootear? -----"
systemctl is-enabled mongod 2>/dev/null || echo "no gestionado por systemd"
echo
echo "----- ÚLTIMAS MUERTES POR FALTA DE MEMORIA (OOM killer) -----"
(dmesg -T 2>/dev/null || dmesg 2>/dev/null) | grep -iE "killed process|out of memory|oom-kill" | tail -n 15
grep -iE "killed process .*mongod|oom" /var/log/messages 2>/dev/null | tail -n 10
echo
echo "----- ÚLTIMAS LÍNEAS DEL LOG DE MONGODB -----"
for L in /var/log/mongodb/mongod.log /var/log/mongodb.log; do
  [ -f "$L" ] && { echo "($L):"; tail -n 25 "$L"; break; }
done
echo
echo "----- CONFIG ACTUAL DE MONGO (cache/almacenamiento) -----"
grep -iE "cacheSizeGB|dbPath|wiredTiger|bindIp|port" /etc/mongod.conf 2>/dev/null || echo "no se encontró /etc/mongod.conf"
echo "=================== FIN DEL DIAGNÓSTICO ==================="
