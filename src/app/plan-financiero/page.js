"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, Grid, TextField, MenuItem,
  Button, IconButton, Tooltip, LinearProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, Table, TableHead, TableBody, TableRow, TableCell, Chip, Divider,
  useMediaQuery, FormControlLabel, Switch,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PaidIcon from "@mui/icons-material/Paid";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtMoney, fmtDate } from "@/components/Money";

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const num = (v) => Number(v || 0);
// Parseo tolerante de montos con separadores de miles ("1.800.000" / "1,800,000").
const parseMonto = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  let s = String(v).trim().replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  const hasComma = s.includes(","), hasDot = s.includes(".");
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    const p = s.split(","); s = p[p.length - 1].length === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot) {
    const p = s.split("."); if (p.length > 1 && p[p.length - 1].length === 3) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

// Lunes de la semana de una fecha ISO (para agrupar en semanas lun-dom).
const lunesDe = (iso) => {
  const d = new Date(iso + "T00:00:00");
  const dow = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - dow);
  return d;
};
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const DIAS_CORTO = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const diaCorto = (iso) => { const d = new Date(iso + "T00:00:00"); return DIAS_CORTO[(d.getDay() + 6) % 7]; };

const totalFila = (p) => parseMonto(p.mod) + parseMonto(p.maq) + parseMonto(p.mat_monto);

const emptyForm = () => ({
  fecha: hoyISO(), etapa: "", concepto: "", mod: "", maq: "",
  mat_detalle: "", mat_monto: "", pedir_presupuesto: false, pedir_materiales: false,
  estado: "previsto", notas: "",
});

export default function PlanFinancieroPage() {
  const { proyecto } = useProjects();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  const [hitos, setHitos] = useState([]);
  const [plan, setPlan] = useState([]);
  const [loading, setLoading] = useState(true);

  // Supuestos de tesorería (no se persisten: son para el cálculo del día).
  const [tc, setTc] = useState("");
  const [saldoARS, setSaldoARS] = useState("");
  const [saldoUSD, setSaldoUSD] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    if (!proyecto) return;
    setLoading(true);
    const [{ data: hs }, { data: ps }] = await Promise.all([
      supabase.from("hitos").select("id,nombre,orden,presupuesto").eq("proyecto_id", proyecto.id).order("orden"),
      supabase.from("plan_pagos").select("*").eq("proyecto_id", proyecto.id).order("fecha", { ascending: true }).order("orden", { ascending: true }),
    ]);
    setHitos(hs ?? []);
    setPlan(ps ?? []);
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const etapasNombres = hitos.map(h => h.nombre);

  // Agenda agrupada por semana (lun-dom), sólo pagos con fecha, en orden.
  const semanas = useMemo(() => {
    const conFecha = plan.filter(p => p.fecha).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
    const map = new Map();
    for (const p of conFecha) {
      const ini = lunesDe(p.fecha);
      const key = toISO(ini);
      if (!map.has(key)) map.set(key, { key, ini, fin: addDays(ini, 6), filas: [] });
      map.get(key).filas.push(p);
    }
    return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  }, [plan]);

  const sinFecha = useMemo(() => plan.filter(p => !p.fecha), [plan]);

  // Cálculo de USD a vender por semana: se cubre con el saldo ARS disponible
  // (primero las semanas más cercanas); el déficit se divide por el TC.
  const tcNum = parseMonto(tc);
  const calcSemanas = useMemo(() => {
    let saldoRest = parseMonto(saldoARS);
    return semanas.map(s => {
      const totalARS = s.filas.reduce((acc, p) => acc + totalFila(p), 0);
      const cubierto = Math.min(saldoRest, totalARS);
      saldoRest -= cubierto;
      const deficit = Math.max(0, totalARS - cubierto);
      const usdVender = tcNum > 0 ? deficit / tcNum : null;
      return { ...s, totalARS, deficit, usdVender };
    });
  }, [semanas, saldoARS, tcNum]);

  const usdVenderTotal = calcSemanas.reduce((s, w) => s + (w.usdVender || 0), 0);
  const saldoUSDNum = parseMonto(saldoUSD);
  const usdAlcanza = saldoUSDNum >= usdVenderTotal;

  // "Por hacer" (anticipación): pagos marcados para pedir presupuesto / materiales.
  const porHacer = useMemo(() => {
    const presup = [], mats = [];
    for (const p of plan) {
      if (p.pedir_presupuesto) presup.push(p);
      if (p.pedir_materiales) mats.push(p);
    }
    const byFecha = (a, b) => ((a.fecha || "9999") < (b.fecha || "9999") ? -1 : 1);
    return { presup: presup.sort(byFecha), mats: mats.sort(byFecha) };
  }, [plan]);

  // Comparación por etapa: suma de pagos previstos vs presupuesto objetivo.
  const compEtapas = useMemo(() => {
    const porEtapa = {};
    for (const p of plan) {
      const et = p.etapa || "(Sin etapa)";
      porEtapa[et] = (porEtapa[et] || 0) + totalFila(p);
    }
    const filas = hitos.map(h => ({
      nombre: h.nombre, id: h.id, objetivo: num(h.presupuesto),
      planificado: porEtapa[h.nombre] || 0,
    }));
    // Etapas que aparecen en el plan pero no están en hitos (o sin etapa).
    for (const et of Object.keys(porEtapa)) {
      if (!hitos.some(h => h.nombre === et)) {
        filas.push({ nombre: et, id: null, objetivo: 0, planificado: porEtapa[et] });
      }
    }
    return filas;
  }, [plan, hitos]);

  const totObjetivo = compEtapas.reduce((s, f) => s + f.objetivo, 0);
  const totPlanificado = compEtapas.reduce((s, f) => s + f.planificado, 0);

  // ---- Alta / edición de pagos previstos ----
  const openNew = () => { setForm({ ...emptyForm(), etapa: etapasNombres[0] || "" }); setEditId(null); setOpen(true); };
  const openEdit = (p) => {
    setForm({
      fecha: p.fecha || hoyISO(), etapa: p.etapa || "", concepto: p.concepto || "",
      mod: p.mod != null ? String(p.mod) : "", maq: p.maq != null ? String(p.maq) : "",
      mat_detalle: p.mat_detalle || "", mat_monto: p.mat_monto != null ? String(p.mat_monto) : "",
      pedir_presupuesto: !!p.pedir_presupuesto, pedir_materiales: !!p.pedir_materiales,
      estado: p.estado || "previsto", notas: p.notas || "",
    });
    setEditId(p.id); setOpen(true);
  };
  const save = async () => {
    if (!proyecto) return;
    setSaving(true);
    const datos = {
      fecha: form.fecha || null, etapa: form.etapa || null, concepto: (form.concepto || "").trim() || null,
      mod: parseMonto(form.mod), maq: parseMonto(form.maq),
      mat_detalle: (form.mat_detalle || "").trim() || null, mat_monto: parseMonto(form.mat_monto),
      pedir_presupuesto: !!form.pedir_presupuesto, pedir_materiales: !!form.pedir_materiales,
      estado: form.estado || "previsto", notas: (form.notas || "").trim() || null,
    };
    const { error } = editId
      ? await supabase.from("plan_pagos").update(datos).eq("id", editId)
      : await supabase.from("plan_pagos").insert({ proyecto_id: proyecto.id, ...datos });
    setSaving(false);
    if (error) { alert(error.message); return; }
    setOpen(false); reload();
  };
  const togglePagado = async (p) => {
    const nuevo = p.estado === "pagado" ? "previsto" : "pagado";
    setPlan(prev => prev.map(x => x.id === p.id ? { ...x, estado: nuevo } : x));
    const { error } = await supabase.from("plan_pagos").update({ estado: nuevo }).eq("id", p.id);
    if (error) { alert(error.message); reload(); }
  };
  const del = async (p) => {
    if (!confirm("¿Eliminar este pago previsto?")) return;
    const { error } = await supabase.from("plan_pagos").delete().eq("id", p.id);
    if (error) alert(error.message); else reload();
  };

  // Guarda el presupuesto objetivo de una etapa (columna hitos.presupuesto).
  const setObjetivo = async (hitoId, valor) => {
    const v = parseMonto(valor);
    setHitos(prev => prev.map(h => h.id === hitoId ? { ...h, presupuesto: v } : h));
    const { error } = await supabase.from("hitos").update({ presupuesto: v }).eq("id", hitoId);
    if (error) { alert(error.message); reload(); }
  };

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5">Plan financiero</Typography>
        <Typography variant="body2" color="text.secondary">
          Anticipá lo que viene: cuánto vas a necesitar por semana (mano de obra, máquina y materiales),
          cuántos USD tenés que vender, qué presupuestos y materiales pedir, y cómo vas contra el presupuesto de cada etapa.
        </Typography>
      </Box>

      {loading && <LinearProgress />}

      {/* Supuestos de tesorería + resumen de venta de USD */}
      <Card>
        <CardContent>
          <Grid container spacing={2} alignItems="flex-end">
            <Grid item xs={12} sm={3}>
              <TextField label="Dólar de venta (ARS/USD)" fullWidth size="small" inputProps={{ inputMode: "decimal" }}
                value={tc} onChange={(e) => setTc(e.target.value)} placeholder="1520" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField label="Saldo ARS disponible hoy" fullWidth size="small" inputProps={{ inputMode: "decimal" }}
                value={saldoARS} onChange={(e) => setSaldoARS(e.target.value)} placeholder="0" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField label="Saldo USD disponible hoy" fullWidth size="small" inputProps={{ inputMode: "decimal" }}
                value={saldoUSD} onChange={(e) => setSaldoUSD(e.target.value)} placeholder="0" />
            </Grid>
            <Grid item xs={12} sm={3}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5, display: "block" }}>
                USD a vender (todas las semanas)
              </Typography>
              <Stack direction="row" spacing={1} alignItems="baseline" sx={{ flexWrap: "wrap" }}>
                <Typography fontWeight={800} sx={{ color: "#0F2A4A", fontVariantNumeric: "tabular-nums" }}>
                  {tcNum > 0 ? fmtMoney(usdVenderTotal, "USD") : "—"}
                </Typography>
                {tcNum > 0 && saldoUSDNum > 0 && (
                  <Chip size="small" color={usdAlcanza ? "success" : "error"} variant="outlined"
                    label={usdAlcanza ? "Alcanza" : `Faltan ${fmtMoney(usdVenderTotal - saldoUSDNum, "USD")}`} />
                )}
              </Stack>
            </Grid>
          </Grid>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: "block" }}>
            El saldo ARS cubre primero las semanas más cercanas; lo que falta se divide por el dólar de venta para saber cuántos USD vender.
          </Typography>
        </CardContent>
      </Card>

      {/* Por hacer (anticipación) */}
      {(porHacer.presup.length > 0 || porHacer.mats.length > 0) && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card sx={{ height: "100%" }}><CardContent>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "#E07A1F" }}>
                Presupuestos a pedir
              </Typography>
              {porHacer.presup.length === 0
                ? <Typography variant="body2" color="text.secondary">Nada pendiente.</Typography>
                : porHacer.presup.map(p => (
                    <Stack key={p.id} direction="row" justifyContent="space-between" sx={{ py: 0.5, borderTop: "1px solid", borderColor: "divider" }}>
                      <Typography variant="body2">{p.concepto || p.etapa || "—"}{p.etapa && p.concepto ? ` · ${p.etapa}` : ""}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>{p.fecha ? fmtDate(p.fecha) : "sin fecha"}</Typography>
                    </Stack>
                  ))}
            </CardContent></Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card sx={{ height: "100%" }}><CardContent>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "#E07A1F" }}>
                Materiales a pedir
              </Typography>
              {porHacer.mats.length === 0
                ? <Typography variant="body2" color="text.secondary">Nada pendiente.</Typography>
                : porHacer.mats.map(p => (
                    <Box key={p.id} sx={{ py: 0.5, borderTop: "1px solid", borderColor: "divider" }}>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" fontWeight={600}>{p.etapa || p.concepto || "—"}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>{p.fecha ? fmtDate(p.fecha) : "sin fecha"}</Typography>
                      </Stack>
                      {p.mat_detalle && <Typography variant="caption" color="text.secondary">{p.mat_detalle}</Typography>}
                    </Box>
                  ))}
            </CardContent></Card>
          </Grid>
        </Grid>
      )}

      {/* Agenda de pagos previstos por semana */}
      <Card>
        <CardContent sx={{ p: { xs: 1, sm: 2 } }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5, px: { xs: 0.5, sm: 0 } }}>
            <Typography variant="subtitle1" fontWeight={700}>Agenda de pagos previstos</Typography>
            <Button variant="contained" color="secondary" size="small" startIcon={<AddIcon />} onClick={openNew}>
              Nuevo pago
            </Button>
          </Stack>

          {semanas.length === 0 && sinFecha.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
              Todavía no cargaste pagos previstos. Empezá con “Nuevo pago”.
            </Typography>
          )}

          <Box sx={{ overflowX: "auto" }}>
            {calcSemanas.map((s) => (
              <Box key={s.key} sx={{ mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center"
                  sx={{ bgcolor: "rgba(15,42,74,0.05)", px: 1.5, py: 0.75, borderRadius: 1, borderLeft: "4px solid #0F2A4A" }}>
                  <Typography variant="subtitle2" fontWeight={800}>
                    {fmtDate(toISO(s.ini))} – {fmtDate(toISO(s.fin))}
                  </Typography>
                  <Stack direction="row" spacing={2} alignItems="baseline" sx={{ flexWrap: "wrap" }} useFlexGap>
                    <Typography variant="body2">Total <b style={{ color: "#C0392B" }}>{fmtMoney(s.totalARS, "ARS")}</b></Typography>
                    <Typography variant="body2">
                      Vender <b style={{ color: "#0F2A4A" }}>{s.usdVender != null ? fmtMoney(s.usdVender, "USD") : "—"}</b>
                    </Typography>
                  </Stack>
                </Stack>
                <Table size="small" sx={{ mt: 0.5 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 120 }}>Fecha</TableCell>
                      <TableCell sx={{ width: 150 }}>Etapa</TableCell>
                      <TableCell>Tarea / concepto</TableCell>
                      <TableCell align="right">MOD</TableCell>
                      <TableCell align="right">MAQ</TableCell>
                      <TableCell align="right">MAT</TableCell>
                      <TableCell align="right">Total</TableCell>
                      <TableCell align="right" sx={{ width: 96 }}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {s.filas.map((p) => (
                      <TableRow key={p.id} hover sx={{ opacity: p.estado === "pagado" ? 0.55 : 1 }}>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>{diaCorto(p.fecha)} {fmtDate(p.fecha)}</TableCell>
                        <TableCell>{p.etapa ? <Chip size="small" variant="outlined" color="primary" label={p.etapa} /> : <Typography variant="body2" color="text.disabled">—</Typography>}</TableCell>
                        <TableCell>
                          {p.concepto || "—"}
                          {p.mat_detalle && <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Pedir: {p.mat_detalle}</Typography>}
                          <Stack direction="row" spacing={0.5} sx={{ mt: p.mat_detalle ? 0.25 : 0 }}>
                            {p.pedir_presupuesto && <Chip size="small" color="warning" variant="outlined" label="Pedir presup." sx={{ height: 18 }} />}
                            {p.pedir_materiales && <Chip size="small" color="warning" variant="outlined" label="Pedir mat." sx={{ height: 18 }} />}
                            {p.estado === "pagado" && <Chip size="small" color="success" label="Pagado" sx={{ height: 18 }} />}
                          </Stack>
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{num(p.mod) ? fmtMoney(p.mod, "ARS") : "—"}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{num(p.maq) ? fmtMoney(p.maq, "ARS") : "—"}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{num(p.mat_monto) ? fmtMoney(p.mat_monto, "ARS") : "—"}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(totalFila(p), "ARS")}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                          <Tooltip title={p.estado === "pagado" ? "Marcar como previsto" : "Marcar como pagado"}>
                            <IconButton size="small" color={p.estado === "pagado" ? "success" : "default"} onClick={() => togglePagado(p)}><PaidIcon fontSize="small" /></IconButton>
                          </Tooltip>
                          <IconButton size="small" onClick={() => openEdit(p)}><EditIcon fontSize="small" /></IconButton>
                          <IconButton size="small" onClick={() => del(p)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            ))}

            {sinFecha.length > 0 && (
              <Box sx={{ mb: 1 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ px: 1.5, py: 0.75 }}>Sin fecha asignada</Typography>
                <Table size="small">
                  <TableBody>
                    {sinFecha.map((p) => (
                      <TableRow key={p.id} hover>
                        <TableCell sx={{ width: 150 }}>{p.etapa ? <Chip size="small" variant="outlined" color="primary" label={p.etapa} /> : "—"}</TableCell>
                        <TableCell>{p.concepto || "—"}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(totalFila(p), "ARS")}</TableCell>
                        <TableCell align="right" sx={{ width: 96 }}>
                          <IconButton size="small" onClick={() => openEdit(p)}><EditIcon fontSize="small" /></IconButton>
                          <IconButton size="small" onClick={() => del(p)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Comparación por etapa: planificado vs presupuesto objetivo */}
      <Card>
        <CardContent sx={{ p: { xs: 1, sm: 2 } }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5, px: { xs: 0.5, sm: 0 } }}>Presupuesto por etapa</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: "block", px: { xs: 0.5, sm: 0 } }}>
            Cargá el presupuesto objetivo de cada etapa. La app suma lo que planificaste (MOD + MAQ + MAT) y te muestra si vas por debajo o por encima.
          </Typography>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Etapa</TableCell>
                  <TableCell align="right" sx={{ width: 190 }}>Presupuesto objetivo</TableCell>
                  <TableCell align="right">Planificado</TableCell>
                  <TableCell align="right">Diferencia</TableCell>
                  <TableCell sx={{ width: 130 }}>Estado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {compEtapas.map((f) => {
                  const dif = f.objetivo - f.planificado; // + = por debajo (te sobra), − = por encima
                  const tieneObj = f.objetivo > 0;
                  return (
                    <TableRow key={f.nombre} hover>
                      <TableCell>{f.nombre}</TableCell>
                      <TableCell align="right">
                        {f.id
                          ? <ObjetivoField value={f.objetivo} onCommit={(v) => setObjetivo(f.id, v)} />
                          : <Typography variant="body2" color="text.disabled">—</Typography>}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(f.planificado, "ARS")}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", fontWeight: 700,
                        color: !tieneObj ? "text.disabled" : dif < 0 ? "error.main" : "success.main" }}>
                        {tieneObj ? fmtMoney(dif, "ARS") : "—"}
                      </TableCell>
                      <TableCell>
                        {!tieneObj
                          ? <Typography variant="caption" color="text.disabled">Sin objetivo</Typography>
                          : dif < 0
                            ? <Chip size="small" color="error" variant="outlined" label="Por encima" />
                            : dif > 0
                              ? <Chip size="small" color="success" variant="outlined" label="Por debajo" />
                              : <Chip size="small" label="En objetivo" />}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {compEtapas.length > 0 && (
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800 }}>Total</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(totObjetivo, "ARS")}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(totPlanificado, "ARS")}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums",
                      color: totObjetivo === 0 ? "text.disabled" : (totObjetivo - totPlanificado) < 0 ? "error.main" : "success.main" }}>
                      {totObjetivo > 0 ? fmtMoney(totObjetivo - totPlanificado, "ARS") : "—"}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>

      {/* Dialog alta / edición */}
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" fullScreen={fullScreen}>
        <DialogTitle>{editId ? "Editar pago previsto" : "Nuevo pago previsto"}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={6}>
              <TextField type="date" label="Fecha prevista" InputLabelProps={{ shrink: true }} fullWidth size="small"
                value={form.fecha} onChange={(e) => setForm(f => ({ ...f, fecha: e.target.value }))} />
            </Grid>
            <Grid item xs={6}>
              <TextField select label="Etapa" fullWidth size="small"
                value={form.etapa} onChange={(e) => setForm(f => ({ ...f, etapa: e.target.value }))}>
                <MenuItem value="">(Sin etapa)</MenuItem>
                {etapasNombres.map(et => <MenuItem key={et} value={et}>{et}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField label="Tarea / concepto" fullWidth size="small"
                value={form.concepto} onChange={(e) => setForm(f => ({ ...f, concepto: e.target.value }))}
                placeholder="Ej: Cimentación pilotines + encadenado" />
            </Grid>
            <Grid item xs={6} sm={4}>
              <TextField label="MOD (mano de obra)" fullWidth size="small" inputProps={{ inputMode: "decimal" }}
                value={form.mod} onChange={(e) => setForm(f => ({ ...f, mod: e.target.value }))} />
            </Grid>
            <Grid item xs={6} sm={4}>
              <TextField label="MAQ (máquina/alquiler)" fullWidth size="small" inputProps={{ inputMode: "decimal" }}
                value={form.maq} onChange={(e) => setForm(f => ({ ...f, maq: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="MAT (estimado $)" fullWidth size="small" inputProps={{ inputMode: "decimal" }}
                value={form.mat_monto} onChange={(e) => setForm(f => ({ ...f, mat_monto: e.target.value }))} />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Materiales a pedir (detalle)" fullWidth size="small" multiline minRows={2}
                value={form.mat_detalle} onChange={(e) => setForm(f => ({ ...f, mat_detalle: e.target.value }))}
                placeholder="Ej: Hierro Ø8 y Ø10, estribos, arena, cemento, piedra 6-20" />
            </Grid>
            <Grid item xs={12}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <FormControlLabel control={<Switch size="small" checked={form.pedir_presupuesto} onChange={(e) => setForm(f => ({ ...f, pedir_presupuesto: e.target.checked }))} />} label="Pedir presupuesto" />
                <FormControlLabel control={<Switch size="small" checked={form.pedir_materiales} onChange={(e) => setForm(f => ({ ...f, pedir_materiales: e.target.checked }))} />} label="Pedir materiales" />
              </Stack>
            </Grid>
            <Grid item xs={12}>
              <TextField label="Notas (opcional)" fullWidth size="small"
                value={form.notas} onChange={(e) => setForm(f => ({ ...f, notas: e.target.value }))} />
            </Grid>
            <Grid item xs={12}>
              <Divider />
              <Typography variant="body2" sx={{ mt: 1 }}>
                Total del pago: <b style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMoney(parseMonto(form.mod) + parseMonto(form.maq) + parseMonto(form.mat_monto), "ARS")}</b>
              </Typography>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" color="secondary" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

// Campo del presupuesto objetivo de una etapa: guarda al salir (blur/Enter).
function ObjetivoField({ value, onCommit }) {
  const [local, setLocal] = useState(value ? String(value) : "");
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setLocal(value ? String(value) : ""); }, [value, focused]);
  return (
    <TextField
      size="small" variant="standard" inputProps={{ inputMode: "decimal", style: { textAlign: "right" } }}
      placeholder="—" value={local}
      onFocus={() => setFocused(true)}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { setFocused(false); onCommit(local); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      sx={{ width: 150 }}
    />
  );
}
