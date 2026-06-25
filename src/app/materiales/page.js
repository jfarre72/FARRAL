"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, Grid, TextField, MenuItem,
  Button, IconButton, Tooltip, LinearProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, Accordion, AccordionSummary, AccordionDetails, Table, TableHead,
  TableBody, TableRow, TableCell, Chip, Link, ToggleButton, ToggleButtonGroup,
  Divider, FormControlLabel, Switch, useMediaQuery, Tabs, Tab,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
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
// Quita los separadores y devuelve un string apto para Number().
const parseMiles = (val) => {
  if (val === "" || val === null || val === undefined) return "";
  // Conserva solo dígitos, coma decimal y signo; coma -> punto.
  const cleaned = String(val).replace(/[^\d,-]/g, "").replace(",", ".");
  return cleaned;
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
  const [tab, setTab] = useState(0); // 0 = Cuentas, 1 = Cuenta corriente, 2 = Por etapa
  const [cuentaSel, setCuentaSel] = useState(""); // cuenta elegida en la solapa de cuenta corriente

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
    const montoIni = Math.max(0, Number(parseMiles(formCuenta.monto_inicial)) || 0);
    const tcIni = Number(parseMiles(formCuenta.tipo_cambio)) || 0;
    if (!editCuentaId && formCuenta.moneda === "ARS" && montoIni > 0 && tcIni <= 0) {
      setErrCuenta("Ingresá el tipo de cambio del acopio inicial (ARS por 1 USD)."); return;
    }
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
    // Alta: creo la cuenta y su primer anticipo.
    const montoInicial = Math.max(0, Number(parseMiles(formCuenta.monto_inicial)) || 0);
    const ins = await supabase.from("cuentas_materiales").insert({
      proyecto_id: proyecto.id,
      proveedor: formCuenta.proveedor.trim(),
      descripcion: formCuenta.descripcion || null,
      moneda: formCuenta.moneda,
      monto_inicial: montoInicial, // legado; el anticipo real va en anticipos_materiales
      fecha: formCuenta.fecha || null,
    }).select("id").single();
    if (ins.error) { setSaving(false); setErrCuenta(ins.error.message); return; }
    if (montoInicial > 0) {
      const insA = await supabase.from("anticipos_materiales").insert({
        cuenta_id: ins.data.id, monto: montoInicial, fecha: formCuenta.fecha || null,
        tipo_cambio: formCuenta.moneda === "ARS" ? (tcIni > 0 ? tcIni : null) : null,
      });
      if (insA.error) { setSaving(false); setErrCuenta(insA.error.message); return; }
    }
    setSaving(false);
    setOpenCuenta(false); reload();
  };

  // ---- Anticipos (acopios sucesivos de una cuenta) ----
  const [nuevoAnticipo, setNuevoAnticipo] = useState({}); // { [cuentaId]: { monto, fecha } }
  const setAnt = (cuentaId, patch) =>
    setNuevoAnticipo(prev => ({ ...prev, [cuentaId]: { monto: "", tc: "", fecha: hoyISO(), ...prev[cuentaId], ...patch } }));
  const addAnticipo = async (cuentaId) => {
    const f = nuevoAnticipo[cuentaId] || {};
    const monto = Number(parseMiles(f.monto ?? "")) || 0;
    if (monto <= 0) { alert("Ingresá el monto del anticipo."); return; }
    const c = cuentas.find(x => x.id === cuentaId);
    const tc = Number(parseMiles(f.tc ?? "")) || 0;
    if (esARS(c) && tc <= 0) { alert("Ingresá el tipo de cambio del acopio (ARS por 1 USD)."); return; }
    const { error } = await supabase.from("anticipos_materiales").insert({
      cuenta_id: cuentaId, monto, fecha: f.fecha || hoyISO(),
      tipo_cambio: esARS(c) ? tc : null,
    });
    if (error) { alert(error.message); return; }
    setNuevoAnticipo(prev => ({ ...prev, [cuentaId]: { monto: "", tc: "", fecha: hoyISO() } }));
    reload();
  };
  const delAnticipo = async (a) => {
    if (!confirm("¿Eliminar este anticipo?")) return;
    const { error } = await supabase.from("anticipos_materiales").delete().eq("id", a.id);
    if (error) alert(error.message); else reload();
  };

  // ---- Devoluciones a saldo (recupero acreditado en la cuenta) ----
  // Se guarda como un anticipo más (suma al saldo) marcado es_devolucion, con el
  // detalle de pallets / bolsones devueltos para descontar el pendiente a recuperar.
  const [nuevaDevolucion, setNuevaDevolucion] = useState({}); // { [cuentaId]: { fecha, items: [...] } }
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
      const { error } = await supabase.from("anticipos_materiales").insert({
        cuenta_id: cuentaId, monto: total, fecha: f.fecha || hoyISO(),
        descripcion: "Devolución de material a saldo",
        remito_nro: (f.remito_nro || "").trim() || null,
        es_devolucion: true, rec_items: items, rec_pallets: pallets, rec_bolsones: bolsones,
        comprobante_url, comprobante_path,
      });
      if (error) { alert(error.message); return; }
      setNuevaDevolucion(prev => ({ ...prev, [cuentaId]: { fecha: hoyISO(), items: [emptyRecItem()], remito_nro: "", file: null } }));
      reload();
    } finally {
      setSubiendoDev(null);
    }
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
  const setRet = (cuentaId, patch) =>
    setNuevoRetiro(prev => ({ ...prev, [cuentaId]: { fecha: hoyISO(), descripcion: "", monto: "", file: null, recupero_items: [emptyRecItem()], ...prev[cuentaId], ...patch } }));

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

  const addRetiro = async (cuentaId) => {
    const f = nuevoRetiro[cuentaId] || {};
    const monto = Number(f.monto || 0);
    if (!monto || monto <= 0) { alert("Ingresá el monto del retiro."); return; }
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
      const { error } = await supabase.from("retiros_materiales").insert({
        cuenta_id: cuentaId,
        fecha: f.fecha || hoyISO(),
        descripcion: (f.descripcion || "").trim() || null,
        remito_nro: (f.remito_nro || "").trim() || null,
        etapa: f.etapa || null,
        tipo_cambio: tcRet,
        monto, remito_url, remito_path,
        recupero: recupero && items.length > 0,
        recupero_items: recupero && items.length > 0 ? items : null,
        recupero_total: recupero && items.length > 0 ? recuperoTotal : null,
        // columnas planas V27 en null: ya se usa recupero_items
        recupero_unidad: null, recupero_cantidad: null, recupero_precio: null,
      });
      if (error) { alert(error.message); setSubiendo(null); return; }
      setNuevoRetiro(prev => ({ ...prev, [cuentaId]: { fecha: hoyISO(), descripcion: "", monto: "", remito_nro: "", etapa: "", tc: "", file: null, recupero: false, recupero_items: [emptyRecItem()] } }));
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
                  {/* Input arriba */}
                  <Grid container spacing={1.5} alignItems="center">
                    <Grid item xs={6} sm={3}>
                      <TextField type="date" label="Fecha" InputLabelProps={{ shrink: true }} fullWidth size="small"
                        value={na.fecha ?? hoyISO()} onChange={(e) => setAnt(c.id, { fecha: e.target.value })} />
                    </Grid>
                    <Grid item xs={6} sm={esARS(c) ? 3 : 5}>
                      <TextField label={`Nuevo anticipo (${c.moneda})`} fullWidth size="small"
                        inputProps={{ inputMode: "decimal" }}
                        value={fmtMiles(na.monto ?? "")}
                        onChange={(e) => setAnt(c.id, { monto: parseMiles(e.target.value) })} />
                    </Grid>
                    {esARS(c) && (
                      <Grid item xs={6} sm={2}>
                        <TextField label="TC (ARS/USD)" fullWidth size="small"
                          inputProps={{ inputMode: "decimal" }}
                          value={fmtMiles(na.tc ?? "")}
                          helperText={(() => {
                            const m = Number(parseMiles(na.monto ?? "")) || 0;
                            const t = Number(parseMiles(na.tc ?? "")) || 0;
                            return m > 0 && t > 0 ? `= ${fmtMoney(m / t, "USD")}` : "Dólar del acopio";
                          })()}
                          onChange={(e) => setAnt(c.id, { tc: parseMiles(e.target.value) })} />
                      </Grid>
                    )}
                    <Grid item xs={esARS(c) ? 6 : 12} sm={esARS(c) ? 4 : 4}>
                      <Button variant="outlined" color="secondary" fullWidth size="small" startIcon={<AddIcon />}
                        onClick={() => addAnticipo(c.id)}>
                        Sumar anticipo
                      </Button>
                    </Grid>
                  </Grid>
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
                            <Tooltip title="Eliminar anticipo"><span>
                              <IconButton size="small" disabled={ant.length === 1} onClick={() => delAnticipo(a)}>
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </span></Tooltip>
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

                  {/* Input arriba: nuevo retiro */}
                  <Box sx={{ p: 1.5, borderRadius: 2, border: "1px dashed", borderColor: "divider", bgcolor: "rgba(255,255,255,0.6)" }}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5, display: "block", mb: 1 }}>Nuevo retiro</Typography>
                  <Grid container spacing={1.5} alignItems="center">
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
                      <Button component="label" variant="outlined" startIcon={<AttachFileIcon />} fullWidth size="small" sx={{ overflow: "hidden" }}>
                        {nr.file ? nr.file.name : "Foto remito"}
                        <input hidden type="file" accept="image/*,application/pdf"
                          onChange={(e) => setRet(c.id, { file: e.target.files?.[0] ?? null })} />
                      </Button>
                    </Grid>
                    <Grid item xs={4} sm={1.5}>
                      <Button variant="contained" color="secondary" fullWidth size="small"
                        disabled={subiendo === c.id} onClick={() => addRetiro(c.id)}>
                        {subiendo === c.id ? "…" : "Agregar"}
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
                  </Box>

                  {/* Detalle de retiros abajo (por fecha) */}
                  <Box sx={{ overflowX: "auto", mt: 1.5 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ width: 110 }}>Fecha</TableCell>
                          <TableCell sx={{ width: 100 }}>Remito Nº</TableCell>
                          <TableCell sx={{ width: 130 }}>Etapa</TableCell>
                          <TableCell>Detalle</TableCell>
                          <TableCell align="right">Monto</TableCell>
                          <TableCell align="right">Neto USD</TableCell>
                          <TableCell align="center" sx={{ width: 80 }}>Remito</TableCell>
                          <TableCell align="right" sx={{ width: 56 }}></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rs.length === 0 && (
                          <TableRow><TableCell colSpan={8}>
                            <Typography variant="body2" color="text.secondary">Todavía no hay retiros en esta cuenta.</Typography>
                          </TableCell></TableRow>
                        )}
                        {rs.map((r) => {
                          const neto = netoRetiro(r);
                          const netoUSD = usdDe(c, neto, r.tipo_cambio);
                          return (
                          <TableRow key={r.id} hover>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtDate(r.fecha)}</TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>{r.remito_nro || "—"}</TableCell>
                            <TableCell>
                              {r.etapa
                                ? <Chip size="small" variant="outlined" color="primary" label={r.etapa} />
                                : <Typography variant="body2" color="text.disabled">—</Typography>}
                            </TableCell>
                            <TableCell>
                              {r.descripcion || "—"}
                              {r.recupero && itemsRecupero(r).map((it, i) => (
                                <Typography key={i} variant="caption" color="warning.main" sx={{ display: "block" }}>
                                  Recupero · {fmtNum0(it.cantidad)} {it.unidad === "bolson" ? "bolsón/es" : "pallet/s"} · {fmtMoney(it.total, c.moneda)}
                                </Typography>
                              ))}
                            </TableCell>
                            <TableCell align="right" sx={{ whiteSpace: "nowrap", color: "error.main", fontWeight: 600 }}>
                              −{fmtMoney(r.monto, c.moneda)}
                            </TableCell>
                            <TableCell align="right" sx={{ whiteSpace: "nowrap", fontWeight: 600, color: "#0F2A4A" }}>
                              {fmtMoney(netoUSD, "USD")}
                            </TableCell>
                            <TableCell align="center">
                              {r.remito_url
                                ? <Tooltip title="Ver remito"><IconButton size="small" component={Link} href={r.remito_url} target="_blank"><ReceiptLongIcon fontSize="small" /></IconButton></Tooltip>
                                : <Typography variant="body2" color="text.disabled">—</Typography>}
                            </TableCell>
                            <TableCell align="right">
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
                  {/* Input arriba: nueva devolución */}
                  <Box sx={{ p: 1.5, borderRadius: 2, border: "1px dashed", borderColor: "divider", bgcolor: "rgba(255,255,255,0.6)" }}>
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
                              <Button variant="contained" size="small" sx={{ bgcolor: "#8E44AD", "&:hover": { bgcolor: "#763a92" } }}
                                disabled={subiendoDev === c.id} onClick={() => addDevolucion(c.id)}>
                                {subiendoDev === c.id ? "…" : "Registrar devolución"}
                              </Button>
                            </Stack>
                          </Stack>
                        </Stack>
                      );
                    })()}
                  </Box>

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
              <Grid item xs={12} sm={formCuenta.moneda === "ARS" ? 4 : 6}>
                <TextField label={`Anticipo inicial (${formCuenta.moneda})`} fullWidth
                  inputProps={{ inputMode: "decimal" }}
                  value={fmtMiles(formCuenta.monto_inicial)}
                  helperText="Primer acopio; después podés sumar más anticipos"
                  onChange={(e) => setFormCuenta({ ...formCuenta, monto_inicial: parseMiles(e.target.value) })} />
              </Grid>
            )}
            {!editCuentaId && formCuenta.moneda === "ARS" && (
              <Grid item xs={12} sm={2}>
                <TextField label="TC (ARS/USD)" fullWidth
                  inputProps={{ inputMode: "decimal" }}
                  value={fmtMiles(formCuenta.tipo_cambio)}
                  helperText={(() => {
                    const m = Number(parseMiles(formCuenta.monto_inicial)) || 0;
                    const t = Number(parseMiles(formCuenta.tipo_cambio)) || 0;
                    return m > 0 && t > 0 ? `= ${fmtMoney(m / t, "USD")}` : "Dólar del acopio";
                  })()}
                  onChange={(e) => setFormCuenta({ ...formCuenta, tipo_cambio: parseMiles(e.target.value) })} />
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
