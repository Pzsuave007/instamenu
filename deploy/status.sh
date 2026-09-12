#!/bin/bash
# ============================================================================
# status.sh  ·  Radiografia SOLO-LECTURA del servidor (no cambia NADA).
#
#   Uso:   bash /home/USUARIO/repo/deploy/status.sh
#
# Te dice, en lenguaje claro: cuanta RAM/swap queda, QUE PROCESOS y QUE APPS
# se estan comiendo la memoria, el disco, si Mongo vive, y si el kernel mato
# algo por falta de memoria (OOM). Ideal cuando tienes varias webapps.
# ============================================================================

echo "=================================================================="
echo "   RADIOGRAFIA DEL SERVIDOR   ·   $(date)"
echo "=================================================================="
echo

echo "----- 1) MEMORIA RAM / SWAP -----"
free -h
echo
AVAIL=$(free -m | awk '/^Mem:/{print $7}')
if [ -n "$AVAIL" ]; then
  if [ "$AVAIL" -lt 200 ]; then
    echo "  >> ALERTA: solo quedan ${AVAIL} MB libres. El servidor esta al limite."
  else
    echo "  >> RAM disponible: ${AVAIL} MB (ok si es > 300-400 MB)."
  fi
fi
echo

echo "----- 2) CARGA DEL SISTEMA (load average) -----"
uptime
echo "  (Si el primer numero supera la cantidad de nucleos de CPU, esta saturado.)"
echo

echo "----- 3) TOP 15 PROCESOS QUE MAS RAM CONSUMEN -----"
printf "%-9s %6s %6s %8s   %s\n" "USUARIO" "%MEM" "%CPU" "RAM(MB)" "PROCESO"
ps -eo user,pmem,pcpu,rss,comm --sort=-rss 2>/dev/null | awk 'NR>1{printf "%-9s %6s %6s %8.0f   %s\n",$1,$2,$3,$4/1024,$5}' | head -15
echo

echo "----- 4) RAM AGRUPADA POR TIPO DE APP -----"
echo "  (suma la memoria de todos los procesos del mismo tipo)"
ps -eo rss,comm 2>/dev/null | awk '
  NR>1{
    name=$2
    if (name ~ /mongod/)              g="MongoDB (base de datos)"
    else if (name ~ /python|uvicorn|gunicorn/) g="Python-backends (FastAPI)"
    else if (name ~ /node/)           g="NodeJS (apps JS)"
    else if (name ~ /php|lsphp/)      g="PHP (WordPress/cPanel)"
    else if (name ~ /mysql|maria/)    g="MySQL/MariaDB"
    else if (name ~ /httpd|apache|nginx|lshttpd/) g="WebServer (Apache/Nginx)"
    else                              g="Otros"
    sum[g]+=$1
  }
  END{ for (k in sum) printf "%8.0f MB   %s\n", sum[k]/1024, k }' | sort -nr
echo

echo "----- 5) BACKENDS (uvicorn) CORRIENDO - con su PUERTO -----"
if pgrep -f "uvicorn" >/dev/null; then
  ps -eo pid,rss,etime,args 2>/dev/null | grep "uvicorn" | grep -v grep \
    | awk '{
        port="?"; for(i=1;i<=NF;i++){ if($i=="--port"){port=$(i+1)} }
        printf "  PID %-8s RAM %5.0f MB  puerto %-6s activo %s\n",$1,$2/1024,port,$3
      }'
  echo "  (InstaMenu usa el puerto 8010. Otros puertos = OTRAS webapps tuyas.)"
else
  echo "  NO hay ningun backend uvicorn corriendo (posible causa del 503)."
fi
echo

echo "----- 6) MONGODB -----"
if pgrep -x mongod >/dev/null; then
  echo "  OK  mongod vivo (PID $(pgrep -x mongod | tr '\n' ' '))"
  systemctl is-enabled mongod 2>/dev/null | sed 's/^/  arranca-en-boot: /'
else
  echo "  XX  mongod NO esta corriendo."
fi
echo

echo "----- 7) DISCO -----"
df -h / 2>/dev/null
echo

echo "----- 8) MUERTES POR FALTA DE MEMORIA (OOM killer) - ultimas -----"
# Solo lineas claras de OOM (sin volcar backtraces gigantes de coredumps).
{ (dmesg -T 2>/dev/null || dmesg 2>/dev/null); cat /var/log/messages 2>/dev/null; } \
  | grep -iE "killed process|out of memory|oom-killer|invoked oom|fatalprocessoutofmemory|dumped core" \
  | grep -ivE "stack trace|0x[0-9a-f]{6}" \
  | cut -c1-160 \
  | tail -n 12
echo "  (Si aparecen lineas aqui, alguna app SE QUEDO SIN RAM. Fijate en el NOMBRE"
echo "   del proceso: node/next-server = app Next.js;  mongod = base de datos, etc.)"
echo

echo "=================================================================="
echo "  RESUMEN:"
echo "  - Mira la seccion 4: la app con mas MB es la que se come la memoria."
echo "  - Si en la 8 hay 'killed process', necesitas mas swap o menos apps."
echo "  - Para ARREGLAR InstaMenu ahora:  sudo bash $(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/recover.sh"
echo "=================================================================="
