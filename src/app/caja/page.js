"use client";
import {
  Card, CardContent, Stack, Typography, Button, Grid, Tabs, Tab, Alert,
  Table, TableBody, TableCell, TableHead, TableRow, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Box,
  Chip, Tooltip, Divider, LinearProgress, ToggleButton, ToggleButtonGroup,
  FormControlLabel, Switch, Link, Autocomplete, useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtMoney, fmtNum, fmtDate, fmtPct } from "@/components/Money";
import { printDocument, esc } from "@/lib/printPdf";

const BUCKET = "comprobantes";

// Gasto REAL imputable en USD (misma convención que Seguimiento económico):
// gasto en USD por su monto; gasto en ARS convertido por el tipo de cambio
// (el del cambio integrado, o el tipo_cambio_gasto cargado al pagar en pesos).
// Un cambio puro de divisa (sin gasto) no cuenta.
function gastoRealUSD(mv) {
  if (mv.tipo !== "egreso") return 0;
  const m = Number(mv.monto || 0);
  if (m <= 0) return 0;
  if (mv.moneda === "USD") return m;
  const tc = Number(mv.cambio_tipo_cambio || mv.tipo_cambio_gasto || 0);
  return tc > 0 ? m / tc : 0;
}

const ETAPAS_DEFAULT = [
  "Inicio", "Cimentación", "Estructura",
  "Obra cerrada", "Instalaciones + revoques", "Terminada",
];

const emptyMov = {
  tipo: "egreso",
  fecha: new Date().toISOString().slice(0, 10),
  // Para ingreso/egreso: moneda + monto del movimiento real
  moneda: "ARS",
  monto: "",
  categoria: "",
  concepto: "",
  etapa: "",
  descripcion: "",
  // TC para valuar en USD un gasto en pesos (sin cambio integrado),
  // al imputarlo a un concepto / etapa.
  tipo_cambio_gasto: "",
  // Cambio integrado dentro de egreso:
  con_cambio: false,
  cambio_moneda_origen: "USD",
  cambio_monto_origen: "",
  cambio_tipo_cambio: "",
  // Cambio puro entre cajas (tipo === "cambio")
  // reutiliza moneda (origen), monto (origen), moneda_destino, tipo_cambio
  moneda_destino: "ARS",
};

export default function CajaPage() {
  const { proyecto } = useProjects();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [tab, setTab] = useState(0);
  const [filtroMoneda, setFiltroMoneda] = useState("all");
  // Presupuestos para imputación
  const [contratistas, setContratistas] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [itemsByPres, setItemsByPres] = useState({});
  // Imputación dentro del form de egreso
  const [imputarA, setImputarA] = useState(false);
  const [impContratistaId, setImpContratistaId] = useState("");
  const [impPresupuestoId, setImpPresupuestoId] = useState("");
  const [impMontos, setImpMontos] = useState({}); // { item_id: monto }
  const [aportes, setAportes] = useState([]);
  const [inversores, setInversores] = useState([]);
  const [movs, setMovs] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [hitos, setHitos] = useState([]);
  const [conceptos, setConceptos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dialog principal (crear / editar mov)
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyMov);
  const [editId, setEditId] = useState(null);
  const [keepCompPath, setKeepCompPath] = useState(null);
  const [file, setFile] = useState(null);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  // Dialog de detalle (ver al click en fila)
  const [detail, setDetail] = useState(null);

  const reload = async () => {
    if (!proyecto) return;
    setLoading(true);
    const [r1, r2, r3, r4, r5, r6, r7, r8, r9] = await Promise.all([
      supabase.from("aportes").select("*").eq("proyecto_id", proyecto.id).order("fecha", { ascending: false }),
      supabase.from("inversores").select("id,nombre").eq("proyecto_id", proyecto.id),
      supabase.from("movimientos_caja").select("*").eq("proyecto_id", proyecto.id).order("fecha", { ascending: false }),
      supabase.from("categorias_egreso").select("nombre").order("nombre"),
      supabase.from("contratistas").select("id,nombre,rubro").eq("proyecto_id", proyecto.id).order("nombre"),
      supabase.from("presupuestos").select("id,nombre,contratista_id,moneda,estado").eq("proyecto_id", proyecto.id).order("fecha", { ascending: false }),
      supabase.from("presupuesto_items").select("id,presupuesto_id,nombre,monto_presupuestado,avance_pct").order("orden"),
      supabase.from("hitos").select("nombre,orden").eq("proyecto_id", proyecto.id).order("orden"),
      supabase.from("conceptos").select("nombre,usa_etapas,orden").eq("proyecto_id", proyecto.id).order("orden"),
    ]);
    setAportes(r1.data ?? []);
    setInversores(r2.data ?? []);
    setMovs(r3.data ?? []);
    setCategorias((r4.data ?? []).map(c => c.nombre));
    setContratistas(r5.data ?? []);
    setPresupuestos(r6.data ?? []);
    setHitos((r8.data ?? []).map(h => h.nombre));
    setConceptos(r9.data ?? []);
    // index items por presupuesto
    const idx = {};
    for (const it of (r7.data ?? [])) {
      if (!idx[it.presupuesto_id]) idx[it.presupuesto_id] = [];
      idx[it.presupuesto_id].push(it);
    }
    setItemsByPres(idx);
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  // ----- Saldos -----
  const saldos = useMemo(() => {
    let usd = 0, ars = 0;
    let ingUSD = 0, ingARS = 0, egrUSD = 0, egrARS = 0;
    for (const a of aportes) {
      if (a.entra_a_caja === false) continue;
      const m = Number(a.monto || 0);
      if (a.moneda === "USD") { usd += m; ingUSD += m; }
      else { ars += m; ingARS += m; }
    }
    for (const mv of movs) {
      const m = Number(mv.monto || 0);
      if (mv.tipo === "ingreso") {
        if (mv.moneda === "USD") { usd += m; ingUSD += m; } else { ars += m; ingARS += m; }
      } else if (mv.tipo === "egreso") {
        if (mv.con_cambio) {
          const origen = mv.cambio_moneda_origen;
          const tc = Number(mv.cambio_tipo_cambio || 0);
          const monOrigen = Number(mv.cambio_monto_origen || 0);
          if (origen === "USD") { usd -= monOrigen; egrUSD += monOrigen; }
          else { ars -= monOrigen; egrARS += monOrigen; }
          const entrada = origen === "USD" ? monOrigen * tc : (tc > 0 ? monOrigen / tc : 0);
          if (mv.moneda === "USD") { usd += entrada; ingUSD += entrada; }
          else { ars += entrada; ingARS += entrada; }
          if (m > 0) {
            if (mv.moneda === "USD") { usd -= m; egrUSD += m; }
            else { ars -= m; egrARS += m; }
          }
        } else {
          if (mv.moneda === "USD") { usd -= m; egrUSD += m; }
          else { ars -= m; egrARS += m; }
        }
      } else if (mv.tipo === "cambio") {
        const md = Number(mv.monto_destino || 0);
        if (mv.moneda === "USD") { usd -= m; egrUSD += m; } else { ars -= m; egrARS += m; }
        if (mv.moneda_destino === "USD") { usd += md; ingUSD += md; } else { ars += md; ingARS += md; }
      }
    }
    return { usd, ars, ingUSD, ingARS, egrUSD, egrARS };
  }, [aportes, movs]);

  // Gasto REAL en USD (lo efectivamente gastado, valuado en USD).
  const gastoRealTotalUSD = useMemo(
    () => movs.reduce((s, mv) => s + gastoRealUSD(mv), 0),
    [movs]
  );

  // ----- Egresos por categoría -----
  const porCategoria = useMemo(() => {
    const map = {};
    for (const mv of movs) {
      if (mv.tipo !== "egreso") continue;
      const k = mv.categoria || "Sin categoría";
      if (!map[k]) map[k] = { ARS: 0, USD: 0 };
      map[k][mv.moneda] += Number(mv.monto || 0);
    }
    return Object.entries(map).map(([cat, v]) => ({ cat, ...v }))
      .sort((a, b) => (b.ARS + b.USD) - (a.ARS + a.USD));
  }, [movs]);

  // ----- Egresos por etapa -----
  const porEtapa = useMemo(() => {
    const orden = (hitos.length > 0 ? hitos : ETAPAS_DEFAULT);
    const ordenIdx = Object.fromEntries(orden.map((n, i) => [n, i]));
    const map = {};
    for (const mv of movs) {
      if (mv.tipo !== "egreso") continue;
      const k = mv.etapa || "Sin etapa";
      if (!map[k]) map[k] = { ARS: 0, USD: 0, n: 0 };
      map[k][mv.moneda] += Number(mv.monto || 0);
      map[k].n += 1;
    }
    return Object.entries(map).map(([etapa, v]) => ({ etapa, ...v }))
      .sort((a, b) => {
        if (a.etapa === "Sin etapa") return 1;
        if (b.etapa === "Sin etapa") return -1;
        return (ordenIdx[a.etapa] ?? 999) - (ordenIdx[b.etapa] ?? 999);
      });
  }, [movs, hitos]);

  // ----- Listado unificado -----
  const invName = (id) => inversores.find(i => i.id === id)?.nombre ?? "—";
  const unified = useMemo(() => {
    const fromAportes = aportes
      .filter(a => a.entra_a_caja !== false)
      .map(a => ({
        id: "ap_" + a.id, kind: "aporte", fecha: a.fecha, tipo: "ingreso",
        moneda: a.moneda, monto: Number(a.monto || 0),
        detalle: `Aporte · ${invName(a.inversor_id)}`,
        observacion: a.observacion ?? null,
        categoria: null, concepto: null, comprobante_url: null, raw: a,
      }));
    const fromMovs = movs.map(mv => ({
      id: "mv_" + mv.id, kind: "mov", fecha: mv.fecha, tipo: mv.tipo,
      moneda: mv.moneda, monto: Number(mv.monto || 0),
      detalle: mv.tipo === "cambio"
        ? `Cambio ${mv.moneda} → ${mv.moneda_destino} @ ${fmtNum(mv.tipo_cambio, 2)}`
        : (mv.descripcion || (mv.tipo === "ingreso" ? "Ingreso" : "Egreso")),
      observacion: mv.descripcion ?? null,
      categoria: mv.categoria, concepto: mv.concepto, etapa: mv.etapa, comprobante_url: mv.comprobante_url, raw: mv,
      moneda_destino: mv.moneda_destino, monto_destino: mv.monto_destino,
      con_cambio: mv.con_cambio,
      cambio_moneda_origen: mv.cambio_moneda_origen,
      cambio_monto_origen: mv.cambio_monto_origen,
      cambio_tipo_cambio: mv.cambio_tipo_cambio,
      tipo_cambio_gasto: mv.tipo_cambio_gasto,
    }));
    return [...fromAportes, ...fromMovs].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }, [aportes, movs, inversores]);

  // Lista visible según filtro + delta y saldo running por fila
  const visible = useMemo(() => {
    const caja = filtroMoneda;
    const deltaPara = (row, c) => {
      const monto = Number(row.monto || 0);
      if (row.kind === "aporte") return row.moneda === c ? +monto : 0;
      const mv = row.raw ?? {};
      if (mv.tipo === "ingreso") return mv.moneda === c ? +monto : 0;
      if (mv.tipo === "egreso") {
        if (mv.con_cambio) {
          let d = 0;
          if (mv.cambio_moneda_origen === c) d -= Number(mv.cambio_monto_origen || 0);
          if (mv.moneda === c) {
            const tc = Number(mv.cambio_tipo_cambio || 0);
            const monOrigen = Number(mv.cambio_monto_origen || 0);
            const entrada = mv.cambio_moneda_origen === "USD" ? monOrigen * tc : (tc > 0 ? monOrigen / tc : 0);
            d += entrada;
            if (Number(mv.monto || 0) > 0) d -= Number(mv.monto || 0);
          }
          return d;
        }
        return mv.moneda === c ? -monto : 0;
      }
      if (mv.tipo === "cambio") {
        let d = 0;
        if (mv.moneda === c) d -= monto;
        if (mv.moneda_destino === c) d += Number(mv.monto_destino || 0);
        return d;
      }
      return 0;
    };

    const filtered = unified.filter(row => {
      if (caja === "all") return true;
      return deltaPara(row, caja) !== 0;
    });
    if (caja === "all") {
      return filtered.map(r => ({ ...r, _delta: null, _saldo: null }));
    }
    const asc = [...filtered].sort((a, b) => a.fecha > b.fecha ? 1 : -1);
    let saldo = 0;
    const acc = {};
    for (const r of asc) {
      const d = deltaPara(r, caja);
      saldo += d;
      acc[r.id] = { delta: d, saldo };
    }
    return filtered.map(r => ({ ...r, _delta: acc[r.id]?.delta ?? 0, _saldo: acc[r.id]?.saldo ?? 0 }));
  }, [unified, filtroMoneda]);

  const tipoLabel = { ingreso: "Ingreso", egreso: "Egreso", cambio: "Cambio" };
  const exportarPdf = () => {
    const filas = visible.map((m) => `<tr>
        <td>${fmtDate(m.fecha)}</td>
        <td>${tipoLabel[m.tipo] || esc(m.tipo)}</td>
        <td>${esc(m.detalle)}</td>
        <td>${esc(m.concepto) || "—"}</td>
        <td>${esc(m.categoria) || "—"}</td>
        <td>${esc(m.etapa) || "—"}</td>
        <td style="text-align:right">${esc(fmtMoney(m.monto, m.moneda))}</td>
      </tr>`).join("");
    const resumen = `
      <h2>Resumen</h2>
      <table><tbody>
        <tr><td>Saldo caja USD</td><td style="text-align:right">${esc(fmtMoney(saldos.usd, "USD"))}</td></tr>
        <tr><td>Saldo caja ARS</td><td style="text-align:right">${esc(fmtMoney(saldos.ars, "ARS"))}</td></tr>
        <tr><td>Ingresos USD</td><td style="text-align:right">${esc(fmtMoney(saldos.ingUSD, "USD"))}</td></tr>
        <tr><td>Gastado USD (real)</td><td style="text-align:right">${esc(fmtMoney(gastoRealTotalUSD, "USD"))}</td></tr>
      </tbody></table>`;
    const tabla = `
      <h2>Movimientos</h2>
      <table><thead><tr>
        <th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Concepto</th><th>Categoría</th><th>Etapa</th><th>Monto</th>
      </tr></thead><tbody>${filas}</tbody></table>`;
    printDocument({
      title: "Caja",
      subtitle: `${esc(proyecto.nombre)} · ${fmtDate(new Date().toISOString())}`,
      bodyHtml: resumen + tabla,
    });
  };

  if (!proyecto) return <Alert severity="info">Seleccioná o creá un proyecto para gestionar la caja.</Alert>;

  // ----- Cálculos del dialog -----
  const monto = Number(form.monto || 0);
  const tc = Number(form.cambio_tipo_cambio || 0);
  const monOrigen = Number(form.cambio_monto_origen || 0);
  const entradaPorCambio = form.cambio_moneda_origen === "USD"
    ? monOrigen * tc
    : (tc > 0 ? monOrigen / tc : 0);

  // Para tipo "cambio" puro
  const tcPuro = Number(form.cambio_tipo_cambio || 0);
  const montoDestinoCambioPuro = (() => {
    if (form.tipo !== "cambio") return 0;
    const m = Number(form.monto || 0);
    if (!m || !tcPuro) return 0;
    return form.moneda === "USD" ? m * tcPuro : m / tcPuro;
  })();

  const openNew = (tipo) => {
    setForm({
      ...emptyMov, tipo,
      moneda: tipo === "cambio" ? "USD" : "ARS",
      moneda_destino: tipo === "cambio" ? "ARS" : "ARS",
    });
    setEditId(null); setKeepCompPath(null); setFile(null); setErr(null);
    setImputarA(false); setImpContratistaId(""); setImpPresupuestoId(""); setImpMontos({});
    setOpen(true);
  };

  const openEdit = (mv) => {
    // mv viene del row "raw"
    setForm({
      tipo: mv.tipo,
      fecha: mv.fecha,
      moneda: mv.moneda ?? "ARS",
      monto: mv.monto ?? "",
      categoria: mv.categoria ?? "",
      concepto: mv.concepto ?? "",
      etapa: mv.etapa ?? "",
      descripcion: mv.descripcion ?? "",
      tipo_cambio_gasto: mv.tipo_cambio_gasto ?? "",
      con_cambio: !!mv.con_cambio,
      cambio_moneda_origen: mv.cambio_moneda_origen ?? "USD",
      cambio_monto_origen: mv.cambio_monto_origen ?? "",
      cambio_tipo_cambio: (mv.tipo === "cambio" ? mv.tipo_cambio : mv.cambio_tipo_cambio) ?? "",
      moneda_destino: mv.moneda_destino ?? "ARS",
    });
    setEditId(mv.id);
    setKeepCompPath(mv.comprobante_url ?? null);
    setFile(null); setErr(null);
    setDetail(null);
    // Cargo las imputaciones existentes del movimiento
    setImputarA(false); setImpContratistaId(""); setImpPresupuestoId(""); setImpMontos({});
    if (mv.tipo === "egreso") {
      supabase.from("imputaciones_pago")
        .select("item_id, monto, presupuesto_items(presupuesto_id, presupuestos(contratista_id))")
        .eq("movimiento_id", mv.id)
        .then(({ data }) => {
          if (!data || data.length === 0) return;
          const first = data[0];
          const presId = first.presupuesto_items?.presupuesto_id;
          const contId = first.presupuesto_items?.presupuestos?.contratista_id;
          if (presId && contId) {
            const montos = {};
            for (const r of data) montos[r.item_id] = String(r.monto || 0);
            setImputarA(true);
            setImpContratistaId(contId);
            setImpPresupuestoId(presId);
            setImpMontos(montos);
          }
        });
    }
    setOpen(true);
  };

  const publicUrl = (path) => {
    if (!path) return null;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl ?? null;
  };

  // Asegura que la categoría exista en el catálogo (si es nueva la inserta).
  const ensureCategoria = async (nombre) => {
    const n = (nombre ?? "").trim();
    if (!n) return null;
    if (categorias.some(c => c.toLowerCase() === n.toLowerCase())) return n;
    const { error } = await supabase.from("categorias_egreso").insert({ nombre: n });
    if (error && !String(error.message).toLowerCase().includes("duplicate")) {
      throw error;
    }
    return n;
  };

  const save = async () => {
    setErr(null);
    if (form.tipo === "cambio") {
      if (form.moneda === form.moneda_destino) { setErr("La caja origen y destino deben ser distintas."); return; }
      if (!monto || monto <= 0) { setErr("Ingresá un monto válido."); return; }
      if (!tcPuro || tcPuro <= 0) { setErr("Ingresá el tipo de cambio."); return; }
    } else {
      const esCambioPuro = form.tipo === "egreso" && form.con_cambio;
      if (!esCambioPuro && (!form.monto || monto <= 0)) { setErr("Ingresá un monto válido."); return; }
      if (form.tipo === "egreso" && form.con_cambio) {
        if (form.cambio_moneda_origen === form.moneda) { setErr("La caja origen del cambio debe ser distinta de la caja del gasto."); return; }
        if (!monOrigen || monOrigen <= 0) { setErr("Ingresá el monto a convertir."); return; }
        if (!tc || tc <= 0) { setErr("Ingresá el tipo de cambio."); return; }
      }
    }
    setSaving(true);

    // Categoría (solo egresos): asegurar que exista en catálogo si es nueva
    let categoriaFinal = null;
    if (form.tipo === "egreso") {
      try {
        categoriaFinal = form.categoria ? await ensureCategoria(form.categoria) : null;
      } catch (e) {
        setSaving(false);
        setErr("Error guardando categoría: " + e.message);
        return;
      }
    }

    // Comprobante
    let comprobante_url = keepCompPath;
    if (file) {
      const safe = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${proyecto.id}/${Date.now()}_${safe}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (up.error) { setSaving(false); setErr("Error subiendo comprobante: " + up.error.message); return; }
      comprobante_url = path;
    }

    const conceptoUsaEtapas = !!conceptos.find(c => c.nombre === form.concepto)?.usa_etapas;

    let payload;
    if (form.tipo === "cambio") {
      payload = {
        proyecto_id: proyecto.id,
        fecha: form.fecha,
        tipo: "cambio",
        moneda: form.moneda,
        monto: monto,
        categoria: null,
        etapa: null,
        descripcion: form.descripcion || null,
        comprobante_url,
        moneda_destino: form.moneda_destino,
        tipo_cambio: tcPuro,
        monto_destino: montoDestinoCambioPuro,
        con_cambio: false,
        cambio_moneda_origen: null,
        cambio_monto_origen: null,
        cambio_tipo_cambio: null,
      };
    } else {
      payload = {
        proyecto_id: proyecto.id,
        fecha: form.fecha,
        tipo: form.tipo,
        moneda: form.moneda,
        monto: monto,
        categoria: form.tipo === "egreso" ? (categoriaFinal || null) : null,
        concepto: form.tipo === "egreso" ? (form.concepto || null) : null,
        etapa: form.tipo === "egreso" && conceptoUsaEtapas ? (form.etapa || null) : null,
        descripcion: form.descripcion || null,
        comprobante_url,
        moneda_destino: null,
        tipo_cambio: null,
        monto_destino: null,
        con_cambio: form.tipo === "egreso" ? form.con_cambio : false,
        cambio_moneda_origen: form.tipo === "egreso" && form.con_cambio ? form.cambio_moneda_origen : null,
        cambio_monto_origen:  form.tipo === "egreso" && form.con_cambio ? monOrigen : null,
        cambio_tipo_cambio:   form.tipo === "egreso" && form.con_cambio ? tc : null,
        tipo_cambio_gasto: form.tipo === "egreso" && !form.con_cambio && form.moneda === "ARS"
          ? (Number(form.tipo_cambio_gasto) > 0 ? Number(form.tipo_cambio_gasto) : null)
          : null,
      };
    }

    let res;
    let movId = editId;
    if (editId) {
      res = await supabase.from("movimientos_caja").update(payload).eq("id", editId);
    } else {
      res = await supabase.from("movimientos_caja").insert(payload).select("id").single();
      if (res.data?.id) movId = res.data.id;
    }
    if (res.error) { setSaving(false); setErr(res.error.message); return; }

    // Sincronizo imputaciones (sólo para egresos)
    if (form.tipo === "egreso" && movId) {
      // borro las viejas
      await supabase.from("imputaciones_pago").delete().eq("movimiento_id", movId);
      if (imputarA && impPresupuestoId) {
        const rows = Object.entries(impMontos)
          .map(([item_id, monto]) => ({ item_id, monto: Number(monto || 0) }))
          .filter(r => r.monto > 0)
          .map(r => ({ ...r, movimiento_id: movId }));
        if (rows.length > 0) {
          const ins = await supabase.from("imputaciones_pago").insert(rows);
          if (ins.error) { setSaving(false); setErr("Error guardando imputaciones: " + ins.error.message); return; }
        }
      }
    }

    setSaving(false);
    setOpen(false); reload();
  };

  const delMov = async (mv) => {
    if (!confirm("¿Eliminar este movimiento de caja?")) return;
    if (mv.comprobante_url) {
      await supabase.storage.from(BUCKET).remove([mv.comprobante_url]);
    }
    const realId = mv.id.replace("mv_", "");
    const { error } = await supabase.from("movimientos_caja").delete().eq("id", realId);
    if (error) alert(error.message); else { setDetail(null); reload(); }
  };

  const tipoChip = (m) => {
    if (m.tipo === "ingreso") return <Chip size="small" color="success" variant="outlined" icon={<ArrowUpwardIcon />} label="Ingreso" />;
    if (m.tipo === "egreso") {
      return (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Chip size="small" color="error" variant="outlined" icon={<ArrowDownwardIcon />} label="Egreso" />
          {m.con_cambio && (
            <Tooltip title="Pago con cambio de moneda">
              <Box sx={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 22, height: 22, borderRadius: "50%",
                bgcolor: "rgba(15,42,74,0.08)", color: "primary.main",
              }}>
                <SwapHorizIcon sx={{ fontSize: 14 }} />
              </Box>
            </Tooltip>
          )}
        </Stack>
      );
    }
    return <Chip size="small" color="primary" variant="outlined" icon={<SwapHorizIcon />} label="Cambio" />;
  };

  return (
    <Stack spacing={3}>
      {/* Header */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        spacing={1.5}
      >
        <Box>
          <Typography variant="h5">Caja</Typography>
          <Typography variant="body2">Saldos, ingresos, egresos y cambios del proyecto.</Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" }, "& > button": { flex: { xs: 1, sm: "initial" } } }}>
          <Button startIcon={<PictureAsPdfIcon />} variant="outlined" onClick={exportarPdf}>PDF</Button>
          <Button startIcon={<ArrowUpwardIcon />} variant="outlined" color="success" onClick={() => openNew("ingreso")}>Ingreso</Button>
          <Button startIcon={<SwapHorizIcon />} variant="outlined" color="primary" onClick={() => openNew("cambio")}>Cambio</Button>
          <Button startIcon={<ArrowDownwardIcon />} variant="contained" color="secondary" onClick={() => openNew("egreso")}>Egreso</Button>
        </Stack>
      </Stack>

      {loading && <LinearProgress />}

      {/* Saldos */}
      <Grid container spacing={2} justifyContent="center">
        <Grid item xs={12} sm={6}>
          <SaldoCard label="Saldo caja USD" saldo={saldos.usd} currency="USD"
            ingresos={saldos.ingUSD} egresos={saldos.egrUSD} accent="#1E8E3E" />
        </Grid>
        <Grid item xs={12} sm={6}>
          <SaldoCard label="Saldo caja ARS" saldo={saldos.ars} currency="ARS"
            ingresos={saldos.ingARS} egresos={saldos.egrARS} accent="#0F2A4A" />
        </Grid>
      </Grid>

      {/* Resumen en USD vs costo total estimado */}
      {(() => {
        const costo = Number(proyecto?.costo_total_estimado || 0);
        const ingresos = saldos.ingUSD;
        const gastado = gastoRealTotalUSD;
        const pctGastado = costo > 0 ? Math.min(100, (gastado / costo) * 100) : 0;
        const pctIngreso = costo > 0 ? Math.min(100, (ingresos / costo) * 100) : 0;
        return (
          <Card>
            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "stretch" }} justifyContent="space-between">
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11 }}>
                    Resumen en USD
                  </Typography>
                  <Stack direction="row" spacing={3} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Total ingresos USD</Typography>
                      <Typography variant="h6" sx={{ fontVariantNumeric: "tabular-nums", color: "success.main" }}>
                        {fmtMoney(ingresos, "USD")}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Total gastado USD</Typography>
                      <Typography variant="h6" sx={{ fontVariantNumeric: "tabular-nums", color: "error.main" }}>
                        {fmtMoney(gastado, "USD")}
                      </Typography>
                    </Box>
                    {costo > 0 && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Costo total estim.</Typography>
                        <Typography variant="h6" sx={{ fontVariantNumeric: "tabular-nums" }}>
                          {fmtMoney(costo, "USD")}
                        </Typography>
                      </Box>
                    )}
                  </Stack>
                </Box>
              </Stack>

              {costo > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
                    <Typography variant="body2" fontWeight={600}>
                      Llevamos gastado <Box component="span" sx={{ color: "error.main" }}>{fmtPct(pctGastado, 1)}</Box> del presupuesto · equivale a {fmtMoney(gastado, "USD")}
                    </Typography>
                  </Stack>
                  <Box sx={{ position: "relative", height: 12, bgcolor: "rgba(15,42,74,0.06)", borderRadius: 6, overflow: "hidden" }}>
                    <Box sx={{
                      position: "absolute", top: 0, left: 0, height: "100%",
                      width: `${pctIngreso}%`, bgcolor: "rgba(30,142,62,0.35)", transition: "width .4s",
                    }} />
                    <Box sx={{
                      position: "absolute", top: 0, left: 0, height: "100%",
                      width: `${pctGastado}%`,
                      backgroundImage: "linear-gradient(90deg, #C0392B 0%, #E07A1F 100%)",
                      transition: "width .4s",
                    }} />
                  </Box>
                  <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.75 }}>
                    <Typography variant="caption" color="text.secondary">
                      Ingresado USD · {fmtPct(pctIngreso, 1)} ({fmtMoney(ingresos, "USD")})
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Gastado USD · {fmtPct(pctGastado, 1)} ({fmtMoney(gastado, "USD")})
                    </Typography>
                  </Stack>
                </Box>
              )}
            </CardContent>
          </Card>
        );
      })()}

      <Box>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
          <Tab label="Movimientos" />
          <Tab label="Egresos por categoría" />
          <Tab label="Egresos por etapa" />
        </Tabs>
        <Divider />
      </Box>

      {tab === 0 && (
        <Card>
          <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              justifyContent="space-between" alignItems={{ xs: "stretch", sm: "center" }}
              sx={{ mb: 1.5 }} spacing={1}
            >
              <Typography variant="caption" color="text.secondary">
                {visible.length} movimiento{visible.length === 1 ? "" : "s"}
              </Typography>
              <ToggleButtonGroup
                exclusive size="small" value={filtroMoneda}
                onChange={(_, v) => v && setFiltroMoneda(v)}
                sx={{ width: { xs: "100%", sm: "auto" }, "& > button": { flex: { xs: 1, sm: "initial" } } }}
              >
                <ToggleButton value="all">Todas</ToggleButton>
                <ToggleButton value="USD">USD</ToggleButton>
                <ToggleButton value="ARS">ARS</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            {visible.length === 0 ? (
              <EmptyState text="No hay movimientos en esta vista." />
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small" sx={{ "& tbody tr": { height: 56 } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 110 }}>Fecha</TableCell>
                      <TableCell sx={{ width: 130 }}>Tipo</TableCell>
                      <TableCell>Detalle</TableCell>
                      <TableCell>Concepto</TableCell>
                      <TableCell>Categoría</TableCell>
                      <TableCell>Etapa</TableCell>
                      <TableCell align="right">Monto</TableCell>
                      {filtroMoneda !== "all" && <TableCell align="right">Saldo</TableCell>}
                      <TableCell sx={{ width: 70 }}>Comprob.</TableCell>
                      <TableCell align="right" sx={{ width: 90 }}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visible.map((m) => {
                      const ingresoColor   = "rgba(30,142,62,0.06)";
                      const egresoColor    = "rgba(192,57,43,0.04)";
                      const bg =
                        m._delta != null
                          ? (m._delta > 0 ? ingresoColor : m._delta < 0 ? egresoColor : undefined)
                          : (m.tipo === "ingreso" ? ingresoColor : m.tipo === "egreso" ? egresoColor : undefined);
                      return (
                      <TableRow
                        key={m.id} hover
                        sx={{ cursor: "pointer", bgcolor: bg, "& td": { verticalAlign: "middle" } }}
                        onClick={() => setDetail(m)}
                      >
                        <TableCell sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtDate(m.fecha)}</TableCell>
                        <TableCell>{tipoChip(m)}</TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500} color="text.primary" sx={{
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 340,
                          }}>
                            {m.detalle}
                          </Typography>
                          {(m.observacion || m.con_cambio || m.tipo === "cambio") && (
                            <Typography variant="caption" color="text.secondary" sx={{
                              display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 340,
                            }}>
                              {m.observacion
                                ? m.observacion
                                : m.con_cambio
                                  ? `Cambio: ${fmtMoney(m.cambio_monto_origen, m.cambio_moneda_origen)} · TC ${fmtNum(m.cambio_tipo_cambio, 2)}`
                                  : `→ ${fmtMoney(m.monto_destino, m.moneda_destino)} · TC ${fmtNum(m.raw?.tipo_cambio, 2)}`}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {m.concepto
                            ? <Chip size="small" label={m.concepto} variant="outlined" color="secondary" />
                            : <Typography variant="body2" color="text.disabled">—</Typography>}
                        </TableCell>
                        <TableCell>
                          {m.categoria
                            ? <Chip size="small" label={m.categoria} />
                            : <Typography variant="body2" color="text.disabled">—</Typography>}
                        </TableCell>
                        <TableCell>
                          {m.etapa
                            ? <Chip size="small" label={m.etapa} variant="outlined" color="primary" />
                            : <Typography variant="body2" color="text.disabled">—</Typography>}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                          {filtroMoneda === "all" ? (
                            <Typography
                              component="span"
                              color={m.tipo === "ingreso" ? "success.main" : m.tipo === "egreso" ? "error.main" : "text.primary"}
                              fontWeight={700}
                            >
                              {m.tipo === "egreso" ? "−" : m.tipo === "ingreso" ? "+" : ""}{fmtMoney(m.monto, m.moneda)}
                            </Typography>
                          ) : (
                            <Typography
                              component="span"
                              color={m._delta > 0 ? "success.main" : m._delta < 0 ? "error.main" : "text.primary"}
                              fontWeight={700}
                            >
                              {m._delta > 0 ? "+" : m._delta < 0 ? "−" : ""}{fmtMoney(Math.abs(m._delta || 0), filtroMoneda)}
                            </Typography>
                          )}
                        </TableCell>
                        {filtroMoneda !== "all" && (
                          <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                            <Typography component="span" fontWeight={600} sx={{ fontVariantNumeric: "tabular-nums" }}>
                              {fmtMoney(m._saldo || 0, filtroMoneda)}
                            </Typography>
                          </TableCell>
                        )}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {m.comprobante_url
                            ? <Tooltip title="Ver comprobante"><IconButton size="small" component={Link} href={publicUrl(m.comprobante_url)} target="_blank"><ReceiptLongIcon fontSize="small" /></IconButton></Tooltip>
                            : <Typography variant="body2" color="text.secondary">—</Typography>}
                        </TableCell>
                        <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                          {m.kind === "mov" ? (
                            <>
                              <Tooltip title="Editar"><IconButton size="small" onClick={() => openEdit(m.raw)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                              <Tooltip title="Eliminar"><IconButton size="small" onClick={() => delMov(m)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                            </>
                          ) : <span />}
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 1 && (
        <Card>
          <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
            {porCategoria.length === 0 ? (
              <EmptyState text="Aún no hay egresos registrados." />
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Categoría</TableCell>
                      <TableCell align="right">Total ARS</TableCell>
                      <TableCell align="right">Total USD</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {porCategoria.map((c) => (
                      <TableRow key={c.cat} hover>
                        <TableCell><Chip size="small" label={c.cat} /></TableCell>
                        <TableCell align="right">{c.ARS ? fmtMoney(c.ARS, "ARS") : "—"}</TableCell>
                        <TableCell align="right">{c.USD ? fmtMoney(c.USD, "USD") : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 2 && (
        <Card>
          <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
            {porEtapa.length === 0 ? (
              <EmptyState text="Aún no hay egresos asociados a una etapa." />
            ) : (() => {
              const totARS = porEtapa.reduce((s, e) => s + e.ARS, 0);
              const totUSD = porEtapa.reduce((s, e) => s + e.USD, 0);
              return (
                <Box sx={{ overflowX: "auto" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Etapa</TableCell>
                        <TableCell align="right"># egresos</TableCell>
                        <TableCell align="right">Total ARS</TableCell>
                        <TableCell align="right">Total USD</TableCell>
                        <TableCell align="right">% del total (ARS)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {porEtapa.map((e) => {
                        const pctARS = totARS > 0 ? (e.ARS / totARS) * 100 : 0;
                        return (
                          <TableRow key={e.etapa} hover>
                            <TableCell>
                              <Chip
                                size="small"
                                label={e.etapa}
                                color={e.etapa === "Sin etapa" ? "default" : "primary"}
                                variant={e.etapa === "Sin etapa" ? "outlined" : "filled"}
                              />
                            </TableCell>
                            <TableCell align="right">{e.n}</TableCell>
                            <TableCell align="right">{e.ARS ? fmtMoney(e.ARS, "ARS") : "—"}</TableCell>
                            <TableCell align="right">{e.USD ? fmtMoney(e.USD, "USD") : "—"}</TableCell>
                            <TableCell align="right">
                              {e.ARS > 0 ? (
                                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                                  <Box sx={{ width: 80, height: 6, bgcolor: "rgba(15,42,74,0.08)", borderRadius: 3, overflow: "hidden" }}>
                                    <Box sx={{ height: "100%", width: `${Math.min(100, pctARS)}%`, bgcolor: "secondary.main" }} />
                                  </Box>
                                  <Typography variant="caption" color="text.secondary">{pctARS.toFixed(1)}%</Typography>
                                </Box>
                              ) : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow sx={{ bgcolor: "rgba(15,42,74,0.04)" }}>
                        <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
                        <TableCell />
                        <TableCell align="right" sx={{ fontWeight: 700 }}>{totARS ? fmtMoney(totARS, "ARS") : "—"}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>{totUSD ? fmtMoney(totUSD, "USD") : "—"}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                </Box>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* DETAIL DIALOG */}
      <Dialog open={!!detail} onClose={() => setDetail(null)} fullWidth maxWidth="sm" fullScreen={fullScreen}>
        <DialogTitle>Detalle del movimiento</DialogTitle>
        <DialogContent dividers>
          {detail && (
            <Stack spacing={1.2}>
              <DetailRow label="Fecha" value={fmtDate(detail.fecha)} />
              <DetailRow label="Tipo" value={tipoChip(detail)} />
              <DetailRow label="Detalle" value={detail.detalle} />
              {detail.observacion && <DetailRow label="Observación" value={detail.observacion} />}
              {detail.categoria && <DetailRow label="Categoría" value={<Chip size="small" label={detail.categoria} />} />}
              {detail.etapa && <DetailRow label="Etapa" value={<Chip size="small" color="primary" variant="outlined" label={detail.etapa} />} />}
              <DetailRow
                label="Monto"
                value={
                  <Typography fontWeight={700} color={detail.tipo === "ingreso" ? "success.main" : detail.tipo === "egreso" ? "error.main" : "text.primary"}>
                    {detail.tipo === "egreso" ? "−" : detail.tipo === "ingreso" ? "+" : ""}{fmtMoney(detail.monto, detail.moneda)}
                  </Typography>
                }
              />
              {detail.tipo === "egreso" && !detail.con_cambio && detail.moneda === "ARS" && Number(detail.tipo_cambio_gasto) > 0 && (
                <DetailRow
                  label="Imputado (USD)"
                  value={`${fmtMoney(Number(detail.monto) / Number(detail.tipo_cambio_gasto), "USD")} · TC ${fmtNum(detail.tipo_cambio_gasto, 2)}`}
                />
              )}
              {detail.con_cambio && (
                <>
                  <Divider />
                  <Typography variant="caption" color="text.secondary">CAMBIO ASOCIADO</Typography>
                  <DetailRow label="Sale de" value={`${fmtMoney(detail.cambio_monto_origen, detail.cambio_moneda_origen)} (${detail.cambio_moneda_origen})`} />
                  <DetailRow label="Tipo de cambio" value={fmtNum(detail.cambio_tipo_cambio, 2)} />
                  <DetailRow label="Entra a caja gasto" value={fmtMoney(
                    detail.cambio_moneda_origen === "USD"
                      ? Number(detail.cambio_monto_origen) * Number(detail.cambio_tipo_cambio)
                      : Number(detail.cambio_tipo_cambio) > 0 ? Number(detail.cambio_monto_origen) / Number(detail.cambio_tipo_cambio) : 0,
                    detail.moneda
                  )} />
                </>
              )}
              {detail.tipo === "cambio" && (
                <>
                  <Divider />
                  <Typography variant="caption" color="text.secondary">CAMBIO ENTRE CAJAS</Typography>
                  <DetailRow label="Caja destino" value={detail.moneda_destino} />
                  <DetailRow label="Tipo de cambio" value={fmtNum(detail.raw?.tipo_cambio, 2)} />
                  <DetailRow label="Monto destino" value={fmtMoney(detail.monto_destino, detail.moneda_destino)} />
                </>
              )}
              {detail.comprobante_url && (
                <>
                  <Divider />
                  <Button startIcon={<ReceiptLongIcon />} variant="outlined" component={Link} href={publicUrl(detail.comprobante_url)} target="_blank">
                    Ver comprobante
                  </Button>
                </>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, justifyContent: "space-between" }}>
          <Box>
            {detail?.kind === "mov" && (
              <Button color="error" startIcon={<DeleteIcon />} onClick={() => delMov(detail)}>
                Eliminar
              </Button>
            )}
          </Box>
          <Stack direction="row" spacing={1}>
            <Button onClick={() => setDetail(null)}>Cerrar</Button>
            {detail?.kind === "mov" && (
              <Button variant="contained" color="secondary" startIcon={<EditIcon />} onClick={() => openEdit(detail.raw)}>
                Editar
              </Button>
            )}
          </Stack>
        </DialogActions>
      </Dialog>

      {/* CREATE / EDIT DIALOG */}
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md" fullScreen={fullScreen}>
        <DialogTitle>
          {editId ? (
            form.tipo === "ingreso" ? "Editar ingreso" : form.tipo === "cambio" ? "Editar cambio" : "Editar egreso"
          ) : (
            form.tipo === "ingreso" ? "Registrar ingreso" : form.tipo === "cambio" ? "Cambio entre cajas" : "Registrar egreso"
          )}
        </DialogTitle>
        <DialogContent dividers>
          {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

          {form.tipo === "cambio" ? (
            // -------- DIALOG: cambio puro entre cajas --------
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField label="Fecha" type="date" fullWidth InputLabelProps={{ shrink: true }}
                  value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                  Caja origen → Caja destino
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField select size="small" sx={{ flex: 1 }} value={form.moneda}
                    onChange={e => setForm({ ...form, moneda: e.target.value, moneda_destino: e.target.value === "USD" ? "ARS" : "USD" })}>
                    <MenuItem value="ARS">ARS ($)</MenuItem>
                    <MenuItem value="USD">USD</MenuItem>
                  </TextField>
                  <SwapHorizIcon color="primary" />
                  <TextField select size="small" sx={{ flex: 1 }} value={form.moneda_destino}
                    onChange={e => setForm({ ...form, moneda_destino: e.target.value })}>
                    <MenuItem value="ARS" disabled={form.moneda === "ARS"}>ARS ($)</MenuItem>
                    <MenuItem value="USD" disabled={form.moneda === "USD"}>USD</MenuItem>
                  </TextField>
                </Stack>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label={`Monto a vender (${form.moneda})`} type="number" fullWidth
                  value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Tipo de cambio (ARS por 1 USD)" type="number" fullWidth
                  value={form.cambio_tipo_cambio}
                  onChange={e => setForm({ ...form, cambio_tipo_cambio: e.target.value })} />
              </Grid>
              <Grid item xs={12}>
                <Alert severity="info" icon={<SwapHorizIcon />} sx={{ alignItems: "flex-start" }}>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    Este registro impacta en <b>2 movimientos</b>:
                  </Typography>
                  <Stack component="ol" sx={{ pl: 2.5, m: 0 }} spacing={0.25}>
                    <li>Caja {form.moneda}: <b style={{ color: "#C0392B" }}>−{fmtMoney(monto, form.moneda)}</b></li>
                    <li>Caja {form.moneda_destino}: <b style={{ color: "#1E8E3E" }}>+{fmtMoney(montoDestinoCambioPuro, form.moneda_destino)}</b></li>
                  </Stack>
                </Alert>
              </Grid>
              <Grid item xs={12}>
                <TextField label="Descripción / observación" fullWidth multiline minRows={2}
                  value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} />
              </Grid>
              <Grid item xs={12}>
                <Button variant="outlined" component="label" startIcon={<AttachFileIcon />} fullWidth>
                  {file ? file.name : (keepCompPath ? "Reemplazar comprobante" : "Adjuntar comprobante (opcional)")}
                  <input hidden type="file" accept="image/*,application/pdf"
                    onChange={e => setFile(e.target.files?.[0] ?? null)} />
                </Button>
              </Grid>
            </Grid>
          ) : (
            // -------- DIALOG: ingreso / egreso --------
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField label="Fecha" type="date" fullWidth InputLabelProps={{ shrink: true }}
                  value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                  {form.tipo === "ingreso" ? "Caja de destino" : "Caja del gasto"}
                </Typography>
                <ToggleButtonGroup
                  exclusive size="small" color="primary" fullWidth
                  value={form.moneda}
                  onChange={(_, v) => v && setForm({ ...form, moneda: v })}
                >
                  <ToggleButton value="ARS">Caja ARS ($)</ToggleButton>
                  <ToggleButton value="USD">Caja USD</ToggleButton>
                </ToggleButtonGroup>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label={form.tipo === "ingreso" ? "Monto" : "Monto del gasto"}
                  type="number" fullWidth
                  value={form.monto}
                  helperText={form.tipo === "egreso" && form.con_cambio ? "0 si es solo cambio de divisa" : " "}
                  onChange={e => setForm({ ...form, monto: e.target.value })}
                />
              </Grid>

              {form.tipo === "egreso" && (
                <Grid item xs={12} sm={6}>
                  <Autocomplete
                    freeSolo
                    options={categorias}
                    value={form.categoria}
                    onChange={(_, v) => setForm({ ...form, categoria: v ?? "" })}
                    onInputChange={(_, v) => setForm({ ...form, categoria: v ?? "" })}
                    renderInput={(params) => (
                      <TextField {...params} label="Categoría"
                        helperText="Escribí una nueva para crearla" />
                    )}
                  />
                </Grid>
              )}

              {form.tipo === "egreso" && (
                <Grid item xs={12} sm={6}>
                  <TextField select label="Concepto" fullWidth
                    value={form.concepto}
                    onChange={e => {
                      const usa = !!conceptos.find(c => c.nombre === e.target.value)?.usa_etapas;
                      setForm({ ...form, concepto: e.target.value, etapa: usa ? form.etapa : "" });
                    }}
                    helperText={conceptos.length === 0 ? "Cargá conceptos en Configuración" : "Tipo de gasto"}
                  >
                    <MenuItem value="">(Sin concepto)</MenuItem>
                    {conceptos.map(c => (
                      <MenuItem key={c.nombre} value={c.nombre}>{c.nombre}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
              )}

              {form.tipo === "egreso" && !!conceptos.find(c => c.nombre === form.concepto)?.usa_etapas && (
                <Grid item xs={12} sm={6}>
                  <TextField select label="Etapa" fullWidth
                    value={form.etapa}
                    onChange={e => setForm({ ...form, etapa: e.target.value })}
                    helperText="Etapa de obra asociada"
                  >
                    <MenuItem value="">(Sin etapa)</MenuItem>
                    {(hitos.length > 0 ? hitos : ETAPAS_DEFAULT).map(et => (
                      <MenuItem key={et} value={et}>{et}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
              )}

              {form.tipo === "egreso" && form.moneda === "ARS" && !form.con_cambio && (
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Tipo de cambio (ARS por 1 USD)" type="number" fullWidth
                    value={form.tipo_cambio_gasto}
                    onChange={e => setForm({ ...form, tipo_cambio_gasto: e.target.value })}
                    helperText={
                      Number(form.tipo_cambio_gasto) > 0 && monto > 0
                        ? `Se imputa ${fmtMoney(monto / Number(form.tipo_cambio_gasto), "USD")} al concepto/etapa`
                        : "Para valuar en USD este gasto en pesos por concepto/etapa (opcional)"
                    }
                  />
                </Grid>
              )}

              <Grid item xs={12}>
                <TextField label="Descripción / observación" fullWidth multiline minRows={2}
                  value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} />
              </Grid>

              {form.tipo === "egreso" && (
                <Grid item xs={12}>
                  <Box sx={{
                    p: 1.5, borderRadius: 2,
                    border: "1px solid", borderColor: "divider",
                    bgcolor: "rgba(15,42,74,0.025)",
                  }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={form.con_cambio}
                          onChange={(e) => {
                            const next = e.target.checked;
                            setForm({
                              ...form,
                              con_cambio: next,
                              cambio_moneda_origen: next ? (form.moneda === "ARS" ? "USD" : "ARS") : "USD",
                            });
                          }}
                        />
                      }
                      label={
                        <Stack>
                          <Typography fontWeight={600}>¿Necesita cambio de moneda?</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Activar si para pagar este gasto primero hay que vender divisa de otra caja.
                          </Typography>
                        </Stack>
                      }
                      sx={{ alignItems: "flex-start", m: 0 }}
                    />

                    {form.con_cambio && (
                      <Stack spacing={2} sx={{ mt: 2 }}>
                        <Grid container spacing={2}>
                          <Grid item xs={12} sm={4}>
                            <TextField
                              select fullWidth label="Caja origen"
                              value={form.cambio_moneda_origen}
                              onChange={(e) => setForm({ ...form, cambio_moneda_origen: e.target.value })}
                            >
                              <MenuItem value="USD" disabled={form.moneda === "USD"}>Caja USD</MenuItem>
                              <MenuItem value="ARS" disabled={form.moneda === "ARS"}>Caja ARS ($)</MenuItem>
                            </TextField>
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <TextField fullWidth type="number"
                              label={`Monto a vender (${form.cambio_moneda_origen})`}
                              value={form.cambio_monto_origen}
                              onChange={(e) => setForm({ ...form, cambio_monto_origen: e.target.value })} />
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <TextField fullWidth type="number"
                              label="Tipo de cambio (ARS por 1 USD)"
                              value={form.cambio_tipo_cambio}
                              onChange={(e) => setForm({ ...form, cambio_tipo_cambio: e.target.value })} />
                          </Grid>
                        </Grid>

                        <Alert severity="info" icon={<SwapHorizIcon />} sx={{ alignItems: "flex-start" }}>
                          <Typography variant="body2" sx={{ mb: 0.5 }}>
                            Este registro impacta en <b>3 movimientos</b>:
                          </Typography>
                          <Stack component="ol" sx={{ pl: 2.5, m: 0 }} spacing={0.25}>
                            <li>Caja {form.cambio_moneda_origen}: <b style={{ color: "#C0392B" }}>−{fmtMoney(monOrigen, form.cambio_moneda_origen)}</b></li>
                            <li>Caja {form.moneda}: <b style={{ color: "#1E8E3E" }}>+{fmtMoney(entradaPorCambio, form.moneda)}</b> (conversión)</li>
                            <li>Caja {form.moneda}: <b style={{ color: "#C0392B" }}>−{fmtMoney(monto, form.moneda)}</b> (pago del gasto)</li>
                          </Stack>
                          {monto > 0 && entradaPorCambio > 0 && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                              Sobrante en caja {form.moneda} luego del pago: <b>{fmtMoney(entradaPorCambio - monto, form.moneda)}</b>
                            </Typography>
                          )}
                        </Alert>
                      </Stack>
                    )}
                  </Box>
                </Grid>
              )}

              {/* Imputación a presupuesto (egresos) */}
              {form.tipo === "egreso" && (
                <Grid item xs={12}>
                  <Box sx={{
                    p: 1.5, borderRadius: 2,
                    border: "1px solid", borderColor: "divider",
                    bgcolor: "rgba(15,42,74,0.025)",
                  }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={imputarA}
                          onChange={(e) => {
                            setImputarA(e.target.checked);
                            if (!e.target.checked) {
                              setImpContratistaId(""); setImpPresupuestoId(""); setImpMontos({});
                            }
                          }}
                        />
                      }
                      label={
                        <Stack>
                          <Typography fontWeight={600}>Imputar este pago a un presupuesto</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Vincula este egreso a ítems de un presupuesto para llevar el pagado vs ejecutado.
                          </Typography>
                        </Stack>
                      }
                      sx={{ alignItems: "flex-start", m: 0 }}
                    />

                    {imputarA && (() => {
                      const opcionesPres = presupuestos.filter(p => !impContratistaId || p.contratista_id === impContratistaId);
                      const items = impPresupuestoId ? (itemsByPres[impPresupuestoId] ?? []) : [];
                      const sumImp = Object.values(impMontos).reduce((s, v) => s + Number(v || 0), 0);
                      const totalEgreso = Number(form.monto || 0);
                      const diff = Math.abs(sumImp - totalEgreso);
                      const allInOne = (itemId) => {
                        setImpMontos({ [itemId]: String(totalEgreso) });
                      };
                      return (
                        <Stack spacing={2} sx={{ mt: 2 }}>
                          <Grid container spacing={2}>
                            <Grid item xs={12} sm={6}>
                              <TextField select fullWidth label="Contratista"
                                value={impContratistaId}
                                onChange={(e) => {
                                  setImpContratistaId(e.target.value);
                                  setImpPresupuestoId("");
                                  setImpMontos({});
                                }}
                              >
                                {contratistas.length === 0 && <MenuItem value="" disabled>Sin contratistas</MenuItem>}
                                {contratistas.map(c => <MenuItem key={c.id} value={c.id}>{c.nombre}</MenuItem>)}
                              </TextField>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                              <TextField select fullWidth label="Presupuesto"
                                value={impPresupuestoId}
                                onChange={(e) => { setImpPresupuestoId(e.target.value); setImpMontos({}); }}
                                disabled={!impContratistaId}
                              >
                                {opcionesPres.length === 0 && <MenuItem value="" disabled>Sin presupuestos</MenuItem>}
                                {opcionesPres.map(p => <MenuItem key={p.id} value={p.id}>{p.nombre} ({p.moneda})</MenuItem>)}
                              </TextField>
                            </Grid>
                          </Grid>

                          {impPresupuestoId && items.length === 0 && (
                            <Alert severity="warning">Este presupuesto no tiene ítems cargados.</Alert>
                          )}

                          {items.length > 0 && (
                            <Box sx={{ overflowX: "auto" }}>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Ítem</TableCell>
                                    <TableCell align="right">Presupuestado</TableCell>
                                    <TableCell align="right">Avance %</TableCell>
                                    <TableCell align="right">Valor avance</TableCell>
                                    <TableCell align="right" sx={{ minWidth: 140 }}>Imputar</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {items.map(it => {
                                    const presup = Number(it.monto_presupuestado || 0);
                                    const valorAv = presup * Number(it.avance_pct || 0) / 100;
                                    const imputadoEsteItem = Number(impMontos[it.id] || 0);
                                    const excedeAvance = imputadoEsteItem > valorAv + 0.01;
                                    return (
                                      <TableRow key={it.id}>
                                        <TableCell>{it.nombre}</TableCell>
                                        <TableCell align="right">{fmtMoney(presup, form.moneda)}</TableCell>
                                        <TableCell align="right">{fmtNum(it.avance_pct, 2)}%</TableCell>
                                        <TableCell align="right">{fmtMoney(valorAv, form.moneda)}</TableCell>
                                        <TableCell align="right">
                                          <Stack direction="column" alignItems="flex-end" spacing={0.25}>
                                            <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
                                              <TextField
                                                size="small" type="number" sx={{ width: 130 }}
                                                value={impMontos[it.id] ?? ""}
                                                error={excedeAvance}
                                                onChange={(e) => setImpMontos(prev => ({ ...prev, [it.id]: e.target.value }))}
                                              />
                                              {items.length > 1 && (
                                                <Tooltip title="Imputar todo el egreso a este ítem">
                                                  <IconButton size="small" onClick={() => allInOne(it.id)}><span style={{ fontSize: 14, fontWeight: 700 }}>·</span></IconButton>
                                                </Tooltip>
                                              )}
                                            </Stack>
                                            {excedeAvance && (
                                              <Typography variant="caption" color="warning.main">
                                                Supera el valor avance ({fmtMoney(valorAv, form.moneda)})
                                              </Typography>
                                            )}
                                          </Stack>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </Box>
                          )}

                          {items.length > 0 && (
                            <Alert severity={diff < 0.01 ? "success" : "warning"} sx={{ py: 0.5 }}>
                              Total imputado: <b>{fmtMoney(sumImp, form.moneda)}</b> · Total egreso: <b>{fmtMoney(totalEgreso, form.moneda)}</b>
                              {diff >= 0.01 && (
                                <Typography variant="caption" display="block" sx={{ mt: 0.3 }}>
                                  Diferencia: {fmtMoney(Math.abs(totalEgreso - sumImp), form.moneda)} ({sumImp > totalEgreso ? "te pasaste" : "falta imputar"}).
                                </Typography>
                              )}
                            </Alert>
                          )}
                        </Stack>
                      );
                    })()}
                  </Box>
                </Grid>
              )}

              <Grid item xs={12}>
                <Button variant="outlined" component="label" startIcon={<AttachFileIcon />} fullWidth>
                  {file ? file.name : (keepCompPath ? "Reemplazar comprobante (mantiene actual si no elegís nada)" : "Adjuntar comprobante (opcional)")}
                  <input hidden type="file" accept="image/*,application/pdf"
                    onChange={e => setFile(e.target.files?.[0] ?? null)} />
                </Button>
                {keepCompPath && (
                  <Button size="small" sx={{ mt: 1 }} color="error" onClick={() => setKeepCompPath(null)}>
                    Quitar comprobante actual
                  </Button>
                )}
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" color="secondary" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : editId ? "Guardar cambios" : "Registrar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function SaldoCard({ label, saldo, currency, ingresos, egresos, accent }) {
  return (
    <Card sx={{ position: "relative", overflow: "hidden" }}>
      <Box sx={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, bgcolor: accent }} />
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
          <Chip size="small" label={currency} sx={{ bgcolor: "rgba(15,42,74,0.06)" }} />
        </Stack>
        <Typography variant="h4" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {fmtMoney(saldo, currency)}
        </Typography>
        <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <ArrowUpwardIcon sx={{ fontSize: 14, color: "success.main" }} />
            <Typography variant="caption" color="text.secondary">Ingresos {fmtMoney(ingresos, currency)}</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <ArrowDownwardIcon sx={{ fontSize: 14, color: "error.main" }} />
            <Typography variant="caption" color="text.secondary">Egresos {fmtMoney(egresos, currency)}</Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }) {
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ py: 6 }}>
      <Typography color="text.secondary">{text}</Typography>
    </Stack>
  );
}

function DetailRow({ label, value }) {
  return (
    <Stack direction="row" spacing={2} alignItems="center">
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 140, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1 }}>
        {typeof value === "string" || typeof value === "number"
          ? <Typography>{value}</Typography>
          : value}
      </Box>
    </Stack>
  );
}
