"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, LinearProgress,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Chip,
  Tabs, Tab, Divider, ToggleButton, ToggleButtonGroup, TextField, InputAdornment
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import TableViewIcon from "@mui/icons-material/TableView";
import { fmtMoney, fmtPct, fmtDate, fmtNum } from "@/components/Money";
import { getCache, setCache } from "@/lib/dataCache";

// USD imputable a la etapa/concepto = el gasto REAL valuado en USD.
// - Gasto en USD: ese monto.
// - Gasto en ARS: monto / tipo de cambio (el del cambio integrado si lo hubo,
//   o el tipo_cambio_gasto cargado al registrar el pago en pesos).
// Un cambio puro de divisa (sin gasto) no imputa nada.
function gastoUSD(mv) {
  if (mv.tipo !== "egreso") return 0;
  // El egreso de acopio es financiero (no consumo): el gasto real se imputa en
  // los retiros de materiales, no acá. Lo excluimos para no duplicar.
  if (mv.anticipo_materiales) return 0;
  const m = Number(mv.monto || 0);
  if (m <= 0) return 0;
  if (mv.moneda === "USD") return m;
  const tc = Number(mv.cambio_tipo_cambio || mv.tipo_cambio_gasto || 0);
  return tc > 0 ? m / tc : 0;
}

// Agrupa los egresos (USD imputado) por un campo, ordenado de mayor a menor.
// Los que no tienen valor en ese campo van a "(Sin asignar)".
function agruparPor(movs, campo) {
  const map = {};
  for (const mv of movs) {
    const g = gastoUSD(mv);
    if (g <= 0) continue;
    const key = mv[campo] || "(Sin asignar)";
    if (!map[key]) map[key] = { nombre: key, real: 0, n: 0 };
    map[key].real += g;
    map[key].n += 1;
  }
  return Object.values(map).sort((a, b) => b.real - a.real);
}

// Cantidad de meses (redondeada) entre dos fechas ISO.
function mesesEntre(iniISO, finISO) {
  if (!iniISO || !finISO) return null;
  const a = new Date(iniISO + "T00:00:00");
  const b = new Date(finISO + "T00:00:00");
  if (isNaN(a) || isNaN(b)) return null;
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  m += (b.getDate() - a.getDate()) / 30.44;
  return Math.max(0, Math.round(m));
}

const DIMENSIONES = [
  { campo: "concepto", label: "Concepto" },
  { campo: "etapa", label: "Etapa" },
  { campo: "rubro", label: "Rubro" },
  { campo: "tipo_costo", label: "Tipo de costo" },
];

function Barra({ pct }) {
  const p = Math.min(100, Math.max(0, pct || 0));
  const over = (pct || 0) > 100;
  return (
    <Box sx={{ height: 6, bgcolor: "rgba(15,42,74,0.08)", borderRadius: 3, overflow: "hidden", minWidth: 80 }}>
      <Box sx={{ height: "100%", width: `${p}%`, bgcolor: over ? "error.main" : "secondary.main" }} />
    </Box>
  );
}

function TablaSeguimiento({ titulo, filas, totalPlan, totalReal, onRowClick }) {
  const pctTot = totalPlan > 0 ? (totalReal / totalPlan) * 100 : null;
  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" gutterBottom>{titulo}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
          Tocá una fila para ver el detalle de los gastos imputados.
        </Typography>
        <TableContainer>
          <Table size="small" sx={{ minWidth: 560 }}>
            <TableHead>
              <TableRow>
                <TableCell>{titulo.includes("etapa") ? "Etapa" : "Concepto"}</TableCell>
                <TableCell align="right">Plan (USD)</TableCell>
                <TableCell align="right">% del plan</TableCell>
                <TableCell align="right">Real (USD)</TableCell>
                <TableCell align="right">% del real</TableCell>
                <TableCell align="right">%</TableCell>
                <TableCell sx={{ width: 140 }}>Avance</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filas.map((f) => {
                const pct = f.plan > 0 ? (f.real / f.plan) * 100 : null;
                const pctPlan = totalPlan > 0 ? (f.plan / totalPlan) * 100 : null;
                const pctReal = totalReal > 0 ? (f.real / totalReal) * 100 : null;
                const clickable = f.real > 0;
                return (
                  <TableRow
                    key={f.nombre} hover
                    onClick={clickable ? () => onRowClick(f) : undefined}
                    sx={{
                      ...(f.otros ? { bgcolor: "rgba(15,42,74,0.03)" } : {}),
                      cursor: clickable ? "pointer" : "default",
                    }}
                  >
                    <TableCell>
                      <Typography variant="body2" sx={{ fontStyle: f.otros ? "italic" : "normal" }}>{f.nombre}</Typography>
                    </TableCell>
                    <TableCell align="right">{fmtMoney(f.plan, "USD")}</TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="text.secondary">{pctPlan != null ? fmtPct(pctPlan, 0) : "—"}</Typography>
                    </TableCell>
                    <TableCell align="right">{fmtMoney(f.real, "USD")}</TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="text.secondary">{pctReal != null ? fmtPct(pctReal, 0) : "—"}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color={pct != null && pct > 100 ? "error.main" : "text.primary"}>
                        {pct != null ? fmtPct(pct, 0) : "—"}
                      </Typography>
                    </TableCell>
                    <TableCell><Barra pct={pct ?? 0} /></TableCell>
                  </TableRow>
                );
              })}
              <TableRow sx={{ "& > td": { borderTop: "2px solid", borderColor: "divider", fontWeight: 700 } }}>
                <TableCell><Typography fontWeight={700}>Total</Typography></TableCell>
                <TableCell align="right"><Typography fontWeight={700}>{fmtMoney(totalPlan, "USD")}</Typography></TableCell>
                <TableCell align="right"><Typography fontWeight={700}>{totalPlan > 0 ? "100%" : "—"}</Typography></TableCell>
                <TableCell align="right"><Typography fontWeight={700}>{fmtMoney(totalReal, "USD")}</Typography></TableCell>
                <TableCell align="right"><Typography fontWeight={700}>{totalReal > 0 ? "100%" : "—"}</Typography></TableCell>
                <TableCell align="right"><Typography fontWeight={700}>{pctTot != null ? fmtPct(pctTot, 0) : "—"}</Typography></TableCell>
                <TableCell><Barra pct={pctTot ?? 0} /></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}

export default function EconomicoPage() {
  const { proyecto } = useProjects();
  const cacheInit = getCache("economico", proyecto?.id);
  const [conceptos, setConceptos] = useState(cacheInit?.conceptos ?? []);
  const [hitos, setHitos] = useState(cacheInit?.hitos ?? []);
  const [movs, setMovs] = useState(cacheInit?.movs ?? []);
  // Materiales de acopio: el consumo se imputa por etapa en los retiros (neto en USD).
  const [cuentasMat, setCuentasMat] = useState(cacheInit?.cuentasMat ?? []);
  const [anticiposMat, setAnticiposMat] = useState(cacheInit?.anticiposMat ?? []);
  const [retirosMat, setRetirosMat] = useState(cacheInit?.retirosMat ?? []);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [dim, setDim] = useState("tipo_costo"); // dimensión del análisis de gastos
  const [disponible, setDisponible] = useState(""); // USD disponibles hoy
  const [fechaObjetivo, setFechaObjetivo] = useState(""); // fecha para calcular necesidad
  const [detalle, setDetalle] = useState(null); // { campo, valor, otros }

  const reload = async () => {
    if (!proyecto) return;
    const cached = getCache("economico", proyecto.id);
    setLoading(!cached);
    const [{ data: cs }, { data: hs }, { data: mv }, { data: cm }] = await Promise.all([
      supabase.from("conceptos").select("*").eq("proyecto_id", proyecto.id).order("orden"),
      supabase.from("hitos").select("*").eq("proyecto_id", proyecto.id).order("orden"),
      supabase.from("movimientos_caja").select("*").eq("proyecto_id", proyecto.id),
      supabase.from("cuentas_materiales").select("id,proveedor,moneda").eq("proyecto_id", proyecto.id),
    ]);
    const matIds = (cm ?? []).map(c => c.id);
    let am = [], rm = [];
    if (matIds.length) {
      const [{ data: a }, { data: r }] = await Promise.all([
        supabase.from("anticipos_materiales").select("cuenta_id,monto,tipo_cambio,es_devolucion").in("cuenta_id", matIds),
        supabase.from("retiros_materiales").select("cuenta_id,fecha,descripcion,monto,etapa,tipo_cambio,recupero,recupero_items,recupero_total").in("cuenta_id", matIds),
      ]);
      am = a ?? []; rm = r ?? [];
    }
    setCache("economico", proyecto.id, { conceptos: cs ?? [], hitos: hs ?? [], movs: mv ?? [], cuentasMat: cm ?? [], anticiposMat: am, retirosMat: rm });
    setConceptos(cs ?? []); setHitos(hs ?? []); setMovs(mv ?? []);
    setCuentasMat(cm ?? []); setAnticiposMat(am); setRetirosMat(rm);
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  // Gasto real de materiales de acopio por etapa (USD neto). Cada anticipo
  // congela su TC; el dólar de la cuenta es el promedio ponderado de sus
  // anticipos reales. Cada retiro imputa su neto (monto − recupero) a su etapa.
  const { realMatPorEtapa, retirosMatDetalle } = useMemo(() => {
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
    const real = {};
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
      if (r.etapa) real[r.etapa] = (real[r.etapa] || 0) + usd;
      det.push({
        id: "ret_" + (r.id ?? `${r.cuenta_id}_${r.fecha}_${r.monto}`),
        fecha: r.fecha, etapa: r.etapa || null,
        descripcion: `Materiales · ${c.proveedor}${r.descripcion ? ` · ${r.descripcion}` : ""}`,
        categoria: "Materiales", monto: neto, moneda: c.moneda,
        tc: Number(r.tipo_cambio || 0), usd, usdRec, usdGross,
      });
    }
    return { realMatPorEtapa: real, retirosMatDetalle: det };
  }, [cuentasMat, anticiposMat, retirosMat]);

  // El concepto de "Obra" (el que usa etapas) recibe el consumo de materiales.
  const obraConcepto = useMemo(() => {
    const obra = conceptos.filter(c => c.usa_etapas).map(c => c.nombre);
    return obra.length === 1 ? obra[0] : null;
  }, [conceptos]);

  // Gastos reales unificados: egresos de Caja (sin acopio) + retiros de
  // materiales representados como gasto en USD (neto, imputado a su etapa).
  const movsReal = useMemo(() => {
    const mat = retirosMatDetalle.map(d => ({
      id: d.id, tipo: "egreso", fecha: d.fecha,
      moneda: d.moneda, monto: d.monto, tipo_cambio_gasto: d.tc > 0 ? d.tc : null,
      concepto: obraConcepto || null, etapa: d.etapa || null,
      tipo_costo: "Materiales", rubro: null, categoria: "Materiales",
      descripcion: d.descripcion, _material: true,
    }));
    return [...movs, ...mat];
  }, [movs, retirosMatDetalle, obraConcepto]);

  // Acopio total (USD) vs lo ya retirado (USD): el acopio sale de Caja pero no
  // se cuenta como gasto; la diferencia con lo retirado es acopio sin consumir.
  const acopioInfo = useMemo(() => {
    const byCuenta = {};
    for (const c of cuentasMat) byCuenta[c.id] = c;
    let acopioUSD = 0;
    for (const a of anticiposMat) {
      if (a.es_devolucion) continue;
      const c = byCuenta[a.cuenta_id];
      if (!c) continue;
      const m = Number(a.monto || 0);
      if ((c.moneda || "ARS") === "ARS") {
        const tc = Number(a.tipo_cambio || 0);
        acopioUSD += tc > 0 ? m / tc : 0;
      } else acopioUSD += m;
    }
    const retiroNetoUSD = retirosMatDetalle.reduce((s, d) => s + (d.usd || 0), 0);
    const aRecuperarUSD = retirosMatDetalle.reduce((s, d) => s + (d.usdRec || 0), 0);
    const retiroBrutoUSD = retirosMatDetalle.reduce((s, d) => s + (d.usdGross || 0), 0);
    const sinConsumirUSD = acopioUSD - retiroBrutoUSD; // acopio que todavía no se retiró
    return { acopioUSD, retiroNetoUSD, aRecuperarUSD, sinConsumirUSD };
  }, [cuentasMat, anticiposMat, retirosMatDetalle]);

  const { filasConcepto, totPlanC, totRealC, filasEtapa, totPlanE, totRealE } = useMemo(() => {
    // Real por concepto / etapa (USD)
    const realPorConcepto = {};
    const realPorEtapa = {};
    let totalReal = 0;
    for (const mv of movsReal) {
      const g = gastoUSD(mv);
      if (g <= 0) continue;
      totalReal += g;
      if (mv.concepto) realPorConcepto[mv.concepto] = (realPorConcepto[mv.concepto] || 0) + g;
      if (mv.etapa) realPorEtapa[mv.etapa] = (realPorEtapa[mv.etapa] || 0) + g;
    }

    const filasConcepto = conceptos.map(c => ({
      nombre: c.nombre, plan: Number(c.valor_plan || 0), real: realPorConcepto[c.nombre] || 0,
    }));
    // Gastos con concepto no listado (o sin concepto)
    const nombresC = new Set(conceptos.map(c => c.nombre));
    const otrosReal = Object.entries(realPorConcepto)
      .filter(([k]) => !nombresC.has(k)).reduce((s, [, v]) => s + v, 0);
    const sinConcepto = totalReal - Object.values(realPorConcepto).reduce((s, v) => s + v, 0);
    const otrosTotal = otrosReal + sinConcepto;
    if (otrosTotal > 0.5) filasConcepto.push({ nombre: "Sin concepto / otros", plan: 0, real: otrosTotal, otros: true });

    const totPlanC = filasConcepto.reduce((s, f) => s + f.plan, 0);
    const totRealC = filasConcepto.reduce((s, f) => s + f.real, 0);

    // El real por etapa ya incluye el consumo de materiales (vía movsReal).
    const filasEtapa = hitos.map(h => ({
      nombre: h.nombre, plan: Number(h.valor_plan || 0), real: realPorEtapa[h.nombre] || 0,
    }));
    const totPlanE = filasEtapa.reduce((s, f) => s + f.plan, 0);
    const totRealE = filasEtapa.reduce((s, f) => s + f.real, 0);

    return { filasConcepto, totPlanC, totRealC, filasEtapa, totPlanE, totRealE };
  }, [conceptos, hitos, movsReal]);

  // Egresos que componen la fila seleccionada, con su USD imputado.
  const detalleGastos = useMemo(() => {
    if (!detalle) return [];
    const nombresC = new Set(conceptos.map(c => c.nombre));
    return movsReal
      .map(mv => ({ mv, usd: gastoUSD(mv) }))
      .filter(({ mv, usd }) => {
        if (usd <= 0) return false;
        if (detalle.otros) return !mv.concepto || !nombresC.has(mv.concepto);
        if (detalle.valor == null) return !mv[detalle.campo];
        return mv[detalle.campo] === detalle.valor;
      })
      .sort((a, b) => (a.mv.fecha < b.mv.fecha ? 1 : -1));
  }, [detalle, movsReal, conceptos]);

  const totalDetalle = detalleGastos.reduce((s, d) => s + d.usd, 0);

  // Flujo de fondos: necesidad acumulada de plata (USD) por etapa, en orden.
  const filasFlujo = useMemo(() => {
    const ord = [...hitos].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    let acc = 0;
    return ord.map(h => {
      const plan = Number(h.valor_plan || 0);
      acc += plan;
      return {
        nombre: h.nombre, plan, acumulado: acc,
        fecha: h.fecha_real || h.fecha_estimada || null,
        meses: mesesEntre(h.fecha_estimada, h.fecha_real),
      };
    });
  }, [hitos]);
  // Meses totales del proyecto (de la primera a la última fecha cargada).
  const mesesTotales = useMemo(() => {
    const inicios = hitos.map(h => h.fecha_estimada).filter(Boolean);
    const fines = hitos.map(h => h.fecha_real).filter(Boolean);
    const ini = inicios.length ? inicios.reduce((m, d) => (d < m ? d : m)) : null;
    const fin = fines.length ? fines.reduce((m, d) => (d > m ? d : m)) : null;
    return mesesEntre(ini, fin);
  }, [hitos]);
  const totalFlujo = filasFlujo.length ? filasFlujo[filasFlujo.length - 1].acumulado : 0;
  const disp = Number(disponible || 0);
  // Hasta qué etapa llega la plata disponible (última totalmente cubierta).
  const alcance = (() => {
    if (disp <= 0) return null;
    let ultima = null;
    for (const f of filasFlujo) {
      if (f.acumulado <= disp) ultima = f; else break;
    }
    return ultima;
  })();
  // Necesidad para la fecha objetivo (suma del plan de las etapas con fecha <= objetivo).
  const necesidadFecha = fechaObjetivo
    ? filasFlujo.filter(f => f.fecha && f.fecha <= fechaObjetivo).reduce((s, f) => s + f.plan, 0)
    : null;

  // Rubro y Tipo de costo solo aplican a la Obra (conceptos con usa_etapas).
  // Para esas dimensiones, ignoramos los gastos que no son de Obra.
  const movsAnalisis = useMemo(() => {
    if (dim !== "rubro" && dim !== "tipo_costo") return movsReal;
    const obra = new Set(conceptos.filter(c => c.usa_etapas).map(c => c.nombre));
    return movsReal.filter(mv => mv.concepto && obra.has(mv.concepto));
  }, [movsReal, conceptos, dim]);

  // Análisis de gastos por la dimensión elegida.
  const filasAnalisis = useMemo(() => agruparPor(movsAnalisis, dim), [movsAnalisis, dim]);
  const totalAnalisis = filasAnalisis.reduce((s, f) => s + f.real, 0);

  // Detalle completo (un gasto por fila) dentro del alcance de la dimensión.
  const detalleAnalisis = useMemo(() =>
    movsAnalisis
      .map(mv => ({ mv, usd: gastoUSD(mv) }))
      .filter(({ usd }) => usd > 0)
      .sort((a, b) => (a.mv.fecha < b.mv.fecha ? 1 : -1)),
    [movsAnalisis]);

  const exportarExcel = () => {
    const numAR = (v) => Number(v || 0).toLocaleString("es-AR", { useGrouping: false, maximumFractionDigits: 2 });
    const head = ["Fecha", "Detalle", "Concepto", "Etapa", "Rubro", "Tipo de costo", "Categoría", "Moneda", "Monto", "TC", "Imputado (USD)"];
    const rows = detalleAnalisis.map(({ mv, usd }) => {
      const tc = Number(mv.cambio_tipo_cambio || mv.tipo_cambio_gasto || 0);
      return [mv.fecha, mv.descripcion || "", mv.concepto || "", mv.etapa || "", mv.rubro || "",
        mv.tipo_costo || "", mv.categoria || "", mv.moneda || "", numAR(mv.monto), tc > 0 ? numAR(tc) : "", numAR(usd)];
    });
    const cell = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const csv = [head, ...rows].map(r => r.map(cell).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Gastos_${(proyecto.nombre || "proyecto").replace(/[^\w.\-]/g, "_")}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5">Seguimiento económico</Typography>
        <Typography variant="body2" color="text.secondary">
          Plan vs. real (en USD) por concepto y por etapa. El “real” suma los egresos cargados.
        </Typography>
      </Box>

      {loading && <LinearProgress />}

      <Box>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
          <Tab label="Plan vs Real" />
          <Tab label="Análisis de gastos" />
          <Tab label="Flujo de fondos" />
        </Tabs>
        <Divider />
      </Box>

      {tab === 0 && (
        <Stack spacing={3}>
          <Alert severity="info">
            <Typography variant="body2" fontWeight={700} sx={{ mb: acopioInfo.acopioUSD > 0 ? 0.5 : 0 }}>
              No se consideran los egresos de acopio. Se consideran los retiros de materiales.
            </Typography>
            {acopioInfo.acopioUSD > 0 && (
              <Typography variant="body2" color="text.secondary">
                Acopio total: <b>{fmtMoney(acopioInfo.acopioUSD, "USD")}</b> ·
                {" "}computado en el real (neto): <b>{fmtMoney(acopioInfo.retiroNetoUSD, "USD")}</b> ·
                {" "}a recuperar: <b>{fmtMoney(acopioInfo.aRecuperarUSD, "USD")}</b> ·
                {" "}sin consumir (sin retirar): <b>{fmtMoney(acopioInfo.sinConsumirUSD, "USD")}</b>.
                {" "}Lo gastado en Caja (acopio) supera al real del económico justamente por lo <b>a recuperar</b> + lo <b>sin consumir</b>.
              </Typography>
            )}
          </Alert>
          <TablaSeguimiento titulo="Por concepto" filas={filasConcepto} totalPlan={totPlanC} totalReal={totRealC}
            onRowClick={(f) => setDetalle({ campo: "concepto", valor: f.nombre, otros: !!f.otros })} />
          <TablaSeguimiento titulo="Por etapa (Obra)" filas={filasEtapa} totalPlan={totPlanE} totalReal={totRealE}
            onRowClick={(f) => setDetalle({ campo: "etapa", valor: f.nombre })} />
          <Typography variant="caption" color="text.secondary">
            El “real” se imputa siempre en USD: los gastos en USD por su monto, y los gastos en ARS convertidos por el
            tipo de cambio (el del cambio integrado, o el tipo de cambio cargado al registrar el pago en pesos).
            Un gasto en ARS sin tipo de cambio cargado no se puede valuar y no impacta en el total.
            En “Por etapa”, el real suma además el consumo de materiales de acopio: cada retiro imputa su neto
            (monto − recupero) en USD al dólar congelado del acopio. El egreso de acopio en Caja no lleva etapa
            para no duplicar.
          </Typography>
        </Stack>
      )}

      {tab === 1 && (
        <Card>
          <CardContent>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }} sx={{ mb: 2 }}>
              <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>Gastos por dimensión</Typography>
              <ToggleButtonGroup exclusive size="small" value={dim} onChange={(_, v) => v && setDim(v)}>
                {DIMENSIONES.map(d => <ToggleButton key={d.campo} value={d.campo}>{d.label}</ToggleButton>)}
              </ToggleButtonGroup>
              <Button size="small" variant="outlined" color="success" startIcon={<TableViewIcon />}
                onClick={exportarExcel} disabled={detalleAnalisis.length === 0}>
                Excel
              </Button>
            </Stack>
            {(dim === "rubro" || dim === "tipo_costo") && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Rubro y tipo de costo aplican solo a los gastos de Obra. Se excluyen los demás conceptos.
              </Alert>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
              Total gastado (USD) agrupado por {DIMENSIONES.find(d => d.campo === dim)?.label.toLowerCase()}. Tocá una fila para ver el detalle.
            </Typography>
            <TableContainer>
              <Table size="small" sx={{ minWidth: 480 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>{DIMENSIONES.find(d => d.campo === dim)?.label}</TableCell>
                    <TableCell align="right"># gastos</TableCell>
                    <TableCell align="right">Total (USD)</TableCell>
                    <TableCell align="right">%</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filasAnalisis.length === 0 && (
                    <TableRow><TableCell colSpan={4}>
                      <Typography variant="body2" color="text.secondary">No hay gastos cargados.</Typography>
                    </TableCell></TableRow>
                  )}
                  {filasAnalisis.map((f) => {
                    const sinAsignar = f.nombre === "(Sin asignar)";
                    const pct = totalAnalisis > 0 ? (f.real / totalAnalisis) * 100 : 0;
                    return (
                      <TableRow key={f.nombre} hover sx={{ cursor: "pointer" }}
                        onClick={() => setDetalle({ campo: dim, valor: sinAsignar ? null : f.nombre })}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontStyle: sinAsignar ? "italic" : "normal" }}>{f.nombre}</Typography>
                        </TableCell>
                        <TableCell align="right">{f.n}</TableCell>
                        <TableCell align="right">{fmtMoney(f.real, "USD")}</TableCell>
                        <TableCell align="right">{fmtPct(pct, 0)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {filasAnalisis.length > 0 && (
                    <TableRow sx={{ "& > td": { borderTop: "2px solid", borderColor: "divider" } }}>
                      <TableCell><Typography fontWeight={700}>Total</Typography></TableCell>
                      <TableCell align="right"><Typography fontWeight={700}>{filasAnalisis.reduce((s, f) => s + f.n, 0)}</Typography></TableCell>
                      <TableCell align="right"><Typography fontWeight={700}>{fmtMoney(totalAnalisis, "USD")}</Typography></TableCell>
                      <TableCell align="right"><Typography fontWeight={700}>100%</Typography></TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>Detalle de gastos</Typography>
            <TableContainer>
              <Table size="small" sx={{ minWidth: 760 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Fecha</TableCell>
                    <TableCell>Detalle</TableCell>
                    <TableCell align="center">Concepto</TableCell>
                    <TableCell align="center">Etapa</TableCell>
                    <TableCell align="center">Rubro</TableCell>
                    <TableCell align="center">Tipo de costo</TableCell>
                    <TableCell align="right">Monto</TableCell>
                    <TableCell align="right">USD</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detalleAnalisis.length === 0 && (
                    <TableRow><TableCell colSpan={8}>
                      <Typography variant="body2" color="text.secondary">No hay gastos cargados.</Typography>
                    </TableCell></TableRow>
                  )}
                  {detalleAnalisis.map(({ mv, usd }) => (
                    <TableRow key={mv.id} hover>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtDate(mv.fecha)}</TableCell>
                      <TableCell>{mv.descripcion || "—"}</TableCell>
                      <TableCell align="center">{mv.concepto || "—"}</TableCell>
                      <TableCell align="center">{mv.etapa || "—"}</TableCell>
                      <TableCell align="center">{mv.rubro || "—"}</TableCell>
                      <TableCell align="center">{mv.tipo_costo || "—"}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{fmtMoney(mv.monto, mv.moneda)}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap", fontWeight: 600 }}>{fmtMoney(usd, "USD")}</TableCell>
                    </TableRow>
                  ))}
                  {detalleAnalisis.length > 0 && (
                    <TableRow sx={{ "& > td": { borderTop: "2px solid", borderColor: "divider" } }}>
                      <TableCell colSpan={7}><Typography fontWeight={700}>Total</Typography></TableCell>
                      <TableCell align="right"><Typography fontWeight={700}>{fmtMoney(totalAnalisis, "USD")}</Typography></TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {tab === 2 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>Necesidad de fondos por etapa</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: "block" }}>
              Cuánta plata (USD) se necesita acumulada según el plan de cada etapa y sus fechas. Cargá lo disponible
              para ver hasta dónde llegás, o una fecha para saber cuánto vas a necesitar.
            </Typography>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
              <TextField
                label="Disponible hoy" type="number" size="small" sx={{ width: { xs: "100%", sm: 200 } }}
                value={disponible} onChange={(e) => setDisponible(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start">US$</InputAdornment> }}
              />
              <TextField
                label="¿Para qué fecha?" type="date" size="small" sx={{ width: { xs: "100%", sm: 200 } }}
                InputLabelProps={{ shrink: true }}
                value={fechaObjetivo} onChange={(e) => setFechaObjetivo(e.target.value)}
              />
            </Stack>

            {disp > 0 && (
              <Alert severity={alcance && alcance.acumulado >= totalFlujo ? "success" : "info"} sx={{ mb: 1.5 }}>
                Con <b>{fmtMoney(disp, "USD")}</b>{" "}
                {alcance
                  ? <>llegás hasta <b>{alcance.nombre}</b> ({totalFlujo > 0 ? fmtPct(alcance.acumulado / totalFlujo * 100, 0) : "—"} del plan).</>
                  : <>todavía no cubrís la primera etapa.</>}
              </Alert>
            )}
            {necesidadFecha != null && (
              <Alert severity="info" sx={{ mb: 1.5 }}>
                Para el <b>{fmtDate(fechaObjetivo)}</b> vas a necesitar <b>{fmtMoney(necesidadFecha, "USD")}</b>.
              </Alert>
            )}

            <TableContainer>
              <Table size="small" sx={{ minWidth: 560 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Etapa</TableCell>
                    <TableCell align="center">Fecha</TableCell>
                    <TableCell align="center">Meses</TableCell>
                    <TableCell align="right">Necesita (USD)</TableCell>
                    <TableCell align="right">Acumulado (USD)</TableCell>
                    <TableCell align="center">Estado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filasFlujo.length === 0 && (
                    <TableRow><TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary">No hay etapas con plan cargado. Definí el plan por etapa en Configuración.</Typography>
                    </TableCell></TableRow>
                  )}
                  {filasFlujo.map((f) => {
                    const cubierta = disp > 0 && f.acumulado <= disp;
                    const previo = f.acumulado - f.plan;
                    const parcial = disp > 0 && !cubierta && disp > previo;
                    const cubreFecha = fechaObjetivo && f.fecha && f.fecha <= fechaObjetivo;
                    return (
                      <TableRow key={f.nombre}
                        sx={{ bgcolor: cubierta ? "rgba(30,142,62,0.10)" : parcial ? "rgba(224,122,31,0.12)" : undefined }}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={cubierta || parcial ? 600 : 400}>{f.nombre}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2" color={cubreFecha ? "primary.main" : "text.secondary"}>
                            {f.fecha ? fmtDate(f.fecha) : "—"}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2" color="text.secondary">
                            {f.meses != null ? `${f.meses} ${f.meses === 1 ? "mes" : "meses"}` : "—"}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{fmtMoney(f.plan, "USD")}</TableCell>
                        <TableCell align="right">{fmtMoney(f.acumulado, "USD")}</TableCell>
                        <TableCell align="center">
                          {disp <= 0 ? "—"
                            : cubierta ? <Chip size="small" color="success" label="Cubierta" />
                            : parcial ? <Chip size="small" color="warning" label={`Parcial ${fmtPct((disp - previo) / f.plan * 100, 0)}`} />
                            : <Chip size="small" variant="outlined" label="Falta" />}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filasFlujo.length > 0 && (
                    <TableRow sx={{ "& > td": { borderTop: "2px solid", borderColor: "divider" } }}>
                      <TableCell><Typography fontWeight={700}>Total plan</Typography></TableCell>
                      <TableCell />
                      <TableCell align="center"><Typography fontWeight={700}>{mesesTotales != null ? `${mesesTotales} ${mesesTotales === 1 ? "mes" : "meses"}` : "—"}</Typography></TableCell>
                      <TableCell align="right"><Typography fontWeight={700}>{fmtMoney(totalFlujo, "USD")}</Typography></TableCell>
                      <TableCell align="right"><Typography fontWeight={700}>{fmtMoney(totalFlujo, "USD")}</Typography></TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!detalle} onClose={() => setDetalle(null)} fullWidth maxWidth="md">
        <DialogTitle>
          Gastos imputados · {detalle?.valor ?? "Sin asignar"}
        </DialogTitle>
        <DialogContent dividers>
          {detalleGastos.length === 0 ? (
            <Alert severity="info">No hay gastos imputados.</Alert>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Fecha</TableCell>
                    <TableCell>Detalle</TableCell>
                    <TableCell>Categoría</TableCell>
                    <TableCell align="right">Monto</TableCell>
                    <TableCell align="right">TC</TableCell>
                    <TableCell align="right">Imputado (USD)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detalleGastos.map(({ mv, usd }) => {
                    const tc = Number(mv.cambio_tipo_cambio || mv.tipo_cambio_gasto || 0);
                    return (
                    <TableRow key={mv.id} hover>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtDate(mv.fecha)}</TableCell>
                      <TableCell>{mv.descripcion || "—"}</TableCell>
                      <TableCell>{mv.categoria ? <Chip size="small" label={mv.categoria} /> : "—"}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{fmtMoney(mv.monto, mv.moneda)}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{tc > 0 ? fmtNum(tc, 2) : "—"}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap", fontWeight: 600 }}>{fmtMoney(usd, "USD")}</TableCell>
                    </TableRow>
                    );
                  })}
                  <TableRow sx={{ "& > td": { borderTop: "2px solid", borderColor: "divider" } }}>
                    <TableCell colSpan={5}><Typography fontWeight={700}>Total imputado</Typography></TableCell>
                    <TableCell align="right"><Typography fontWeight={700}>{fmtMoney(totalDetalle, "USD")}</Typography></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetalle(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
