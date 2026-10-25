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

## Despliegue gratuito en Cloudflare

1. En el panel de Cloudflare: **Storage & Databases → D1 → Create database** (nombre: `amigo-invisible`). Las tablas se crean solas.
2. **Workers & Pages → Create → Pages → Connect to Git**, elige este repositorio.
   - Framework preset: *None*
   - Build command: *(vacío)*
   - Build output directory: `public`
3. Tras el primer despliegue, en el proyecto: **Settings → Bindings → Add → D1 database**, nombre de variable `DB`, elige `amigo-invisible`. Guarda y vuelve a desplegar (**Deployments → Retry deployment**).

Tendrás una dirección `https://<proyecto>.pages.dev`.
