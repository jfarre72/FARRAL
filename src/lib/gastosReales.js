// Cálculo unificado del GASTO REAL en USD del proyecto.
// Única fuente de verdad usada por la portada, el panel de indicadores y el
// seguimiento económico, para que los tres muestren siempre el mismo número.
//
// Criterio (igual al de Seguimiento económico):
//  - Egreso en USD → su monto. Egreso en ARS → monto / tipo de cambio.
//  - El egreso de ACOPIO (anticipo_materiales) es financiero, no consumo: se
//    excluye. El gasto real de materiales se imputa vía los RETIROS (neto de
//    recupero), valuados al TC ponderado de cada cuenta de materiales.

// USD imputable de un movimiento de caja. Excluye el acopio (se cuenta por
// retiros) y los cambios puros de divisa.
export function gastoUSD(mv) {
  if (mv.tipo !== "egreso") return 0;
  if (mv.anticipo_materiales) return 0;
  const m = Number(mv.monto || 0);
  if (m <= 0) return 0;
  if (mv.moneda === "USD") return m;
  const tc = Number(mv.cambio_tipo_cambio || mv.tipo_cambio_gasto || 0);
  return tc > 0 ? m / tc : 0;
}

// El concepto de "Obra" (el que usa etapas) recibe el consumo de materiales.
export function obraConceptoDe(conceptos = []) {
  const obra = conceptos.filter(c => c.usa_etapas).map(c => c.nombre);
  return obra.length === 1 ? obra[0] : null;
}

// Retiros de materiales representados como gasto en USD (neto, imputado a su
// etapa). Cada anticipo congela su TC; el dólar de la cuenta es el promedio
// ponderado de sus anticipos reales. Devuelve una fila por retiro con su
// USD neto (usd), a recuperar (usdRec) y bruto (usdGross).
export function retirosMatDetalle({ cuentasMat = [], anticiposMat = [], retirosMat = [] }) {
  const byCuenta = {};
  for (const c of cuentasMat) byCuenta[c.id] = c;
  const arsAcc = {}, usdAcc = {};
  for (const a of anticiposMat) {
    if (a.es_devolucion) continue;
    const c = byCuenta[a.cuenta_id];
    if (!c || (c.moneda || "ARS") !== "ARS") continue;
    const tc = Number(a.tipo_cambio || 0), m = Number(a.monto || 0);
    if (tc > 0 && m > 0) { arsAcc[a.cuenta_id] = (arsAcc[a.cuenta_id] || 0) + m; usdAcc[a.cuenta_id] = (usdAcc[a.cuenta_id] || 0) + m / tc; }
  }
  const tcByCuenta = {};
  for (const id in arsAcc) tcByCuenta[id] = usdAcc[id] > 0 ? arsAcc[id] / usdAcc[id] : null;
  const usdDe = (c, monto, tc) => {
    if (!c || (c.moneda || "ARS") !== "ARS") return Number(monto || 0);
    const t = Number(tc || 0) > 0 ? Number(tc) : tcByCuenta[c.id];
    return t > 0 ? Number(monto || 0) / t : 0;
  };
  const recOf = (r) => {
    if (!r.recupero) return 0;
    if (Array.isArray(r.recupero_items) && r.recupero_items.length) {
      return r.recupero_items.reduce((s, it) => s + Number(it.total != null ? it.total : Number(it.cantidad || 0) * Number(it.precio || 0)), 0);
    }
    return Number(r.recupero_total || 0);
  };
  const det = [];
  for (const r of retirosMat) {
    const c = byCuenta[r.cuenta_id];
    if (!c) continue;
    const rec = recOf(r);
    const neto = Number(r.monto || 0) - rec;
    const usd = usdDe(c, neto, r.tipo_cambio);
    const usdRec = usdDe(c, rec, r.tipo_cambio);
    const usdGross = usdDe(c, Number(r.monto || 0), r.tipo_cambio);
    if (!usd && !usdRec) continue;
    det.push({
      id: "ret_" + (r.id ?? `${r.cuenta_id}_${r.fecha}_${r.monto}`),
      fecha: r.fecha, etapa: r.etapa || null,
      descripcion: `Materiales · ${c.proveedor}${r.descripcion ? ` · ${r.descripcion}` : ""}`,
      categoria: "Materiales", monto: neto, moneda: c.moneda,
      tc: Number(r.tipo_cambio || 0), usd, usdRec, usdGross,
    });
  }
  return det;
}

// Gastos reales unificados: egresos de Caja (sin acopio) + retiros de
// materiales como gasto en USD (neto, imputado a su etapa).
export function buildMovsReales({ movs = [], cuentasMat = [], anticiposMat = [], retirosMat = [], conceptos = [] }) {
  const det = retirosMatDetalle({ cuentasMat, anticiposMat, retirosMat });
  const obra = obraConceptoDe(conceptos);
  const mat = det.map(d => ({
    id: d.id, tipo: "egreso", fecha: d.fecha,
    moneda: d.moneda, monto: d.monto, tipo_cambio_gasto: d.tc > 0 ? d.tc : null,
    concepto: obra || null, etapa: d.etapa || null,
    tipo_costo: "Materiales", rubro: null, categoria: "Materiales",
    descripcion: d.descripcion, _material: true,
  }));
  return [...movs, ...mat];
}

// Total gastado en USD (egresos de caja sin acopio + retiros de materiales).
export function totalGastadoUSD(args) {
  return buildMovsReales(args).reduce((s, mv) => s + gastoUSD(mv), 0);
}
