// Endpoint que lee una LISTA DE PRECIOS de acopio desde un Excel/CSV adjunto y
// devuelve los renglones mapeados. Es cálculo puro (SheetJS): NO usa IA, así que
// no tiene costo por token y es instantáneo.
//
// Detecta las columnas por el nombre del encabezado (Código, Denominación,
// Precio, Descuento). Preserva los decimales tal como vienen en la planilla.

import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Adivina la categoría por palabras clave del nombre (para agrupar el consumo).
function categoriaDe(nombre) {
  const s = (nombre || "").toLowerCase();
  const has = (...ws) => ws.some((w) => s.includes(w));
  if (has("cemento")) return "Cemento";
  if (has("cal ", "cal aerea", "cal comun", "cal hidra")) return "Cal";
  if (has("arena")) return "Arena";
  if (has("piedra", "granza", "canto rodado", "cascote")) return "Piedra/Granza";
  if (has("ladrillo", "bloque", "retak", "hueco", "portante", "telgopor", "viga")) return "Ladrillos/Bloques";
  if (has("hierro", "acero", "clavo", "alambre", "barra")) return "Hierro/Acero";
  if (has("malla")) return "Malla";
  if (has("hormigon", "hormigón")) return "Hormigón";
  if (has("madera", "fenolico", "tabla", "tirante")) return "Madera";
  if (has("aislante", "membrana", "poliestireno", "lana de vidrio", "hidrofugo", "ceresita")) return "Aislaciones";
  if (has("caño", "cano ", "pvc", "cloacal", "hidraul")) return "Hidráulica";
  if (has("cable", "electric", "termica", "disyuntor")) return "Electricidad";
  if (has("pintura", "latex", "esmalte", "enduido", "fijador")) return "Pintura";
  if (has("puerta", "ventana", "abertura", "marco")) return "Aberturas";
  if (has("pegamento", "yeso", "revoque", "hidralit", "seco placa", "montante", "solera", "tacuru")) return "Otros";
  return "Otros";
}

// Interpreta un número que puede venir como number (Excel) o string con
// separadores de miles AR/US. Preserva decimales: "9.935,56" => 9935.56.
function parseNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const hasComma = s.includes(","), hasDot = s.includes(".");
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    const parts = s.split(",");
    s = parts[parts.length - 1].length === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot) {
    const parts = s.split(".");
    if (parts.length > 1 && parts[parts.length - 1].length === 3) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const norm = (v) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

// Dada una fila de encabezados, mapea qué índice corresponde a cada campo.
// Devuelve null si no encuentra al menos denominación + precio.
function mapearColumnas(headers) {
  const H = headers.map(norm);
  const find = (preds) => {
    for (let i = 0; i < H.length; i++) if (preds(H[i], i)) return i;
    return -1;
  };
  // Descuento primero (para que "descto" no se confunda con "denominación").
  const iDesc = find((h) => h.includes("descto") || h.includes("descuen") || h.includes("bonif") || h === "desc" || h.includes("%"));
  const iCod = find((h) => h.startsWith("cod") || h === "art" || h.includes("codigo") || h.includes("sku") || h.includes("articulo"));
  const iMat = find((h) => h.includes("denomi") || h.includes("descrip") || h.includes("produc") || h.includes("articul") || h.includes("detalle") || h.includes("material"));
  const iUni = find((h) => h === "um" || h.includes("unidad") || h === "u.m." || h.includes("medida"));
  const iPrec = find((h, i) => (h.includes("precio") || h.includes("p.unit") || h.includes("unitario") || h.includes("importe")) && i !== iDesc);
  if (iMat < 0 || iPrec < 0) return null;
  return { iCod, iMat, iUni, iPrec, iDesc };
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { body = {}; }
  const base64 = body?.base64 || "";
  if (!base64) return Response.json({ ok: false, error: "SIN_ARCHIVO" }, { status: 200 });

  let rows;
  try {
    const buf = Buffer.from(base64, "base64");
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // header:1 => matriz de filas (arreglos), sin asumir dónde está el encabezado.
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false, defval: "" });
  } catch (e) {
    return Response.json({ ok: false, error: "PARSEO", detalle: String(e?.message || e) }, { status: 200 });
  }
  if (!Array.isArray(rows) || !rows.length) {
    return Response.json({ ok: false, error: "VACIO" }, { status: 200 });
  }

  // Busco la fila de encabezados en las primeras 15 filas.
  let headerIdx = -1, cols = null;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const m = mapearColumnas(rows[i] || []);
    if (m) { headerIdx = i; cols = m; break; }
  }
  if (!cols) {
    return Response.json({ ok: false, error: "SIN_COLUMNAS" }, { status: 200 });
  }

  const items = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const material = String(r[cols.iMat] ?? "").trim();
    const bruto = parseNum(r[cols.iPrec]);
    if (!material && bruto == null) continue;
    // Salteo subtotales / renglones sin denominación real.
    if (!material) continue;
    let desc = cols.iDesc >= 0 ? parseNum(r[cols.iDesc]) : 0;
    if (desc == null || desc < 0) desc = 0;
    if (desc > 100) desc = 100;
    const neto = bruto != null ? Math.round(bruto * (1 - desc / 100) * 100) / 100 : null;
    const codigo = cols.iCod >= 0 ? String(r[cols.iCod] ?? "").trim() : "";
    const unidad = cols.iUni >= 0 ? String(r[cols.iUni] ?? "").trim().toLowerCase() : "";
    items.push({
      codigo,
      material,
      unidad: unidad || "unidad",
      categoria: categoriaDe(material),
      precio_bruto: bruto,
      descuento: desc,
      precio: neto,
    });
  }

  return Response.json({ ok: true, items, filas: items.length, mapeo: cols }, { status: 200 });
}
