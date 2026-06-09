// Utilidades para el cálculo de ponderación por días en el proyecto.
// Cada aporte se pondera: monto × días entre `fecha_inicio_calculo`
// (o, en su defecto, `fecha`) y la fecha de corte del proyecto
// (`fecha_fin` si existe; si no, hoy).
// El % de participación de cada aporte/inversor sale del pool ponderado.

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

/**
 * Calcula ponderación, % participación y ganancia estimada por aporte
 * e inversor.
 *
 * @param {object} proyecto - con fecha_fin, precio_venta_estimado, costo_total_estimado
 * @param {Array}  aportes  - aportes del proyecto
 * @param {Array}  inversores - inversores del proyecto
 */
export function computePonderacion({ proyecto, aportes = [], inversores = [] }) {
  const fechaCorte = proyecto?.fecha_fin || todayISO();
  const venta = Number(proyecto?.precio_venta_estimado || 0);
  const costo = Number(proyecto?.costo_total_estimado  || 0);
  const gananciaTotal = venta - costo;

  // Ponderación por aporte
  const aportesConPonderado = aportes.map((a) => {
    const start = a.fecha_inicio_calculo || a.fecha;
    const dias = daysBetween(start, fechaCorte);
    const monto = Number(a.monto || 0);
    const ponderado = monto * dias;
    return { ...a, _dias: dias, _ponderado: ponderado, _fechaInicioCalculo: start };
  });

  const totalPonderado = aportesConPonderado.reduce((s, a) => s + a._ponderado, 0);

  // Asigno % por aporte
  const aportesFinal = aportesConPonderado.map((a) => {
    const pct = totalPonderado > 0 ? (a._ponderado / totalPonderado) * 100 : 0;
    const gan = gananciaTotal > 0 ? (gananciaTotal * pct) / 100 : 0;
    return { ...a, _participacion: pct, _ganancia: gan };
  });

  // Resumen por inversor
  const porInversor = inversores.map((inv) => {
    const items = aportesFinal.filter((a) => a.inversor_id === inv.id);
    const aportesUSD = items.filter(a => a.moneda === "USD").reduce((s,a) => s + Number(a.monto || 0), 0);
    const aportesARS = items.filter(a => a.moneda === "ARS").reduce((s,a) => s + Number(a.monto || 0), 0);
    const ponderado = items.reduce((s, a) => s + a._ponderado, 0);
    const participacion = totalPonderado > 0 ? (ponderado / totalPonderado) * 100 : 0;
    const ganancia = gananciaTotal > 0 ? (gananciaTotal * participacion) / 100 : 0;
    return {
      ...inv,
      nAportes: items.length,
      aportesUSD, aportesARS,
      ponderado, participacion, ganancia,
    };
  });

  return {
    fechaCorte,
    venta, costo, gananciaTotal,
    totalPonderado,
    aportes: aportesFinal,
    porInversor,
  };
}
