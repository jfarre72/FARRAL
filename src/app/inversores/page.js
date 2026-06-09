"use client";
import {
  Card, CardContent, Stack, Typography, Button, Grid, Tabs, Tab, Alert,
  Table, TableBody, TableCell, TableHead, TableRow, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Box,
  Chip, Tooltip, Divider, LinearProgress, useMediaQuery
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import PaidIcon from "@mui/icons-material/Paid";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtMoney, fmtNum, fmtPct } from "@/components/Money";
import DonutChart from "@/components/DonutChart";
import { computePonderacion } from "@/lib/ponderacion";

// Paleta para segmentos de inversores en el gráfico
const PALETTE = ["#0F2A4A", "#E07A1F", "#1E8E3E", "#7B61FF", "#0EA5A4", "#C0392B", "#E0A21F", "#5C6470"];

const emptyInv  = { nombre: "", contacto: "", moneda_habitual: "USD" };
const emptyAp   = {
  inversor_id: "", fecha: new Date().toISOString().slice(0,10),
  fecha_inicio_calculo: "",
  cantidad_m2: "", tipo_venta: "pozo", costo_m2: "", monto: "",
  moneda: "USD", precio_venta_final: "", observacion: ""
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
      moneda: inv?.moneda_habitual ?? "USD",
      costo_m2: proyecto?.costo_m2_pozo ? String(proyecto.costo_m2_pozo) : "",
      precio_venta_final: proyecto?.precio_venta_m2 ? String(proyecto.precio_venta_m2) : "",
    });
    setEditApId(null); setErrAp(null); setOpenAp(true);
  };
  const openEditAp = (a) => {
    setFormAp({
      inversor_id: a.inversor_id,
      fecha: a.fecha,
      fecha_inicio_calculo: a.fecha_inicio_calculo ?? a.fecha,
      cantidad_m2: a.cantidad_m2 ?? "",
      tipo_venta: a.tipo_venta,
      costo_m2: a.costo_m2 ?? "",
      monto: a.monto ?? "",
      moneda: a.moneda,
      precio_venta_final: a.precio_venta_final ?? "",
      observacion: a.observacion ?? "",
    });
    setEditApId(a.id); setErrAp(null); setOpenAp(true);
  };
  const saveAp = async () => {
    setErrAp(null);
    if (!formAp.inversor_id) { setErrAp("Elegí un inversor."); return; }
    if (!formAp.cantidad_m2) { setErrAp("La cantidad de m² es obligatoria."); return; }
    const payload = {
      proyecto_id: proyecto.id,
      inversor_id: formAp.inversor_id,
      fecha: formAp.fecha,
      fecha_inicio_calculo: formAp.fecha_inicio_calculo || formAp.fecha,
      cantidad_m2: Number(formAp.cantidad_m2 || 0),
      tipo_venta: formAp.tipo_venta,
      costo_m2: Number(formAp.costo_m2 || 0),
      monto: Number(formAp.monto || 0),
      moneda: formAp.moneda,
      precio_venta_final: formAp.precio_venta_final === "" ? null : Number(formAp.precio_venta_final),
      observacion: formAp.observacion || null,
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

  // ---- Cálculo monto sugerido al editar costo_m2 / cantidad_m2
  const montoSugerido = (() => {
    const c = Number(formAp.costo_m2 || 0);
    const m = Number(formAp.cantidad_m2 || 0);
    return c && m ? c * m : null;
  })();

  // ---- Cálculo de ponderación (nuevo modelo)
  const calc = useMemo(
    () => computePonderacion({ proyecto, aportes, inversores }),
    [proyecto, aportes, inversores]
  );
  const resumen   = calc.porInversor;
  const aportesC  = calc.aportes;
  const totProy   = {
    aportesUSD: resumen.reduce((s,r) => s + r.aportesUSD, 0),
    aportesARS: resumen.reduce((s,r) => s + r.aportesARS, 0),
    ponderado:  calc.totalPonderado,
    ganancia:   calc.gananciaTotal,
    venta:      calc.venta,
    costo:      calc.costo,
    fechaCorte: calc.fechaCorte,
  };
  const costoM2Estim = proyecto?.m2_totales > 0 && proyecto?.costo_total_estimado > 0
    ? Number(proyecto.costo_total_estimado) / Number(proyecto.m2_totales)
    : 0;

  const invName = (id) => inversores.find(i => i.id === id)?.nombre ?? "—";

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
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <Button startIcon={<AddIcon />} variant="outlined" onClick={openNewInv}>Nuevo inversor</Button>
          <Button startIcon={<PaidIcon />} variant="contained" color="secondary"
            disabled={inversores.length === 0} onClick={() => openNewAp("")}>
            Registrar aporte
          </Button>
        </Stack>
      </Stack>

      {loading && <LinearProgress />}

      <Box>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
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
            <Grid container spacing={3} alignItems="center">
              <Grid item xs={12} md={5}>
                <Typography variant="subtitle2" gutterBottom>Composición por ponderación</Typography>
                <DonutChart
                  size={180}
                  centerValue={resumen.filter(r => r.ponderado > 0).length}
                  centerLabel="inversores"
                  segments={
                    resumen.filter(r => r.ponderado > 0).length > 0
                      ? resumen
                          .filter(r => r.ponderado > 0)
                          .map((r, idx) => ({ label: r.nombre, value: r.ponderado, color: PALETTE[idx % PALETTE.length] }))
                      : [{ label: "Sin aportes", value: 1, color: "rgba(15,42,74,0.12)" }]
                  }
                />
              </Grid>
              <Grid item xs={12} md={7}>
                <Grid container spacing={2}>
                  <KPI title="Venta estimada"   value={fmtMoney(totProy.venta, "USD")} />
                  <KPI title="Costo estimado"   value={fmtMoney(totProy.costo, "USD")} />
                  <KPI title="Ganancia estim."  value={fmtMoney(totProy.ganancia, "USD")} hint={`Costo m² ${fmtMoney(costoM2Estim, "USD")}`} />
                  <KPI title="Total ponderado"  value={fmtNum(totProy.ponderado, 0)} hint={`Corte ${totProy.fechaCorte}`} />
                  <KPI title="Aportes USD"      value={fmtMoney(totProy.aportesUSD, "USD")} />
                  <KPI title="Aportes ARS"      value={fmtMoney(totProy.aportesARS, "ARS")} />
                </Grid>
              </Grid>
            </Grid>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Inversor</TableCell>
                    <TableCell align="right">Aportes USD</TableCell>
                    <TableCell align="right">Aportes ARS</TableCell>
                    <TableCell align="right">Ponderado</TableCell>
                    <TableCell align="right">% participación</TableCell>
                    <TableCell align="right">Ganancia estim.</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {resumen.map(r => (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <Stack>
                          <Typography fontWeight={600}>{r.nombre}</Typography>
                          <Typography variant="caption" color="text.secondary">{r.contacto}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell align="right">{fmtMoney(r.aportesUSD,"USD")}</TableCell>
                      <TableCell align="right">{fmtMoney(r.aportesARS,"ARS")}</TableCell>
                      <TableCell align="right">{fmtNum(r.ponderado, 0)}</TableCell>
                      <TableCell align="right">{fmtPct(r.participacion)}</TableCell>
                      <TableCell align="right">{totProy.ganancia > 0 ? fmtMoney(r.ganancia, "USD") : "—"}</TableCell>
                    </TableRow>
                  ))}
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
                      <TableCell>Moneda habitual</TableCell>
                      <TableCell align="right">N° aportes</TableCell>
                      <TableCell align="right">Acciones</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {resumen.map(i => (
                      <TableRow key={i.id} hover>
                        <TableCell>{i.nombre}</TableCell>
                        <TableCell>{i.contacto || "—"}</TableCell>
                        <TableCell><Chip size="small" label={i.moneda_habitual} /></TableCell>
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
                      <TableCell>Tipo</TableCell>
                      <TableCell align="right">m²</TableCell>
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
                        <TableCell sx={{ whiteSpace: "nowrap" }}>{a.fecha}</TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>{a._fechaInicioCalculo}</TableCell>
                        <TableCell>{invName(a.inversor_id)}</TableCell>
                        <TableCell>
                          <Chip size="small"
                            label={a.tipo_venta === "pozo" ? "Pozo" : "Avanzado"}
                            color={a.tipo_venta === "pozo" ? "secondary" : "primary"}
                            variant="outlined" />
                        </TableCell>
                        <TableCell align="right">{fmtNum(a.cantidad_m2)}</TableCell>
                        <TableCell align="right">{fmtMoney(a.monto, a.moneda)}</TableCell>
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
            {resumen.filter(r => r.ponderado > 0).length === 0 ? (
              <Typography color="text.secondary">Sin aportes ponderados todavía.</Typography>
            ) : (
              <Stack spacing={2.5}>
                <DonutChart
                  size={200}
                  centerValue={totProy.ganancia > 0 ? fmtMoney(totProy.ganancia, "USD") : fmtNum(totProy.ponderado, 0)}
                  centerLabel={totProy.ganancia > 0 ? "Ganancia estim." : "Ponderado total"}
                  segments={resumen
                    .filter(r => r.ponderado > 0)
                    .map((r, idx) => ({ label: r.nombre, value: r.ponderado, color: PALETTE[idx % PALETTE.length] }))}
                />
                <Divider />
                {resumen.filter(r => r.ponderado > 0).map((r) => (
                  <Box key={r.id}>
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                      <Typography fontWeight={600}>{r.nombre}</Typography>
                      <Typography>
                        {fmtPct(r.participacion)}
                        {totProy.ganancia > 0 && <> · {fmtMoney(r.ganancia, "USD")}</>}
                      </Typography>
                    </Stack>
                    <Box sx={{ height: 10, bgcolor: "rgba(15,42,74,0.08)", borderRadius: 5, overflow: "hidden" }}>
                      <Box sx={{
                        height: "100%",
                        width: `${Math.min(100, r.participacion)}%`,
                        bgcolor: "secondary.main",
                      }} />
                    </Box>
                  </Box>
                ))}
              </Stack>
            )}
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
            <Grid item xs={12} sm={6}>
              <TextField select label="Moneda habitual" fullWidth value={formInv.moneda_habitual}
                onChange={e => setFormInv({ ...formInv, moneda_habitual: e.target.value })}>
                <MenuItem value="USD">USD</MenuItem>
                <MenuItem value="ARS">ARS</MenuItem>
              </TextField>
            </Grid>
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
                onChange={e => {
                  const inv = inversores.find(i => i.id === e.target.value);
                  setFormAp({ ...formAp, inversor_id: e.target.value, moneda: inv?.moneda_habitual ?? formAp.moneda });
                }}>
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
            <Grid item xs={12} sm={3}>
              <TextField select label="Tipo de venta" fullWidth value={formAp.tipo_venta}
                onChange={e => setFormAp({ ...formAp, tipo_venta: e.target.value })}>
                <MenuItem value="pozo">Venta de pozo</MenuItem>
                <MenuItem value="avanzado">Venta avanzado</MenuItem>
              </TextField>
            </Grid>

            <Grid item xs={12} sm={3}>
              <TextField label="Cantidad m²" type="number" fullWidth value={formAp.cantidad_m2}
                onChange={e => setFormAp({ ...formAp, cantidad_m2: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField label="Costo m²" type="number" fullWidth value={formAp.costo_m2}
                onChange={e => setFormAp({ ...formAp, costo_m2: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                label="Monto"
                type="number"
                fullWidth
                value={formAp.monto}
                helperText={montoSugerido ? `Sugerido: ${fmtMoney(montoSugerido, formAp.moneda)}` : " "}
                onChange={e => setFormAp({ ...formAp, monto: e.target.value })}
                onFocus={() => {
                  if (formAp.monto === "" && montoSugerido) setFormAp(f => ({ ...f, monto: String(montoSugerido) }));
                }}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField select label="Moneda" fullWidth value={formAp.moneda}
                onChange={e => setFormAp({ ...formAp, moneda: e.target.value })}>
                <MenuItem value="USD">USD</MenuItem>
                <MenuItem value="ARS">ARS</MenuItem>
              </TextField>
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
    <Grid item xs={12} sm={6} md={3}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="caption" color="text.secondary">{title}</Typography>
          <Typography variant="h6" sx={{ mt: 0.5 }}>{value}</Typography>
          {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
        </CardContent>
      </Card>
    </Grid>
  );
}
