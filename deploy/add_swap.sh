#!/bin/bash
# ============================================================================
# add_swap.sh  ·  Agranda el SWAP (colchon de memoria) para que el kernel
#                 DEJE DE MATAR apps cuando la RAM se llena.
#
#   Uso:   sudo bash /home/USUARIO/repo/deploy/add_swap.sh          (default 4G extra)
#          sudo bash /home/USUARIO/repo/deploy/add_swap.sh 6G       (tamano a gusto)
#
# Crea /swapfile2 y lo hace permanente (sobrevive reinicios). Es idempotente:
# si ya existe /swapfile2 no lo duplica. NO borra datos.
# ============================================================================
set -e

if [ "$(id -u)" -ne 0 ]; then
  echo "❌ Debes correrlo como root:  sudo bash add_swap.sh"; exit 1
fi

SIZE="${1:-4G}"
SWAPFILE="/swapfile2"

echo ">>> Swap actual:"
swapon --show || true
free -h
echo

if swapon --show=NAME --noheadings 2>/dev/null | grep -q "^${SWAPFILE}$"; then
  echo "✅ ${SWAPFILE} ya esta activo. No hago nada."
  swapon --show; exit 0
fi

echo ">>> Creando ${SWAPFILE} de ${SIZE} ..."
if ! fallocate -l "$SIZE" "$SWAPFILE" 2>/dev/null; then
  # fallback: dd (convierte 4G/6G en MB)
  MB=$(( ${SIZE%[Gg]} * 1024 ))
  dd if=/dev/zero of="$SWAPFILE" bs=1M count="$MB" status=progress
fi
chmod 600 "$SWAPFILE"
mkswap "$SWAPFILE" >/dev/null
swapon "$SWAPFILE"

# Permanente (sobrevive reinicios)
grep -q "$SWAPFILE" /etc/fstab || echo "$SWAPFILE none swap sw 0 0" >> /etc/fstab

# Menos agresivo al usar swap (prefiere RAM real)
sysctl -w vm.swappiness=10 >/dev/null || true
grep -q 'vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf

echo
echo "✅ LISTO. Swap despues:"
swapon --show
free -h
echo "======================================================="
echo "Ahora el servidor tiene mas colchon: cuando la RAM se llene,"
echo "usara swap en vez de MATAR apps. Menos caidas / 503."
echo "======================================================="
