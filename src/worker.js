import { handleApi } from './api.js';

// /api/* lo atiende este Worker; el resto (HTML, rutas /a /e /p) lo sirven los assets estáticos.
export default {
  fetch: (request, env) => handleApi(request, env),
};
