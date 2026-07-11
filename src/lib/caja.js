// Saldo GLOBAL de la caja del proyecto (sin desglose por titular), en ARS y USD.
// Replica la lógica de la página de Caja: aportes que entran a caja + movimientos
// (ingreso / egreso / egreso con cambio integrado / cambio). Los traspasos no
// cambian el total de cada moneda (son internos entre titulares).
export function saldosCaja(aportes = [], movs = []) {
  let usd = 0, ars = 0;
  for (const a of aportes) {
    if (a.entra_a_caja === false) continue;
    const m = Number(a.monto || 0);
    if (a.moneda === "USD") usd += m; else ars += m;
  }
  for (const mv of movs) {
    const m = Number(mv.monto || 0);
    if (mv.tipo === "ingreso") {
      if (mv.moneda === "USD") usd += m; else ars += m;
    } else if (mv.tipo === "egreso") {
      if (mv.con_cambio) {
        const origen = mv.cambio_moneda_origen;
        const tc = Number(mv.cambio_tipo_cambio || 0);
        const monOrigen = Number(mv.cambio_monto_origen || 0);
        if (origen === "USD") usd -= monOrigen; else ars -= monOrigen;
        const entrada = origen === "USD" ? monOrigen * tc : (tc > 0 ? monOrigen / tc : 0);
        if (mv.moneda === "USD") usd += entrada; else ars += entrada;
        if (m > 0) { if (mv.moneda === "USD") usd -= m; else ars -= m; }
      } else {
        if (mv.moneda === "USD") usd -= m; else ars -= m;
      }
    } else if (mv.tipo === "cambio") {
      const md = Number(mv.monto_destino || 0);
      if (mv.moneda === "USD") usd -= m; else ars -= m;
      if (mv.moneda_destino === "USD") usd += md; else ars += md;
    }
    // traspaso: no cambia los totales globales por moneda
  }
  return { usd, ars };
}
