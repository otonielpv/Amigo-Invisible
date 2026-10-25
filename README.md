# Amigo invisible

Web sencilla para organizar el amigo invisible de varias familias por separado. Funciona en **Cloudflare Pages + D1** (gratis).

- Un grupo por familia, con presupuesto máximo.
- Participantes con exclusiones («no puede regalar a…»).
- Enlace personal por participante: muestra a quién regala y su lista de deseos (título, enlace, foto y detalles). Cada uno edita su propia lista.
- El enlace de administrador (`/a/...`) no muestra el sorteo.

## Desarrollo local

    npm install
    npm run dev      # http://localhost:8788 (D1 local simulada)
    npm test         # con el servidor anterior en marcha

## Despliegue en Cloudflare (Workers con assets + D1, gratis)

El proyecto se despliega con `npx wrangler deploy` usando `wrangler.jsonc`:

- `public/` se sirve como web estática (las rutas `/a/…`, `/e/…` y `/p/…` caen en `index.html`).
- `/api/*` lo atiende `src/worker.js`, que guarda los datos en D1 (binding `DB`). Las tablas se crean solas.
- Si usas otra base de datos D1, cambia `database_id` en `wrangler.jsonc` (se ve en el panel: Storage & Databases → D1).
- Conecta el repositorio en Workers & Pages → Create → Import a repository. Comando de build: vacío. Comando de deploy: `npx wrangler deploy`.

## Contraseña de administración (opcional)

Define el secreto `ADMIN_PASSWORD` en Cloudflare (proyecto → Settings → Variables and secrets → Add → tipo **Secret**). Con ella hay que introducir la contraseña para crear grupos y para abrir cualquier página de administración (`/a/…`), que es la que muestra los enlaces de todos. Los enlaces de los participantes (`/e/…` y `/p/…`) no la necesitan: su protección es un código largo imposible de adivinar. En local, ponla en un fichero `.dev.vars` (`ADMIN_PASSWORD=...`).
