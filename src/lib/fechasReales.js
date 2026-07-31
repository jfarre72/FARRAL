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

// Convierte el valor guardado (etapas / tareas) en un arreglo limpio.
//
// A partir de ahora las listas se guardan como JSON (ver serializeLista) para
// que un nombre que contenga comas —p. ej. "Instalaciones bajo platea (agua,
// cloaca, electricidad)"— no se parta en pedazos. Para no romper los registros
// viejos, si el texto no es un arreglo JSON válido caemos al formato anterior
// (separado por comas).
export const parseLista = (s) => {
  if (!s) return [];
  if (typeof s !== "string") return Array.isArray(s) ? s : [];
  const txt = s.trim();
  if (txt.startsWith("[")) {
    try {
      const arr = JSON.parse(txt);
      if (Array.isArray(arr)) {
        return arr.map((x) => String(x).trim()).filter(Boolean);
      }
    } catch {
      // No era JSON válido: seguimos con el parseo legacy.
    }
  }
  return txt.split(",").map((x) => x.trim()).filter(Boolean);
};

// Serializa una lista de nombres para guardarla. Devuelve JSON (soporta comas
// dentro de los nombres) o null si la lista está vacía.
export const serializeLista = (arr) =>
  arr && arr.length ? JSON.stringify(arr.map((x) => String(x).trim()).filter(Boolean)) : null;

// Compat: alias del parser anterior.
export const parseCsv = parseLista;

// Devuelve un Map: tarea.id -> { fecha_inicio, fecha_fin, dias } (ISO YYYY-MM-DD).
// - fecha_inicio / fecha_fin: primer y último día trabajado de la tarea.
// - dias: cantidad de días efectivamente trabajados (el "esfuerzo"), que puede
//   ser menor que el intervalo si la tarea se hizo en jornadas salteadas.
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
    const dias = new Set(); // fechas distintas trabajadas (esfuerzo real)
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
      dias.add(r.fecha);
    }
    if (min) porTarea.set(t.id, { fecha_inicio: min, fecha_fin: max, dias: dias.size });
  }
  return porTarea;
}

// Fecha de hoy en formato ISO (YYYY-MM-DD), hora local.
export function isoHoy() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${da}`;
}

// Deriva el estado de una tarea a partir de sus fechas reales (del Diario) y de
// la fecha de hoy:
//   - completado (finalización manual) => "finalizado".
//   - sin días cargados en el Diario    => "no_iniciado".
//   - primer día en el futuro           => "planificado" (se está planificando).
//   - primer día hoy o en el pasado     => "en_curso".
export function estadoDesdeDiario(tarea, todayISO = isoHoy()) {
  if (tarea.completado) return "finalizado";
  const ini = tarea.fecha_inicio;
  if (!ini) return "no_iniciado";
  return ini > todayISO ? "planificado" : "en_curso";
}

// Aplica las fechas derivadas del Diario sobre una lista de tareas, devolviendo
// nuevas tareas con fecha_inicio / fecha_fin y estado tomados del Diario. Si la
// tarea no tiene días cargados, sus fechas quedan en null y el estado se deriva
// según corresponda.
export function aplicarFechasReales(registros, tareas, hitos, todayISO = isoHoy()) {
  const map = fechasRealesPorTarea(registros, tareas, hitos);
  return (tareas || []).map((t) => {
    const r = map.get(t.id);
    const conFechas = {
      ...t,
      fecha_inicio: r?.fecha_inicio ?? null,
      fecha_fin: r?.fecha_fin ?? null,
      dias_trabajados: r?.dias ?? 0,
    };
    return { ...conFechas, estado: estadoDesdeDiario(conFechas, todayISO) };
  });
}
