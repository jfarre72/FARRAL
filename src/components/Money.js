"use client";

const formatters = {
  USD: new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }),
  ARS: new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }),
};

export function fmtMoney(value, currency = "USD") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const f = formatters[currency] ?? formatters.USD;
  return f.format(Number(value));
}

export function fmtPct(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toFixed(digits)}%`;
}

export function fmtNum(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("es-AR", { maximumFractionDigits: digits });
}

/**
 * Formatea fecha ISO (YYYY-MM-DD) como DD/MM/AAAA.
 * Acepta también ISO con timestamp (toma la parte de fecha).
 */
export function fmtDate(iso) {
  if (!iso) return "—";
  // Objeto Date (p. ej. fechas proyectadas del cronograma) → dd/mm/aaaa.
  if (iso instanceof Date) {
    if (isNaN(iso)) return "—";
    const dd = String(iso.getDate()).padStart(2, "0");
    const mm = String(iso.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${iso.getFullYear()}`;
  }
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Convierte un valor (Date u "YYYY-MM-DD") a Date a medianoche local, o null.
function aFecha(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  const d = new Date(String(v).slice(0, 10) + "T00:00:00");
  return isNaN(d) ? null : d;
}

/**
 * Duración entre dos fechas como "X meses y Y semanas", usando meses de
 * calendario reales y expresando el resto de días en semanas (7 días).
 * Función única y compartida para que todas las pantallas coincidan.
 * Ej.: 17/06/2026 → 21/04/2027 = "10 meses y 1 semana".
 */
export function fmtDuracion(desde, hasta) {
  const a = aFecha(desde), b = aFecha(hasta);
  if (!a || !b) return "—";
  const neg = b < a;
  const ini = neg ? b : a;
  const fin = neg ? a : b;
  let meses = (fin.getFullYear() - ini.getFullYear()) * 12 + (fin.getMonth() - ini.getMonth());
  let dias = fin.getDate() - ini.getDate();
  if (dias < 0) {
    meses -= 1;
    // Días tomando como base el último día del mes anterior a 'fin'.
    dias += new Date(fin.getFullYear(), fin.getMonth(), 0).getDate();
  }
  let semanas = Math.round(dias / 7);
  if (semanas >= 4) { meses += 1; semanas -= 4; } // 4 semanas redondeadas = 1 mes
  const partes = [];
  if (meses > 0) partes.push(`${meses} ${meses === 1 ? "mes" : "meses"}`);
  if (semanas > 0) partes.push(`${semanas} ${semanas === 1 ? "semana" : "semanas"}`);
  if (!partes.length) partes.push("menos de 1 semana");
  const txt = partes.join(" y ");
  return neg ? `−${txt}` : txt;
}

/**
 * Tasa anualizada SIMPLE (no compuesta).
 *   anual = ROI × 365 / dias
 * Devuelve el porcentaje (ej. 18.42 para 18.42 %) o null si no se puede.
 */
export function anualizada(roiPct, dias) {
  if (dias === null || dias === undefined || dias <= 0) return null;
  if (roiPct === null || roiPct === undefined || Number.isNaN(Number(roiPct))) return null;
  return Number(roiPct) * 365 / dias;
}
