// Deriva las fechas reales (inicio / fin) de cada tarea a partir del Diario.
//
// Regla: para una tarea se toman todos los días del Diario en los que se
// trabajó y esa tarea fue asignada. La primera fecha es el inicio y la última
// el fin. Si sólo se cargó un día, inicio y fin coinciden en ese día.
//
// Cada tarea se considera de forma AISLADA: un mismo día puede tener varias
// tareas asignadas, y cada una acumula sus propias fechas de manera
// independiente. Si la tarea pertenece a una etapa, además se exige que esa
// etapa esté presente en el día para desambiguar tareas homónimas de distintas
// etapas.

// Convierte el texto separado por comas (etapas / tareas) en un arreglo limpio.
export const parseCsv = (s) =>
  s ? s.split(",").map((x) => x.trim()).filter(Boolean) : [];

// Devuelve un Map: tarea.id -> { fecha_inicio, fecha_fin } (ISO YYYY-MM-DD).
// Sólo incluye tareas que tengan al menos un día cargado en el Diario.
export function fechasRealesPorTarea(registros, tareas, hitos) {
  const idToNombre = {};
  for (const h of hitos || []) idToNombre[h.id] = h.nombre;

  // Sólo interesan los días efectivamente trabajados y con fecha válida.
  const regs = (registros || []).filter((r) => r.trabajado && r.fecha);

  const porTarea = new Map();
  for (const t of tareas || []) {
    const etapaNombre = idToNombre[t.hito_id];
    let min = null;
    let max = null;
    for (const r of regs) {
      const tks = parseCsv(r.tareas);
      if (!tks.includes(t.nombre)) continue;
      // Si la tarea pertenece a una etapa y el día declara etapas, exigimos que
      // esa etapa esté entre ellas (así una tarea homónima de otra etapa no la
      // contamina).
      const ets = parseCsv(r.etapa);
      if (etapaNombre && ets.length && !ets.includes(etapaNombre)) continue;
      // Las fechas ISO (YYYY-MM-DD) se comparan bien lexicográficamente.
      if (min == null || r.fecha < min) min = r.fecha;
      if (max == null || r.fecha > max) max = r.fecha;
    }
    if (min) porTarea.set(t.id, { fecha_inicio: min, fecha_fin: max });
  }
  return porTarea;
}

// Aplica las fechas derivadas del Diario sobre una lista de tareas, devolviendo
// nuevas tareas con fecha_inicio / fecha_fin tomadas del Diario (o null si la
// tarea no tiene días cargados).
export function aplicarFechasReales(registros, tareas, hitos) {
  const map = fechasRealesPorTarea(registros, tareas, hitos);
  return (tareas || []).map((t) => {
    const r = map.get(t.id);
    return { ...t, fecha_inicio: r?.fecha_inicio ?? null, fecha_fin: r?.fecha_fin ?? null };
  });
}
