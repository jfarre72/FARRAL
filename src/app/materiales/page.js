"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, Grid, TextField, MenuItem,
  Button, IconButton, Tooltip, LinearProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, Accordion, AccordionSummary, AccordionDetails, Table, TableHead,
  TableBody, TableRow, TableCell, Chip, Link, ToggleButton, ToggleButtonGroup,
  Divider, FormControlLabel, Switch, useMediaQuery, Tabs, Tab, Autocomplete,
  Checkbox,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import * as XLSX from "xlsx";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtMoney, fmtDate } from "@/components/Money";

const BUCKET = "galeria"; // reutilizamos el bucket público existente

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const emptyCuenta = { proveedor: "", descripcion: "", moneda: "ARS", monto_inicial: "", tipo_cambio: "", fecha: hoyISO() };

// Etapas por defecto si el proyecto todavía no tiene hitos cargados.
const ETAPAS_DEFAULT = [
  "Inicio", "Cimentación", "Estructura",
  "Obra cerrada", "Instalaciones + revoques", "Terminada",
];

// Formatea una cantidad sin decimales innecesarios (ej. 3, 2.5).
const fmtNum0 = (val) => {
  const n = Number(val || 0);
  return Number.isInteger(n) ? String(n) : n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
};

// Ítem vacío para el formulario de recupero (varios por retiro).
const emptyRecItem = () => ({ unidad: "pallet", cantidad: "", precio: "" });

// Categorías normalizadas de material (deben coincidir con /api/ia/remito).
const CATEGORIAS_MAT = [
  "Cemento", "Cal", "Arena", "Piedra/Granza", "Ladrillos/Bloques",
  "Hierro/Acero", "Malla", "Hormigón", "Madera", "Aislaciones",
  "Hidráulica", "Electricidad", "Pintura", "Aberturas", "Otros",
];
// Ítem vacío de material (renglón del remito). precio = precio unitario de la
// lista del acopio; el subtotal es cantidad × precio.
const emptyMatItem = () => ({ codigo: "", material: "", cantidad: "", unidad: "unidad", categoria: "Otros", precio: "" });
// Ítem vacío de lista de precios de acopio.
const emptyPrecioItem = () => ({ codigo: "", material: "", unidad: "unidad", categoria: "Otros", precio_bruto: "", descuento: "0", precio: "" });
// Neto de una fila de lista = bruto × (1 − descuento/100), redondeado a 2 decimales.
const netoDe = (bruto, desc) => {
  const b = Number(bruto || 0);
  let d = Number(desc || 0);
  if (!Number.isFinite(d) || d < 0) d = 0;
  if (d > 100) d = 100;
  return Math.round(b * (1 - d / 100) * 100) / 100;
};

// Interpreta una cantidad con separadores de miles en cualquier convención:
// "1,000.00" y "1.000,00" => 1000; "3.00" => 3; "1,000" => 1000.
const parseCantidad = (v) => {
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
};

// Reduce una imagen a un tamaño manejable y la devuelve como base64 (sin el
// prefijo data:) + media type, para mandarla al lector de remitos.
async function imagenAOptimizada(file, maxDim = 1600, quality = 0.72) {
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const escala = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * escala));
  const h = Math.max(1, Math.round(img.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL("image/jpeg", quality);
  return { base64: out.split(",")[1], mediaType: "image/jpeg" };
}

// Lee un archivo cualquiera (PDF o imagen) y lo devuelve como base64 sin el
// prefijo data:, junto con su media type. Para PDFs, que van al lector nativo.
async function archivoABase64(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
  const base64 = String(dataUrl).split(",")[1] || "";
  return { base64, mediaType: file.type || "application/octet-stream" };
}

// Detecta si un ítem del remito es un envase retornable (pallet / bolsón que se
// devuelve). Se basa en el texto: "retornable", "devolución", "con boleta"…
// No marca los bolsones que son producto (ej. "ARENA X BOLSON").
const esRetornable = (it) => {
  const t = `${it?.material || ""} ${it?.unidad || ""}`.toLowerCase();
  return /(retornab|devoluc|retorno|con boleta)/.test(t);
};
// Unidad de recupero (pallet o bolsón) inferida del texto del ítem.
const unidadRecupero = (it) =>
  /pallet|palet|tarima/.test(`${it?.material || ""} ${it?.unidad || ""}`.toLowerCase()) ? "pallet" : "bolson";

// Devuelve los ítems de recupero de un retiro como arreglo normalizado.
// Usa recupero_items (V28) si existe; si no, sintetiza el ítem único de la V27.
const itemsRecupero = (r) => {
  if (!r?.recupero) return [];
  if (Array.isArray(r.recupero_items) && r.recupero_items.length) {
    return r.recupero_items.map(it => ({
      unidad: it.unidad === "bolson" ? "bolson" : "pallet",
      cantidad: Number(it.cantidad || 0),
      precio: Number(it.precio || 0),
      total: Number(it.total != null ? it.total : Number(it.cantidad || 0) * Number(it.precio || 0)),
    }));
  }
  // Legado V27: un solo ítem en columnas planas.
  return [{
    unidad: r.recupero_unidad === "bolson" ? "bolson" : "pallet",
    cantidad: Number(r.recupero_cantidad || 0),
    precio: Number(r.recupero_precio || 0),
    total: Number(r.recupero_total || 0),
  }];
};

// Formatea un string numérico con separadores de miles (formato AR: punto miles, coma decimal).
const fmtMiles = (val) => {
  if (val === "" || val === null || val === undefined) return "";
  // El estado guarda el valor en formato JS (punto = decimal, sin separador
  // de miles). Sólo si viene en formato AR (con coma) normalizo coma->punto y
  // descarto los puntos de miles; si no, conservo el punto como decimal.
  let s = String(val);
  s = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (s === "" || s === "-") return s;
  const neg = s.startsWith("-");
  const [intPart, decPart] = s.replace("-", "").split(".");
  const intFmt = (intPart || "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  let out = (neg ? "-" : "") + (intFmt || "0");
  if (decPart !== undefined) out += "," + decPart;
  return out;
};
// Devuelve un string apto para Number(), interpretando separadores de miles y
// decimales. Es IDEMPOTENTE: entiende tanto el formato de pantalla AR
// ("721.131,52" -> "721131.52") como el valor ya normalizado ("721131.52"),
// para que aplicarla dos veces no rompa el decimal.
const parseMiles = (val) => {
  if (val === "" || val === null || val === undefined) return "";
  let s = String(val).trim().replace(/[^\d.,-]/g, "");
  if (s === "" || s === "-") return s;
  const neg = s.startsWith("-");
  s = s.replace(/^-/, "");
  const hasComma = s.includes(","), hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // El último separador es el decimal; el otro es de miles.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    // Coma sola: siempre es el separador decimal (AR).
    s = s.replace(",", ".");
  } else if (hasDot) {
    // Punto solo: es de miles si hay más de un grupo y el último es de 3 dígitos
    // (ej "721.131", "1.500.000"); si no, es decimal (ej "721131.52").
    const p = s.split(".");
    if (p.length > 2 || (p.length === 2 && p[1].length === 3)) s = s.replace(/\./g, "");
  }
  return (neg ? "-" : "") + s;
};

export default function MaterialesPage() {
  const { proyecto } = useProjects();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [cuentas, setCuentas] = useState([]);
  const [anticipos, setAnticipos] = useState([]);
  const [retiros, setRetiros] = useState([]);
  const [recuperos, setRecuperos] = useState([]); // ingresos de caja marcados como recupero
  const [hitos, setHitos] = useState([]); // nombres de etapas del proyecto
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0); // 0 = Cuentas, 1 = Cuenta corriente, 2 = Por etapa, 3 = Consumo, 4 = Control por lista
  const [cuentaSel, setCuentaSel] = useState(""); // cuenta elegida en la solapa de cuenta corriente
  const [consumoEtapa, setConsumoEtapa] = useState(""); // filtro de etapa en la solapa de consumo
  const [leyendoIA, setLeyendoIA] = useState(null); // cuentaId con lectura de remito en curso

  // Dialog cuenta
  const [openCuenta, setOpenCuenta] = useState(false);
  const [formCuenta, setFormCuenta] = useState(emptyCuenta);
  const [editCuentaId, setEditCuentaId] = useState(null);
  const [errCuenta, setErrCuenta] = useState(null);
  const [saving, setSaving] = useState(false);

  // Alta de retiro por cuenta
  const [nuevoRetiro, setNuevoRetiro] = useState({}); // { [cuentaId]: { fecha, descripcion, monto, file } }
  const [subiendo, setSubiendo] = useState(null); // cuentaId en curso

  const reload = async () => {
    if (!proyecto) return;
    setLoading(true);
    const { data: cs } = await supabase
      .from("cuentas_materiales").select("*").eq("proyecto_id", proyecto.id)
      .order("fecha", { ascending: false });
    const ids = (cs ?? []).map(c => c.id);
    let rs = [], rec = [], ant = [];
    if (ids.length) {
      const { data: as } = await supabase
        .from("anticipos_materiales").select("*").in("cuenta_id", ids)
        .order("fecha", { ascending: true }).order("created_at", { ascending: true });
      ant = as ?? [];
      const { data } = await supabase
        .from("retiros_materiales").select("*").in("cuenta_id", ids)
        .order("fecha", { ascending: false }).order("created_at", { ascending: false });
      rs = data ?? [];
      const { data: rc } = await supabase
        .from("movimientos_caja")
        .select("id, fecha, monto, moneda, cuenta_materiales_id, recupero_pallets, recupero_bolsones")
        .eq("proyecto_id", proyecto.id)
        .eq("tipo", "ingreso")
        .eq("recupero_materiales", true)
        .in("cuenta_materiales_id", ids);
      rec = rc ?? [];
    }
    const { data: hs } = await supabase
      .from("hitos").select("nombre,orden").eq("proyecto_id", proyecto.id).order("orden");
    setCuentas(cs ?? []);
    setAnticipos(ant);
    setRetiros(rs);
    setRecuperos(rec);
    setHitos((hs ?? []).map(h => h.nombre));
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const retirosDe = (cuentaId) => retiros.filter(r => r.cuenta_id === cuentaId);
  const recuperosDe = (cuentaId) => recuperos.filter(r => r.cuenta_materiales_id === cuentaId);
  const anticiposDe = (cuentaId) => anticipos.filter(a => a.cuenta_id === cuentaId);
  // Anticipos "reales" (acopios) vs devoluciones a saldo (recupero acreditado en
  // la cuenta). Ambos suman al anticipo total / saldo, pero se muestran y cuentan
  // por separado.
  const anticiposReales = (cuentaId) => anticiposDe(cuentaId).filter(a => !a.es_devolucion);
  const devolucionesDe = (cuentaId) => anticiposDe(cuentaId).filter(a => a.es_devolucion);

  // ---- Valuación en USD (gasto real por etapa) ----
  // Cada anticipo congela su propio TC (lista nueva = nuevo acopio = nuevo TC).
  // El TC de la cuenta es el promedio ponderado de sus anticipos reales:
  //   TC = total ARS anticipado / total USD anticipado.
  // En cuentas USD no aplica (el USD es el monto directo).
  const esARS = (c) => (c?.moneda || "ARS") === "ARS";
  const tcDe = (c) => {
    if (!esARS(c)) return null;
    const reales = anticiposReales(c.id).filter(a => Number(a.tipo_cambio || 0) > 0 && Number(a.monto || 0) > 0);
    const ars = reales.reduce((s, a) => s + Number(a.monto || 0), 0);
    const usd = reales.reduce((s, a) => s + Number(a.monto || 0) / Number(a.tipo_cambio), 0);
    return usd > 0 ? ars / usd : null;
  };
  // TC del último acopio cargado (para sugerir en el retiro).
  const ultimoTcDe = (cuentaId) => {
    const reales = anticiposReales(cuentaId).filter(a => Number(a.tipo_cambio || 0) > 0);
    return reales.length ? Number(reales[reales.length - 1].tipo_cambio) : null;
  };
  // Anticipos (acopios) que tienen lista de precios cargada.
  const anticiposConLista = (cuentaId) =>
    anticiposReales(cuentaId).filter(a => Array.isArray(a.lista_precios) && a.lista_precios.length);
  // Acopio "vigente" por FIFO: sumando los anticipos por fecha, el primero cuyo
  // acumulado supera lo ya retirado es el que se está consumiendo. Para valorizar
  // devuelvo su id sólo si tiene lista; si el vigente no tiene, uso el último con
  // lista cargada. "" si ningún acopio tiene lista.
  const anticipoVigenteId = (cuentaId) => {
    const conLista = anticiposConLista(cuentaId);
    if (!conLista.length) return "";
    const reales = anticiposReales(cuentaId).slice()
      .sort((a, b) => String(a.fecha || "").localeCompare(String(b.fecha || "")));
    const retirado = retiros.filter(r => r.cuenta_id === cuentaId).reduce((s, r) => s + Number(r.monto || 0), 0);
    let acum = 0;
    for (const a of reales) {
      acum += Number(a.monto || 0);
      if (acum > retirado && Array.isArray(a.lista_precios) && a.lista_precios.length) return a.id;
    }
    return conLista[conLista.length - 1].id;
  };
  // Lista de precios (arreglo de ítems) de un anticipo por id.
  const listaDe = (anticipoId) => {
    const a = anticipos.find(x => x.id === anticipoId);
    return Array.isArray(a?.lista_precios) ? a.lista_precios : [];
  };
  // Nº de lista (acopio) legible de un anticipo por id. Cae al Nº de acopio
  // cargado; si no hay, muestra los últimos 4 caracteres del id como referencia.
  const listaNroDe = (anticipoId) => {
    if (!anticipoId) return "";
    const a = anticipos.find(x => x.id === anticipoId);
    if (!a) return "";
    return a.acopio_nro ? String(a.acopio_nro) : `#${String(a.id).slice(-4)}`;
  };

  // USD de un monto en la moneda de la cuenta, usando el TC dado o el de la cuenta.
  const usdDe = (c, monto, tc) => {
    if (!esARS(c)) return Number(monto || 0);
    const t = Number(tc || 0) > 0 ? Number(tc) : tcDe(c);
    return t > 0 ? Number(monto || 0) / t : 0;
  };
  // Neto de un retiro en la moneda de la cuenta (monto - recupero del retiro).
  const netoRetiro = (r) => Number(r.monto || 0) - itemsRecupero(r).reduce((a, it) => a + it.total, 0);
  // Anticipo total de la cuenta: suma de sus anticipos; si todavía no tiene
  // (migración no corrida), cae al monto_inicial heredado.
  const totalAnticipoDe = (c) => {
    const as = anticiposDe(c.id);
    return as.length ? as.reduce((s, a) => s + Number(a.monto || 0), 0) : Number(c.monto_inicial || 0);
  };
  const calc = (c) => {
    const rs = retirosDe(c.id);
    const anticipado = totalAnticipoDe(c);
    const retirado = rs.reduce((s, r) => s + Number(r.monto || 0), 0);
    const saldo = anticipado - retirado;
    // Recupero: total a recuperar (de los retiros con recupero) vs ya recuperado.
    // El recupero puede cobrarse en efectivo (ingresos de caja) o acreditarse al
    // saldo de la cuenta (devoluciones a saldo). Ambos descuentan lo pendiente.
    const rec = recuperosDe(c.id);
    const dev = devolucionesDe(c.id);
    const aRecuperar = rs.reduce((s, r) => s + itemsRecupero(r).reduce((a, it) => a + it.total, 0), 0);
    const recuperadoCaja = rec.reduce((s, r) => s + Number(r.monto || 0), 0);
    const recuperadoSaldo = dev.reduce((s, a) => s + Number(a.monto || 0), 0);
    const recuperado = recuperadoCaja + recuperadoSaldo;
    const pendienteRecupero = aRecuperar - recuperado;
    // Cantidades de pallets / bolsones a devolver (de los retiros) vs devueltos
    // (sumando los recuperos de caja y las devoluciones a saldo).
    const palletsADevolver = rs.reduce((s, r) => s + itemsRecupero(r).reduce((a, it) => a + (it.unidad === "pallet" ? it.cantidad : 0), 0), 0);
    const bolsonesADevolver = rs.reduce((s, r) => s + itemsRecupero(r).reduce((a, it) => a + (it.unidad === "bolson" ? it.cantidad : 0), 0), 0);
    const palletsDevueltos = rec.reduce((s, r) => s + Number(r.recupero_pallets || 0), 0)
      + dev.reduce((s, a) => s + Number(a.rec_pallets || 0), 0);
    const bolsonesDevueltos = rec.reduce((s, r) => s + Number(r.recupero_bolsones || 0), 0)
      + dev.reduce((s, a) => s + Number(a.rec_bolsones || 0), 0);
    return { anticipado, retirado, saldo, n: rs.length, aRecuperar, recuperado, pendienteRecupero,
      palletsADevolver, bolsonesADevolver, palletsDevueltos, bolsonesDevueltos };
  };

  // Totales separados por moneda (ARS y USD no se mezclan).
  const totalesPorMoneda = useMemo(() => {
    const acc = {};
    const ensure = (m) => (acc[m] ??= {
      anticipado: 0, retirado: 0, aRecuperar: 0, recuperado: 0,
      palletsADevolver: 0, palletsDevueltos: 0, bolsonesADevolver: 0, bolsonesDevueltos: 0,
    });
    for (const c of cuentas) {
      const m = c.moneda || "ARS";
      const k = calc(c);
      const o = ensure(m);
      o.anticipado += k.anticipado;
      o.retirado += k.retirado;
      o.aRecuperar += k.aRecuperar;
      o.recuperado += k.recuperado;
      o.palletsADevolver += k.palletsADevolver;
      o.palletsDevueltos += k.palletsDevueltos;
      o.bolsonesADevolver += k.bolsonesADevolver;
      o.bolsonesDevueltos += k.bolsonesDevueltos;
    }
    for (const m in acc) {
      acc[m].saldo = acc[m].anticipado - acc[m].retirado;
      acc[m].pendienteRecupero = acc[m].aRecuperar - acc[m].recuperado;
    }
    return acc;
  }, [cuentas, anticipos, retiros, recuperos]);
  const monedasConCuentas = ["ARS", "USD"].filter(m => totalesPorMoneda[m]);

  // Gasto real por etapa en USD: por cada retiro, neto (monto - recupero)
  // valuado al TC congelado, imputado a su etapa. "A recuperar" = el recupero
  // del retiro (lo que se descontó), también en USD.
  const { gastoPorEtapa, totalNetoUSD, totalARecuperarUSD } = useMemo(() => {
    const map = {}; // etapa -> { netoUSD, aRecuperarUSD, n }
    let totalNetoUSD = 0, totalARecuperarUSD = 0;
    for (const c of cuentas) {
      for (const r of retirosDe(c.id)) {
        const et = r.etapa || "(Sin etapa)";
        const rec = itemsRecupero(r).reduce((a, it) => a + it.total, 0);
        const neto = Number(r.monto || 0) - rec;
        const netoUSD = usdDe(c, neto, r.tipo_cambio);
        const recUSD = usdDe(c, rec, r.tipo_cambio);
        (map[et] ??= { netoUSD: 0, aRecuperarUSD: 0, n: 0 });
        map[et].netoUSD += netoUSD;
        map[et].aRecuperarUSD += recUSD;
        map[et].n += 1;
        totalNetoUSD += netoUSD;
        totalARecuperarUSD += recUSD;
      }
    }
    const orden = (hitos.length ? hitos : ETAPAS_DEFAULT);
    const idx = Object.fromEntries(orden.map((n, i) => [n, i]));
    const filas = Object.entries(map).map(([etapa, v]) => ({ etapa, ...v }))
      .sort((a, b) => {
        if (a.etapa === "(Sin etapa)") return 1;
        if (b.etapa === "(Sin etapa)") return -1;
        return (idx[a.etapa] ?? 999) - (idx[b.etapa] ?? 999);
      });
    return { gastoPorEtapa: filas, totalNetoUSD, totalARecuperarUSD };
    // eslint-disable-next-line
  }, [cuentas, retiros, anticipos, hitos]);

  // ---- Cuenta ----
  const openNewCuenta = () => { setFormCuenta(emptyCuenta); setEditCuentaId(null); setErrCuenta(null); setOpenCuenta(true); };
  const openEditCuenta = (c) => {
    setFormCuenta({
      proveedor: c.proveedor ?? "", descripcion: c.descripcion ?? "",
      moneda: c.moneda ?? "ARS", monto_inicial: c.monto_inicial ?? "", fecha: c.fecha ?? hoyISO(),
    });
    setEditCuentaId(c.id); setErrCuenta(null); setOpenCuenta(true);
  };
  const saveCuenta = async () => {
    setErrCuenta(null);
    if (!formCuenta.proveedor.trim()) { setErrCuenta("El proveedor es obligatorio."); return; }
    setSaving(true);
    if (editCuentaId) {
      // En edición no se toca el anticipo: los anticipos se gestionan dentro
      // de la cuenta (varios acopios). Sólo datos de la cuenta.
      const res = await supabase.from("cuentas_materiales").update({
        proveedor: formCuenta.proveedor.trim(),
        descripcion: formCuenta.descripcion || null,
        moneda: formCuenta.moneda,
        fecha: formCuenta.fecha || null,
      }).eq("id", editCuentaId);
      setSaving(false);
      if (res.error) { setErrCuenta(res.error.message); return; }
      setOpenCuenta(false); reload();
      return;
    }
    // Alta: sólo creo la cuenta. Los acopios (anticipos) se cargan desde Caja.
    const ins = await supabase.from("cuentas_materiales").insert({
      proyecto_id: proyecto.id,
      proveedor: formCuenta.proveedor.trim(),
      descripcion: formCuenta.descripcion || null,
      moneda: formCuenta.moneda,
      monto_inicial: 0, // legado; los anticipos van en anticipos_materiales
      fecha: formCuenta.fecha || null,
    }).select("id").single();
    if (ins.error) { setSaving(false); setErrCuenta(ins.error.message); return; }
    setSaving(false);
    setOpenCuenta(false); reload();
  };

  // ---- Anticipos (acopios sucesivos de una cuenta) ----
  const [nuevoAnticipo, setNuevoAnticipo] = useState({}); // { [cuentaId]: { monto, fecha } }
  const [editAnt, setEditAnt] = useState(null); // anticipo en edición
  const setAnt = (cuentaId, patch) =>
    setNuevoAnticipo(prev => ({ ...prev, [cuentaId]: { monto: "", tc: "", fecha: hoyISO(), ...prev[cuentaId], ...patch } }));
  const addAnticipo = async (cuentaId) => {
    const f = nuevoAnticipo[cuentaId] || {};
    const monto = Number(parseMiles(f.monto ?? "")) || 0;
    if (monto <= 0) { alert("Ingresá el monto del anticipo."); return; }
    const c = cuentas.find(x => x.id === cuentaId);
    const tc = Number(parseMiles(f.tc ?? "")) || 0;
    if (esARS(c) && tc <= 0) { alert("Ingresá el tipo de cambio del acopio (ARS por 1 USD)."); return; }
    const datos = { monto, fecha: f.fecha || hoyISO(), tipo_cambio: esARS(c) ? tc : null };
    const editing = editAnt && editAnt.cuenta_id === cuentaId;
    const { error } = editing
      ? await supabase.from("anticipos_materiales").update(datos).eq("id", editAnt.id)
      : await supabase.from("anticipos_materiales").insert({ cuenta_id: cuentaId, ...datos });
    if (error) { alert(error.message); return; }
    setEditAnt(null);
    setNuevoAnticipo(prev => ({ ...prev, [cuentaId]: { monto: "", tc: "", fecha: hoyISO() } }));
    reload();
  };
  const startEditAnticipo = (a) => {
    setEditAnt(a);
    setNuevoAnticipo(prev => ({ ...prev, [a.cuenta_id]: {
      monto: a.monto != null ? String(a.monto) : "",
      tc: a.tipo_cambio != null ? String(a.tipo_cambio) : "",
      fecha: a.fecha || hoyISO(),
    } }));
  };
  const cancelEditAnticipo = (cuentaId) => {
    setEditAnt(null);
    setNuevoAnticipo(prev => ({ ...prev, [cuentaId]: { monto: "", tc: "", fecha: hoyISO() } }));
  };
  const delAnticipo = async (a) => {
    if (!confirm("¿Eliminar este anticipo?")) return;
    const { error } = await supabase.from("anticipos_materiales").delete().eq("id", a.id);
    if (error) alert(error.message); else reload();
  };

  // ---- Lista de precios del acopio (diálogo por anticipo) ----
  const [listaDlg, setListaDlg] = useState(null); // { anticipo, cuenta, items, file, acopio_nro }
  const [leyendoLista, setLeyendoLista] = useState(false);
  const [guardandoLista, setGuardandoLista] = useState(false);
  const openListaDlg = (a, c) => {
    const items = Array.isArray(a.lista_precios) && a.lista_precios.length
      ? a.lista_precios.map(it => ({
          codigo: it.codigo || "",
          material: it.material || "",
          unidad: it.unidad || "unidad",
          categoria: CATEGORIAS_MAT.includes(it.categoria) ? it.categoria : "Otros",
          precio_bruto: it.precio_bruto != null ? String(it.precio_bruto) : "",
          descuento: it.descuento != null ? String(it.descuento) : "0",
        }))
      : [emptyPrecioItem()];
    setListaDlg({ anticipo: a, cuenta: c, items, file: null, acopio_nro: a.acopio_nro || "" });
  };
  const setListaItem = (idx, patch) =>
    setListaDlg(prev => prev && ({ ...prev, items: prev.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
  const addListaItem = () =>
    setListaDlg(prev => prev && ({ ...prev, items: [...prev.items, emptyPrecioItem()] }));
  const delListaItem = (idx) =>
    setListaDlg(prev => prev && ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  // Lee la lista de precios (foto o PDF) con IA y llena la tabla del diálogo.
  const leerListaIA = async () => {
    const dlg = listaDlg;
    if (!dlg?.file) { alert("Adjuntá la foto o el PDF de la lista de acopio."); return; }
    const file = dlg.file;
    const esImagen = file.type?.startsWith("image/");
    const esPDF = file.type === "application/pdf";
    if (!esImagen && !esPDF) { alert("La lista tiene que ser una imagen o un PDF."); return; }
    setLeyendoLista(true);
    try {
      const payload = {};
      if (esPDF) { const { base64 } = await archivoABase64(file); payload.pdfBase64 = base64; }
      else { const { base64, mediaType } = await imagenAOptimizada(file, 2000, 0.8); payload.imagenBase64 = base64; payload.mediaType = mediaType; }
      const res = await fetch("/api/ia/lista-precios", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) {
        const msg = {
          FALTA_API_KEY: "Falta configurar la API key (ANTHROPIC_API_KEY) en Vercel.",
          SIN_ARCHIVO: "No se recibió el archivo.",
          PARSEO: "No pude interpretar la lista. Cargá los precios a mano.",
          API_ERROR: "Error del asistente: " + (data.detalle || ""),
          RED: "Error de red: " + (data.detalle || ""),
        }[data.error] || ("Error: " + (data.error || "desconocido"));
        alert(msg); return;
      }
      if (data.usage) {
        supabase.from("ia_uso").insert({
          proyecto_id: proyecto?.id ?? null, tipo: "lista_precios", modelo: data.usage.modelo,
          input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens, costo_usd: data.usage.costo_usd,
        });
      }
      const items = (data.items || []).map(it => ({
        codigo: it.codigo || "",
        material: it.material || "",
        unidad: it.unidad || "unidad",
        categoria: CATEGORIAS_MAT.includes(it.categoria) ? it.categoria : "Otros",
        precio_bruto: it.precio_bruto != null ? String(it.precio_bruto) : "",
        descuento: it.descuento != null ? String(it.descuento) : "0",
      }));
      setListaDlg(prev => prev && ({
        ...prev,
        items: items.length ? items : [emptyPrecioItem()],
        acopio_nro: prev.acopio_nro || (data.acopio_nro ? String(data.acopio_nro) : ""),
      }));
      if (!items.length) alert("No pude leer precios de la lista. Cargalos a mano.");
      else if (data.nota) alert("Nota IA: " + data.nota);
    } catch (e) {
      alert("No se pudo procesar el archivo: " + (e?.message || e));
    } finally {
      setLeyendoLista(false);
    }
  };
  // Importa la lista desde un Excel/CSV adjunto (cálculo puro, SIN IA => gratis).
  const importarExcel = async () => {
    const dlg = listaDlg;
    if (!dlg?.file) { alert("Adjuntá el Excel (.xlsx/.xls) o CSV de la lista."); return; }
    setLeyendoLista(true);
    try {
      const { base64 } = await archivoABase64(dlg.file);
      const res = await fetch("/api/materiales/lista-excel", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ base64 }),
      });
      const data = await res.json();
      if (!data.ok) {
        const msg = {
          SIN_ARCHIVO: "No se recibió el archivo.",
          VACIO: "El Excel está vacío.",
          SIN_COLUMNAS: "No encontré las columnas. Asegurate de que la planilla tenga encabezados con al menos “Denominación” (o Descripción/Material) y “Precio”.",
          PARSEO: "No pude leer el Excel: " + (data.detalle || ""),
        }[data.error] || ("Error: " + (data.error || "desconocido"));
        alert(msg); return;
      }
      const items = (data.items || []).map(it => ({
        codigo: it.codigo || "",
        material: it.material || "",
        unidad: it.unidad || "unidad",
        categoria: CATEGORIAS_MAT.includes(it.categoria) ? it.categoria : "Otros",
        precio_bruto: it.precio_bruto != null ? String(it.precio_bruto) : "",
        descuento: it.descuento != null ? String(it.descuento) : "0",
      }));
      setListaDlg(prev => prev && ({ ...prev, items: items.length ? items : [emptyPrecioItem()] }));
      if (!items.length) alert("No encontré renglones en el Excel. Revisá que tenga columnas de Denominación y Precio.");
    } catch (e) {
      alert("No se pudo leer el Excel: " + (e?.message || e));
    } finally {
      setLeyendoLista(false);
    }
  };

  // Guarda la lista congelada dentro del anticipo (+ sube el archivo adjunto).
  const saveLista = async () => {
    const dlg = listaDlg;
    if (!dlg) return;
    setGuardandoLista(true);
    try {
      const lista = dlg.items.map(it => {
        const bruto = Number(parseMiles(it.precio_bruto ?? "")) || 0;
        const desc = Number(parseMiles(it.descuento ?? "")) || 0;
        return {
          codigo: (it.codigo || "").toString().trim() || null,
          material: (it.material || "").trim(),
          unidad: (it.unidad || "unidad").toString().trim().toLowerCase() || "unidad",
          categoria: CATEGORIAS_MAT.includes(it.categoria) ? it.categoria : "Otros",
          precio_bruto: bruto || null,
          descuento: desc || 0,
          precio: netoDe(bruto, desc),
        };
      }).filter(it => it.material || it.precio_bruto != null);

      const datos = { lista_precios: lista.length ? lista : null, acopio_nro: (dlg.acopio_nro || "").trim() || null };
      // Subo el archivo adjunto de la lista, si hay uno nuevo.
      if (dlg.file) {
        const ext = (dlg.file.name.split(".").pop() || "bin").toLowerCase();
        const path = `${proyecto.id}/materiales/listas/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, dlg.file, { upsert: false });
        if (upErr) { alert(upErr.message); setGuardandoLista(false); return; }
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        if (dlg.anticipo.lista_precios_path) await supabase.storage.from(BUCKET).remove([dlg.anticipo.lista_precios_path]);
        datos.lista_precios_url = pub.publicUrl; datos.lista_precios_path = path;
      }
      const { error } = await supabase.from("anticipos_materiales").update(datos).eq("id", dlg.anticipo.id);
      if (error) { alert(error.message); setGuardandoLista(false); return; }
      setListaDlg(null); reload();
    } finally {
      setGuardandoLista(false);
    }
  };

  // ---- Devoluciones a saldo (recupero acreditado en la cuenta) ----
  // Se guarda como un anticipo más (suma al saldo) marcado es_devolucion, con el
  // detalle de pallets / bolsones devueltos para descontar el pendiente a recuperar.
  const [nuevaDevolucion, setNuevaDevolucion] = useState({}); // { [cuentaId]: { fecha, items: [...] } }
  const [editDev, setEditDev] = useState(null); // devolución en edición
  const [devOpen, setDevOpen] = useState(null); // cuentaId del diálogo de recupero
  const openNuevoDev = (cuentaId) => {
    setEditDev(null);
    setNuevaDevolucion(prev => ({ ...prev, [cuentaId]: { fecha: hoyISO(), items: [emptyRecItem()], remito_nro: "", file: null } }));
    setDevOpen(cuentaId);
  };
  const setDev = (cuentaId, patch) =>
    setNuevaDevolucion(prev => ({ ...prev, [cuentaId]: { fecha: hoyISO(), items: [emptyRecItem()], ...prev[cuentaId], ...patch } }));
  const devItemsDe = (cuentaId) => {
    const its = nuevaDevolucion[cuentaId]?.items;
    return Array.isArray(its) && its.length ? its : [emptyRecItem()];
  };
  const addDevItem = (cuentaId) =>
    setDev(cuentaId, { items: [...devItemsDe(cuentaId), emptyRecItem()] });
  const setDevItem = (cuentaId, idx, patch) =>
    setDev(cuentaId, { items: devItemsDe(cuentaId).map((it, i) => i === idx ? { ...it, ...patch } : it) });
  const delDevItem = (cuentaId, idx) => {
    const next = devItemsDe(cuentaId).filter((_, i) => i !== idx);
    setDev(cuentaId, { items: next.length ? next : [emptyRecItem()] });
  };
  const [subiendoDev, setSubiendoDev] = useState(null); // cuentaId en curso
  const addDevolucion = async (cuentaId) => {
    const f = nuevaDevolucion[cuentaId] || {};
    const items = (f.items || []).map(it => ({
      unidad: it.unidad === "bolson" ? "bolson" : "pallet",
      cantidad: Number(parseMiles(it.cantidad ?? "")) || 0,
      precio: Number(it.precio ?? 0) || 0,
    })).filter(it => it.cantidad > 0 || it.precio > 0)
      .map(it => ({ ...it, total: it.cantidad * it.precio }));
    if (!items.length) { alert("Cargá al menos un ítem de devolución (cantidad y precio)."); return; }
    const total = items.reduce((s, it) => s + it.total, 0);
    const pallets = items.reduce((s, it) => s + (it.unidad === "pallet" ? it.cantidad : 0), 0);
    const bolsones = items.reduce((s, it) => s + (it.unidad === "bolson" ? it.cantidad : 0), 0);
    setSubiendoDev(cuentaId);
    try {
      let comprobante_url = null, comprobante_path = null;
      if (f.file) {
        const ext = (f.file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${proyecto.id}/materiales/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, f.file, { upsert: false });
        if (upErr) { alert(upErr.message); return; }
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        comprobante_url = pub.publicUrl; comprobante_path = path;
      }
      const datos = {
        monto: total, fecha: f.fecha || hoyISO(),
        descripcion: "Devolución de material a saldo",
        remito_nro: (f.remito_nro || "").trim() || null,
        es_devolucion: true, rec_items: items, rec_pallets: pallets, rec_bolsones: bolsones,
      };
      const editing = editDev && editDev.cuenta_id === cuentaId;
      let error;
      if (editing) {
        if (f.file) {
          if (editDev.comprobante_path) await supabase.storage.from(BUCKET).remove([editDev.comprobante_path]);
          datos.comprobante_url = comprobante_url; datos.comprobante_path = comprobante_path;
        }
        ({ error } = await supabase.from("anticipos_materiales").update(datos).eq("id", editDev.id));
      } else {
        ({ error } = await supabase.from("anticipos_materiales").insert({ cuenta_id: cuentaId, comprobante_url, comprobante_path, ...datos }));
      }
      if (error) { alert(error.message); return; }
      setEditDev(null); setDevOpen(null);
      setNuevaDevolucion(prev => ({ ...prev, [cuentaId]: { fecha: hoyISO(), items: [emptyRecItem()], remito_nro: "", file: null } }));
      reload();
    } finally {
      setSubiendoDev(null);
    }
  };
  const startEditDevolucion = (a) => {
    setEditDev(a);
    setDevOpen(a.cuenta_id);
    const its = Array.isArray(a.rec_items) && a.rec_items.length ? a.rec_items : [emptyRecItem()];
    setNuevaDevolucion(prev => ({ ...prev, [a.cuenta_id]: {
      fecha: a.fecha || hoyISO(),
      remito_nro: a.remito_nro || "",
      file: null,
      items: its.map(it => ({ unidad: it.unidad || "pallet", cantidad: String(it.cantidad ?? ""), precio: it.precio != null ? String(it.precio) : "" })),
    } }));
  };
  const cancelEditDevolucion = (cuentaId) => {
    setEditDev(null); setDevOpen(null);
    setNuevaDevolucion(prev => ({ ...prev, [cuentaId]: { fecha: hoyISO(), items: [emptyRecItem()], remito_nro: "", file: null } }));
  };
  const delDevolucion = async (a) => {
    if (!confirm("¿Eliminar esta devolución a saldo?")) return;
    if (a.comprobante_path) await supabase.storage.from(BUCKET).remove([a.comprobante_path]);
    const { error } = await supabase.from("anticipos_materiales").delete().eq("id", a.id);
    if (error) alert(error.message); else reload();
  };
  const delCuenta = async (c) => {
    if (!confirm(`¿Eliminar la cuenta de "${c.proveedor}" y todos sus retiros?`)) return;
    const paths = retirosDe(c.id).map(r => r.remito_path).filter(Boolean);
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    const { error } = await supabase.from("cuentas_materiales").delete().eq("id", c.id);
    if (error) alert(error.message); else reload();
  };

  // ---- Retiro ----
  const [editRet, setEditRet] = useState(null); // retiro en edición
  const [retiroOpen, setRetiroOpen] = useState(null); // cuentaId del diálogo de retiro
  const openNuevoRetiro = (cuentaId) => {
    setEditRet(null);
    setNuevoRetiro(prev => ({ ...prev, [cuentaId]: { fecha: hoyISO(), descripcion: "", monto: "", remito_nro: "", etapa: "", tc: "", file: null, recupero: false, recupero_items: [emptyRecItem()], materiales_items: [], lista_anticipo_id: anticipoVigenteId(cuentaId) } }));
    setRetiroOpen(cuentaId);
  };
  const setRet = (cuentaId, patch) =>
    setNuevoRetiro(prev => ({ ...prev, [cuentaId]: { fecha: hoyISO(), descripcion: "", monto: "", file: null, recupero_items: [emptyRecItem()], ...prev[cuentaId], ...patch } }));
  const startEditRetiro = (r) => {
    setEditRet(r);
    setRetiroOpen(r.cuenta_id);
    const its = itemsRecupero(r);
    setNuevoRetiro(prev => ({ ...prev, [r.cuenta_id]: {
      fecha: r.fecha || hoyISO(),
      descripcion: r.descripcion || "",
      monto: r.monto != null ? String(r.monto) : "",
      remito_nro: r.remito_nro || "",
      etapa: r.etapa || "",
      tc: r.tipo_cambio != null ? String(r.tipo_cambio) : "",
      file: null,
      recupero: !!r.recupero,
      recupero_items: r.recupero && its.length
        ? its.map(it => ({ unidad: it.unidad, cantidad: String(it.cantidad ?? ""), precio: it.precio != null ? String(it.precio) : "" }))
        : [emptyRecItem()],
      lista_anticipo_id: r.lista_anticipo_id || anticipoVigenteId(r.cuenta_id),
      materiales_items: Array.isArray(r.materiales_items)
        ? r.materiales_items.map(it => ({
            codigo: it.codigo || "",
            material: it.material || "",
            cantidad: it.cantidad != null ? String(it.cantidad) : "",
            unidad: it.unidad || "unidad",
            categoria: CATEGORIAS_MAT.includes(it.categoria) ? it.categoria : "Otros",
            precio: it.precio != null ? String(it.precio) : "",
          }))
        : [],
    } }));
  };
  const cancelEditRetiro = (cuentaId) => {
    setEditRet(null); setRetiroOpen(null);
    setNuevoRetiro(prev => ({ ...prev, [cuentaId]: { fecha: hoyISO(), descripcion: "", monto: "", remito_nro: "", etapa: "", tc: "", file: null, recupero: false, recupero_items: [emptyRecItem()], materiales_items: [] } }));
  };

  // ---- Ítems de recupero del retiro en curso ----
  const recItemsDe = (cuentaId) => {
    const its = nuevoRetiro[cuentaId]?.recupero_items;
    return Array.isArray(its) && its.length ? its : [emptyRecItem()];
  };
  const addRecItem = (cuentaId) =>
    setRet(cuentaId, { recupero_items: [...recItemsDe(cuentaId), emptyRecItem()] });
  const setRecItem = (cuentaId, idx, patch) =>
    setRet(cuentaId, { recupero_items: recItemsDe(cuentaId).map((it, i) => i === idx ? { ...it, ...patch } : it) });
  const delRecItem = (cuentaId, idx) => {
    const next = recItemsDe(cuentaId).filter((_, i) => i !== idx);
    setRet(cuentaId, { recupero_items: next.length ? next : [emptyRecItem()] });
  };

  // ---- Ítems de material del remito (para analizar el consumo y valorizar) ----
  const matItemsDe = (cuentaId) => {
    const its = nuevoRetiro[cuentaId]?.materiales_items;
    return Array.isArray(its) ? its : [];
  };
  // Subtotal de un ítem = cantidad × precio unitario.
  const subtotalMat = (it) => (Number(parseCantidad(it?.cantidad)) || 0) * (Number(parseMiles(it?.precio ?? "")) || 0);
  // Total del remito = Σ subtotales. Es la sumatoria P×Q.
  const totalMatItems = (cuentaId) => matItemsDe(cuentaId).reduce((s, it) => s + subtotalMat(it), 0);
  // Setea los ítems y, si alguno tiene precio, sincroniza el Monto con Σ(P×Q).
  const setMatItems = (cuentaId, items) => {
    const patch = { materiales_items: items };
    if (items.some(it => (Number(parseMiles(it?.precio ?? "")) || 0) > 0)) {
      const total = items.reduce((s, it) => s + subtotalMat(it), 0);
      patch.monto = String(Math.round(total * 100) / 100);
    }
    setRet(cuentaId, patch);
  };
  const addMatItem = (cuentaId) =>
    setMatItems(cuentaId, [...matItemsDe(cuentaId), emptyMatItem()]);
  const setMatItem = (cuentaId, idx, patch) =>
    setMatItems(cuentaId, matItemsDe(cuentaId).map((it, i) => i === idx ? { ...it, ...patch } : it));
  const delMatItem = (cuentaId, idx) =>
    setMatItems(cuentaId, matItemsDe(cuentaId).filter((_, i) => i !== idx));

  // Lee la foto del remito con IA y completa la lista de materiales del retiro.
  const leerRemitoIA = async (cuentaId) => {
    const f = nuevoRetiro[cuentaId] || {};
    const file = f.file;
    const esImagen = file && file.type?.startsWith("image/");
    const esPDF = file && file.type === "application/pdf";
    if (!esImagen && !esPDF) {
      alert("Adjuntá una FOTO (imagen) o un PDF del remito para poder leerlo con IA.");
      return;
    }
    setLeyendoIA(cuentaId);
    try {
      // Lista de precios del acopio elegido (para que la IA valorice cada ítem).
      const lista = listaDe(f.lista_anticipo_id);
      const payload = { etapas: hitos, hoy: hoyISO(), lista };
      if (esPDF) {
        const { base64 } = await archivoABase64(file);
        payload.pdfBase64 = base64;
      } else {
        const { base64, mediaType } = await imagenAOptimizada(file);
        payload.imagenBase64 = base64; payload.mediaType = mediaType;
      }
      const res = await fetch("/api/ia/remito", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) {
        const msg = {
          FALTA_API_KEY: "Falta configurar la API key (ANTHROPIC_API_KEY) en Vercel.",
          SIN_IMAGEN: "No se recibió la imagen.",
          PARSEO: "No pude interpretar el remito. Cargá los ítems a mano.",
          API_ERROR: "Error del asistente: " + (data.detalle || ""),
          RED: "Error de red: " + (data.detalle || ""),
        }[data.error] || ("Error: " + (data.error || "desconocido"));
        alert(msg);
        return;
      }
      if (data.usage) {
        supabase.from("ia_uso").insert({
          proyecto_id: proyecto?.id ?? null, tipo: "remito", modelo: data.usage.modelo,
          input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens, costo_usd: data.usage.costo_usd,
        });
      }
      const items = (data.items || []).map(it => ({
        codigo: it.codigo || "",
        material: it.material || "",
        cantidad: it.cantidad != null ? String(it.cantidad) : "",
        unidad: it.unidad || "unidad",
        categoria: CATEGORIAS_MAT.includes(it.categoria) ? it.categoria : "Otros",
        precio: it.precio_unitario != null ? String(it.precio_unitario) : "",
      }));
      // Sincroniza el monto con Σ(P×Q) si vinieron precios de la lista.
      setMatItems(cuentaId, items.length ? items : [emptyMatItem()]);
      // Autodetección de retornables: los pallets / bolsones marcados como
      // devolución / retornables se cargan también en "¿Presenta recupero?",
      // así se descuentan del neto imputado a la etapa.
      const recFromRemito = items.filter(esRetornable).map(it => ({
        unidad: unidadRecupero(it),
        cantidad: it.cantidad || "",
        precio: it.precio || "",
      }));
      if (recFromRemito.length) setRet(cuentaId, { recupero: true, recupero_items: recFromRemito });
      if (data.remito_nro && !f.remito_nro) setRet(cuentaId, { remito_nro: String(data.remito_nro) });
      const sinPrecio = items.filter(it => !(Number(it.precio) > 0)).length;
      const avisoRec = recFromRemito.length
        ? `\n\nDetecté ${recFromRemito.length} ítem/s retornable/s (pallet/bolsón) y los cargué en "¿Presenta recupero?": se descuentan del neto imputado a la etapa. Revisá cantidad y precio.`
        : "";
      if (!items.length) alert("No pude leer materiales del remito. Cargalos a mano.");
      else if (lista.length && sinPrecio) alert(`Leí ${items.length} materiales. ${sinPrecio} no encontraron precio en la lista del acopio: revisalos y cargá el precio a mano.` + (data.nota ? "\n\nNota IA: " + data.nota : "") + avisoRec);
      else if (data.nota || avisoRec) alert((data.nota ? "Nota IA: " + data.nota : "").trim() + avisoRec);
    } catch (e) {
      alert("No se pudo procesar la imagen: " + (e?.message || e));
    } finally {
      setLeyendoIA(null);
    }
  };

  // Consumo de materiales agregado (de los ítems de los remitos), opcionalmente
  // filtrado por etapa. Agrupa por categoría + material + unidad.
  const consumo = useMemo(() => {
    const map = {};
    for (const c of cuentas) {
      for (const r of retiros.filter(x => x.cuenta_id === c.id)) {
        const et = r.etapa || "(Sin etapa)";
        if (consumoEtapa && et !== consumoEtapa) continue;
        const its = Array.isArray(r.materiales_items) ? r.materiales_items : [];
        for (const it of its) {
          const material = (it.material || "").trim() || "(sin nombre)";
          const unidad = (it.unidad || "unidad").toString().trim().toLowerCase();
          const categoria = CATEGORIAS_MAT.includes(it.categoria) ? it.categoria : "Otros";
          const key = `${categoria}||${material.toLowerCase()}||${unidad}`;
          (map[key] ??= { categoria, material, unidad, cantidad: 0, retiros: 0, etapas: new Set() });
          map[key].cantidad += Number(it.cantidad || 0);
          map[key].retiros += 1;
          map[key].etapas.add(et);
        }
      }
    }
    return Object.values(map)
      .map(v => ({ ...v, etapas: [...v.etapas] }))
      .sort((a, b) => a.categoria === b.categoria
        ? b.cantidad - a.cantidad
        : a.categoria.localeCompare(b.categoria));
    // eslint-disable-next-line
  }, [cuentas, retiros, consumoEtapa]);

  // Control por lista (acopio): para cada anticipo con lista de precios, arma el
  // detalle de lo retirado imputado a esa lista — artículo, cantidad, precio
  // unitario y total retirado — más el total y el saldo (anticipo − retirado).
  const controlPorLista = useMemo(() => {
    const out = [];
    for (const c of cuentas) {
      const rsCta = retiros.filter(x => x.cuenta_id === c.id);
      // Devoluciones a saldo (recuperos cobrados como saldo) de la cuenta:
      // pallets / bolsones que volvieron. Se muestran como renglones aparte y
      // NO descuentan del total retirado. Son a nivel cuenta, así que se
      // adjuntan una sola vez, en la primera lista de la cuenta.
      const devsCta = devolucionesDe(c.id).flatMap(d =>
        (Array.isArray(d.rec_items) ? d.rec_items : []).map(it => {
          const cantidad = Number(it.cantidad || 0);
          const precio = Number(it.precio || 0);
          return {
            unidad: it.unidad === "bolson" ? "bolson" : "pallet",
            material: it.unidad === "bolson" ? "Bolsón (devolución a saldo)" : "Pallet (devolución a saldo)",
            fecha: d.fecha,
            cantidad,
            precio,
            total: cantidad * precio,
          };
        })
      );
      const totalDevuelto = devsCta.reduce((s, it) => s + it.total, 0);
      let devAsignada = false;
      for (const a of anticiposReales(c.id)) {
        const tieneLista = Array.isArray(a.lista_precios) && a.lista_precios.length;
        const rsLista = rsCta.filter(r => r.lista_anticipo_id === a.id);
        if (!tieneLista && rsLista.length === 0) continue;
        const map = {};
        for (const r of rsLista) {
          const its = Array.isArray(r.materiales_items) ? r.materiales_items : [];
          for (const it of its) {
            const material = (it.material || "").trim() || "(sin nombre)";
            const codigo = (it.codigo != null ? String(it.codigo) : "").trim();
            const unidad = (it.unidad || "unidad").toString().trim().toLowerCase();
            const precio = Number(it.precio || 0);
            const cantidad = Number(it.cantidad || 0);
            const total = it.total != null ? Number(it.total) : cantidad * precio;
            const key = `${codigo}||${material.toLowerCase()}||${unidad}`;
            (map[key] ??= { codigo, material, unidad, cantidad: 0, precio, total: 0 });
            map[key].cantidad += cantidad;
            map[key].total += total;
            if (precio > 0) map[key].precio = precio;
          }
        }
        const items = Object.values(map).sort((x, y) => x.material.localeCompare(y.material));
        const totalRetirado = rsLista.reduce((s, r) => s + Number(r.monto || 0), 0);
        const anticipoMonto = Number(a.monto || 0);
        // Adjunto las devoluciones a saldo de la cuenta a su primera lista.
        const devoluciones = devAsignada ? [] : devsCta;
        const devTotal = devAsignada ? 0 : totalDevuelto;
        devAsignada = true;
        out.push({
          key: a.id,
          cuenta: c,
          anticipo: a,
          nro: a.acopio_nro ? String(a.acopio_nro) : `#${String(a.id).slice(-4)}`,
          fecha: a.fecha,
          moneda: c.moneda,
          items,
          devoluciones,
          devTotal,
          nRetiros: rsLista.length,
          totalRetirado,
          anticipoMonto,
          saldo: anticipoMonto - totalRetirado,
        });
      }
    }
    return out.sort((x, y) => (x.cuenta.proveedor || "").localeCompare(y.cuenta.proveedor || "")
      || String(x.fecha || "").localeCompare(String(y.fecha || "")));
    // eslint-disable-next-line
  }, [cuentas, retiros, anticipos]);

  const addRetiro = async (cuentaId) => {
    const f = nuevoRetiro[cuentaId] || {};
    const monto = Number(f.monto || 0);
    if (!monto || monto <= 0) { alert("Ingresá el monto del retiro."); return; }
    // Foto del remito OBLIGATORIA: al menos una foto nueva, o (en edición) la ya cargada.
    const editingNow = editRet && editRet.cuenta_id === cuentaId;
    const tieneFoto = !!f.file || (editingNow && !!editRet.remito_url);
    if (!tieneFoto) { alert("La foto del remito es obligatoria para cargar un retiro."); return; }
    setSubiendo(cuentaId);
    try {
      let remito_url = null, remito_path = null;
      if (f.file) {
        const ext = (f.file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${proyecto.id}/materiales/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, f.file, { upsert: false });
        if (upErr) { alert(upErr.message); setSubiendo(null); return; }
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        remito_url = pub.publicUrl; remito_path = path;
      }
      const recupero = !!f.recupero;
      // Normalizo los ítems cargados: descarto los que no tengan cantidad ni precio.
      const items = recupero
        ? (f.recupero_items || []).map(it => ({
            unidad: it.unidad === "bolson" ? "bolson" : "pallet",
            cantidad: Number(parseMiles(it.cantidad ?? "")) || 0,
            precio: Number(it.precio ?? 0) || 0,
          })).filter(it => it.cantidad > 0 || it.precio > 0)
          .map(it => ({ ...it, total: it.cantidad * it.precio }))
        : [];
      const recuperoTotal = items.reduce((s, it) => s + it.total, 0);
      const c = cuentas.find(x => x.id === cuentaId);
      // TC congelado del retiro: el cargado, o el del último acopio, o el de la cuenta.
      const tcRet = esARS(c)
        ? (Number(parseMiles(f.tc ?? "")) || ultimoTcDe(cuentaId) || tcDe(c) || null)
        : null;
      const datos = {
        fecha: f.fecha || hoyISO(),
        descripcion: (f.descripcion || "").trim() || null,
        remito_nro: (f.remito_nro || "").trim() || null,
        etapa: f.etapa || null,
        tipo_cambio: tcRet,
        monto,
        recupero: recupero && items.length > 0,
        recupero_items: recupero && items.length > 0 ? items : null,
        recupero_total: recupero && items.length > 0 ? recuperoTotal : null,
        // columnas planas V27 en null: ya se usa recupero_items
        recupero_unidad: null, recupero_cantidad: null, recupero_precio: null,
        lista_anticipo_id: f.lista_anticipo_id || null,
        // Detalle de materiales del remito (para analizar el consumo y valorizar).
        materiales_items: (() => {
          const mats = (f.materiales_items || []).map(it => {
            const cantidad = parseCantidad(it.cantidad);
            const precio = Number(parseMiles(it.precio ?? "")) || 0;
            return {
              codigo: (it.codigo || "").toString().trim() || null,
              material: (it.material || "").trim(),
              cantidad,
              unidad: (it.unidad || "unidad").toString().trim().toLowerCase() || "unidad",
              categoria: CATEGORIAS_MAT.includes(it.categoria) ? it.categoria : "Otros",
              precio: precio > 0 ? precio : null,
              total: precio > 0 ? Math.round((Number(cantidad) || 0) * precio * 100) / 100 : null,
            };
          }).filter(it => it.material || it.cantidad != null);
          return mats.length ? mats : null;
        })(),
      };
      const editing = editRet && editRet.cuenta_id === cuentaId;
      let error;
      if (editing) {
        // Si subí un remito nuevo, reemplazo (y borro el anterior); si no, lo conservo.
        if (f.file) {
          if (editRet.remito_path) await supabase.storage.from(BUCKET).remove([editRet.remito_path]);
          datos.remito_url = remito_url; datos.remito_path = remito_path;
        }
        ({ error } = await supabase.from("retiros_materiales").update(datos).eq("id", editRet.id));
      } else {
        ({ error } = await supabase.from("retiros_materiales").insert({ cuenta_id: cuentaId, remito_url, remito_path, ...datos }));
      }
      if (error) { alert(error.message); setSubiendo(null); return; }
      setEditRet(null); setRetiroOpen(null);
      setNuevoRetiro(prev => ({ ...prev, [cuentaId]: { fecha: hoyISO(), descripcion: "", monto: "", remito_nro: "", etapa: "", tc: "", file: null, recupero: false, recupero_items: [emptyRecItem()], materiales_items: [] } }));
      reload();
    } finally {
      setSubiendo(null);
    }
  };

  const delRetiro = async (r) => {
    if (!confirm("¿Eliminar este retiro?")) return;
    if (r.remito_path) await supabase.storage.from(BUCKET).remove([r.remito_path]);
    const { error } = await supabase.from("retiros_materiales").delete().eq("id", r.id);
    if (error) alert(error.message); else reload();
  };

  // Tilda / destilda un retiro como "validado" (revisado / conciliado).
  const toggleValidado = async (r) => {
    const nuevo = !r.validado;
    setRetiros(prev => prev.map(x => x.id === r.id ? { ...x, validado: nuevo } : x));
    const { error } = await supabase.from("retiros_materiales")
      .update({ validado: nuevo }).eq("id", r.id);
    if (error) {
      alert(error.message);
      setRetiros(prev => prev.map(x => x.id === r.id ? { ...x, validado: !nuevo } : x));
    }
  };

  // Descarga a Excel los retiros de una cuenta de materiales.
  const exportarRetirosExcel = (c) => {
    const rs = retirosDe(c.id);
    const filas = rs.map((r) => {
      const neto = netoRetiro(r);
      const netoUSD = usdDe(c, neto, r.tipo_cambio);
      const brutoUSD = usdDe(c, Number(r.monto || 0), r.tipo_cambio);
      const recUSD = usdDe(c, Number(r.monto || 0) - neto, r.tipo_cambio);
      const detalle = [
        r.descripcion || "",
        ...(Array.isArray(r.materiales_items) ? r.materiales_items.map(it =>
          `${it.cantidad != null ? fmtNum0(it.cantidad) + " " + (it.unidad || "") + " · " : ""}${it.material || ""}`) : []),
      ].filter(Boolean).join(" | ");
      return {
        "Fecha": r.fecha ? fmtDate(r.fecha) : "",
        "Remito Nº": r.remito_nro || "",
        "Lista Nº": listaNroDe(r.lista_anticipo_id),
        "Etapa": r.etapa || "",
        "Detalle": detalle,
        [`Monto (${c.moneda})`]: Number(r.monto || 0),
        "Bruto USD": brutoUSD,
        "A recuperar USD": recUSD,
        "Neto USD": netoUSD,
        "Validado": r.validado ? "Sí" : "No",
      };
    });
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Retiros");
    const safe = (c.proveedor || "cuenta").replace(/[^\w\-]+/g, "_").slice(0, 40);
    XLSX.writeFile(wb, `retiros_${safe}_${hoyISO()}.xlsx`);
  };

  // Cuenta corriente de una cuenta: anticipos / devoluciones (+) y retiros (−)
  // en orden cronológico, con saldo acumulado fila por fila.
  const ledgerDe = (cuentaId) => {
    const ents = [];
    for (const a of anticiposDe(cuentaId)) {
      ents.push({
        id: "a_" + a.id, fecha: a.fecha, created_at: a.created_at,
        tipo: a.es_devolucion ? "Devolución" : "Anticipo",
        remito_nro: a.remito_nro || "",
        detalle: a.es_devolucion
          ? (Array.isArray(a.rec_items) && a.rec_items.length
              ? a.rec_items.map(it => `${fmtNum0(it.cantidad)} ${it.unidad === "bolson" ? "bolsón/es" : "pallet/s"}`).join(", ")
              : "Devolución a saldo")
          : "Acopio / anticipo",
        url: a.comprobante_url || null,
        delta: Number(a.monto || 0),
      });
    }
    for (const r of retirosDe(cuentaId)) {
      ents.push({
        id: "r_" + r.id, fecha: r.fecha, created_at: r.created_at,
        tipo: "Retiro", remito_nro: r.remito_nro || "",
        detalle: r.descripcion || "Retiro",
        url: r.remito_url || null,
        delta: -Number(r.monto || 0),
      });
    }
    ents.sort((x, y) => {
      const fx = x.fecha || "", fy = y.fecha || "";
      if (fx !== fy) return fx < fy ? -1 : 1;
      return (x.created_at || "") < (y.created_at || "") ? -1 : 1;
    });
    let saldo = 0;
    return ents.map(e => { saldo += e.delta; return { ...e, saldo }; });
  };

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1.5}>
        <Box>
          <Typography variant="h5">Materiales</Typography>
          <Typography variant="body2" color="text.secondary">
            Cuentas con anticipo (precio congelado). Se descuentan los retiros con su remito hasta llegar a saldo cero.
          </Typography>
        </Box>
        <Button variant="contained" color="secondary" startIcon={<AddIcon />}
          onClick={openNewCuenta} sx={{ flexShrink: 0 }}>
          Nueva cuenta
        </Button>
      </Stack>

      {loading && <LinearProgress />}

      {cuentas.length > 0 && (
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tab label="Cuentas" />
          <Tab label="Cuenta corriente" />
          <Tab label="Por etapa (USD)" />
          <Tab label="Consumo" />
          <Tab label="Control por lista" />
        </Tabs>
      )}

      {tab === 0 && (<>
      {/* Resumen */}
      {cuentas.length > 0 && (
        <Card>
          <CardContent>
            <Stack divider={<Divider flexItem />} spacing={2}>
              {monedasConCuentas.map((m) => {
                const t = totalesPorMoneda[m];
                const hayRecupero = t.aRecuperar > 0;
                return (
                  <Box key={m}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                      <Chip size="small" label={m} sx={{ bgcolor: "rgba(15,42,74,0.06)", fontWeight: 700 }} />
                      <Typography variant="caption" color="text.secondary">Totales caja {m}</Typography>
                    </Stack>
                    <Grid container spacing={2}>
                      <Resumen sm={3} label="Anticipado" value={fmtMoney(t.anticipado, m)} />
                      <Resumen sm={3} label="Retirado" value={fmtMoney(t.retirado, m)} color="error.main" />
                      <Resumen sm={3} label="Saldo disponible" value={fmtMoney(t.saldo, m)}
                        color={t.saldo < 0 ? "error.main" : "success.main"} />
                      <Grid item xs={12} sm={3}>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5 }}>Pendiente a recuperar</Typography>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: "wrap" }} useFlexGap>
                          <Typography fontWeight={700}
                            color={!hayRecupero ? "text.disabled" : t.pendienteRecupero <= 0 ? "success.main" : "warning.main"}>
                            {hayRecupero ? fmtMoney(t.pendienteRecupero, m) : "—"}
                          </Typography>
                          {t.bolsonesADevolver > 0 && (
                            <Chip size="small" variant="outlined"
                              color={t.bolsonesDevueltos >= t.bolsonesADevolver ? "success" : "warning"}
                              label={`Bolsones ${fmtNum0(t.bolsonesDevueltos)}/${fmtNum0(t.bolsonesADevolver)}`} />
                          )}
                          {t.palletsADevolver > 0 && (
                            <Chip size="small" variant="outlined"
                              color={t.palletsDevueltos >= t.palletsADevolver ? "success" : "warning"}
                              label={`Pallets ${fmtNum0(t.palletsDevueltos)}/${fmtNum0(t.palletsADevolver)}`} />
                          )}
                        </Stack>
                      </Grid>
                    </Grid>
                  </Box>
                );
              })}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: "block" }}>
              Los saldos en ARS y USD se muestran por separado. Pendiente a recuperar = saldo que falta recuperar de los retiros marcados con recupero.
            </Typography>
          </CardContent>
        </Card>
      )}

      {cuentas.length === 0 ? (
        <Card><CardContent>
          <Stack spacing={2} alignItems="flex-start">
            <Typography color="text.secondary">No hay cuentas de materiales. Creá la primera.</Typography>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={openNewCuenta}>Nueva cuenta</Button>
          </Stack>
        </CardContent></Card>
      ) : (
        cuentas.map((c) => {
          const k = calc(c);
          const rs = retirosDe(c.id);
          const ant = anticiposReales(c.id);
          const devs = devolucionesDe(c.id);
          const na = nuevoAnticipo[c.id] || {};
          const nr = nuevoRetiro[c.id] || {};
          const pct = k.anticipado > 0 ? Math.min(100, (k.retirado / k.anticipado) * 100) : 0;
          return (
            <Accordion key={c.id} disableGutters defaultExpanded={false}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ width: "100%" }}>
                  {/* Nombre de la cuenta arriba */}
                  <Stack sx={{ mb: 1.25 }}>
                    <Typography fontWeight={700}>{c.proveedor}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {c.descripcion ? `${c.descripcion} · ` : ""}{c.fecha ? fmtDate(c.fecha) : ""} · {c.moneda}
                      {esARS(c) && tcDe(c) ? ` · Dólar acopio ~${fmtNum0(tcDe(c))} · ${fmtMoney(usdDe(c, k.anticipado), "USD")}` : ""}
                    </Typography>
                  </Stack>

                  {/* Indicadores un renglón más abajo */}
                  <Grid container spacing={2} alignItems="center">
                    <Resumen sm={3} label={ant.length > 1 ? `Anticipado (${ant.length})` : "Anticipado"} value={fmtMoney(k.anticipado, c.moneda)} />
                    <Resumen sm={3} label="Retirado" value={fmtMoney(k.retirado, c.moneda)} color="error.main" />
                    <Grid item xs={12} sm={3}>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5 }}>Saldo disponible</Typography>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography fontWeight={700} color={k.saldo < -0.005 ? "error.main" : Math.abs(k.saldo) <= 0.005 ? "text.secondary" : "success.main"}>
                          {fmtMoney(k.saldo, c.moneda)}
                        </Typography>
                        {Math.abs(k.saldo) <= 0.005 && <Chip size="small" color="success" label="Saldado" />}
                        {k.saldo < -0.005 && <Chip size="small" color="error" variant="outlined" label="Excedido" />}
                      </Stack>
                    </Grid>
                    <Grid item xs={12} sm={3}>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5 }}>Pendiente a recuperar</Typography>
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: "wrap" }} useFlexGap>
                        <Typography fontWeight={700}
                          color={k.aRecuperar <= 0 ? "text.disabled" : k.pendienteRecupero <= 0 ? "success.main" : "warning.main"}>
                          {k.aRecuperar > 0 ? fmtMoney(k.pendienteRecupero, c.moneda) : "—"}
                        </Typography>
                        {k.aRecuperar > 0 && k.bolsonesADevolver > 0 && (
                          <Chip size="small" variant="outlined"
                            color={k.bolsonesDevueltos >= k.bolsonesADevolver ? "success" : "warning"}
                            label={`Bolsones ${fmtNum0(k.bolsonesDevueltos)}/${fmtNum0(k.bolsonesADevolver)}`} />
                        )}
                        {k.aRecuperar > 0 && k.palletsADevolver > 0 && (
                          <Chip size="small" variant="outlined"
                            color={k.palletsDevueltos >= k.palletsADevolver ? "success" : "warning"}
                            label={`Pallets ${fmtNum0(k.palletsDevueltos)}/${fmtNum0(k.palletsADevolver)}`} />
                        )}
                      </Stack>
                    </Grid>
                  </Grid>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ bgcolor: "rgba(15,42,74,0.015)" }}>
                {/* ===================== SECCIÓN 1: ANTICIPOS ===================== */}
                <Section title="Anticipos / acopios" accent="#1E8E3E"
                  right={<Typography variant="caption" color="text.secondary">Total anticipado: <b>{fmtMoney(k.anticipado, c.moneda)}</b></Typography>}>
                  {/* Los acopios se cargan desde Caja (egreso marcado como acopio). */}
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                    Los acopios se registran desde <b>Caja</b> (egreso marcado como “acopio de materiales”). Acá ves los anticipos cargados.
                  </Typography>
                  {/* Detalle de anticipos abajo (por fecha) */}
                  {ant.length > 0 && (
                    <Box sx={{ mt: 1.5 }}>
                      <Stack direction="row" sx={{ px: 0.5, pb: 0.5 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ width: 120, textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5 }}>Fecha</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5 }}>Monto</Typography>
                        {esARS(c) && <Typography variant="caption" color="text.secondary" sx={{ width: 80, textAlign: "right", textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5 }}>TC</Typography>}
                        {esARS(c) && <Typography variant="caption" color="text.secondary" sx={{ width: 110, textAlign: "right", textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5 }}>USD</Typography>}
                      </Stack>
                      <Stack>
                        {ant.map((a) => (
                          <Stack key={a.id} direction="row" alignItems="center" spacing={1}
                            sx={{ px: 0.5, py: 0.5, borderTop: "1px solid", borderColor: "rgba(15,42,74,0.06)" }}>
                            <Typography variant="body2" sx={{ width: 120, whiteSpace: "nowrap" }}>{a.fecha ? fmtDate(a.fecha) : "—"}</Typography>
                            <Typography variant="body2" sx={{ flex: 1, fontWeight: 600, color: "#1E8E3E" }}>{fmtMoney(a.monto, c.moneda)}</Typography>
                            {esARS(c) && <Typography variant="body2" sx={{ width: 80, textAlign: "right", color: "text.secondary" }}>{Number(a.tipo_cambio || 0) > 0 ? fmtNum0(a.tipo_cambio) : "—"}</Typography>}
                            {esARS(c) && <Typography variant="body2" sx={{ width: 110, textAlign: "right", color: "text.secondary" }}>{Number(a.tipo_cambio || 0) > 0 ? fmtMoney(Number(a.monto || 0) / Number(a.tipo_cambio), "USD") : "—"}</Typography>}
                            {(() => {
                              const n = Array.isArray(a.lista_precios) ? a.lista_precios.length : 0;
                              return (
                                <Tooltip title={n ? `Lista de precios: ${n} ítems. Tocá para ver/editar.` : "Cargar lista de precios de este acopio (foto o PDF)"}>
                                  <Button size="small" variant={n ? "outlined" : "text"} color={n ? "success" : "primary"}
                                    startIcon={<ReceiptLongIcon sx={{ fontSize: 16 }} />}
                                    onClick={() => openListaDlg(a, c)} sx={{ minWidth: 0, height: 24, px: 1, whiteSpace: "nowrap" }}>
                                    {n ? `Lista (${n})` : "Lista"}
                                  </Button>
                                </Tooltip>
                              );
                            })()}
                            {a.movimiento_id ? (
                              <Tooltip title="Acopio generado desde Caja; editalo o eliminalo desde el movimiento de Caja">
                                <Chip size="small" variant="outlined" label="Caja" sx={{ height: 22 }} />
                              </Tooltip>
                            ) : (
                              <Tooltip title="Eliminar anticipo"><span>
                                <IconButton size="small" onClick={() => delAnticipo(a)}>
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </span></Tooltip>
                            )}
                          </Stack>
                        ))}
                      </Stack>
                    </Box>
                  )}
                </Section>

                {/* ===================== SECCIÓN 2: RETIROS ===================== */}
                <Section title="Retiros" accent="#C0392B"
                  right={<Typography variant="caption" color="text.secondary">Retirado: <b style={{ color: "#C0392B" }}>{fmtMoney(k.retirado, c.moneda)}</b> · Saldo: <b>{fmtMoney(k.saldo, c.moneda)}</b></Typography>}>
                  {/* Barra de consumo */}
                  <Box sx={{ mb: 1.5, height: 6, bgcolor: "rgba(15,42,74,0.08)", borderRadius: 4, overflow: "hidden" }}>
                    <Box sx={{ height: "100%", width: `${pct}%`, bgcolor: pct >= 100 ? "error.main" : "secondary.main", transition: "width .4s" }} />
                  </Box>

                  {/* Botón que abre el diálogo de nuevo retiro */}
                  <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap", gap: 1 }}>
                  <Button variant="contained" color="secondary" size="small" startIcon={<AddIcon />}
                    onClick={() => openNuevoRetiro(c.id)}>
                    Nuevo retiro
                  </Button>
                  <Button variant="outlined" color="secondary" size="small" startIcon={<FileDownloadIcon />}
                    disabled={rs.length === 0} onClick={() => exportarRetirosExcel(c)}>
                    Descargar Excel
                  </Button>
                  </Stack>
                  <Dialog open={retiroOpen === c.id} onClose={() => cancelEditRetiro(c.id)} fullWidth maxWidth="md" fullScreen={fullScreen}>
                  <DialogTitle>{editRet && editRet.cuenta_id === c.id ? "Editar retiro" : "Nuevo retiro"} · {c.proveedor}</DialogTitle>
                  <DialogContent dividers>
                  <Grid container spacing={1.5} alignItems="center" sx={{ mt: 0 }}>
                    <Grid item xs={6} sm={2}>
                      <TextField type="date" label="Fecha" InputLabelProps={{ shrink: true }} fullWidth size="small"
                        value={nr.fecha ?? hoyISO()} onChange={(e) => setRet(c.id, { fecha: e.target.value })} />
                    </Grid>
                    <Grid item xs={6} sm={2}>
                      <TextField label={`Monto (${c.moneda})`} fullWidth size="small"
                        inputProps={{ inputMode: "decimal" }}
                        value={fmtMiles(nr.monto ?? "")}
                        onChange={(e) => setRet(c.id, { monto: parseMiles(e.target.value) })} />
                    </Grid>
                    <Grid item xs={6} sm={2}>
                      <TextField label="Remito Nº" fullWidth size="small"
                        value={nr.remito_nro ?? ""} onChange={(e) => setRet(c.id, { remito_nro: e.target.value })} />
                    </Grid>
                    <Grid item xs={6} sm={2.5}>
                      <TextField label="Detalle" fullWidth size="small"
                        value={nr.descripcion ?? ""} onChange={(e) => setRet(c.id, { descripcion: e.target.value })} />
                    </Grid>
                    <Grid item xs={8} sm={2}>
                      <Button component="label" variant={nr.file || (editRet?.cuenta_id === c.id && editRet?.remito_url) ? "outlined" : "contained"}
                        color={nr.file || (editRet?.cuenta_id === c.id && editRet?.remito_url) ? "primary" : "error"}
                        startIcon={<AttachFileIcon />} fullWidth size="small" sx={{ overflow: "hidden" }}>
                        {nr.file ? nr.file.name : (editRet?.cuenta_id === c.id && editRet?.remito_url ? "Cambiar foto" : "Foto remito *")}
                        <input hidden type="file" accept="image/*,application/pdf"
                          onChange={(e) => setRet(c.id, { file: e.target.files?.[0] ?? null })} />
                      </Button>
                    </Grid>
                    {/* Segunda fila: etapa de consumo + TC + neto USD imputado */}
                    <Grid item xs={12} sm={esARS(c) ? 4 : 5}>
                      <TextField select label="Etapa (a qué se imputa)" fullWidth size="small"
                        value={nr.etapa ?? ""} onChange={(e) => setRet(c.id, { etapa: e.target.value })}
                        helperText="Etapa donde se consume este material">
                        <MenuItem value="">(Sin etapa)</MenuItem>
                        {(hitos.length ? hitos : ETAPAS_DEFAULT).map(et => <MenuItem key={et} value={et}>{et}</MenuItem>)}
                      </TextField>
                    </Grid>
                    {esARS(c) && (
                      <Grid item xs={6} sm={3}>
                        <TextField label="TC del retiro (ARS/USD)" fullWidth size="small"
                          inputProps={{ inputMode: "decimal" }}
                          value={fmtMiles(nr.tc ?? (ultimoTcDe(c.id) ? String(ultimoTcDe(c.id)) : ""))}
                          onChange={(e) => setRet(c.id, { tc: parseMiles(e.target.value) })}
                          helperText="Dólar del acopio del que sale" />
                      </Grid>
                    )}
                    <Grid item xs={esARS(c) ? 6 : 12} sm={esARS(c) ? 5 : 7}>
                      {(() => {
                        const m = Number(parseMiles(nr.monto ?? "")) || 0;
                        const recForm = !!nr.recupero
                          ? recItemsDe(c.id).reduce((s, it) => s + (Number(parseMiles(it.cantidad ?? "")) || 0) * (Number(it.precio ?? 0) || 0), 0)
                          : 0;
                        const neto = m - recForm;
                        const tcUse = esARS(c) ? (Number(parseMiles(nr.tc ?? "")) || ultimoTcDe(c.id) || tcDe(c)) : null;
                        const netoUSD = usdDe(c, neto, tcUse);
                        const recUSD = usdDe(c, recForm, tcUse);
                        return (
                          <Box sx={{ px: 1, py: 0.5 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5, display: "block" }}>
                              Imputa a la etapa (USD neto)
                            </Typography>
                            <Stack direction="row" spacing={1} alignItems="baseline" sx={{ flexWrap: "wrap" }}>
                              <Typography fontWeight={700} sx={{ color: "#0F2A4A", fontVariantNumeric: "tabular-nums" }}>
                                {m > 0 ? fmtMoney(netoUSD, "USD") : "—"}
                              </Typography>
                              {recForm > 0 && (
                                <Typography variant="caption" color="warning.main">
                                  ({fmtMoney(recUSD, "USD")} a recuperar)
                                </Typography>
                              )}
                              {esARS(c) && !tcUse && m > 0 && (
                                <Typography variant="caption" color="error.main">Cargá el TC</Typography>
                              )}
                            </Stack>
                          </Box>
                        );
                      })()}
                    </Grid>
                  </Grid>

                  {/* Recupero del retiro */}
                  <Box sx={{ mt: 1.5 }}>
                    <FormControlLabel
                      control={
                        <Switch size="small" checked={!!nr.recupero}
                          onChange={(e) => setRet(c.id, { recupero: e.target.checked })} />
                      }
                      label={
                        <Stack>
                          <Typography variant="body2" fontWeight={600}>¿Presenta recupero?</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Material (pallets / bolsones) que se devuelve y genera plata a recuperar.
                          </Typography>
                        </Stack>
                      }
                      sx={{ alignItems: "flex-start", m: 0 }}
                    />
                    {nr.recupero && (() => {
                      const items = recItemsDe(c.id);
                      const granTotal = items.reduce((s, it) => {
                        const cant = Number(parseMiles(it.cantidad ?? "")) || 0;
                        const prec = Number(it.precio ?? 0) || 0;
                        return s + cant * prec;
                      }, 0);
                      return (
                        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
                          {items.map((it, idx) => {
                            const cant = Number(parseMiles(it.cantidad ?? "")) || 0;
                            const prec = Number(it.precio ?? 0) || 0;
                            return (
                              <Grid container spacing={1.5} alignItems="center" key={idx}>
                                <Grid item xs={12} sm={3}>
                                  <ToggleButtonGroup exclusive size="small" fullWidth
                                    value={it.unidad ?? "pallet"}
                                    onChange={(_, v) => v && setRecItem(c.id, idx, { unidad: v })}>
                                    <ToggleButton value="pallet">Pallet</ToggleButton>
                                    <ToggleButton value="bolson">Bolsón</ToggleButton>
                                  </ToggleButtonGroup>
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                  <TextField label="Cantidad" fullWidth size="small"
                                    inputProps={{ inputMode: "decimal" }}
                                    value={it.cantidad ?? ""}
                                    onChange={(e) => setRecItem(c.id, idx, { cantidad: e.target.value.replace(/[^\d.,]/g, "") })} />
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                  <TextField label={`Precio unitario (${c.moneda})`} fullWidth size="small"
                                    inputProps={{ inputMode: "decimal" }}
                                    value={fmtMiles(it.precio ?? "")}
                                    onChange={(e) => setRecItem(c.id, idx, { precio: parseMiles(e.target.value) })} />
                                </Grid>
                                <Grid item xs={10} sm={3}>
                                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5, display: "block" }}>
                                    Subtotal
                                  </Typography>
                                  <Typography fontWeight={700} color="warning.main" sx={{ fontVariantNumeric: "tabular-nums" }}>
                                    {fmtMoney(cant * prec, c.moneda)}
                                  </Typography>
                                </Grid>
                                <Grid item xs={2} sm={1} sx={{ textAlign: "right" }}>
                                  <Tooltip title="Quitar ítem">
                                    <span>
                                      <IconButton size="small" disabled={items.length === 1}
                                        onClick={() => delRecItem(c.id, idx)}>
                                        <DeleteOutlineIcon fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                </Grid>
                              </Grid>
                            );
                          })}
                          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ flexWrap: "wrap", gap: 1 }}>
                            <Button size="small" startIcon={<AddIcon />} onClick={() => addRecItem(c.id)}>
                              Agregar ítem
                            </Button>
                            <Typography variant="body2">
                              Total a recuperar:{" "}
                              <Typography component="span" fontWeight={700} color="warning.main" sx={{ fontVariantNumeric: "tabular-nums" }}>
                                {fmtMoney(granTotal, c.moneda)}
                              </Typography>
                            </Typography>
                          </Stack>
                        </Stack>
                      );
                    })()}
                  </Box>

                  {/* ===== Materiales del remito (consumo + valorización) ===== */}
                  {(() => {
                    const listasCta = anticiposConLista(c.id);
                    const listaSel = nr.lista_anticipo_id || "";
                    const listaLen = listaDe(listaSel).length;
                    const total = totalMatItems(c.id);
                    const hayPrecios = matItemsDe(c.id).some(it => (Number(parseMiles(it.precio ?? "")) || 0) > 0);
                    const puedeIA = nr.file && (nr.file.type?.startsWith("image/") || nr.file.type === "application/pdf");
                    return (
                  <Box sx={{ mt: 2 }}>
                    <Divider sx={{ mb: 1.5 }} />
                    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1} sx={{ mb: 1 }}>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>Materiales del remito</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Detalle de lo que salió. Podés leerlo con IA o cargarlo a mano: al elegir el material de la lista del acopio se trae el precio y se multiplica por la cantidad; el Monto es la suma.
                        </Typography>
                      </Box>
                      <Button size="small" variant="outlined" startIcon={<AutoAwesomeIcon />}
                        disabled={leyendoIA === c.id || !puedeIA}
                        onClick={() => leerRemitoIA(c.id)} sx={{ flexShrink: 0 }}>
                        {leyendoIA === c.id ? "Leyendo…" : "Leer remito con IA"}
                      </Button>
                    </Stack>
                    {/* Selector de lista de precios del acopio (default: FIFO). */}
                    <Grid container spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <Grid item xs={12} sm={7}>
                        <TextField select label="Lista de precios (acopio)" fullWidth size="small"
                          value={listasCta.some(a => a.id === listaSel) ? listaSel : ""}
                          onChange={(e) => setRet(c.id, { lista_anticipo_id: e.target.value })}
                          helperText={listasCta.length
                            ? (listaLen ? `${listaLen} precios · se usa para valorizar el remito` : "Este acopio no tiene lista cargada")
                            : "Ningún acopio tiene lista. Cargala desde “Anticipos / acopios”."}>
                          <MenuItem value="">(Sin lista — cargo precios a mano)</MenuItem>
                          {listasCta.map(a => (
                            <MenuItem key={a.id} value={a.id}>
                              {(a.fecha ? fmtDate(a.fecha) : "s/f")} · {fmtMoney(a.monto, c.moneda)}
                              {a.acopio_nro ? ` · acopio ${a.acopio_nro}` : ""} ({(a.lista_precios || []).length} precios)
                            </MenuItem>
                          ))}
                        </TextField>
                      </Grid>
                    </Grid>
                    {!puedeIA && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                        Adjuntá la foto o el PDF del remito arriba para poder leerlo con IA.
                      </Typography>
                    )}
                    <Stack spacing={1.25}>
                      {matItemsDe(c.id).map((it, idx) => {
                        const sub = subtotalMat(it);
                        return (
                        <Box key={idx} sx={{ p: 1, border: "1px solid", borderColor: "rgba(15,42,74,0.10)", borderRadius: 1 }}>
                          <Grid container spacing={1} alignItems="center">
                            <Grid item xs={8} sm={5}>
                              <Autocomplete
                                freeSolo size="small" fullWidth
                                options={listaDe(listaSel)}
                                value={it.material ?? ""}
                                getOptionLabel={(o) => (typeof o === "string" ? o : (o.material || ""))}
                                isOptionEqualToValue={(o, v) => (o?.material || "") === (typeof v === "string" ? v : v?.material)}
                                filterOptions={(opts, state) => {
                                  const q = state.inputValue.trim().toLowerCase();
                                  const base = q
                                    ? opts.filter(o => (o.material || "").toLowerCase().includes(q) || (o.codigo || "").toLowerCase().includes(q))
                                    : opts;
                                  return base.slice(0, 50);
                                }}
                                onChange={(e, val) => {
                                  if (val && typeof val === "object") {
                                    setMatItem(c.id, idx, {
                                      material: val.material || "",
                                      codigo: val.codigo || "",
                                      unidad: val.unidad || it.unidad || "unidad",
                                      categoria: CATEGORIAS_MAT.includes(val.categoria) ? val.categoria : (it.categoria || "Otros"),
                                      precio: val.precio != null ? String(val.precio) : (it.precio ?? ""),
                                    });
                                  } else {
                                    setMatItem(c.id, idx, { material: val || "" });
                                  }
                                }}
                                onInputChange={(e, val, reason) => { if (reason === "input") setMatItem(c.id, idx, { material: val }); }}
                                renderOption={(props, o) => (
                                  <li {...props} key={(o.codigo || "") + "·" + o.material}>
                                    <Box>
                                      <Typography variant="body2">{o.material}</Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        {o.codigo ? `Cód. ${o.codigo} · ` : ""}
                                        {o.precio != null && o.precio !== "" ? fmtMoney(o.precio, c.moneda) : "sin precio"}
                                        {o.unidad ? ` · ${o.unidad}` : ""}
                                      </Typography>
                                    </Box>
                                  </li>
                                )}
                                renderInput={(params) => (
                                  <TextField {...params} label="Material"
                                    helperText={it.codigo ? `Cód. ${it.codigo}` : (listaDe(listaSel).length ? "Elegí de la lista para traer el precio" : " ")} />
                                )}
                              />
                            </Grid>
                            <Grid item xs={4} sm={2}>
                              <TextField select label="Categoría" fullWidth size="small"
                                value={CATEGORIAS_MAT.includes(it.categoria) ? it.categoria : "Otros"}
                                onChange={(e) => setMatItem(c.id, idx, { categoria: e.target.value })}>
                                {CATEGORIAS_MAT.map(cat => <MenuItem key={cat} value={cat}>{cat}</MenuItem>)}
                              </TextField>
                            </Grid>
                            <Grid item xs={4} sm={1.5}>
                              <TextField label="Cantidad" fullWidth size="small" inputProps={{ inputMode: "decimal" }}
                                value={it.cantidad ?? ""} onChange={(e) => setMatItem(c.id, idx, { cantidad: e.target.value.replace(/[^\d.,]/g, "") })} />
                            </Grid>
                            <Grid item xs={4} sm={1.5}>
                              <TextField label="Unidad" fullWidth size="small"
                                value={it.unidad ?? ""} onChange={(e) => setMatItem(c.id, idx, { unidad: e.target.value })} />
                            </Grid>
                            <Grid item xs={4} sm={2}>
                              <TextField label={`Precio (${c.moneda})`} fullWidth size="small" inputProps={{ inputMode: "decimal" }}
                                value={fmtMiles(it.precio ?? "")} onChange={(e) => setMatItem(c.id, idx, { precio: parseMiles(e.target.value) })} />
                            </Grid>
                            <Grid item xs={8} sm={9}>
                              <Typography variant="caption" color="text.secondary">
                                Subtotal:{" "}
                                <Typography component="span" fontWeight={700} color={sub > 0 ? "secondary.main" : "text.disabled"} sx={{ fontVariantNumeric: "tabular-nums" }}>
                                  {fmtMoney(sub, c.moneda)}
                                </Typography>
                              </Typography>
                            </Grid>
                            <Grid item xs={4} sm={3} sx={{ textAlign: "right" }}>
                              <Tooltip title="Quitar material">
                                <IconButton size="small" onClick={() => delMatItem(c.id, idx)}>
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Grid>
                          </Grid>
                        </Box>
                        );
                      })}
                    </Stack>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1, flexWrap: "wrap", gap: 1 }}>
                      <Button size="small" startIcon={<AddIcon />} onClick={() => addMatItem(c.id)}>
                        Agregar material
                      </Button>
                      {hayPrecios && (
                        <Typography variant="body2">
                          Total remito (Σ P×Q):{" "}
                          <Typography component="span" fontWeight={700} color="secondary.main" sx={{ fontVariantNumeric: "tabular-nums" }}>
                            {fmtMoney(total, c.moneda)}
                          </Typography>
                          <Typography component="span" variant="caption" color="text.secondary"> → se cargó como Monto</Typography>
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                    );
                  })()}
                  </DialogContent>
                  <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button onClick={() => cancelEditRetiro(c.id)}>Cancelar</Button>
                    <Button variant="contained" color="secondary" disabled={subiendo === c.id}
                      onClick={() => addRetiro(c.id)}>
                      {subiendo === c.id ? "…" : (editRet && editRet.cuenta_id === c.id ? "Guardar cambios" : "Agregar retiro")}
                    </Button>
                  </DialogActions>
                  </Dialog>

                  {/* Detalle de retiros abajo (por fecha) */}
                  <Box sx={{ overflowX: "auto", mt: 1.5 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ width: 110 }}>Fecha</TableCell>
                          <TableCell sx={{ width: 100 }}>Remito Nº</TableCell>
                          <TableCell sx={{ width: 90 }}>Lista Nº</TableCell>
                          <TableCell sx={{ width: 130 }}>Etapa</TableCell>
                          <TableCell>Detalle</TableCell>
                          <TableCell align="right">Monto</TableCell>
                          <TableCell align="right">Bruto USD</TableCell>
                          <TableCell align="right">A recuperar USD</TableCell>
                          <TableCell align="right">Neto USD</TableCell>
                          <TableCell align="center" sx={{ width: 80 }}>Validado</TableCell>
                          <TableCell align="center" sx={{ width: 80 }}>Remito</TableCell>
                          <TableCell align="right" sx={{ width: 56 }}></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rs.length === 0 && (
                          <TableRow><TableCell colSpan={12}>
                            <Typography variant="body2" color="text.secondary">Todavía no hay retiros en esta cuenta.</Typography>
                          </TableCell></TableRow>
                        )}
                        {rs.map((r) => {
                          const neto = netoRetiro(r);
                          const netoUSD = usdDe(c, neto, r.tipo_cambio);
                          const brutoUSD = usdDe(c, Number(r.monto || 0), r.tipo_cambio);
                          const recUSD = usdDe(c, Number(r.monto || 0) - neto, r.tipo_cambio);
                          return (
                          <TableRow key={r.id} hover>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtDate(r.fecha)}</TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>{r.remito_nro || "—"}</TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>
                              {listaNroDe(r.lista_anticipo_id)
                                ? <Chip size="small" variant="outlined" color="secondary" label={listaNroDe(r.lista_anticipo_id)} />
                                : <Typography variant="body2" color="text.disabled">—</Typography>}
                            </TableCell>
                            <TableCell>
                              {r.etapa
                                ? <Chip size="small" variant="outlined" color="primary" label={r.etapa} />
                                : <Typography variant="body2" color="text.disabled">—</Typography>}
                            </TableCell>
                            <TableCell>
                              {r.descripcion || "—"}
                              {Array.isArray(r.materiales_items) && r.materiales_items.map((it, i) => (
                                <Typography key={"m" + i} variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                  {it.cantidad != null ? `${fmtNum0(it.cantidad)} ${it.unidad || ""} · ` : ""}{it.material}
                                </Typography>
                              ))}
                              {r.recupero && itemsRecupero(r).map((it, i) => (
                                <Typography key={i} variant="caption" color="warning.main" sx={{ display: "block" }}>
                                  Recupero · {fmtNum0(it.cantidad)} {it.unidad === "bolson" ? "bolsón/es" : "pallet/s"} · {fmtMoney(it.total, c.moneda)}
                                </Typography>
                              ))}
                            </TableCell>
                            <TableCell align="right" sx={{ whiteSpace: "nowrap", color: "error.main", fontWeight: 600 }}>
                              −{fmtMoney(r.monto, c.moneda)}
                            </TableCell>
                            <TableCell align="right" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                              {fmtMoney(brutoUSD, "USD")}
                            </TableCell>
                            <TableCell align="right" sx={{ whiteSpace: "nowrap", color: recUSD > 0 ? "warning.main" : "text.disabled" }}>
                              {recUSD > 0 ? fmtMoney(recUSD, "USD") : "—"}
                            </TableCell>
                            <TableCell align="right" sx={{ whiteSpace: "nowrap", fontWeight: 600, color: "#0F2A4A" }}>
                              {fmtMoney(netoUSD, "USD")}
                            </TableCell>
                            <TableCell align="center">
                              <Tooltip title={r.validado ? "Retiro validado" : "Marcar como validado"}>
                                <Checkbox size="small" color="success" checked={!!r.validado}
                                  onChange={() => toggleValidado(r)} />
                              </Tooltip>
                            </TableCell>
                            <TableCell align="center">
                              {r.remito_url
                                ? <Tooltip title="Ver remito"><IconButton size="small" component={Link} href={r.remito_url} target="_blank"><ReceiptLongIcon fontSize="small" /></IconButton></Tooltip>
                                : <Typography variant="body2" color="text.disabled">—</Typography>}
                            </TableCell>
                            <TableCell align="right">
                              <Tooltip title="Editar retiro"><IconButton size="small" onClick={() => startEditRetiro(r)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                              <Tooltip title="Eliminar retiro"><IconButton size="small" onClick={() => delRetiro(r)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                            </TableCell>
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Box>
                </Section>

                {/* ============== SECCIÓN 3: DEVOLUCIÓN A SALDO ============== */}
                <Section title="Devolución a saldo" accent="#8E44AD"
                  right={<Typography variant="caption" color="text.secondary">Recuperado a saldo: <b style={{ color: "#8E44AD" }}>{fmtMoney(devs.reduce((s, a) => s + Number(a.monto || 0), 0), c.moneda)}</b></Typography>}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                    En vez de cobrarse en efectivo (que entra a Caja), la devolución de pallets / bolsones se acredita acá y suma al saldo disponible de la cuenta.
                  </Typography>
                  {/* Botón que abre el diálogo de nuevo recupero */}
                  <Button variant="contained" size="small" startIcon={<AddIcon />}
                    sx={{ bgcolor: "#8E44AD", "&:hover": { bgcolor: "#763a92" }, mb: 1 }}
                    onClick={() => openNuevoDev(c.id)}>
                    Nuevo recupero
                  </Button>
                  <Dialog open={devOpen === c.id} onClose={() => cancelEditDevolucion(c.id)} fullWidth maxWidth="md" fullScreen={fullScreen}>
                  <DialogTitle>{editDev && editDev.cuenta_id === c.id ? "Editar recupero" : "Nuevo recupero a saldo"} · {c.proveedor}</DialogTitle>
                  <DialogContent dividers>
                    {(() => {
                      const nd = nuevaDevolucion[c.id] || {};
                      const items = devItemsDe(c.id);
                      const granTotal = items.reduce((s, it) => {
                        const cant = Number(parseMiles(it.cantidad ?? "")) || 0;
                        const prec = Number(it.precio ?? 0) || 0;
                        return s + cant * prec;
                      }, 0);
                      return (
                        <Stack spacing={1.5}>
                          <Grid container spacing={1.5} alignItems="center">
                            <Grid item xs={6} sm={3}>
                              <TextField type="date" label="Fecha" InputLabelProps={{ shrink: true }} fullWidth size="small"
                                value={nd.fecha ?? hoyISO()} onChange={(e) => setDev(c.id, { fecha: e.target.value })} />
                            </Grid>
                            <Grid item xs={6} sm={3}>
                              <TextField label="Remito Nº" fullWidth size="small"
                                value={nd.remito_nro ?? ""} onChange={(e) => setDev(c.id, { remito_nro: e.target.value })} />
                            </Grid>
                            <Grid item xs={6} sm={4}>
                              <Button component="label" variant="outlined" startIcon={<AttachFileIcon />} fullWidth size="small" sx={{ overflow: "hidden" }}>
                                {nd.file ? nd.file.name : "Comprobante"}
                                <input hidden type="file" accept="image/*,application/pdf"
                                  onChange={(e) => setDev(c.id, { file: e.target.files?.[0] ?? null })} />
                              </Button>
                            </Grid>
                          </Grid>
                          {items.map((it, idx) => {
                            const cant = Number(parseMiles(it.cantidad ?? "")) || 0;
                            const prec = Number(it.precio ?? 0) || 0;
                            return (
                              <Grid container spacing={1.5} alignItems="center" key={idx}>
                                <Grid item xs={12} sm={3}>
                                  <ToggleButtonGroup exclusive size="small" fullWidth
                                    value={it.unidad ?? "pallet"}
                                    onChange={(_, v) => v && setDevItem(c.id, idx, { unidad: v })}>
                                    <ToggleButton value="pallet">Pallet</ToggleButton>
                                    <ToggleButton value="bolson">Bolsón</ToggleButton>
                                  </ToggleButtonGroup>
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                  <TextField label="Cantidad" fullWidth size="small"
                                    inputProps={{ inputMode: "decimal" }}
                                    value={it.cantidad ?? ""}
                                    onChange={(e) => setDevItem(c.id, idx, { cantidad: e.target.value.replace(/[^\d.,]/g, "") })} />
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                  <TextField label={`Precio unitario (${c.moneda})`} fullWidth size="small"
                                    inputProps={{ inputMode: "decimal" }}
                                    value={fmtMiles(it.precio ?? "")}
                                    onChange={(e) => setDevItem(c.id, idx, { precio: parseMiles(e.target.value) })} />
                                </Grid>
                                <Grid item xs={10} sm={3}>
                                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5, display: "block" }}>
                                    Subtotal
                                  </Typography>
                                  <Typography fontWeight={700} sx={{ color: "#8E44AD", fontVariantNumeric: "tabular-nums" }}>
                                    {fmtMoney(cant * prec, c.moneda)}
                                  </Typography>
                                </Grid>
                                <Grid item xs={2} sm={1} sx={{ textAlign: "right" }}>
                                  <Tooltip title="Quitar ítem">
                                    <span>
                                      <IconButton size="small" disabled={items.length === 1}
                                        onClick={() => delDevItem(c.id, idx)}>
                                        <DeleteOutlineIcon fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                </Grid>
                              </Grid>
                            );
                          })}
                          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ flexWrap: "wrap", gap: 1 }}>
                            <Button size="small" startIcon={<AddIcon />} onClick={() => addDevItem(c.id)}>
                              Agregar ítem
                            </Button>
                            <Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: "wrap" }}>
                              <Typography variant="body2">
                                Suma al saldo:{" "}
                                <Typography component="span" fontWeight={700} sx={{ color: "#8E44AD", fontVariantNumeric: "tabular-nums" }}>
                                  {fmtMoney(granTotal, c.moneda)}
                                </Typography>
                              </Typography>
                              <Button size="small" onClick={() => cancelEditDevolucion(c.id)}>Cancelar</Button>
                              <Button variant="contained" size="small" sx={{ bgcolor: "#8E44AD", "&:hover": { bgcolor: "#763a92" } }}
                                disabled={subiendoDev === c.id} onClick={() => addDevolucion(c.id)}>
                                {subiendoDev === c.id ? "…" : (editDev && editDev.cuenta_id === c.id ? "Guardar" : "Registrar")}
                              </Button>
                            </Stack>
                          </Stack>
                        </Stack>
                      );
                    })()}
                  </DialogContent>
                  </Dialog>

                  {/* Detalle de devoluciones */}
                  {devs.length > 0 && (
                    <Box sx={{ overflowX: "auto", mt: 1.5 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ width: 110 }}>Fecha</TableCell>
                            <TableCell sx={{ width: 100 }}>Remito Nº</TableCell>
                            <TableCell>Detalle</TableCell>
                            <TableCell align="right">Suma al saldo</TableCell>
                            <TableCell align="center" sx={{ width: 80 }}>Comprob.</TableCell>
                            <TableCell align="right" sx={{ width: 56 }}></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {devs.map((a) => (
                            <TableRow key={a.id} hover>
                              <TableCell sx={{ whiteSpace: "nowrap" }}>{a.fecha ? fmtDate(a.fecha) : "—"}</TableCell>
                              <TableCell sx={{ whiteSpace: "nowrap" }}>{a.remito_nro || "—"}</TableCell>
                              <TableCell>
                                {(Array.isArray(a.rec_items) ? a.rec_items : []).map((it, i) => (
                                  <Typography key={i} variant="caption" sx={{ display: "block", color: "#8E44AD" }}>
                                    {fmtNum0(it.cantidad)} {it.unidad === "bolson" ? "bolsón/es" : "pallet/s"} · {fmtMoney(Number(it.total || 0), c.moneda)}
                                  </Typography>
                                ))}
                                {!Array.isArray(a.rec_items) && <Typography variant="caption" color="text.secondary">Devolución a saldo</Typography>}
                              </TableCell>
                              <TableCell align="right" sx={{ whiteSpace: "nowrap", color: "#8E44AD", fontWeight: 600 }}>
                                +{fmtMoney(a.monto, c.moneda)}
                              </TableCell>
                              <TableCell align="center">
                                {a.comprobante_url
                                  ? <Tooltip title="Ver comprobante"><IconButton size="small" component={Link} href={a.comprobante_url} target="_blank"><ReceiptLongIcon fontSize="small" /></IconButton></Tooltip>
                                  : <Typography variant="body2" color="text.disabled">—</Typography>}
                              </TableCell>
                              <TableCell align="right">
                                <Tooltip title="Editar devolución"><IconButton size="small" onClick={() => startEditDevolucion(a)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                                <Tooltip title="Eliminar devolución"><IconButton size="small" onClick={() => delDevolucion(a)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Box>
                  )}
                </Section>

                <Stack direction="row" spacing={1} sx={{ mt: 2 }} justifyContent="flex-end">
                  <Button size="small" startIcon={<EditIcon />} onClick={() => openEditCuenta(c)}>Editar cuenta</Button>
                  <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => delCuenta(c)}>Eliminar cuenta</Button>
                </Stack>
              </AccordionDetails>
            </Accordion>
          );
        })
      )}
      </>)}

      {tab === 1 && (() => {
        const selId = cuentaSel || cuentas[0]?.id || "";
        const cSel = cuentas.find(c => c.id === selId);
        if (!cSel) return <Card><CardContent><Typography color="text.secondary">No hay cuentas para mostrar.</Typography></CardContent></Card>;
        const k = calc(cSel);
        const filas = ledgerDe(selId);
        return (
          <Stack spacing={2}>
            <Card><CardContent>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={3}>
                  <TextField select fullWidth size="small" label="Cuenta"
                    value={selId} onChange={(e) => setCuentaSel(e.target.value)}>
                    {cuentas.map(c => (
                      <MenuItem key={c.id} value={c.id}>{c.proveedor} ({c.moneda})</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Resumen sm={3} label="Anticipado" value={fmtMoney(k.anticipado, cSel.moneda)} />
                <Resumen sm={3} label="Retirado" value={fmtMoney(k.retirado, cSel.moneda)} color="error.main" />
                <Resumen sm={3} label="Saldo disponible" value={fmtMoney(k.saldo, cSel.moneda)}
                  color={k.saldo < -0.005 ? "error.main" : Math.abs(k.saldo) <= 0.005 ? "text.secondary" : "success.main"} />
              </Grid>
            </CardContent></Card>

            <Card><CardContent sx={{ p: { xs: 1, sm: 2 } }}>
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 110 }}>Fecha</TableCell>
                      <TableCell sx={{ width: 120 }}>Tipo</TableCell>
                      <TableCell sx={{ width: 100 }}>Remito Nº</TableCell>
                      <TableCell>Detalle</TableCell>
                      <TableCell align="right">Ingreso</TableCell>
                      <TableCell align="right">Egreso</TableCell>
                      <TableCell align="right">Saldo</TableCell>
                      <TableCell align="center" sx={{ width: 60 }}>Comp.</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filas.length === 0 && (
                      <TableRow><TableCell colSpan={8}>
                        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                          Esta cuenta todavía no tiene movimientos.
                        </Typography>
                      </TableCell></TableRow>
                    )}
                    {filas.map((f) => {
                      const esIngreso = f.delta >= 0;
                      const color = f.tipo === "Retiro" ? "#C0392B" : f.tipo === "Devolución" ? "#8E44AD" : "#1E8E3E";
                      return (
                        <TableRow key={f.id} hover sx={{ bgcolor: esIngreso ? "rgba(30,142,62,0.04)" : "rgba(192,57,43,0.04)" }}>
                          <TableCell sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{f.fecha ? fmtDate(f.fecha) : "—"}</TableCell>
                          <TableCell>
                            <Chip size="small" variant="outlined" label={f.tipo}
                              sx={{ borderColor: color, color }} />
                          </TableCell>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>{f.remito_nro || "—"}</TableCell>
                          <TableCell>{f.detalle}</TableCell>
                          <TableCell align="right" sx={{ whiteSpace: "nowrap", color: "#1E8E3E", fontWeight: 600 }}>
                            {esIngreso ? fmtMoney(f.delta, cSel.moneda) : ""}
                          </TableCell>
                          <TableCell align="right" sx={{ whiteSpace: "nowrap", color: "error.main", fontWeight: 600 }}>
                            {!esIngreso ? fmtMoney(Math.abs(f.delta), cSel.moneda) : ""}
                          </TableCell>
                          <TableCell align="right" sx={{ whiteSpace: "nowrap", fontWeight: 700, fontVariantNumeric: "tabular-nums",
                            color: f.saldo < -0.005 ? "error.main" : "text.primary" }}>
                            {fmtMoney(f.saldo, cSel.moneda)}
                          </TableCell>
                          <TableCell align="center">
                            {f.url
                              ? <Tooltip title="Ver comprobante"><IconButton size="small" component={Link} href={f.url} target="_blank"><ReceiptLongIcon fontSize="small" /></IconButton></Tooltip>
                              : <Typography variant="body2" color="text.disabled">—</Typography>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            </CardContent></Card>
          </Stack>
        );
      })()}

      {tab === 2 && (
        <Stack spacing={2}>
          <Card><CardContent>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between">
              <Box>
                <Typography variant="subtitle2" fontWeight={800} sx={{ textTransform: "uppercase", letterSpacing: 0.6 }}>
                  Gasto real de materiales por etapa
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Neto en USD (retiro − recupero) valuado al dólar congelado de cada acopio. El recupero queda aparte como “a recuperar”.
                </Typography>
              </Box>
              <Stack direction="row" spacing={3}>
                <Box sx={{ textAlign: "right" }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", textTransform: "uppercase", fontSize: 10 }}>Total neto</Typography>
                  <Typography fontWeight={700} sx={{ color: "#0F2A4A" }}>{fmtMoney(totalNetoUSD, "USD")}</Typography>
                </Box>
                <Box sx={{ textAlign: "right" }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", textTransform: "uppercase", fontSize: 10 }}>A recuperar</Typography>
                  <Typography fontWeight={700} color="warning.main">{fmtMoney(totalARecuperarUSD, "USD")}</Typography>
                </Box>
              </Stack>
            </Stack>
          </CardContent></Card>

          <Card><CardContent sx={{ p: { xs: 1, sm: 2 } }}>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Etapa</TableCell>
                    <TableCell align="right">Retiros</TableCell>
                    <TableCell align="right">Neto imputado (USD)</TableCell>
                    <TableCell align="right">A recuperar (USD)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {gastoPorEtapa.length === 0 && (
                    <TableRow><TableCell colSpan={4}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                        Todavía no hay retiros imputados a etapas.
                      </Typography>
                    </TableCell></TableRow>
                  )}
                  {gastoPorEtapa.map((f) => (
                    <TableRow key={f.etapa} hover>
                      <TableCell>
                        {f.etapa === "(Sin etapa)"
                          ? <Typography variant="body2" color="text.disabled">(Sin etapa)</Typography>
                          : <Chip size="small" variant="outlined" color="primary" label={f.etapa} />}
                      </TableCell>
                      <TableCell align="right">{f.n}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: "#0F2A4A", fontVariantNumeric: "tabular-nums" }}>
                        {fmtMoney(f.netoUSD, "USD")}
                      </TableCell>
                      <TableCell align="right" sx={{ color: f.aRecuperarUSD > 0 ? "warning.main" : "text.disabled", fontVariantNumeric: "tabular-nums" }}>
                        {f.aRecuperarUSD > 0 ? fmtMoney(f.aRecuperarUSD, "USD") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </CardContent></Card>

          <Alert severity="info">
            Este es el insumo para comparar “plan vs real” por etapa en dólares. La integración con Económico (sumar esto al real por etapa y excluir el egreso de acopio de la Caja) queda como próximo paso.
          </Alert>
        </Stack>
      )}

      {tab === 3 && (
        <Stack spacing={2}>
          <Card><CardContent>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between" alignItems={{ sm: "center" }}>
              <Box>
                <Typography variant="subtitle2" fontWeight={800} sx={{ textTransform: "uppercase", letterSpacing: 0.6 }}>
                  Consumo de materiales
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Cantidades salidas según los remitos de los retiros (leídos con IA o cargados a mano). Sirve para saber cuánto material llevó cada etapa y aprender para la próxima obra.
                </Typography>
              </Box>
              <TextField select size="small" label="Etapa" sx={{ minWidth: 220 }}
                value={consumoEtapa} onChange={(e) => setConsumoEtapa(e.target.value)}>
                <MenuItem value="">Todas las etapas</MenuItem>
                {(hitos.length ? hitos : ETAPAS_DEFAULT).map(et => <MenuItem key={et} value={et}>{et}</MenuItem>)}
                <MenuItem value="(Sin etapa)">(Sin etapa)</MenuItem>
              </TextField>
            </Stack>
          </CardContent></Card>

          <Card><CardContent sx={{ p: { xs: 1, sm: 2 } }}>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 150 }}>Categoría</TableCell>
                    <TableCell>Material</TableCell>
                    <TableCell align="right" sx={{ width: 120 }}>Cantidad</TableCell>
                    <TableCell sx={{ width: 90 }}>Unidad</TableCell>
                    <TableCell align="right" sx={{ width: 80 }}>Retiros</TableCell>
                    {!consumoEtapa && <TableCell>Etapas</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {consumo.length === 0 && (
                    <TableRow><TableCell colSpan={consumoEtapa ? 5 : 6}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                        Todavía no hay materiales cargados. Cargá un retiro con la foto del remito y leelo con IA.
                      </Typography>
                    </TableCell></TableRow>
                  )}
                  {consumo.map((m, i) => (
                    <TableRow key={i} hover>
                      <TableCell><Chip size="small" variant="outlined" label={m.categoria} /></TableCell>
                      <TableCell>{m.material}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtNum0(m.cantidad)}</TableCell>
                      <TableCell sx={{ color: "text.secondary" }}>{m.unidad}</TableCell>
                      <TableCell align="right" sx={{ color: "text.secondary" }}>{m.retiros}</TableCell>
                      {!consumoEtapa && (
                        <TableCell>
                          <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }} useFlexGap>
                            {m.etapas.map(et => (
                              <Chip key={et} size="small" variant="outlined" color={et === "(Sin etapa)" ? "default" : "primary"} label={et} />
                            ))}
                          </Stack>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </CardContent></Card>
        </Stack>
      )}

      {tab === 4 && (
        <Stack spacing={2}>
          <Card><CardContent>
            <Box>
              <Typography variant="subtitle2" fontWeight={800} sx={{ textTransform: "uppercase", letterSpacing: 0.6 }}>
                Control por lista (acopio)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Por cada lista / acopio: el detalle de lo retirado (artículo, cantidad, precio unitario y total), el total retirado y el saldo de la lista (anticipo − retirado). Los recuperos cargados en "Devolución a saldo" aparecen como renglones aparte (no descuentan del retirado).
              </Typography>
            </Box>
          </CardContent></Card>

          {controlPorLista.length === 0 && (
            <Alert severity="info">
              Todavía no hay listas de precios cargadas ni retiros imputados a una lista. Cargá la lista de precios en un acopio y elegí esa lista al registrar un retiro.
            </Alert>
          )}

          {controlPorLista.map((L) => (
            <Card key={L.key}><CardContent sx={{ p: { xs: 1, sm: 2 } }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between" alignItems={{ sm: "center" }} sx={{ mb: 1 }}>
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap" }} useFlexGap>
                    <Chip size="small" color="secondary" label={`Lista Nº ${L.nro}`} />
                    <Typography variant="subtitle2" fontWeight={700}>{L.cuenta.proveedor}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {L.fecha ? fmtDate(L.fecha) : "sin fecha"} · {L.nRetiros} retiro{L.nRetiros === 1 ? "" : "s"}
                    </Typography>
                  </Stack>
                </Box>
                <Stack direction="row" spacing={3}>
                  <Box sx={{ textAlign: "right" }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", textTransform: "uppercase", fontSize: 10 }}>Anticipo</Typography>
                    <Typography fontWeight={700} sx={{ color: "#0F2A4A" }}>{fmtMoney(L.anticipoMonto, L.moneda)}</Typography>
                  </Box>
                  <Box sx={{ textAlign: "right" }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", textTransform: "uppercase", fontSize: 10 }}>Retirado</Typography>
                    <Typography fontWeight={700} color="error.main">{fmtMoney(L.totalRetirado, L.moneda)}</Typography>
                  </Box>
                  {L.devTotal > 0 && (
                    <Box sx={{ textAlign: "right" }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", textTransform: "uppercase", fontSize: 10 }}>Devuelto a saldo</Typography>
                      <Typography fontWeight={700} sx={{ color: "#8E44AD" }}>{fmtMoney(L.devTotal, L.moneda)}</Typography>
                    </Box>
                  )}
                  <Box sx={{ textAlign: "right" }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", textTransform: "uppercase", fontSize: 10 }}>Saldo lista</Typography>
                    <Typography fontWeight={700} sx={{ color: L.saldo < 0 ? "#C0392B" : "#1E8449" }}>{fmtMoney(L.saldo, L.moneda)}</Typography>
                  </Box>
                </Stack>
              </Stack>
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 80 }}>Código</TableCell>
                      <TableCell>Artículo</TableCell>
                      <TableCell align="right" sx={{ width: 110 }}>Cantidad</TableCell>
                      <TableCell sx={{ width: 80 }}>Unidad</TableCell>
                      <TableCell align="right" sx={{ width: 130 }}>Precio unit.</TableCell>
                      <TableCell align="right" sx={{ width: 140 }}>Total retirado</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {L.items.length === 0 && (
                      <TableRow><TableCell colSpan={6}>
                        <Typography variant="body2" color="text.secondary" sx={{ py: 1.5, textAlign: "center" }}>
                          Todavía no hay artículos retirados imputados a esta lista.
                        </Typography>
                      </TableCell></TableRow>
                    )}
                    {L.items.map((it, i) => (
                      <TableRow key={i} hover>
                        <TableCell sx={{ color: "text.secondary" }}>{it.codigo || "—"}</TableCell>
                        <TableCell>{it.material}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtNum0(it.cantidad)}</TableCell>
                        <TableCell sx={{ color: "text.secondary" }}>{it.unidad}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{it.precio > 0 ? fmtMoney(it.precio, L.moneda) : "—"}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: "#0F2A4A", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(it.total, L.moneda)}</TableCell>
                      </TableRow>
                    ))}
                    {L.items.length > 0 && (
                      <TableRow>
                        <TableCell colSpan={5} align="right" sx={{ fontWeight: 700 }}>Total retirado (detalle)</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: "#0F2A4A", fontVariantNumeric: "tabular-nums" }}>
                          {fmtMoney(L.items.reduce((s, it) => s + it.total, 0), L.moneda)}
                        </TableCell>
                      </TableRow>
                    )}
                    {L.devoluciones.length > 0 && (
                      <TableRow>
                        <TableCell colSpan={6} sx={{ borderBottom: "none", pt: 2 }}>
                          <Typography variant="caption" fontWeight={700} sx={{ color: "#8E44AD", textTransform: "uppercase", letterSpacing: 0.5 }}>
                            Devoluciones a saldo (recupero) — no descuentan del retirado
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                    {L.devoluciones.map((it, i) => (
                      <TableRow key={"dev" + i} hover>
                        <TableCell sx={{ color: "text.secondary" }}>—</TableCell>
                        <TableCell sx={{ color: "#8E44AD" }}>{it.material}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtNum0(it.cantidad)}</TableCell>
                        <TableCell sx={{ color: "text.secondary" }}>{it.unidad === "bolson" ? "bolsón" : "pallet"}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{it.precio > 0 ? fmtMoney(it.precio, L.moneda) : "—"}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: "#8E44AD", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(it.total, L.moneda)}</TableCell>
                      </TableRow>
                    ))}
                    {L.devoluciones.length > 0 && (
                      <TableRow>
                        <TableCell colSpan={5} align="right" sx={{ fontWeight: 700 }}>Total devuelto a saldo</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: "#8E44AD", fontVariantNumeric: "tabular-nums" }}>
                          {fmtMoney(L.devTotal, L.moneda)}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>
            </CardContent></Card>
          ))}
        </Stack>
      )}

      {/* Dialog: lista de precios de un acopio (anticipo) */}
      <Dialog open={!!listaDlg} onClose={() => setListaDlg(null)} fullWidth maxWidth="md" fullScreen={fullScreen}>
        {listaDlg && (() => {
          const { anticipo: a, cuenta: c, items, file } = listaDlg;
          const esExcel = file && /\.(xlsx|xls|csv)$/i.test(file.name || "");
          const puedeIA = file && !esExcel && (file.type?.startsWith("image/") || file.type === "application/pdf");
          const totalItems = items.filter(it => (it.material || "").trim() || Number(parseMiles(it.precio_bruto ?? "")) > 0).length;
          return (
            <>
              <DialogTitle>
                Lista de precios del acopio · {c.proveedor}
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  {a.fecha ? fmtDate(a.fecha) : "sin fecha"} · {fmtMoney(a.monto, c.moneda)} — congelada dentro de este acopio
                </Typography>
              </DialogTitle>
              <DialogContent dividers>
                <Grid container spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                  <Grid item xs={6} sm={3}>
                    <TextField label="Acopio N°" fullWidth size="small"
                      value={listaDlg.acopio_nro ?? ""} onChange={(e) => setListaDlg(prev => prev && ({ ...prev, acopio_nro: e.target.value }))} />
                  </Grid>
                  <Grid item xs={6} sm={4}>
                    <Button component="label" variant={file ? "outlined" : "contained"}
                      startIcon={<AttachFileIcon />} fullWidth size="small" sx={{ overflow: "hidden" }}>
                      {file ? file.name : "Adjuntar lista (Excel/PDF/foto)"}
                      <input hidden type="file" accept=".xlsx,.xls,.csv,image/*,application/pdf"
                        onChange={(e) => setListaDlg(prev => prev && ({ ...prev, file: e.target.files?.[0] ?? null }))} />
                    </Button>
                  </Grid>
                  <Grid item xs={12} sm={5}>
                    {esExcel ? (
                      <Button variant="contained" color="success" fullWidth size="small"
                        disabled={leyendoLista} onClick={importarExcel}>
                        {leyendoLista ? "Importando…" : "Importar Excel (gratis)"}
                      </Button>
                    ) : (
                      <Button variant="outlined" startIcon={<AutoAwesomeIcon />} fullWidth size="small"
                        disabled={leyendoLista || !puedeIA} onClick={leerListaIA}>
                        {leyendoLista ? "Leyendo lista…" : "Leer lista con IA"}
                      </Button>
                    )}
                  </Grid>
                </Grid>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                  {esExcel
                    ? "Excel/CSV: se lee gratis y al instante (sin IA). Mapea Código · Denominación · Precio · Descuento; el neto = precio − descuento."
                    : "Recomendado: adjuntá un Excel/CSV (gratis, sin IA). Con foto o PDF se usa IA (tiene costo). El neto = precio − descuento."}
                </Typography>
                <Box sx={{ overflowX: "auto" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ width: 70 }}>Código</TableCell>
                        <TableCell>Denominación</TableCell>
                        <TableCell sx={{ width: 90 }}>Unidad</TableCell>
                        <TableCell align="right" sx={{ width: 110 }}>Precio</TableCell>
                        <TableCell align="right" sx={{ width: 80 }}>Desc. %</TableCell>
                        <TableCell align="right" sx={{ width: 120 }}>Neto</TableCell>
                        <TableCell sx={{ width: 44 }}></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {items.map((it, idx) => {
                        const neto = netoDe(parseMiles(it.precio_bruto ?? ""), parseMiles(it.descuento ?? ""));
                        return (
                          <TableRow key={idx}>
                            <TableCell>
                              <TextField variant="standard" size="small" fullWidth
                                value={it.codigo ?? ""} onChange={(e) => setListaItem(idx, { codigo: e.target.value })} />
                            </TableCell>
                            <TableCell>
                              <TextField variant="standard" size="small" fullWidth
                                value={it.material ?? ""} onChange={(e) => setListaItem(idx, { material: e.target.value })} />
                            </TableCell>
                            <TableCell>
                              <TextField variant="standard" size="small" fullWidth
                                value={it.unidad ?? ""} onChange={(e) => setListaItem(idx, { unidad: e.target.value })} />
                            </TableCell>
                            <TableCell align="right">
                              <TextField variant="standard" size="small" fullWidth inputProps={{ inputMode: "decimal", style: { textAlign: "right" } }}
                                value={fmtMiles(it.precio_bruto ?? "")} onChange={(e) => setListaItem(idx, { precio_bruto: parseMiles(e.target.value) })} />
                            </TableCell>
                            <TableCell align="right">
                              <TextField variant="standard" size="small" fullWidth inputProps={{ inputMode: "decimal", style: { textAlign: "right" } }}
                                value={it.descuento ?? ""} onChange={(e) => setListaItem(idx, { descuento: e.target.value.replace(/[^\d.,]/g, "") })} />
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, color: "#1E8E3E", fontVariantNumeric: "tabular-nums" }}>
                              {fmtMoney(neto, c.moneda)}
                            </TableCell>
                            <TableCell align="right">
                              <IconButton size="small" onClick={() => delListaItem(idx)}>
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Box>
                <Button size="small" startIcon={<AddIcon />} onClick={addListaItem} sx={{ mt: 1 }}>
                  Agregar renglón
                </Button>
              </DialogContent>
              <DialogActions sx={{ px: 3, py: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ mr: "auto" }}>{totalItems} ítems</Typography>
                <Button onClick={() => setListaDlg(null)}>Cancelar</Button>
                <Button variant="contained" color="secondary" disabled={guardandoLista} onClick={saveLista}>
                  {guardandoLista ? "…" : "Guardar lista"}
                </Button>
              </DialogActions>
            </>
          );
        })()}
      </Dialog>

      {/* Dialog nueva/editar cuenta */}
      <Dialog open={openCuenta} onClose={() => setOpenCuenta(false)} fullWidth maxWidth="sm" fullScreen={fullScreen}>
        <DialogTitle>{editCuentaId ? "Editar cuenta" : "Nueva cuenta de materiales"}</DialogTitle>
        <DialogContent dividers>
          {errCuenta && <Alert severity="error" sx={{ mb: 2 }}>{errCuenta}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={7}>
              <TextField label="Proveedor" fullWidth value={formCuenta.proveedor}
                onChange={(e) => setFormCuenta({ ...formCuenta, proveedor: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={5}>
              <TextField type="date" label="Fecha" InputLabelProps={{ shrink: true }} fullWidth
                value={formCuenta.fecha} onChange={(e) => setFormCuenta({ ...formCuenta, fecha: e.target.value })} />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Descripción (opcional)" fullWidth value={formCuenta.descripcion}
                onChange={(e) => setFormCuenta({ ...formCuenta, descripcion: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>Moneda</Typography>
              <ToggleButtonGroup exclusive size="small" fullWidth value={formCuenta.moneda}
                onChange={(_, v) => v && setFormCuenta({ ...formCuenta, moneda: v })}>
                <ToggleButton value="ARS">ARS ($)</ToggleButton>
                <ToggleButton value="USD">USD</ToggleButton>
              </ToggleButtonGroup>
            </Grid>
            {!editCuentaId && (
              <Grid item xs={12}>
                <Alert severity="info" sx={{ py: 0.5 }}>
                  Los acopios (anticipos) se cargan desde <b>Caja</b>, marcando el egreso como “acopio de materiales”.
                </Alert>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenCuenta(false)}>Cancelar</Button>
          <Button variant="contained" color="secondary" onClick={saveCuenta} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

// Sección visual con encabezado (título a la izquierda, dato resumen a la
// derecha) y una barra de color que la identifica. Agrupa input + detalle.
function Section({ title, accent = "#0F2A4A", right, children }) {
  return (
    <Box sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider", overflow: "hidden", mb: 2, bgcolor: "background.paper" }}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }}
        spacing={0.5}
        sx={{ px: 1.5, py: 1, bgcolor: "rgba(15,42,74,0.035)", borderLeft: `4px solid ${accent}` }}>
        <Typography variant="subtitle2" fontWeight={800} sx={{ textTransform: "uppercase", letterSpacing: 0.6, fontSize: 12.5 }}>
          {title}
        </Typography>
        {right}
      </Stack>
      <Box sx={{ p: 1.5 }}>{children}</Box>
    </Box>
  );
}

function Resumen({ label, value, color = "text.primary", sm = 4 }) {
  return (
    <Grid item xs={6} sm={sm}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5 }}>{label}</Typography>
      <Typography fontWeight={700} sx={{ color, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
    </Grid>
  );
}
