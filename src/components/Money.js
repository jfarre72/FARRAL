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
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso);
  return `${m[3]}/${m[2]}/${m[1]}`;
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
