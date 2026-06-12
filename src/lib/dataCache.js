// Caché en memoria para datos por (clave, proyecto). Permite mostrar datos
// previos de inmediato al volver a una sección mientras se revalida en segundo
// plano, evitando el "parpadeo" de carga.
const store = new Map();

const k = (clave, proyectoId) => `${clave}:${proyectoId ?? "none"}`;

export function getCache(clave, proyectoId) {
  return store.get(k(clave, proyectoId));
}

export function setCache(clave, proyectoId, data) {
  store.set(k(clave, proyectoId), data);
}
