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
 * Tasa anualizada compuesta a partir de un ROI total y una duración en días.
 *   anual = (1 + ROI)^(365/dias) - 1
 * Devuelve el porcentaje (ej. 18.42 para 18.42 %) o null si no se puede.
 */
export function anualizada(roiPct, dias) {
  if (dias === null || dias === undefined || dias <= 0) return null;
  if (roiPct === null || roiPct === undefined || Number.isNaN(Number(roiPct))) return null;
  const r = Number(roiPct) / 100;
  if (1 + r <= 0) return null;
  const a = Math.pow(1 + r, 365 / dias) - 1;
  return a * 100;
}
