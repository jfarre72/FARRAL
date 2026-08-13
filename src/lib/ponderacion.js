// Utilidades para el cálculo de ponderación por días en el proyecto.
// Cada aporte se pondera: monto × días entre `fecha_inicio_calculo`
// (o, en su defecto, `fecha`) y la fecha de corte del proyecto
// (`fecha_fin` si existe; si no, hoy).
//
// Inversor "Faltante" (virtual): cuando los aportes acumulados son
// menores al costo_total_estimado, se agrega un inversor sintético con
// monto = costo - aportes y fecha_inicio_calculo = proyecto.fecha_inversor_faltante
// (fallback: fecha_fin del proyecto, o hoy). Sirve para que las % de
// participación reflejen lo que queda por aportar.

export const FALTANTE_ID = "__faltante__";

export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysBetween(fromISO, toISO) {
  if (!fromISO || !toISO) return 0;
  const a = new Date(`${fromISO}T00:00:00`);
  const b = new Date(`${toISO}T00:00:00`);
  const diff = Math.round((b - a) / 86400000);
  return Math.max(0, diff);
}

export function computePonderacion({ proyecto, aportes = [], inversores = [], fechaCorteOverride, fechaFaltanteOverride, ventaOverride, costoOverride, excluidos = [] } = {}) {
  // Permite hacer "what if" con una fecha distinta a la de fin del proyecto y/o
  // con una venta / costo simulados (ventaOverride, costoOverride).
  // `excluidos`: ids de inversores que NO participan de la ganancia (p.ej. un
  // arquitecto tomado como contratado). Su ponderado se anula, así no reciben
  // ganancia y ésta se reparte entre el resto según su propio peso.
  const exSet = new Set(excluidos || []);
  const fechaCorte = fechaCorteOverride || proyecto?.fecha_fin || todayISO();
  const venta = ventaOverride != null ? Number(ventaOverride) : Number(proyecto?.precio_venta_estimado || 0);
  const costo = costoOverride != null ? Number(costoOverride) : Number(proyecto?.costo_total_estimado  || 0);
  const gananciaTotal = venta - costo;

  // --- Aportes reales (USD) ---
  // Por convención del usuario, los aportes se computan en USD.
  // ARS aportes se ignoran para la ponderación / ganancia y se reportan
  // aparte como info de caja.
  const aportesUSD = aportes.filter(a => (a.moneda ?? "USD") === "USD");
  const aportesConPonderado = aportesUSD.map((a) => {
    const start = a.fecha_inicio_calculo || a.fecha;
    const dias = daysBetween(start, fechaCorte);
    const monto = Number(a.monto || 0);
    const excl = exSet.has(a.inversor_id);
    const ponderado = excl ? 0 : monto * dias;
    return { ...a, _dias: dias, _ponderado: ponderado, _excluido: excl, _fechaInicioCalculo: start };
  });

  const totalAportadoUSD = aportesConPonderado.reduce((s, a) => s + Number(a.monto || 0), 0);

  // --- Inversor Faltante ---
  const montoFaltante = Math.max(0, costo - totalAportadoUSD);
  // La "fecha de venta" simulada manda desde cuándo el Faltante aporta capital.
  const fechaFaltante = fechaFaltanteOverride || proyecto?.fecha_inversor_faltante || proyecto?.fecha_fin || todayISO();
  const diasFaltante = daysBetween(fechaFaltante, fechaCorte);
  const ponderadoFaltante = montoFaltante * diasFaltante;
  const totalPonderado = aportesConPonderado.reduce((s, a) => s + a._ponderado, 0) + ponderadoFaltante;

  // --- % por aporte ---
  const aportesFinal = aportesConPonderado.map((a) => {
    const pct = totalPonderado > 0 ? (a._ponderado / totalPonderado) * 100 : 0;
    const gan = gananciaTotal > 0 ? (gananciaTotal * pct) / 100 : 0;
    return { ...a, _participacion: pct, _ganancia: gan };
  });

  // --- Resumen por inversor (sólo USD) ---
  const porInversor = inversores.map((inv) => {
    const items = aportesFinal.filter((a) => a.inversor_id === inv.id);
    const aportesUSD = items.reduce((s,a) => s + Number(a.monto || 0), 0);
    const ponderado = items.reduce((s, a) => s + a._ponderado, 0);
    const participacion = totalPonderado > 0 ? (ponderado / totalPonderado) * 100 : 0;
    const ganancia = gananciaTotal > 0 ? (gananciaTotal * participacion) / 100 : 0;
    const totalDevolver = aportesUSD + ganancia;
    const gananciaPct = aportesUSD > 0 ? (ganancia / aportesUSD) * 100 : 0;
    // Promedio ponderado de días para anualizar
    const diasProm = ponderado > 0 ? (items.reduce((s,a) => s + a._dias * Number(a.monto || 0), 0) / aportesUSD) : 0;
    return {
      ...inv,
      nAportes: items.length,
      aportesUSD,
      ponderado, participacion, ganancia,
      totalDevolver, gananciaPct, diasProm,
      excluido: exSet.has(inv.id),
    };
  });

  // Faltante como "inversor" virtual al final del listado
  const faltante = {
    id: FALTANTE_ID,
    nombre: "Faltante",
    contacto: null,
    moneda_habitual: "USD",
    es_faltante: true,
    nAportes: montoFaltante > 0 ? 1 : 0,
    aportesUSD: montoFaltante,
    ponderado: ponderadoFaltante,
    participacion: totalPonderado > 0 ? (ponderadoFaltante / totalPonderado) * 100 : 0,
    ganancia: gananciaTotal > 0 && totalPonderado > 0
      ? (gananciaTotal * ponderadoFaltante) / totalPonderado : 0,
    totalDevolver: montoFaltante + (gananciaTotal > 0 && totalPonderado > 0
      ? (gananciaTotal * ponderadoFaltante) / totalPonderado : 0),
    gananciaPct: montoFaltante > 0 && gananciaTotal > 0 && totalPonderado > 0
      ? (((gananciaTotal * ponderadoFaltante) / totalPonderado) / montoFaltante) * 100
      : 0,
    diasProm: diasFaltante,
    fechaInicio: fechaFaltante,
  };

  // % recaudado del costo total
  const pctRecaudado = costo > 0 ? (totalAportadoUSD / costo) * 100 : 0;

  // Duración total del proyecto (para anualización del proyecto).
  // Si hay override de fecha de corte, se usa esa fecha como "fin" virtual.
  const diasProyecto = daysBetween(proyecto?.fecha_inicio, fechaCorte) || 365;
  // Promedio ponderado de días de los aportes (para anualización por inversor)

  return {
    fechaCorte,
    venta, costo, gananciaTotal,
    totalPonderado,
    totalAportadoUSD,
    pctRecaudado,
    diasProyecto,
    montoFaltante,
    fechaFaltante,
    aportes: aportesFinal,
    porInversor,
    faltante,
  };
}
