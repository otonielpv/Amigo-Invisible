# Amigo invisible

Web sencilla para organizar el amigo invisible de varias familias por separado. Sin dependencias (solo Node 18+).

    npm start        # http://localhost:3000
    npm test

- Un grupo por familia, con presupuesto máximo.
- Añade participantes, su lista de deseos y a quién **no** pueden regalar.
- Enlace personal por participante (copiar o WhatsApp): muestra a quién regala, el presupuesto y los deseos de esa persona. Cada uno puede editar su propia lista.
- El enlace de administrador (`/a/...`) no muestra el sorteo. Los datos se guardan en `data.json` (o `DATA_FILE`).
- Para compartir los enlaces fuera de tu casa hay que desplegarlo en un servidor accesible (Render, Railway, un VPS…) con almacenamiento persistente para `data.json`.
