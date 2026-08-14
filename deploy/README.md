# Desplegar InstaMenu 2.0 en tu servidor cPanel

Perfil probado: **VPS + cPanel + AlmaLinux + Apache + Python 3.9+ + MongoDB local**.
Dominio: **instamenuapp.com** · Usuario cPanel: **instamenuapp** · Puerto backend: **8010**.

## Antes de empezar (en Emergent)
1. `yarn build` del frontend ya viene hecho y commiteado en `frontend/build/`
   (se construye aquí, NO en el servidor, por la poca RAM del VPS).
   El build apunta a `https://instamenuapp.com` (ver `frontend/.env.production`).
2. Pulsa **Save to Github** en el chat para subir el repo.

## En el servidor (como root, una sola vez)
```bash
git config --global --add safe.directory '*'
curl -sSL https://raw.githubusercontent.com/Pzsuave007/instamenu/main/bootstrap.sh | bash
```
Esto clona el repo en `/home/instamenuapp/repo`, crea el venv en
`/opt/instamenuapp/backend`, genera el `JWT_SECRET`, arranca el backend en el
puerto 8010 y configura el arranque automático (`@reboot`).

> ⚠️ Edita `/opt/instamenuapp/backend/.env` y cambia `ADMIN_PASSWORD`
> antes de entrar (el super admin se crea con ese usuario/clave al arrancar).

## En cPanel (3 clics)
1. **SSL/TLS Status** → Let's Encrypt para `instamenuapp.com` + `www`.
2. **Domains** → **Force HTTPS Redirect** ON.
3. **WHM → EasyApache 4 → Apache Modules** → habilita `mod_proxy`,
   `mod_proxy_http`, `mod_rewrite`, `mod_headers`.

## Verificar
```bash
curl -i https://instamenuapp.com/api/     # → HTTP 200 + JSON
```
Abre `https://instamenuapp.com/login` y entra con tu super admin.

## Actualizaciones futuras (2 líneas)
```bash
cd /home/instamenuapp/repo && git pull && bash deploy.sh
```
(Recuerda: si cambió el frontend, primero `yarn build` + commit en Emergent.)

## Almacenamiento de medios
Los videos/fotos se guardan en **disco local**: `/opt/instamenuapp/media`
(`STORAGE_BACKEND=local` en el `.env`). Esa carpeta persiste entre despliegues
y NO depende de Emergent. Asegúrate de tener espacio en disco (límite 200 MB
por archivo). Haz respaldo de esa carpeta + de MongoDB (`instamenu_prod`).

## Fire TV
- **Reproductor web**: abre `https://instamenuapp.com/player` en la tele.
- **APK nativo**: ya apunta a `https://instamenuapp.com` por defecto. Reconstruye
  el APK una vez (GitHub Action "Build Fire TV APK") e instálalo; nunca más habrá
  que cambiar la dirección. Los TVs lo descargan desde `https://instamenuapp.com/api/apk`.

## Nota sobre subidas grandes (opcional)
Si subir videos grandes por el proxy de Apache da error, sube en tu
`.htaccess` o en la config del dominio: `LimitRequestBody 0` y aumenta
`ProxyTimeout 600`.
