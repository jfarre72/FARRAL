"use client";
import {
  Card, CardContent, Stack, Typography, Button, Grid, Tabs, Tab, Alert,
  Table, TableBody, TableCell, TableHead, TableRow, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Box,
  Chip, Tooltip, Divider, LinearProgress, FormControlLabel, Switch,
  TableSortLabel, useMediaQuery
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import PaidIcon from "@mui/icons-material/Paid";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtMoney, fmtNum, fmtPct, fmtDate, anualizada } from "@/components/Money";
import { printDocument, esc } from "@/lib/printPdf";
import DonutChart from "@/components/DonutChart";
import { computePonderacion } from "@/lib/ponderacion";

// Paleta para segmentos de inversores en el gráfico
const PALETTE = ["#0F2A4A", "#E07A1F", "#1E8E3E", "#7B61FF", "#0EA5A4", "#C0392B", "#E0A21F", "#5C6470"];

const emptyInv  = { nombre: "", contacto: "", moneda_habitual: "USD" };
const emptyAp   = {
  inversor_id: "", fecha: new Date().toISOString().slice(0,10),
  fecha_inicio_calculo: "",
  monto: "",
  moneda: "USD", observacion: "",
  entra_a_caja: true,
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
          {anualProy != null && (
            <Chip
              color="success"
              variant="filled"
              label={`Rendimiento anualizado · ${fmtPct(anualProy, 2)}`}
              sx={{ fontWeight: 700, width: { xs: "100%", sm: "auto" } }}
            />
          )}
          <Button
            sx={{ flex: { xs: 1, sm: "initial" } }}
            startIcon={<PictureAsPdfIcon />} variant="outlined" onClick={exportarPdf}>
            PDF
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
        </Tabs>
        <Divider />
      </Box>

      {tab === 0 && (
        <Card>
          <CardContent>
            {/* Simulador de fecha de entrega */}
            <Box sx={{
              mb: 2, p: 1.5, borderRadius: 2,
              border: "1px dashed", borderColor: "divider",
              bgcolor: "rgba(15,42,74,0.025)",
            }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2">Simular fecha de entrega</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Reemplaza temporalmente la fecha de fin del proyecto para ver el impacto en ponderación, % participación, ganancia y rendimiento anualizado.
                  </Typography>
                </Box>
                <TextField
                  type="date" label="Fecha de entrega (simulada)"
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: { xs: "100%", sm: 220 } }}
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
                <Typography variant="caption" color="warning.main" sx={{ mt: 1, display: "block" }}>
                  Simulación activa. Fecha original del proyecto: {proyecto.fecha_fin}.
                </Typography>
              )}

              <Divider sx={{ my: 1.5 }} />

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2">Simular fecha de venta</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Desde cuándo el inversor &quot;Faltante&quot; aporta el capital. Puede ser anterior a la fecha de entrega.
                  </Typography>
                </Box>
                <TextField
                  type="date" label="Fecha de venta (simulada)"
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: { xs: "100%", sm: 220 } }}
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
                <Typography variant="caption" color="warning.main" sx={{ mt: 1, display: "block" }}>
                  Simulación activa. Fecha original del Faltante: {fmtDate(proyecto.fecha_inversor_faltante)}.
                </Typography>
              )}
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
                Corte: {totProy.fechaCorte} · Monto × días en proyecto
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
