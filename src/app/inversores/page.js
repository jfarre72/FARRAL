"use client";
import {
  Card, CardContent, Stack, Typography, Button, Grid, Tabs, Tab, Alert,
  Table, TableBody, TableCell, TableHead, TableRow, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Box,
  Chip, Tooltip, Divider, LinearProgress, FormControlLabel, Switch,
  TableSortLabel, useMediaQuery, ToggleButton, ToggleButtonGroup, Slider,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import PaidIcon from "@mui/icons-material/Paid";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import TableViewIcon from "@mui/icons-material/TableView";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtMoney, fmtNum, fmtPct, fmtDate, anualizada } from "@/components/Money";
import { printDocument, esc } from "@/lib/printPdf";
import DonutChart from "@/components/DonutChart";
import { computePonderacion } from "@/lib/ponderacion";
import { aplicarFechasReales } from "@/lib/fechasReales";

const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const estTotal = (t) => Number(t.est_mod || 0) + Number(t.est_maq || 0) + Number(t.est_mat || 0);
const dISO = (iso) => new Date(String(iso).slice(0, 10) + "T00:00:00");
const diasEntre = (a, b) => Math.max(0, Math.round((b - a) / 86400000));
// Puntos mensuales entre dos fechas (incluye inicio y fin exactos).
function puntosMensuales(startISO, endISO) {
  const s = dISO(startISO), e = dISO(endISO);
  if (isNaN(s) || isNaN(e) || e <= s) return [];
  const pts = [new Date(s)];
  let d = new Date(s.getFullYear(), s.getMonth() + 1, 1);
  while (d < e) { pts.push(new Date(d)); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); }
  pts.push(new Date(e));
  return pts;
}

// Paleta para segmentos de inversores en el gráfico
const PALETTE = ["#0F2A4A", "#E07A1F", "#1E8E3E", "#7B61FF", "#0EA5A4", "#C0392B", "#E0A21F", "#5C6470"];

const emptyInv  = { nombre: "", contacto: "", moneda_habitual: "USD" };
const TITULARES = ["Rodrigo", "Juan"];

const emptyAp   = {
  inversor_id: "", fecha: new Date().toISOString().slice(0,10),
  fecha_inicio_calculo: "",
  monto: "",
  moneda: "USD", observacion: "",
  entra_a_caja: true,
  titular: "",
};

export default function InversoresPage() {
  const { proyecto } = useProjects();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [tab, setTab] = useState(0);
  const [inversores, setInversores] = useState([]);
  const [aportes, setAportes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [openInv, setOpenInv] = useState(false);
  const [formInv, setFormInv] = useState(emptyInv);
  const [editInvId, setEditInvId] = useState(null);
  const [errInv, setErrInv] = useState(null);

  const [openAp, setOpenAp] = useState(false);
  const [formAp, setFormAp] = useState(emptyAp);
  const [editApId, setEditApId] = useState(null);
  const [errAp, setErrAp] = useState(null);

  // What-if: fecha de entrega del proyecto editable desde el Resumen.
  // Reemplaza temporalmente a fecha_fin. Persiste por proyecto en localStorage.
  const [fechaVentaOverride, setFechaVentaOverride] = useState("");
  // What-if: fecha de venta simulada → desde cuándo el "Faltante" aporta capital.
  const [fechaVentaSim, setFechaVentaSim] = useState("");

  const [orderBy, setOrderBy] = useState("aportesUSD");
  const [orderDir, setOrderDir] = useState("desc");
  const handleSort = (col) => {
    if (orderBy === col) setOrderDir(d => d === "asc" ? "desc" : "asc");
    else { setOrderBy(col); setOrderDir("desc"); }
  };

  // Filas expandidas del Resumen por inversor
  const [expandedInv, setExpandedInv] = useState(new Set());
  const toggleExpand = (id) => {
    setExpandedInv(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  useEffect(() => {
    if (!proyecto) return;
    const k = `farral.fechaVentaOverride.${proyecto.id}`;
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(k) : null;
    setFechaVentaOverride(saved || proyecto.fecha_fin || "");
    const kv = `farral.fechaVentaSim.${proyecto.id}`;
    const savedV = typeof window !== "undefined" ? window.localStorage.getItem(kv) : null;
    setFechaVentaSim(savedV || proyecto.fecha_inversor_faltante || "");
    // eslint-disable-next-line
  }, [proyecto?.id]);
  useEffect(() => {
    if (!proyecto) return;
    const k = `farral.fechaVentaOverride.${proyecto.id}`;
    if (fechaVentaOverride) window.localStorage.setItem(k, fechaVentaOverride);
  }, [fechaVentaOverride, proyecto?.id]);
  useEffect(() => {
    if (!proyecto) return;
    const kv = `farral.fechaVentaSim.${proyecto.id}`;
    if (fechaVentaSim) window.localStorage.setItem(kv, fechaVentaSim);
  }, [fechaVentaSim, proyecto?.id]);

  const reload = async () => {
    if (!proyecto) return;
    setLoading(true);
    const [r1, r2] = await Promise.all([
      supabase.from("inversores").select("*").eq("proyecto_id", proyecto.id).order("nombre"),
      supabase.from("aportes").select("*").eq("proyecto_id", proyecto.id).order("fecha", { ascending: false }),
    ]);
    setInversores(r1.data ?? []);
    setAportes(r2.data ?? []);
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  if (!proyecto) {
    return <Alert severity="info">Seleccioná o creá un proyecto para gestionar inversores.</Alert>;
  }

  // ------ Inversor save ------
  const openNewInv = () => { setFormInv(emptyInv); setEditInvId(null); setErrInv(null); setOpenInv(true); };
  const openEditInv = (i) => {
    setFormInv({ nombre: i.nombre, contacto: i.contacto ?? "", moneda_habitual: i.moneda_habitual });
    setEditInvId(i.id); setErrInv(null); setOpenInv(true);
  };
  const saveInv = async () => {
    setErrInv(null);
    if (!formInv.nombre.trim()) { setErrInv("Nombre obligatorio."); return; }
    const payload = {
      proyecto_id: proyecto.id,
      nombre: formInv.nombre.trim(),
      contacto: formInv.contacto || null,
      moneda_habitual: formInv.moneda_habitual,
    };
    const res = editInvId
      ? await supabase.from("inversores").update(payload).eq("id", editInvId)
      : await supabase.from("inversores").insert(payload);
    if (res.error) { setErrInv(res.error.message); return; }
    setOpenInv(false); reload();
  };
  const deleteInv = async (id) => {
    if (!confirm("¿Eliminar inversor y todos sus aportes?")) return;
    const { error } = await supabase.from("inversores").delete().eq("id", id);
    if (error) alert(error.message); else reload();
  };

  // ------ Aporte save ------
  const openNewAp = (inversor_id = "") => {
    const inv = inversores.find(i => i.id === inversor_id);
    const hoy = new Date().toISOString().slice(0,10);
    setFormAp({
      ...emptyAp,
      inversor_id,
      fecha: hoy,
      fecha_inicio_calculo: hoy,
      moneda: "USD",
    });
    setEditApId(null); setErrAp(null); setOpenAp(true);
  };
  const openEditAp = (a) => {
    setFormAp({
      inversor_id: a.inversor_id,
      fecha: a.fecha,
      fecha_inicio_calculo: a.fecha_inicio_calculo ?? a.fecha,
      monto: a.monto ?? "",
      moneda: a.moneda,
      observacion: a.observacion ?? "",
      entra_a_caja: a.entra_a_caja ?? true,
      titular: a.titular ?? "",
    });
    setEditApId(a.id); setErrAp(null); setOpenAp(true);
  };
  const saveAp = async () => {
    setErrAp(null);
    if (!formAp.inversor_id) { setErrAp("Elegí un inversor."); return; }
    if (!formAp.monto || Number(formAp.monto) <= 0) { setErrAp("El monto es obligatorio."); return; }
    const payload = {
      proyecto_id: proyecto.id,
      inversor_id: formAp.inversor_id,
      fecha: formAp.fecha,
      fecha_inicio_calculo: formAp.fecha_inicio_calculo || formAp.fecha,
      // Campos legacy NOT NULL: valores neutros
      cantidad_m2: 0,
      tipo_venta: "pozo",
      costo_m2: 0,
      monto: Number(formAp.monto || 0),
      moneda: formAp.moneda,
      observacion: formAp.observacion || null,
      entra_a_caja: formAp.entra_a_caja !== false,
      titular: formAp.titular || null,
    };
    const res = editApId
      ? await supabase.from("aportes").update(payload).eq("id", editApId)
      : await supabase.from("aportes").insert(payload);
    if (res.error) { setErrAp(res.error.message); return; }
    setOpenAp(false); reload();
  };
  const deleteAp = async (id) => {
    if (!confirm("¿Eliminar aporte?")) return;
    const { error } = await supabase.from("aportes").delete().eq("id", id);
    if (error) alert(error.message); else reload();
  };

  // ---- Cálculo de ponderación (nuevo modelo)
  const calc = useMemo(
    () => computePonderacion({ proyecto, aportes, inversores, fechaCorteOverride: fechaVentaOverride || undefined, fechaFaltanteOverride: fechaVentaSim || undefined }),
    [proyecto, aportes, inversores, fechaVentaOverride, fechaVentaSim]
  );
  // Reales + faltante (este último al final). Si no hay faltante, no se incluye.
  const resumen   = calc.faltante.aportesUSD > 0
    ? [...calc.porInversor, calc.faltante]
    : calc.porInversor;
  const aportesC  = calc.aportes;
  const totProy   = {
    aportesUSD: calc.totalAportadoUSD,
    pctRecaudado: calc.pctRecaudado,
    ponderado:  calc.totalPonderado,
    ganancia:   calc.gananciaTotal,
    venta:      calc.venta,
    costo:      calc.costo,
    fechaCorte: calc.fechaCorte,
    diasProyecto: calc.diasProyecto,
  };
  // Rendimiento anualizado del proyecto (fórmula simple)
  // anual = (ganancia / costo) × 365 / días
  const roiProy = totProy.costo > 0 ? (totProy.ganancia / totProy.costo) * 100 : 0;
  const anualProy = anualizada(roiProy, totProy.diasProyecto);
  const costoM2Estim = proyecto?.m2_totales > 0 && proyecto?.costo_total_estimado > 0
    ? Number(proyecto.costo_total_estimado) / Number(proyecto.m2_totales)
    : 0;
  const ventaM2Estim = proyecto?.m2_totales > 0 && proyecto?.precio_venta_estimado > 0
    ? Number(proyecto.precio_venta_estimado) / Number(proyecto.m2_totales)
    : 0;

  const invName = (id) => inversores.find(i => i.id === id)?.nombre ?? "—";

  const exportarExcel = () => {
    const numAR = (v) => Number(v || 0).toLocaleString("es-AR", { useGrouping: false, maximumFractionDigits: 2 });
    const t = resumen.reduce((acc, r) => {
      acc.aportesUSD += Number(r.aportesUSD || 0);
      acc.ponderado += Number(r.ponderado || 0);
      acc.participacion += Number(r.participacion || 0);
      acc.ganancia += Number(r.ganancia || 0);
      acc.totalDevolver += Number(totProy.ganancia > 0 ? r.totalDevolver : r.aportesUSD) || 0;
      return acc;
    }, { aportesUSD: 0, ponderado: 0, participacion: 0, ganancia: 0, totalDevolver: 0 });
    const head = ["Inversor", "Aporte (USD)", "Ponderado", "% Participación", "Ganancia estim. (USD)", "% Ganancia", "Total a devolver (USD)"];
    const rows = resumen.map((r) => [
      r.nombre + (r.es_faltante ? " (virtual)" : ""),
      numAR(r.aportesUSD), numAR(r.ponderado), numAR(r.participacion),
      totProy.ganancia > 0 ? numAR(r.ganancia) : "",
      totProy.ganancia > 0 && r.aportesUSD > 0 ? numAR(r.gananciaPct) : "",
      numAR(totProy.ganancia > 0 ? r.totalDevolver : r.aportesUSD),
    ]);
    rows.push(["Totales", numAR(t.aportesUSD), numAR(t.ponderado), numAR(t.participacion),
      totProy.ganancia > 0 ? numAR(t.ganancia) : "", "", numAR(t.totalDevolver)]);
    const cell = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const csv = [head, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Inversores_${(proyecto.nombre || "proyecto").replace(/[^\w.\-]/g, "_")}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportarPdf = () => {
    const filas = resumen.map((r) => `<tr>
        <td>${esc(r.nombre)}${r.es_faltante ? ' <span class="tag">virtual</span>' : ""}</td>
        <td style="text-align:right">${esc(fmtMoney(r.aportesUSD, "USD"))}</td>
        <td style="text-align:right">${esc(fmtNum(r.ponderado, 0))}</td>
        <td style="text-align:right">${esc(fmtPct(r.participacion))}</td>
        <td style="text-align:right">${totProy.ganancia > 0 ? esc(fmtMoney(r.ganancia, "USD")) : "—"}</td>
        <td style="text-align:right">${totProy.ganancia > 0 && r.aportesUSD > 0 ? esc(fmtPct(r.gananciaPct)) : "—"}</td>
        <td style="text-align:right">${esc(fmtMoney(totProy.ganancia > 0 ? r.totalDevolver : r.aportesUSD, "USD"))}</td>
      </tr>`).join("");
    const t = resumen.reduce((acc, r) => {
      acc.aportesUSD += Number(r.aportesUSD || 0);
      acc.ponderado += Number(r.ponderado || 0);
      acc.participacion += Number(r.participacion || 0);
      acc.ganancia += Number(r.ganancia || 0);
      acc.totalDevolver += Number(totProy.ganancia > 0 ? r.totalDevolver : r.aportesUSD) || 0;
      return acc;
    }, { aportesUSD: 0, ponderado: 0, participacion: 0, ganancia: 0, totalDevolver: 0 });
    const totalRow = `<tr style="font-weight:700;border-top:2px solid #cdd5e0">
        <td>Totales</td>
        <td style="text-align:right">${esc(fmtMoney(t.aportesUSD, "USD"))}</td>
        <td style="text-align:right">${esc(fmtNum(t.ponderado, 0))}</td>
        <td style="text-align:right">${esc(fmtPct(t.participacion))}</td>
        <td style="text-align:right">${totProy.ganancia > 0 ? esc(fmtMoney(t.ganancia, "USD")) : "—"}</td>
        <td></td>
        <td style="text-align:right">${esc(fmtMoney(t.totalDevolver, "USD"))}</td>
      </tr>`;
    const resumenKpi = `<h2>Resumen del proyecto</h2>
      <table><tbody>
        <tr><td>Venta estimada</td><td style="text-align:right">${esc(fmtMoney(totProy.venta, "USD"))}</td></tr>
        <tr><td>Costo estimado</td><td style="text-align:right">${esc(fmtMoney(totProy.costo, "USD"))}</td></tr>
        <tr><td>Ganancia estimada</td><td style="text-align:right">${esc(fmtMoney(totProy.ganancia, "USD"))}</td></tr>
        <tr><td>Recaudado</td><td style="text-align:right">${esc(fmtPct(totProy.pctRecaudado, 1))}</td></tr>
      </tbody></table>`;
    const tabla = `<h2>Inversores</h2>
      <table><thead><tr>
        <th>Inversor</th><th>Aporte (USD)</th><th>Ponderado</th><th>% partic.</th>
        <th>Ganancia estim.</th><th>% ganancia</th><th>Total a devolver</th>
      </tr></thead><tbody>${filas}${totalRow}</tbody></table>`;
    printDocument({
      title: "Inversores",
      subtitle: `${esc(proyecto.nombre)} · ${fmtDate(new Date().toISOString())}`,
      bodyHtml: resumenKpi + tabla,
    });
  };

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        spacing={1.5}
      >
        <Box>
          <Typography variant="h5">Inversores</Typography>
          <Typography variant="body2">Aportes, participación y composición del proyecto.</Typography>
        </Box>
        <Stack
          direction="row" spacing={1} useFlexGap flexWrap="wrap"
          sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}
        >
          <Button
            sx={{ flex: { xs: 1, sm: "initial" } }}
            startIcon={<PictureAsPdfIcon />} variant="outlined" onClick={exportarPdf}>
            PDF
          </Button>
          <Button
            sx={{ flex: { xs: 1, sm: "initial" } }}
            startIcon={<TableViewIcon />} variant="outlined" color="success" onClick={exportarExcel}>
            Excel
          </Button>
          <Button
            sx={{ flex: { xs: 1, sm: "initial" } }}
            startIcon={<AddIcon />} variant="outlined" onClick={openNewInv}>
            Nuevo inversor
          </Button>
          <Button
            sx={{ flex: { xs: 1, sm: "initial" } }}
            startIcon={<PaidIcon />} variant="contained" color="secondary"
            disabled={inversores.length === 0} onClick={() => openNewAp("")}>
            Registrar aporte
          </Button>
        </Stack>
      </Stack>

      {loading && <LinearProgress />}

      <Box>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
          <Tab label="Resumen" />
          <Tab label="Inversores" />
          <Tab label="Aportes" />
          <Tab label="Composición" />
          <Tab label="What if" />
        </Tabs>
        <Divider />
      </Box>

      {tab === 0 && (
        <Card>
          <CardContent>
            {/* Simulador de fechas (entrega y venta) en una línea */}
            <Box sx={{
              mb: 2, p: 1.5, borderRadius: 2,
              border: "1px dashed", borderColor: "divider",
              bgcolor: "rgba(15,42,74,0.025)",
            }}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "flex-start" }} divider={<Divider orientation="vertical" flexItem sx={{ display: { xs: "none", md: "block" } }} />}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" gutterBottom>Simular fecha de entrega</Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TextField
                      type="date" label="Fecha entrega (sim.)" size="small"
                      InputLabelProps={{ shrink: true }}
                      sx={{ flexGrow: 1 }}
                      value={fechaVentaOverride}
                      onChange={(e) => setFechaVentaOverride(e.target.value)}
                    />
                    <Button
                      size="small" variant="outlined"
                      disabled={!proyecto.fecha_fin || fechaVentaOverride === proyecto.fecha_fin}
                      onClick={() => setFechaVentaOverride(proyecto.fecha_fin || "")}
                    >
                      Restablecer
                    </Button>
                  </Stack>
                  {proyecto.fecha_fin && fechaVentaOverride && fechaVentaOverride !== proyecto.fecha_fin && (
                    <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, display: "block" }}>
                      Simulación activa. Original: {fmtDate(proyecto.fecha_fin)}.
                    </Typography>
                  )}
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" gutterBottom>Simular fecha de venta</Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TextField
                      type="date" label="Fecha venta (sim.)" size="small"
                      InputLabelProps={{ shrink: true }}
                      sx={{ flexGrow: 1 }}
                      value={fechaVentaSim}
                      onChange={(e) => setFechaVentaSim(e.target.value)}
                    />
                    <Button
                      size="small" variant="outlined"
                      disabled={fechaVentaSim === (proyecto.fecha_inversor_faltante || "")}
                      onClick={() => setFechaVentaSim(proyecto.fecha_inversor_faltante || "")}
                    >
                      Restablecer
                    </Button>
                  </Stack>
                  {proyecto.fecha_inversor_faltante && fechaVentaSim && fechaVentaSim !== proyecto.fecha_inversor_faltante && (
                    <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, display: "block" }}>
                      Simulación activa. Original: {fmtDate(proyecto.fecha_inversor_faltante)}.
                    </Typography>
                  )}
                </Box>
              </Stack>
            </Box>

            <Grid container spacing={2}>
              <KPI title="Venta estimada"  value={fmtMoney(totProy.venta, "USD")} hint={`Precio m² ${fmtMoney(ventaM2Estim, "USD")}`} />
              <KPI title="Costo estimado"  value={fmtMoney(totProy.costo, "USD")} hint={`Costo m² ${fmtMoney(costoM2Estim, "USD")}`} />
              <KPI title="Ganancia estim." value={fmtMoney(totProy.ganancia, "USD")} hint={anualProy != null ? `Anualizado ${fmtPct(anualProy, 2)}` : " "} />
              <KPI title="Recaudado"       value={fmtPct(totProy.pctRecaudado, 1)} hint={`${fmtMoney(totProy.aportesUSD, "USD")} de ${fmtMoney(totProy.costo, "USD")}`} />
            </Grid>
            <Box sx={{ mt: 2, height: 10, bgcolor: "rgba(15,42,74,0.08)", borderRadius: 5, overflow: "hidden" }}>
              <Box sx={{ height: "100%", width: `${Math.min(100, totProy.pctRecaudado)}%`, bgcolor: "success.main", transition: "width .4s" }} />
            </Box>
            <Divider sx={{ my: 3 }} />
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 40 }} />
                    <SortHeader col="nombre"         label="Inversor"          orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                    <SortHeader col="aportesUSD"     label="Aporte (USD)"      align="right" orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                    <SortHeader col="ponderado"      label="Ponderado"         align="right" orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                    <SortHeader col="participacion"  label="% participación"   align="right" orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                    <SortHeader col="ganancia"       label="Ganancia estim."   align="right" orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                    <SortHeader col="gananciaPct"    label="% ganancia"        align="right" orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                    <SortHeader col="totalDevolver"  label="Total a devolver"  align="right" orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(() => {
                    const cmp = (a, b) => {
                      if (a.es_faltante && !b.es_faltante) return 1;
                      if (b.es_faltante && !a.es_faltante) return -1;
                      const av = a[orderBy], bv = b[orderBy];
                      if (typeof av === "string") {
                        return orderDir === "asc"
                          ? String(av || "").localeCompare(String(bv || ""))
                          : String(bv || "").localeCompare(String(av || ""));
                      }
                      return orderDir === "asc" ? Number(av || 0) - Number(bv || 0) : Number(bv || 0) - Number(av || 0);
                    };
                    return [...resumen].sort(cmp);
                  })().map(r => {
                    const isOpen = expandedInv.has(r.id);
                    return (
                    <React.Fragment key={r.id}>
                      <TableRow
                        hover
                        onClick={() => toggleExpand(r.id)}
                        sx={{
                          cursor: "pointer",
                          "& > td": { borderBottom: isOpen ? "none" : undefined },
                          ...(r.es_faltante ? { bgcolor: "rgba(15,42,74,0.04)" } : {}),
                        }}
                      >
                        <TableCell sx={{ width: 40, pr: 0 }}>
                          <IconButton size="small" sx={{ pointerEvents: "none" }}>
                            {isOpen ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
                          </IconButton>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <Box>
                              <Typography fontWeight={600} sx={{ fontStyle: r.es_faltante ? "italic" : "normal" }}>
                                {r.nombre}
                              </Typography>
                              {r.contacto && <Typography variant="caption" color="text.secondary">{r.contacto}</Typography>}
                              {r.es_faltante && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  desde {fmtDate(r.fechaInicio)}
                                </Typography>
                              )}
                            </Box>
                            {r.es_faltante && <Chip size="small" label="virtual" variant="outlined" />}
                          </Stack>
                        </TableCell>
                        <TableCell align="right">{fmtMoney(r.aportesUSD, "USD")}</TableCell>
                        <TableCell align="right">{fmtNum(r.ponderado, 0)}</TableCell>
                        <TableCell align="right">{fmtPct(r.participacion)}</TableCell>
                        <TableCell align="right">{totProy.ganancia > 0 ? fmtMoney(r.ganancia, "USD") : "—"}</TableCell>
                        <TableCell align="right">{totProy.ganancia > 0 && r.aportesUSD > 0 ? fmtPct(r.gananciaPct) : "—"}</TableCell>
                        <TableCell align="right">
                          <Typography fontWeight={700}>
                            {totProy.ganancia > 0 ? fmtMoney(r.totalDevolver, "USD") : fmtMoney(r.aportesUSD, "USD")}
                          </Typography>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow sx={{ height: "auto !important", "&:hover": { bgcolor: "transparent" }, "& > td": { p: 0, border: 0 } }}>
                          <TableCell colSpan={8}>
                            <DetalleInversor r={r} aportesC={aportesC} totProy={totProy} />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                    );
                  })}
                  {resumen.length > 0 && (() => {
                    const t = resumen.reduce((acc, r) => {
                      acc.aportesUSD += Number(r.aportesUSD || 0);
                      acc.ponderado += Number(r.ponderado || 0);
                      acc.participacion += Number(r.participacion || 0);
                      acc.ganancia += Number(r.ganancia || 0);
                      acc.totalDevolver += Number(totProy.ganancia > 0 ? r.totalDevolver : r.aportesUSD) || 0;
                      return acc;
                    }, { aportesUSD: 0, ponderado: 0, participacion: 0, ganancia: 0, totalDevolver: 0 });
                    return (
                      <TableRow sx={{ "& > td": { borderTop: "2px solid", borderColor: "divider", fontWeight: 700 } }}>
                        <TableCell />
                        <TableCell><Typography fontWeight={700}>Totales</Typography></TableCell>
                        <TableCell align="right"><Typography fontWeight={700}>{fmtMoney(t.aportesUSD, "USD")}</Typography></TableCell>
                        <TableCell align="right"><Typography fontWeight={700}>{fmtNum(t.ponderado, 0)}</Typography></TableCell>
                        <TableCell align="right"><Typography fontWeight={700}>{fmtPct(t.participacion)}</Typography></TableCell>
                        <TableCell align="right"><Typography fontWeight={700}>{totProy.ganancia > 0 ? fmtMoney(t.ganancia, "USD") : "—"}</Typography></TableCell>
                        <TableCell align="right" />
                        <TableCell align="right"><Typography fontWeight={700}>{fmtMoney(t.totalDevolver, "USD")}</Typography></TableCell>
                      </TableRow>
                    );
                  })()}
                </TableBody>
              </Table>
            </Box>
          </CardContent>
        </Card>
      )}

      {tab === 1 && (
        <Card>
          <CardContent>
            {inversores.length === 0 ? (
              <Typography color="text.secondary">Aún no hay inversores cargados.</Typography>
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Nombre</TableCell>
                      <TableCell>Contacto</TableCell>
                      <TableCell align="right">N° aportes</TableCell>
                      <TableCell align="right">Acciones</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {resumen.filter(i => !i.es_faltante).map(i => (
                      <TableRow key={i.id} hover>
                        <TableCell>{i.nombre}</TableCell>
                        <TableCell>{i.contacto || "—"}</TableCell>
                        <TableCell align="right">{i.nAportes}</TableCell>
                        <TableCell align="right">
                          <Tooltip title="Nuevo aporte"><IconButton onClick={() => openNewAp(i.id)}><PaidIcon fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Editar"><IconButton onClick={() => openEditInv(i)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Eliminar"><IconButton onClick={() => deleteInv(i.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                        </TableCell>
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
          <CardContent>
            {aportes.length === 0 ? (
              <Typography color="text.secondary">Aún no se registraron aportes.</Typography>
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Fecha</TableCell>
                      <TableCell>Inicio cálc.</TableCell>
                      <TableCell>Inversor</TableCell>
                      <TableCell align="right">Monto</TableCell>
                      <TableCell align="right">Días</TableCell>
                      <TableCell align="right">Ponderado</TableCell>
                      <TableCell align="right">% partic.</TableCell>
                      <TableCell align="right">Ganancia</TableCell>
                      <TableCell align="right">Acciones</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {aportesC.map(a => (
                      <TableRow key={a.id} hover>
                        <TableCell sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtDate(a.fecha)}</TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtDate(a._fechaInicioCalculo)}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                            <span>{invName(a.inversor_id)}</span>
                            {a.entra_a_caja === false && (
                              <Chip size="small" label="no caja" variant="outlined" sx={{ borderStyle: "dashed" }} />
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell align="right">{fmtMoney(a.monto, "USD")}</TableCell>
                        <TableCell align="right">{fmtNum(a._dias, 0)}</TableCell>
                        <TableCell align="right">{fmtNum(a._ponderado, 0)}</TableCell>
                        <TableCell align="right">{fmtPct(a._participacion)}</TableCell>
                        <TableCell align="right">{totProy.ganancia > 0 ? fmtMoney(a._ganancia, "USD") : "—"}</TableCell>
                        <TableCell align="right">
                          <Tooltip title="Editar"><IconButton onClick={() => openEditAp(a)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Eliminar"><IconButton onClick={() => deleteAp(a.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 3 && (
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1 }}>
              <Typography variant="h6">Composición por ponderación</Typography>
              <Typography variant="caption" color="text.secondary">
                Corte: {fmtDate(totProy.fechaCorte)} · Monto × días en proyecto
              </Typography>
            </Stack>
            {(() => {
              const ordenado = resumen
                .filter(r => r.ponderado > 0)
                .slice()
                .sort((a, b) => b.ponderado - a.ponderado);
              if (ordenado.length === 0) {
                return <Typography color="text.secondary">Sin aportes ponderados todavía.</Typography>;
              }
              return (
              <Stack spacing={2.5}>
                <DonutChart
                  size={200}
                  centerValue={totProy.ganancia > 0 ? fmtMoney(totProy.ganancia, "USD") : fmtNum(totProy.ponderado, 0)}
                  centerLabel={totProy.ganancia > 0 ? "Ganancia estim." : "Ponderado total"}
                  segments={ordenado
                    .map((r, idx) => ({
                      label: r.nombre,
                      value: r.ponderado,
                      color: r.es_faltante ? "rgba(15,42,74,0.18)" : PALETTE[idx % PALETTE.length],
                    }))}
                />
                <Divider />
                {ordenado.map((r) => (
                  <Box key={r.id}>
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                      <Typography fontWeight={600} sx={{ fontStyle: r.es_faltante ? "italic" : "normal" }}>
                        {r.nombre}{r.es_faltante && " (virtual)"}
                      </Typography>
                      <Typography>
                        {fmtPct(r.participacion)}
                        {totProy.ganancia > 0 && <> · {fmtMoney(r.ganancia, "USD")}</>}
                      </Typography>
                    </Stack>
                    <Box sx={{ height: 10, bgcolor: "rgba(15,42,74,0.08)", borderRadius: 5, overflow: "hidden" }}>
                      <Box sx={{
                        height: "100%",
                        width: `${Math.min(100, r.participacion)}%`,
                        bgcolor: r.es_faltante ? "rgba(15,42,74,0.35)" : "secondary.main",
                      }} />
                    </Box>
                  </Box>
                ))}
              </Stack>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {tab === 4 && (
        <WhatIf proyecto={proyecto} aportes={aportes} inversores={inversores} />
      )}

      {/* Dialog inversor */}
      <Dialog open={openInv} onClose={() => setOpenInv(false)} fullWidth maxWidth="sm" fullScreen={fullScreen}>
        <DialogTitle>{editInvId ? "Editar inversor" : "Nuevo inversor"}</DialogTitle>
        <DialogContent dividers>
          {errInv && <Alert severity="error" sx={{ mb: 2 }}>{errInv}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={12}><TextField label="Nombre" fullWidth required value={formInv.nombre}
              onChange={e => setFormInv({ ...formInv, nombre: e.target.value })} /></Grid>
            <Grid item xs={12}><TextField label="Contacto" fullWidth value={formInv.contacto}
              onChange={e => setFormInv({ ...formInv, contacto: e.target.value })} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenInv(false)}>Cancelar</Button>
          <Button variant="contained" onClick={saveInv}>{editInvId ? "Guardar" : "Crear"}</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog aporte */}
      <Dialog open={openAp} onClose={() => setOpenAp(false)} fullWidth maxWidth="md" fullScreen={fullScreen}>
        <DialogTitle>{editApId ? "Editar aporte" : "Registrar aporte"}</DialogTitle>
        <DialogContent dividers>
          {errAp && <Alert severity="error" sx={{ mb: 2 }}>{errAp}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField select label="Inversor" fullWidth required value={formAp.inversor_id}
                onChange={e => setFormAp({ ...formAp, inversor_id: e.target.value })}>
                {inversores.map(i => <MenuItem key={i.id} value={i.id}>{i.nombre}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField label="Fecha (ingresa a caja)" type="date" fullWidth InputLabelProps={{ shrink: true }}
                value={formAp.fecha}
                onChange={e => {
                  const f = e.target.value;
                  // Si fecha_inicio_calculo seguía igual a la fecha previa, lo sincronizo
                  setFormAp(prev => ({
                    ...prev,
                    fecha: f,
                    fecha_inicio_calculo: (!prev.fecha_inicio_calculo || prev.fecha_inicio_calculo === prev.fecha) ? f : prev.fecha_inicio_calculo,
                  }));
                }} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField label="Inicio cálculo %" type="date" fullWidth InputLabelProps={{ shrink: true }}
                value={formAp.fecha_inicio_calculo}
                helperText="Desde cuándo cuenta para la ponderación"
                onChange={e => setFormAp({ ...formAp, fecha_inicio_calculo: e.target.value })} />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Monto (USD)"
                type="number"
                fullWidth
                value={formAp.monto}
                onChange={e => setFormAp({ ...formAp, monto: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <Box sx={{
                p: 1.5, borderRadius: 2,
                border: "1px solid", borderColor: "divider",
                bgcolor: "rgba(15,42,74,0.025)",
              }}>
                <Typography variant="caption" color="text.secondary">PREVIEW DE PONDERACIÓN</Typography>
                <Grid container spacing={2} sx={{ mt: 0 }}>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Fecha de corte</Typography>
                    <Typography fontWeight={600}>{proyecto.fecha_fin || "hoy"}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Días</Typography>
                    <Typography fontWeight={600}>
                      {(() => {
                        const start = formAp.fecha_inicio_calculo || formAp.fecha;
                        const cut = proyecto.fecha_fin || new Date().toISOString().slice(0,10);
                        if (!start) return "—";
                        const d = Math.max(0, Math.round((new Date(cut+"T00:00:00") - new Date(start+"T00:00:00"))/86400000));
                        return fmtNum(d, 0);
                      })()}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Ponderado</Typography>
                    <Typography fontWeight={600}>
                      {(() => {
                        const start = formAp.fecha_inicio_calculo || formAp.fecha;
                        const cut = proyecto.fecha_fin || new Date().toISOString().slice(0,10);
                        const monto = Number(formAp.monto || 0);
                        if (!start || !monto) return "—";
                        const d = Math.max(0, Math.round((new Date(cut+"T00:00:00") - new Date(start+"T00:00:00"))/86400000));
                        return fmtNum(monto * d, 0);
                      })()}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Sobre el total actual</Typography>
                    <Typography fontWeight={600}>
                      {(() => {
                        const start = formAp.fecha_inicio_calculo || formAp.fecha;
                        const cut = proyecto.fecha_fin || new Date().toISOString().slice(0,10);
                        const monto = Number(formAp.monto || 0);
                        if (!start || !monto) return "—";
                        const d = Math.max(0, Math.round((new Date(cut+"T00:00:00") - new Date(start+"T00:00:00"))/86400000));
                        const pond = monto * d;
                        const totalActual = aportesC
                          .filter(a => editApId ? a.id !== editApId : true)
                          .reduce((s,a) => s + a._ponderado, 0) + pond;
                        return totalActual > 0 ? fmtPct((pond/totalActual)*100) : "—";
                      })()}
                    </Typography>
                  </Grid>
                </Grid>
              </Box>
            </Grid>

            <Grid item xs={12}>
              <TextField label="Observación" fullWidth multiline minRows={2}
                value={formAp.observacion} onChange={e => setFormAp({ ...formAp, observacion: e.target.value })} />
            </Grid>

            <Grid item xs={12}>
              <Box sx={{
                p: 1.5, borderRadius: 2,
                border: "1px solid", borderColor: "divider",
                bgcolor: "rgba(15,42,74,0.025)",
              }}>
                <FormControlLabel
                  sx={{ alignItems: "flex-start", m: 0 }}
                  control={
                    <Switch
                      checked={formAp.entra_a_caja !== false}
                      onChange={(e) => setFormAp({ ...formAp, entra_a_caja: e.target.checked })}
                    />
                  }
                  label={
                    <Stack>
                      <Typography fontWeight={600}>
                        {formAp.entra_a_caja !== false ? "Aporte en efectivo (ingresa a caja)" : "Aporte sin ingreso de efectivo"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formAp.entra_a_caja !== false
                          ? "El monto entra al saldo USD de la caja en la fecha indicada."
                          : "Honorarios o servicios que se cobran al final con su % de ganancia. No impactan en caja, pero cuentan para el % recaudado y la ponderación."}
                      </Typography>
                    </Stack>
                  }
                />
              </Box>
            </Grid>

            {formAp.entra_a_caja !== false && (
              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                  Titular de la caja donde ingresa
                </Typography>
                <ToggleButtonGroup
                  exclusive size="small" color="primary"
                  value={formAp.titular}
                  onChange={(_, v) => setFormAp({ ...formAp, titular: v ?? "" })}
                >
                  {TITULARES.map(t => <ToggleButton key={t} value={t} sx={{ px: 2.5 }}>{t}</ToggleButton>)}
                </ToggleButtonGroup>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAp(false)}>Cancelar</Button>
          <Button variant="contained" onClick={saveAp}>{editApId ? "Guardar" : "Registrar"}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function KPI({ title, value, hint }) {
  return (
    <Grid item xs={6} sm={6} md={3} sx={{ display: "flex" }}>
      <Card variant="outlined" sx={{ width: "100%", display: "flex", flexDirection: "column" }}>
        <CardContent sx={{
          flexGrow: 1, display: "flex", flexDirection: "column",
          p: { xs: 1.2, sm: 2 }, "&:last-child": { pb: { xs: 1.2, sm: 2 } },
        }}>
          <Typography variant="caption" color="text.secondary"
            sx={{ textTransform: "uppercase", letterSpacing: 0.4, fontSize: { xs: 10, sm: 11 } }}>
            {title}
          </Typography>
          <Typography sx={{
            mt: 0.5, fontWeight: 700, fontVariantNumeric: "tabular-nums",
            fontSize: { xs: 15, sm: 22 }, lineHeight: 1.2, wordBreak: "break-word",
          }}>
            {value}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: "auto", minHeight: 16 }}>
            {hint || " "}
          </Typography>
        </CardContent>
      </Card>
    </Grid>
  );
}

function DetalleInversor({ r, aportesC, totProy }) {
  // Aportes reales del inversor; para Faltante, mostramos un único pseudo-aporte.
  const items = r.es_faltante
    ? [{
        id: "__faltante__",
        fecha: r.fechaInicio,
        _fechaInicioCalculo: r.fechaInicio,
        monto: r.aportesUSD,
        _dias: r.diasProm,
        _ponderado: r.ponderado,
        _participacion: r.participacion,
        _ganancia: r.ganancia,
        observacion: "Aporte virtual (capital aún no comprometido)",
        entra_a_caja: false,
      }]
    : aportesC.filter(a => a.inversor_id === r.id);

  return (
    <Box sx={{
      m: { xs: 1, sm: 2 },
      p: { xs: 1.5, sm: 2.5 },
      bgcolor: "rgba(15,42,74,0.045)",
      border: "1px solid rgba(15,42,74,0.10)",
      borderRadius: 2,
    }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "baseline" }}
        spacing={0.5}
        sx={{ mb: 1 }}
      >
        <Stack direction="row" alignItems="baseline" spacing={1}>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
            Detalle de aportes
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ({items.length} {items.length === 1 ? "aporte" : "aportes"})
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          <Chip
            size="small"
            variant="outlined"
            label={`Fecha de entrega: ${fmtDate(totProy.fechaCorte)}`}
            sx={{ fontSize: 11, fontWeight: 600, bgcolor: "background.paper" }}
          />
          {totProy.ganancia > 0 && (
            <Chip
              size="small"
              variant="outlined"
              color="success"
              label={`Ganancia proyecto: ${fmtMoney(totProy.ganancia, "USD")}`}
              sx={{ fontSize: 11, fontWeight: 700, bgcolor: "background.paper" }}
            />
          )}
        </Stack>
      </Stack>

      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">Sin aportes registrados.</Typography>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ "& thead .MuiTableCell-head": { bgcolor: "transparent" } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 110 }}>Ingreso</TableCell>
                <TableCell sx={{ width: 110 }}>Inicio cálc.</TableCell>
                <TableCell align="right">Monto</TableCell>
                <TableCell align="right">Días</TableCell>
                <TableCell align="right">Ponderado</TableCell>
                <TableCell align="right">% participación</TableCell>
                <TableCell align="right">Ganancia estim.</TableCell>
                <TableCell align="right">% ganancia</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((a, idx) => {
                const monto = Number(a.monto || 0);
                const pctGan = monto > 0 ? (Number(a._ganancia || 0) / monto) * 100 : 0;
                return (
                <TableRow key={a.id ?? idx}>
                  <TableCell sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtDate(a.fecha)}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtDate(a._fechaInicioCalculo)}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={0.75}>
                      {a.entra_a_caja === false && (
                        <Chip size="small" label="no caja" variant="outlined" sx={{ borderStyle: "dashed", height: 18, fontSize: 10 }} />
                      )}
                      <Typography component="span" fontWeight={600}>{fmtMoney(a.monto, "USD")}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{fmtNum(a._dias, 0)}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{fmtNum(a._ponderado, 0)}</TableCell>
                  <TableCell align="right">{fmtPct(a._participacion)}</TableCell>
                  <TableCell align="right">{totProy.ganancia > 0 ? fmtMoney(a._ganancia, "USD") : "—"}</TableCell>
                  <TableCell align="right">{totProy.ganancia > 0 && monto > 0 ? fmtPct(pctGan) : "—"}</TableCell>
                </TableRow>
                );
              })}
              {items.length > 1 && (
                <TableRow sx={{ bgcolor: "rgba(15,42,74,0.04)" }}>
                  <TableCell colSpan={2} sx={{ fontWeight: 700 }}>Totales</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtMoney(r.aportesUSD, "USD")}</TableCell>
                  <TableCell />
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtNum(r.ponderado, 0)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtPct(r.participacion)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {totProy.ganancia > 0 ? fmtMoney(r.ganancia, "USD") : "—"}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {totProy.ganancia > 0 && r.aportesUSD > 0 ? fmtPct(r.gananciaPct) : "—"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      )}

      {/* Frase resumen de cálculo */}
      <Box sx={{ mt: 1.5, px: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          Ponderación = Σ(monto × días). % participación = ponderado / total. Ganancia = % participación × ganancia del proyecto. Total a devolver = aporte + ganancia.
        </Typography>
        {totProy.ganancia > 0 && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
            Ganancia del proyecto utilizada para el cálculo: <Box component="span" fontWeight={700} sx={{ color: "success.main" }}>{fmtMoney(totProy.ganancia, "USD")}</Box>
            {" "}(= venta {fmtMoney(totProy.venta, "USD")} − costo {fmtMoney(totProy.costo, "USD")}).
          </Typography>
        )}
        {!r.es_faltante && (
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            <Box component="span" fontWeight={600}>{r.nombre}</Box> aporta <Box component="span" fontWeight={600}>{fmtMoney(r.aportesUSD, "USD")}</Box>,
            su ponderado es <Box component="span" fontWeight={600}>{fmtNum(r.ponderado, 0)}</Box> ({fmtPct(r.participacion)} del proyecto).
            {totProy.ganancia > 0 && (
              <> Le corresponderían <Box component="span" fontWeight={700} sx={{ color: "success.main" }}>{fmtMoney(r.ganancia, "USD")}</Box> de ganancia
              ({fmtPct(r.participacion)} × {fmtMoney(totProy.ganancia, "USD")}),
              total a devolver <Box component="span" fontWeight={700}>{fmtMoney(r.totalDevolver, "USD")}</Box>.</>
            )}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

// =====================================================================
// SOLAPA "What if" — simulador de venta / costo / % ganancia y fechas
// =====================================================================
function WhatIf({ proyecto, aportes, inversores }) {
  const baseVenta = Number(proyecto?.precio_venta_estimado || 0);
  const baseCosto = Number(proyecto?.costo_total_estimado || 0);
  const baseFEntrega = proyecto?.fecha_fin || "";
  const baseFVenta = proyecto?.fecha_inversor_faltante || proyecto?.fecha_fin || "";
  const basePctGan = baseCosto > 0 ? ((baseVenta - baseCosto) / baseCosto) * 100 : 0;

  const [venta, setVenta] = useState(baseVenta ? String(baseVenta) : "");
  const [costo, setCosto] = useState(baseCosto ? String(baseCosto) : "");
  const [pctStr, setPctStr] = useState("");
  const [fEntrega, setFEntrega] = useState(baseFEntrega);
  const [fVenta, setFVenta] = useState(baseFVenta);
  const [expanded, setExpanded] = useState(new Set());
  const toggle = (id) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [orderBy, setOrderBy] = useState("aportesUSD");
  const [orderDir, setOrderDir] = useState("desc");
  const handleSort = (col) => {
    if (orderBy === col) setOrderDir(d => d === "asc" ? "desc" : "asc");
    else { setOrderBy(col); setOrderDir("desc"); }
  };
  // Vista: gráfico de proyección (principal) o detalle de inversores.
  const [view, setView] = useState("grafico");
  // Tareas con costo estimado y fecha (del Diario), para la curva de gasto.
  const [tareasCosto, setTareasCosto] = useState([]);
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!proyecto) return;
      const { data: hs } = await supabase.from("hitos").select("id,nombre,orden").eq("proyecto_id", proyecto.id).order("orden");
      const ids = (hs ?? []).map(h => h.id);
      let ts = [];
      if (ids.length) {
        const { data } = await supabase.from("hito_tareas").select("*").in("hito_id", ids).order("orden");
        ts = data ?? [];
      }
      const { data: dr } = await supabase.from("seguimiento_diario").select("fecha,trabajado,etapa,tareas").eq("proyecto_id", proyecto.id);
      const conFechas = aplicarFechasReales(dr ?? [], ts, hs ?? []);
      if (vivo) setTareasCosto(conFechas.filter(t => t.fecha_inicio && estTotal(t) > 0).map(t => ({ fecha: String(t.fecha_inicio).slice(0, 10), total: estTotal(t) })));
    })();
    return () => { vivo = false; };
  }, [proyecto?.id]);

  const resetAll = () => {
    setVenta(baseVenta ? String(baseVenta) : "");
    setCosto(baseCosto ? String(baseCosto) : "");
    setPctStr("");
    setFEntrega(baseFEntrega);
    setFVenta(baseFVenta);
  };
  useEffect(() => { resetAll(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const ventaN = Number(venta || 0);
  const costoN = Number(costo || 0);
  const gananciaN = ventaN - costoN;
  const pctGan = costoN > 0 ? (gananciaN / costoN) * 100 : 0;

  // Editar % ganancia objetivo: mantiene el costo fijo y recalcula el precio de
  // venta, redondeado a un valor entero "prolijo" (múltiplo de 100).
  const aplicarPct = (g) => { const gg = Number(g || 0); if (costoN > 0) setVenta(String(Math.round(costoN * (1 + gg / 100) / 100) * 100)); };

  const sim = useMemo(
    () => computePonderacion({ proyecto, aportes, inversores, fechaCorteOverride: fEntrega || undefined, fechaFaltanteOverride: fVenta || undefined, ventaOverride: ventaN, costoOverride: costoN }),
    [proyecto, aportes, inversores, fEntrega, fVenta, ventaN, costoN]
  );
  const base = useMemo(
    () => computePonderacion({ proyecto, aportes, inversores }),
    [proyecto, aportes, inversores]
  );

  const resumen = sim.faltante.aportesUSD > 0 ? [...sim.porInversor, sim.faltante] : sim.porInversor;
  const totProy = {
    venta: sim.venta, costo: sim.costo, ganancia: sim.gananciaTotal,
    pctRecaudado: sim.pctRecaudado, fechaCorte: sim.fechaCorte, diasProyecto: sim.diasProyecto,
  };
  const roi = totProy.costo > 0 ? (totProy.ganancia / totProy.costo) * 100 : 0;
  const anual = anualizada(roi, totProy.diasProyecto);

  // Duración de la obra: desde el inicio del proyecto hasta la entrega simulada.
  const diasObra = (proyecto?.fecha_inicio && fEntrega)
    ? Math.max(0, Math.round((new Date(fEntrega + "T00:00:00") - new Date(proyecto.fecha_inicio + "T00:00:00")) / 86400000))
    : null;
  const mesesObra = diasObra != null ? diasObra / 30.44 : null;

  // Proyección mensual: cómo evolucionan venta, costo acumulado, ganancia y % anualizada
  // desde el inicio de obra hasta la entrega. El costo se acumula según el
  // cronograma por etapa (fechas del Diario), escalado al costo simulado; si no
  // hay cronograma cargado, se reparte lineal.
  const proyeccion = useMemo(() => {
    const inicio = proyecto?.fecha_inicio;
    if (!inicio || !fEntrega) return null;
    const pts = puntosMensuales(inicio, fEntrega);
    if (pts.length < 2) return null;
    const s = dISO(inicio);
    const totalDias = diasEntre(s, dISO(fEntrega)) || 1;
    const placed = [...tareasCosto].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    const planTotal = placed.reduce((x, t) => x + t.total, 0);
    const ratio = costoN > 0 ? ventaN / costoN : 0; // = 1 + %ganancia
    const rows = pts.map(d => {
      const raw = placed.reduce((x, t) => (dISO(t.fecha) <= d ? x + t.total : x), 0);
      const elapsed = diasEntre(s, d);
      const costoAcum = planTotal > 0 ? Math.min(costoN, (raw / planTotal) * costoN) : costoN * (elapsed / totalDias);
      const venta = costoAcum * ratio;
      const ganancia = venta - costoAcum;
      const roi = costoAcum > 0 ? (ganancia / costoAcum) * 100 : 0;
      return {
        label: `${MES_CORTO[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`,
        fecha: fmtDate(d.toISOString()),
        venta, costo: costoAcum, ganancia, anual: anualizada(roi, elapsed),
      };
    });
    return { rows, modo: planTotal > 0 ? "plan" : "lineal" };
  }, [proyecto?.fecha_inicio, fEntrega, ventaN, costoN, tareasCosto]);

  const delta = (v) => (v > 0 ? "+" : "") + fmtMoney(v, "USD");
  const hayCambio = ventaN !== baseVenta || costoN !== baseCosto
    || (fEntrega || "") !== baseFEntrega || (fVenta || "") !== baseFVenta;

  const t = resumen.reduce((acc, r) => {
    acc.aportesUSD += Number(r.aportesUSD || 0);
    acc.ponderado += Number(r.ponderado || 0);
    acc.participacion += Number(r.participacion || 0);
    acc.ganancia += Number(r.ganancia || 0);
    acc.totalDevolver += Number(totProy.ganancia > 0 ? r.totalDevolver : r.aportesUSD) || 0;
    return acc;
  }, { aportesUSD: 0, ponderado: 0, participacion: 0, ganancia: 0, totalDevolver: 0 });

  return (
    <Card>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" flexWrap="wrap" sx={{ mb: 1 }}>
          <Box>
            <Typography variant="h6">Simulador “What if”</Typography>
            <Typography variant="body2" color="text.secondary">
              Cambiá el precio de venta, el costo total, el % de ganancia o las fechas y mirá el impacto en el proyecto y en cada inversor.
            </Typography>
          </Box>
          <Button size="small" variant="outlined" disabled={!hayCambio} onClick={resetAll}>Restablecer</Button>
        </Stack>

        {/* Inputs de simulación */}
        <Box sx={{ p: 1.5, borderRadius: 2, border: "1px dashed", borderColor: "divider", bgcolor: "rgba(15,42,74,0.025)", mb: 2 }}>
          <Grid container spacing={2.5}>
            <Grid item xs={12} md={4}>
              <SliderVar
                label="Precio de venta (USD)" base={baseVenta} value={ventaN}
                onChange={(v) => { setVenta(String(v)); setPctStr(""); }}
                fmt={(v) => fmtMoney(v, "USD")}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <SliderVar
                label="Costo total (USD)" base={baseCosto} value={costoN}
                onChange={(v) => { setCosto(String(v)); setPctStr(""); }}
                fmt={(v) => fmtMoney(v, "USD")}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <SliderPct
                label="% ganancia (s/ costo)" base={basePctGan} value={pctGan}
                disabled={!(costoN > 0)}
                onChange={(p) => { setPctStr(String(p)); aplicarPct(p); }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField label="Fecha de entrega (sim.)" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }}
                value={fEntrega} onChange={(e) => setFEntrega(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField label="Fecha de venta (sim.)" type="date" size="small" fullWidth InputLabelProps={{ shrink: true }}
                value={fVenta} onChange={(e) => setFVenta(e.target.value)} />
            </Grid>
          </Grid>
        </Box>

        {/* KPIs simulados con delta vs actual */}
        <Grid container spacing={2}>
          <KPI title="Venta (sim.)" value={fmtMoney(totProy.venta, "USD")} hint={hayCambio ? `vs actual ${delta(totProy.venta - base.venta)}` : " "} />
          <KPI title="Costo (sim.)" value={fmtMoney(totProy.costo, "USD")} hint={hayCambio ? `vs actual ${delta(totProy.costo - base.costo)}` : " "} />
          <KPI title="Ganancia (sim.)" value={fmtMoney(totProy.ganancia, "USD")} hint={hayCambio ? `vs actual ${delta(totProy.ganancia - base.gananciaTotal)}` : (anual != null ? `Anualizado ${fmtPct(anual, 2)}` : " ")} />
          <KPI title="% ganancia (s/ costo)" value={fmtPct(roi, 1)} hint={anual != null ? `Anualizado ${fmtPct(anual, 2)}` : " "} />
          <KPI title="Meses de obra"
            value={mesesObra != null ? `${fmtNum(mesesObra, 1)} meses` : "—"}
            hint={diasObra != null ? `${fmtDate(proyecto.fecha_inicio)} → ${fmtDate(fEntrega)}` : "Cargá la fecha de inicio del proyecto"} />
        </Grid>

        <Divider sx={{ my: 3 }} />

        <Stack direction="row" justifyContent="center" sx={{ mb: 2 }}>
          <ToggleButtonGroup exclusive size="small" color="primary" value={view}
            onChange={(_, v) => { if (v) setView(v); }}>
            <ToggleButton value="grafico" sx={{ px: 2.5 }}>Gráfico</ToggleButton>
            <ToggleButton value="inversores" sx={{ px: 2.5 }}>Inversores</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        {view === "grafico" && (
          proyeccion
            ? <ProyeccionChart data={proyeccion.rows} modo={proyeccion.modo} />
            : <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
                Cargá la fecha de inicio del proyecto (y una fecha de entrega) para ver la proyección.
              </Typography>
        )}

        {view === "inversores" && (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 40 }} />
                <SortHeader col="nombre"        label="Inversor"         orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                <SortHeader col="aportesUSD"    label="Aporte (USD)"     align="right" orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                <SortHeader col="ponderado"     label="Ponderado"        align="right" orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                <SortHeader col="participacion" label="% participación"  align="right" orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                <SortHeader col="ganancia"      label="Ganancia estim."  align="right" orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                <SortHeader col="gananciaPct"   label="% ganancia"       align="right" orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                <SortHeader col="totalDevolver" label="Total a devolver" align="right" orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
              </TableRow>
            </TableHead>
            <TableBody>
              {[...resumen].sort((a, b) => {
                if (a.es_faltante && !b.es_faltante) return 1;
                if (b.es_faltante && !a.es_faltante) return -1;
                const av = a[orderBy], bv = b[orderBy];
                if (typeof av === "string") {
                  return orderDir === "asc"
                    ? String(av || "").localeCompare(String(bv || ""))
                    : String(bv || "").localeCompare(String(av || ""));
                }
                return orderDir === "asc" ? Number(av || 0) - Number(bv || 0) : Number(bv || 0) - Number(av || 0);
              }).map(r => {
                const isOpen = expanded.has(r.id);
                return (
                  <React.Fragment key={r.id}>
                    <TableRow hover onClick={() => toggle(r.id)}
                      sx={{ cursor: "pointer", "& > td": { borderBottom: isOpen ? "none" : undefined }, ...(r.es_faltante ? { bgcolor: "rgba(15,42,74,0.04)" } : {}) }}>
                      <TableCell sx={{ width: 40, pr: 0 }}>
                        <IconButton size="small" sx={{ pointerEvents: "none" }}>
                          {isOpen ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
                        </IconButton>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Typography fontWeight={600} sx={{ fontStyle: r.es_faltante ? "italic" : "normal" }}>{r.nombre}</Typography>
                          {r.es_faltante && <Chip size="small" label="virtual" variant="outlined" />}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">{fmtMoney(r.aportesUSD, "USD")}</TableCell>
                      <TableCell align="right">{fmtNum(r.ponderado, 0)}</TableCell>
                      <TableCell align="right">{fmtPct(r.participacion)}</TableCell>
                      <TableCell align="right">{totProy.ganancia > 0 ? fmtMoney(r.ganancia, "USD") : "—"}</TableCell>
                      <TableCell align="right">{totProy.ganancia > 0 && r.aportesUSD > 0 ? fmtPct(r.gananciaPct) : "—"}</TableCell>
                      <TableCell align="right"><Typography fontWeight={700}>{totProy.ganancia > 0 ? fmtMoney(r.totalDevolver, "USD") : fmtMoney(r.aportesUSD, "USD")}</Typography></TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow sx={{ height: "auto !important", "&:hover": { bgcolor: "transparent" }, "& > td": { p: 0, border: 0 } }}>
                        <TableCell colSpan={8}>
                          <DetalleInversor r={r} aportesC={sim.aportes} totProy={totProy} />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
              {resumen.length > 0 && (
                <TableRow sx={{ "& > td": { borderTop: "2px solid", borderColor: "divider", fontWeight: 700 } }}>
                  <TableCell />
                  <TableCell><Typography fontWeight={700}>Totales</Typography></TableCell>
                  <TableCell align="right"><Typography fontWeight={700}>{fmtMoney(t.aportesUSD, "USD")}</Typography></TableCell>
                  <TableCell align="right"><Typography fontWeight={700}>{fmtNum(t.ponderado, 0)}</Typography></TableCell>
                  <TableCell align="right"><Typography fontWeight={700}>{fmtPct(t.participacion)}</Typography></TableCell>
                  <TableCell align="right"><Typography fontWeight={700}>{totProy.ganancia > 0 ? fmtMoney(t.ganancia, "USD") : "—"}</Typography></TableCell>
                  <TableCell align="right" />
                  <TableCell align="right"><Typography fontWeight={700}>{fmtMoney(t.totalDevolver, "USD")}</Typography></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
        )}
      </CardContent>
    </Card>
  );
}

// Máximo "prolijo" para un eje (1/2/2.5/5 × 10^n).
function niceMax(v) {
  if (!(v > 0)) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const f = v / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * base;
}
const kUSD = (v) => {
  const a = Math.abs(v);
  if (a >= 1000000) return `${(v / 1000000).toFixed(a >= 10000000 ? 0 : 1)}M`;
  if (a >= 1000) return `${Math.round(v / 1000)}k`;
  return String(Math.round(v));
};

// Gráfico de proyección: líneas de Precio de venta, Costo acumulado, Ganancia
// (eje USD, izquierda) y % anualizada (eje %, derecha) a lo largo de la obra.
function ProyeccionChart({ data, modo }) {
  const theme = useTheme();
  const [hi, setHi] = useState(null);
  const svgRef = React.useRef(null);

  const W = 820, H = 360, padL = 60, padR = 58, padT = 18, padB = 44;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = data.length;

  const SERIES = [
    { key: "venta", label: "Precio de venta", color: "#1E8E3E", axis: "usd" },
    { key: "costo", label: "Costo acumulado", color: "#E07A1F", axis: "usd" },
    { key: "ganancia", label: "Ganancia", color: "#1E5AA8", axis: "usd" },
    { key: "anual", label: "% anualizada", color: "#7B61FF", axis: "pct", dash: true },
  ];

  const maxUSD = niceMax(Math.max(1, ...data.map(d => d.venta)));
  const maxPct = niceMax(Math.max(1, ...data.map(d => (d.anual != null ? d.anual : 0))));
  const xAt = (i) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yUSD = (v) => padT + plotH - (Math.max(0, v) / maxUSD) * plotH;
  const yPct = (v) => padT + plotH - (Math.max(0, v) / maxPct) * plotH;
  const yOf = (s, v) => (s.axis === "usd" ? yUSD(v) : yPct(v));

  const linePath = (s) => {
    let d = "", started = false;
    data.forEach((row, i) => {
      const v = row[s.key];
      if (v == null) return;
      const x = xAt(i), y = yOf(s, v);
      d += (started ? " L" : "M") + `${x.toFixed(1)},${y.toFixed(1)}`;
      started = true;
    });
    return d;
  };

  const onMove = (e) => {
    const el = svgRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((x - padL) / plotW) * (n - 1));
    setHi(Math.max(0, Math.min(n - 1, i)));
  };

  const ticks = 4;
  const axisColor = theme.palette.divider;
  const textColor = theme.palette.text.secondary;
  const labelStep = Math.max(1, Math.ceil(n / 9));

  return (
    <Box>
      {/* Leyenda */}
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap justifyContent="center" sx={{ mb: 1 }}>
        {SERIES.map(s => (
          <Stack key={s.key} direction="row" spacing={0.75} alignItems="center">
            <Box sx={{ width: 16, height: 0, borderTop: `3px ${s.dash ? "dashed" : "solid"} ${s.color}` }} />
            <Typography variant="caption" color="text.secondary">{s.label}</Typography>
          </Stack>
        ))}
      </Stack>

      <Box sx={{ width: "100%", overflowX: "auto" }}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 520, display: "block" }}
          onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
          {/* Grilla + eje USD (izq) */}
          {Array.from({ length: ticks + 1 }).map((_, i) => {
            const v = (maxUSD / ticks) * i, y = yUSD(v);
            return (
              <g key={`g${i}`}>
                <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={axisColor} strokeWidth="1" />
                <text x={padL - 8} y={y + 3} textAnchor="end" fontSize="10" fill={textColor}>US$ {kUSD(v)}</text>
              </g>
            );
          })}
          {/* Eje % (der) */}
          {Array.from({ length: ticks + 1 }).map((_, i) => {
            const v = (maxPct / ticks) * i, y = yPct(v);
            return <text key={`p${i}`} x={W - padR + 8} y={y + 3} textAnchor="start" fontSize="10" fill="#7B61FF">{Math.round(v)}%</text>;
          })}
          {/* Etiquetas X */}
          {data.map((row, i) => (i % labelStep === 0 || i === n - 1) && (
            <text key={`x${i}`} x={xAt(i)} y={H - padB + 16} textAnchor="middle" fontSize="10" fill={textColor}>{row.label}</text>
          ))}
          {/* Líneas */}
          {SERIES.map(s => (
            <path key={s.key} d={linePath(s)} fill="none" stroke={s.color} strokeWidth="2.5"
              strokeDasharray={s.dash ? "5 4" : "0"} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {/* Guía + puntos + tooltip en hover */}
          {hi != null && (() => {
            const row = data[hi]; const gx = xAt(hi);
            const lines = [
              { c: "#1E8E3E", t: `Venta ${fmtMoney(row.venta, "USD")}` },
              { c: "#E07A1F", t: `Costo ${fmtMoney(row.costo, "USD")}` },
              { c: "#1E5AA8", t: `Ganancia ${fmtMoney(row.ganancia, "USD")}` },
              { c: "#7B61FF", t: `Anualizada ${row.anual != null ? fmtPct(row.anual, 1) : "—"}` },
            ];
            const bw = 168, bh = 20 + lines.length * 15;
            const bx = Math.max(padL, Math.min(W - padR - bw, gx + 10));
            const by = padT + 4;
            return (
              <g>
                <line x1={gx} y1={padT} x2={gx} y2={padT + plotH} stroke={axisColor} strokeWidth="1" strokeDasharray="3 3" />
                {SERIES.map(s => row[s.key] != null && (
                  <circle key={s.key} cx={gx} cy={yOf(s, row[s.key])} r="3.5" fill="#fff" stroke={s.color} strokeWidth="2" />
                ))}
                <rect x={bx} y={by} width={bw} height={bh} rx="6" fill={theme.palette.background.paper} stroke={axisColor} />
                <text x={bx + 10} y={by + 15} fontSize="10.5" fontWeight="700" fill={theme.palette.text.primary}>{row.fecha}</text>
                {lines.map((l, k) => (
                  <g key={k}>
                    <rect x={bx + 10} y={by + 24 + k * 15} width="8" height="8" rx="2" fill={l.c} />
                    <text x={bx + 22} y={by + 31 + k * 15} fontSize="10.5" fill={theme.palette.text.secondary}>{l.t}</text>
                  </g>
                ))}
              </g>
            );
          })()}
        </svg>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, textAlign: "center" }}>
        Estimación: el costo se acumula {modo === "plan" ? "según el cronograma por etapa (fechas del Diario)" : "de forma lineal (sin cronograma cargado)"}, y el precio de venta mantiene el % de ganancia definido. La anualizada baja a medida que se alarga el plazo.
      </Typography>
    </Box>
  );
}

// Paso "prolijo" (entero, redondo) según la magnitud del valor base.
function niceStepMoney(base) {
  const b = Math.abs(base);
  if (b >= 100000) return 1000;
  if (b >= 20000) return 500;
  if (b >= 5000) return 100;
  if (b >= 500) return 10;
  return 1;
}

// Slider de un valor de dinero centrado en el valor actual (base). El centro es
// el valor actual; a la derecha suma y a la izquierda resta, en pasos enteros
// redondos. El resultado siempre es un entero múltiplo del paso.
function SliderVar({ label, base, value, onChange, fmt }) {
  const disabled = !(base > 0);
  const step = niceStepMoney(base || 0);
  const N = Math.max(20, Math.round((base * 0.5) / step)); // rango ±50%
  const k = disabled ? 0 : Math.max(-N, Math.min(N, Math.round((value - base) / step)));
  const deltaPct = base > 0 ? ((value - base) / base) * 100 : 0;
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>
        {fmt(value)}
      </Typography>
      <Slider
        size="small" disabled={disabled}
        min={-N} max={N} step={1} value={k}
        onChange={(_, kk) => onChange(base + kk * step)}
        marks={[{ value: 0 }]}
        sx={{ mt: 0.5 }}
      />
      <Typography variant="caption" color="text.secondary">
        Actual: {fmt(base)}
        {k !== 0
          ? ` · ${deltaPct > 0 ? "+" : ""}${fmtNum(deltaPct, 1)}% · ${value - base > 0 ? "+" : "-"}${fmt(Math.abs(value - base))}`
          : " (centro)"}
      </Typography>
    </Box>
  );
}

// Slider de % ganancia centrado en el % actual (base), en puntos enteros.
function SliderPct({ label, base, value, onChange, disabled }) {
  const N = 30; // ±30 puntos alrededor del % actual
  const center = Math.round(base);
  const min = center - N, max = center + N;
  const v = disabled ? center : Math.max(min, Math.min(max, Math.round(value)));
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>
        {fmtPct(value, 1)}
      </Typography>
      <Slider
        size="small" disabled={disabled}
        min={min} max={max} step={1} value={v}
        onChange={(_, p) => onChange(p)}
        marks={[{ value: center }]}
        sx={{ mt: 0.5 }}
      />
      <Typography variant="caption" color="text.secondary">
        Actual: {fmtPct(base, 1)}{Math.round(value) !== center ? " · recalcula el precio de venta" : " (centro)"}
      </Typography>
    </Box>
  );
}

function SortHeader({ col, label, align = "left", orderBy, orderDir, onSort }) {
  const active = orderBy === col;
  return (
    <TableCell align={align} sortDirection={active ? orderDir : false}>
      <TableSortLabel
        active={active}
        direction={active ? orderDir : "asc"}
        onClick={() => onSort(col)}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}
