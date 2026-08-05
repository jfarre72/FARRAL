"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, Grid, TextField,
  LinearProgress, Table, TableHead, TableBody, TableRow, TableCell, Chip,
  Tooltip, Accordion, AccordionSummary, AccordionDetails, IconButton, Button,
  Tabs, Tab,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtMoney, fmtDate } from "@/components/Money";
import { aplicarFechasReales } from "@/lib/fechasReales";
import { saldosCaja } from "@/lib/caja";

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

const lunesDe = (iso) => {
  const d = new Date(iso + "T00:00:00");
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d;
};
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hoyISO = () => toISO(new Date());
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

const totalTarea = (t) => parseMonto(t.est_mod) + parseMonto(t.est_maq) + parseMonto(t.est_mat);

const ESTADO_CHIP = {
  planificado: { label: "Planificado", color: "info" },
  en_curso: { label: "En curso", color: "warning" },
  finalizado: { label: "Finalizado", color: "success" },
  no_iniciado: { label: "Sin planificar", color: "default" },
};

export default function CashflowPage() {
  const { proyecto, refresh } = useProjects();

  const [tab, setTab] = useState(0);
  const [hitos, setHitos] = useState([]);
  const [tareas, setTareas] = useState([]); // ya con fechas/estado del Diario
  const [saldos, setSaldos] = useState({ ars: 0, usd: 0 }); // saldos reales de Caja
  const [items, setItems] = useState([]);   // ítems de cashflow manual
  const [tcSem, setTcSem] = useState({});    // { semanaISO(lunes): tc }
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!proyecto) return;
    setLoading(true);
    const { data: hs } = await supabase
      .from("hitos").select("id,nombre,orden,valor_plan").eq("proyecto_id", proyecto.id).order("orden");
    const ids = (hs ?? []).map(h => h.id);
    let ts = [];
    if (ids.length) {
      const { data } = await supabase.from("hito_tareas").select("*").in("hito_id", ids).order("orden");
      ts = data ?? [];
    }
    const [{ data: dr }, { data: aportes }, { data: movs }, { data: its }, { data: tcs }] = await Promise.all([
      supabase.from("seguimiento_diario").select("fecha,trabajado,etapa,tareas").eq("proyecto_id", proyecto.id),
      supabase.from("aportes").select("monto,moneda,entra_a_caja").eq("proyecto_id", proyecto.id),
      supabase.from("movimientos_caja").select("*").eq("proyecto_id", proyecto.id),
      supabase.from("cashflow_items").select("*").eq("proyecto_id", proyecto.id).order("fecha"),
      supabase.from("cashflow_tc").select("semana,tc").eq("proyecto_id", proyecto.id),
    ]);
    setHitos(hs ?? []);
    setTareas(aplicarFechasReales(dr ?? [], ts, hs ?? []));
    setSaldos(saldosCaja(aportes ?? [], movs ?? []));
    setItems(its ?? []);
    setTcSem(Object.fromEntries((tcs ?? []).map(r => [String(r.semana).slice(0, 10), r.tc])));
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  // ---- Tab 1: estimación por tarea (guardado optimista) ----
  const setEst = async (tareaId, patch) => {
    setTareas(prev => prev.map(t => t.id === tareaId ? { ...t, ...patch } : t));
    const { error } = await supabase.from("hito_tareas").update(patch).eq("id", tareaId);
    if (error) { alert(error.message); reload(); }
  };

  // El dólar de venta de referencia (para comparar Real vs Objetivo por etapa)
  // sigue viviendo en el proyecto; se edita en la solapa Cashflow por semana,
  // pero acá usamos el valor guardado del proyecto como referencia general.
  const tcRef = parseMonto(proyecto?.dolar_venta);

  const porEtapa = useMemo(() => {
    return hitos.map(h => {
      const ts = tareas.filter(t => t.hito_id === h.id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
      const subtotal = ts.reduce((s, t) => s + totalTarea(t), 0);
      return { hito: h, tareas: ts, subtotal };
    });
  }, [hitos, tareas]);

  // ---- Tab 2: cashflow manual ----
  const addItem = async () => {
    if (!proyecto) return;
    const payload = { proyecto_id: proyecto.id, fecha: hoyISO(), concepto: "", monto: 0 };
    const { data, error } = await supabase.from("cashflow_items").insert(payload).select().single();
    if (error) { alert(error.message); return; }
    setItems(prev => [...prev, data]);
  };
  const updItem = async (id, patch) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
    const { error } = await supabase.from("cashflow_items").update(patch).eq("id", id);
    if (error) { alert(error.message); reload(); }
  };
  const delItem = async (id) => {
    setItems(prev => prev.filter(it => it.id !== id));
    const { error } = await supabase.from("cashflow_items").delete().eq("id", id);
    if (error) { alert(error.message); reload(); }
  };
  const setTcSemana = async (semanaISO, valor) => {
    const v = parseMonto(valor) || null;
    setTcSem(prev => ({ ...prev, [semanaISO]: v }));
    const { error } = await supabase.from("cashflow_tc")
      .upsert({ proyecto_id: proyecto.id, semana: semanaISO, tc: v }, { onConflict: "proyecto_id,semana" });
    if (error) { alert(error.message); reload(); return; }
    // Guardamos además el último TC como dólar de referencia del proyecto.
    if (v && v !== num(proyecto?.dolar_venta)) {
      await supabase.from("proyectos").update({ dolar_venta: v }).eq("id", proyecto.id);
      refresh?.();
    }
  };

  // Ítems agrupados por semana (lunes-domingo), con TC de la semana y USD a vender.
  const semanas = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      if (!it.fecha) continue;
      const ini = lunesDe(String(it.fecha).slice(0, 10));
      const key = toISO(ini);
      if (!map.has(key)) map.set(key, { key, ini, fin: addDays(ini, 6), total: 0, items: [] });
      const g = map.get(key);
      g.items.push(it);
      g.total += parseMonto(it.monto);
    }
    const arr = [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
    // Cada semana ordena sus ítems por fecha.
    for (const s of arr) s.items.sort((a, b) => (String(a.fecha) < String(b.fecha) ? -1 : 1));
    // El saldo ARS positivo cubre primero las semanas más cercanas.
    let saldoRest = Math.max(0, num(saldos.ars));
    let acumUSD = 0;
    return arr.map(s => {
      const cubierto = Math.min(saldoRest, s.total);
      saldoRest -= cubierto;
      const deficit = Math.max(0, s.total - cubierto);
      const tc = parseMonto(tcSem[s.key]);
      const usdVender = tc > 0 ? deficit / tc : null;
      if (usdVender != null) acumUSD += usdVender;
      return { ...s, cubierto, deficit, tc, usdVender, acumUSD: usdVender != null ? acumUSD : null };
    });
  }, [items, saldos.ars, tcSem]);

  const usdVenderTotal = semanas.reduce((s, w) => s + (w.usdVender || 0), 0);
  const totalARS = semanas.reduce((s, w) => s + w.total, 0);
  const algunSinTc = semanas.some(w => w.total > 0 && !(w.tc > 0));
  const saldoUSDNum = num(saldos.usd);

  // Planificado semana a semana (referencia): tareas con fecha y costo estimado.
  const planTareas = useMemo(() => {
    const hitoNombre = Object.fromEntries(hitos.map(h => [h.id, h.nombre]));
    return tareas
      .filter(t => t.fecha_inicio && totalTarea(t) > 0)
      .map(t => ({
        id: t.id, nombre: t.nombre, etapa: hitoNombre[t.hito_id] || "—",
        ini: String(t.fecha_inicio).slice(0, 10),
        fin: t.fecha_fin ? String(t.fecha_fin).slice(0, 10) : String(t.fecha_inicio).slice(0, 10),
        total: totalTarea(t),
      }))
      .sort((a, b) => (a.ini < b.ini ? -1 : a.ini > b.ini ? 1 : 0));
  }, [tareas, hitos]);

  const planPorSemana = useMemo(() => {
    const map = new Map();
    for (const t of planTareas) {
      const ini = lunesDe(t.ini);
      const key = toISO(ini);
      if (!map.has(key)) map.set(key, { key, ini, fin: addDays(ini, 6), total: 0 });
      map.get(key).total += t.total;
    }
    return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  }, [planTareas]);

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5">Cashflow</Typography>
        <Typography variant="body2" color="text.secondary">
          Costos por etapa (real vs. plan) y el cashflow semanal de lo que hay que pagar.
        </Typography>
      </Box>

      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tab label="Costos por etapa" />
        <Tab label="Cashflow" />
      </Tabs>

      {loading && <LinearProgress />}

      {tab === 0 && (
        <CostosPorEtapa porEtapa={porEtapa} tcRef={tcRef} setEst={setEst} />
      )}

      {tab === 1 && (
        <CashflowManual
          saldos={saldos} saldoUSDNum={saldoUSDNum}
          semanas={semanas} totalARS={totalARS} usdVenderTotal={usdVenderTotal}
          algunSinTc={algunSinTc}
          addItem={addItem} updItem={updItem} delItem={delItem} setTcSemana={setTcSemana}
          planTareas={planTareas} planPorSemana={planPorSemana}
        />
      )}
    </Stack>
  );
}

// =====================================================================
// SOLAPA 1 — Costos por etapa (real vs objetivo)
// =====================================================================
function CostosPorEtapa({ porEtapa, tcRef, setEst }) {
  return (
    <Card>
      <CardContent sx={{ p: { xs: 1, sm: 2 } }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ px: { xs: 0.5, sm: 0 } }}>Estimación por tarea</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: "block", px: { xs: 0.5, sm: 0 } }}>
          Cargá lo que te pasan por cada tarea (materiales, mano de obra y máquina). La app suma por etapa y la compara
          con el valor planificado que cargaste en Ajustes.
        </Typography>

        {porEtapa.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
            No hay etapas ni tareas cargadas. Definilas en Planificación.
          </Typography>
        )}

        <Box>
          {porEtapa.map(({ hito, tareas: ts, subtotal }) => {
            const objetivo = num(hito.valor_plan);
            const estimadoUSD = tcRef > 0 ? subtotal / tcRef : null;
            const dif = (objetivo > 0 && estimadoUSD != null) ? objetivo - estimadoUSD : null;
            return (
            <Accordion key={hito.id} disableGutters defaultExpanded={false}
              sx={{ "&:before": { display: "none" }, border: "1px solid", borderColor: "divider", borderRadius: 1, mb: 1, overflow: "hidden" }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: "rgba(15,42,74,0.05)", borderLeft: "4px solid #0F2A4A" }}>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ width: "100%", pr: 1, flexWrap: "wrap" }} useFlexGap>
                  <Typography variant="subtitle2" fontWeight={800} sx={{ flexGrow: 1, minWidth: 120 }}>
                    {hito.nombre}
                  </Typography>
                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: "wrap" }} useFlexGap>
                    <Typography variant="body2">
                      Real <b style={{ color: "#0F2A4A" }}>{fmtMoney(subtotal, "ARS")}</b>
                      {estimadoUSD != null && <> · <b style={{ color: "#0F2A4A" }}>{fmtMoney(estimadoUSD, "USD")}</b></>}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">Obj. {objetivo > 0 ? fmtMoney(objetivo, "USD") : "—"}</Typography>
                    {dif == null
                      ? <Tooltip title="Cargá el objetivo en Ajustes (Etapas) y el dólar de venta en la solapa Cashflow"><Chip size="small" variant="outlined" label="Sin comparar" /></Tooltip>
                      : dif < -0.5
                        ? <Chip size="small" color="error" variant="outlined" label={`Por encima ${fmtMoney(-dif, "USD")}`} />
                        : dif > 0.5
                          ? <Chip size="small" color="success" variant="outlined" label={`Por debajo ${fmtMoney(dif, "USD")}`} />
                          : <Chip size="small" label="En objetivo" />}
                  </Stack>
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0, overflowX: "auto" }}>
              <Table size="small" sx={{ minWidth: 1180 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 108 }}>Fecha plan</TableCell>
                    <TableCell sx={{ minWidth: 150 }}>Tarea</TableCell>
                    <TableCell sx={{ minWidth: 180 }}>Materiales (nota)</TableCell>
                    <TableCell align="right" sx={{ width: 120 }}>MAT $</TableCell>
                    <TableCell sx={{ minWidth: 140 }}>MOD (nota)</TableCell>
                    <TableCell align="right" sx={{ width: 120 }}>MOD $</TableCell>
                    <TableCell sx={{ minWidth: 140 }}>MAQ (nota)</TableCell>
                    <TableCell align="right" sx={{ width: 120 }}>MAQ $</TableCell>
                    <TableCell align="right" sx={{ width: 120 }}>Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ts.length === 0 && (
                    <TableRow><TableCell colSpan={9}>
                      <Typography variant="body2" color="text.secondary">Esta etapa no tiene tareas cargadas.</Typography>
                    </TableCell></TableRow>
                  )}
                  {ts.map((t) => {
                    const est = ESTADO_CHIP[t.estado] || ESTADO_CHIP.no_iniciado;
                    return (
                      <TableRow key={t.id} hover>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>{t.fecha_inicio ? fmtDate(t.fecha_inicio) : "—"}</TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{t.nombre}</Typography>
                          <Chip size="small" variant="outlined" color={est.color} label={est.label} sx={{ height: 18, mt: 0.25 }} />
                        </TableCell>
                        <TableCell><NoteCell value={t.est_notas} placeholder="Hierro, arena, cemento…" onCommit={(v) => setEst(t.id, { est_notas: v })} /></TableCell>
                        <TableCell align="right"><MoneyCell value={t.est_mat} onCommit={(v) => setEst(t.id, { est_mat: v })} /></TableCell>
                        <TableCell><NoteCell value={t.est_notas_mod} placeholder="Cuadrilla, jornales…" onCommit={(v) => setEst(t.id, { est_notas_mod: v })} /></TableCell>
                        <TableCell align="right"><MoneyCell value={t.est_mod} onCommit={(v) => setEst(t.id, { est_mod: v })} /></TableCell>
                        <TableCell><NoteCell value={t.est_notas_maq} placeholder="Retro, vibrador…" onCommit={(v) => setEst(t.id, { est_notas_maq: v })} /></TableCell>
                        <TableCell align="right"><MoneyCell value={t.est_maq} onCommit={(v) => setEst(t.id, { est_maq: v })} /></TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                          {fmtMoney(totalTarea(t), "ARS")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </AccordionDetails>
            </Accordion>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// SOLAPA 2 — Cashflow manual (ítems + TC semanal + gráfico + planificado)
// =====================================================================
function CashflowManual({
  saldos, saldoUSDNum, semanas, totalARS, usdVenderTotal, algunSinTc,
  addItem, updItem, delItem, setTcSemana, planTareas, planPorSemana,
}) {
  return (
    <Stack spacing={3}>
      {/* Saldos de Caja + USD a vender total */}
      <Card>
        <CardContent>
          <Grid container spacing={2} alignItems="stretch">
            <Grid item xs={6} sm={3}>
              <SaldoBox label="Saldo ARS (Caja)" value={fmtMoney(saldos.ars, "ARS")} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <SaldoBox label="Saldo USD (Caja)" value={fmtMoney(saldos.usd, "USD")} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <SaldoBox label="Total a pagar (ARS)" value={fmtMoney(totalARS, "ARS")} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5, display: "block" }}>
                USD a vender (total)
              </Typography>
              <Stack direction="row" spacing={1} alignItems="baseline" sx={{ flexWrap: "wrap" }}>
                <Typography fontWeight={800} sx={{ color: "#0F2A4A", fontVariantNumeric: "tabular-nums" }}>
                  {!algunSinTc ? fmtMoney(usdVenderTotal, "USD") : "—"}
                </Typography>
                {!algunSinTc && (
                  <Chip size="small" color={saldoUSDNum >= usdVenderTotal ? "success" : "error"} variant="outlined"
                    label={saldoUSDNum >= usdVenderTotal ? "Alcanza con el USD en caja" : `Faltan ${fmtMoney(usdVenderTotal - saldoUSDNum, "USD")}`} />
                )}
              </Stack>
            </Grid>
          </Grid>
          {algunSinTc && (
            <Typography variant="caption" color="warning.main" sx={{ mt: 1.5, display: "block" }}>
              Cargá el tipo de cambio de cada semana para calcular los USD a vender.
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Gráfico semanal de lo que hay que pagar */}
      <Card>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>Cashflow semanal</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: "block" }}>
            Lo que hay que pagar por semana según los ítems cargados. El saldo ARS de Caja cubre primero las semanas
            más cercanas; el resto se convierte a USD con el tipo de cambio de esa semana.
          </Typography>
          <WeeklyBars
            data={semanas.map(s => ({ key: s.key, label: fmtDate(toISO(s.ini)), value: s.total,
              sub: s.usdVender != null ? fmtMoney(s.usdVender, "USD") : null }))}
            color="#C0392B"
          />
        </CardContent>
      </Card>

      {/* Ítems por semana */}
      <Card>
        <CardContent sx={{ p: { xs: 1, sm: 2 } }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="subtitle1" fontWeight={700}>Ítems a pagar</Typography>
            <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={addItem}>Agregar ítem</Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: "block" }}>
            Cargá cada pago con su fecha, concepto y monto (p. ej. “Pago a Emiliano”, “Adelanto 50% Losa radiante”).
            Se agrupan por semana y se convierten a USD con el tipo de cambio que cargues en cada una.
          </Typography>

          {semanas.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
              Todavía no cargaste ítems. Usá “Agregar ítem”.
            </Typography>
          )}

          {semanas.map((s) => (
            <Box key={s.key} sx={{ mb: 2, border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
              <Box sx={{ bgcolor: "rgba(15,42,74,0.05)", borderLeft: "4px solid #0F2A4A", px: 1.5, py: 1 }}>
                <Grid container spacing={1} alignItems="center">
                  <Grid item xs={12} sm={5}>
                    <Typography variant="subtitle2" fontWeight={800}>
                      Semana {fmtDate(toISO(s.ini))} – {fmtDate(toISO(s.fin))}
                    </Typography>
                  </Grid>
                  <Grid item xs={5} sm={3}>
                    <Typography variant="body2">A pagar <b style={{ color: "#C0392B" }}>{fmtMoney(s.total, "ARS")}</b></Typography>
                  </Grid>
                  <Grid item xs={4} sm={2}>
                    <TextField
                      label="Dólar venta" size="small" fullWidth
                      defaultValue={s.tc || ""}
                      placeholder="1540"
                      onBlur={(e) => setTcSemana(s.key, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                      inputProps={{ inputMode: "decimal", style: { fontSize: 13 } }}
                    />
                  </Grid>
                  <Grid item xs={3} sm={2}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.1 }}>USD a vender</Typography>
                    <Typography variant="body2" fontWeight={700} sx={{ color: "#0F2A4A", fontVariantNumeric: "tabular-nums" }}>
                      {s.usdVender != null ? fmtMoney(s.usdVender, "USD") : "—"}
                    </Typography>
                  </Grid>
                </Grid>
              </Box>
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small" sx={{ minWidth: 560 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 150 }}>Fecha</TableCell>
                      <TableCell>Concepto</TableCell>
                      <TableCell align="right" sx={{ width: 150 }}>Monto (ARS)</TableCell>
                      <TableCell align="center" sx={{ width: 48 }}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {s.items.map((it) => (
                      <TableRow key={it.id} hover>
                        <TableCell>
                          <TextField
                            type="date" variant="standard" size="small"
                            defaultValue={String(it.fecha).slice(0, 10)}
                            onBlur={(e) => { const v = e.target.value; if (v && v !== String(it.fecha).slice(0, 10)) updItem(it.id, { fecha: v }); }}
                            InputProps={{ disableUnderline: true }} inputProps={{ style: { fontSize: 13 } }}
                          />
                        </TableCell>
                        <TableCell>
                          <NoteCell value={it.concepto} placeholder="Pago a…" onCommit={(v) => updItem(it.id, { concepto: v || "" })} />
                        </TableCell>
                        <TableCell align="right"><MoneyCell value={it.monto} onCommit={(v) => updItem(it.id, { monto: v })} /></TableCell>
                        <TableCell align="center">
                          <Tooltip title="Eliminar ítem">
                            <IconButton size="small" color="error" onClick={() => delItem(it.id)}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Box>
          ))}
        </CardContent>
      </Card>

      {/* Planificado semana a semana (referencia) */}
      <Card>
        <CardContent sx={{ p: { xs: 1, sm: 2 } }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>Planificado semana a semana</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: "block" }}>
            Costo estimado de las tareas planificadas (según el Diario), agrupado por semana. Sirve de referencia
            para armar el cashflow.
          </Typography>

          {planPorSemana.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
              No hay tareas planificadas con costo estimado. Cargalas en “Costos por etapa”.
            </Typography>
          ) : (
            <>
              <WeeklyBars
                data={planPorSemana.map(s => ({ key: s.key, label: fmtDate(toISO(s.ini)), value: s.total }))}
                color="#0F2A4A"
              />
              <Box sx={{ overflowX: "auto", mt: 2 }}>
                <Table size="small" sx={{ minWidth: 560 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Tarea</TableCell>
                      <TableCell>Etapa</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>Fechas</TableCell>
                      <TableCell align="right">Total (ARS)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {planTareas.map((t) => (
                      <TableRow key={t.id} hover>
                        <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{t.nombre}</Typography></TableCell>
                        <TableCell><Typography variant="body2" color="text.secondary">{t.etapa}</Typography></TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtDate(t.ini)} – {fmtDate(t.fin)}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                          {fmtMoney(t.total, "ARS")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}

// --- Gráfico de barras verticales por semana (con divs, sin dependencias) ---
function WeeklyBars({ data, color }) {
  if (!data || data.length === 0) {
    return <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>Sin datos todavía.</Typography>;
  }
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <Box sx={{ display: "flex", alignItems: "stretch", gap: 1, minHeight: 200, overflowX: "auto", pb: 1 }}>
      {data.map((d) => (
        <Box key={d.key} sx={{ flex: "1 0 64px", minWidth: 64, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Typography variant="caption" sx={{ fontSize: 10, lineHeight: 1.1, height: 26, textAlign: "center", color: "text.secondary" }}>
            {fmtMoney(d.value, "ARS")}
          </Typography>
          <Box sx={{ flexGrow: 1, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", borderBottom: "1px solid", borderColor: "divider" }}>
            <Tooltip title={`${d.label}: ${fmtMoney(d.value, "ARS")}${d.sub ? ` · ${d.sub}` : ""}`} arrow disableInteractive>
              <Box sx={{ width: "62%", borderRadius: "4px 4px 0 0", height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 4 : 0, bgcolor: color, transition: "height .2s" }} />
            </Tooltip>
          </Box>
          <Typography variant="caption" sx={{ fontSize: 9.5, lineHeight: 1.1, mt: 0.5, textAlign: "center", color: "text.secondary" }}>
            {d.label}
          </Typography>
          {d.sub && (
            <Typography variant="caption" sx={{ fontSize: 9.5, lineHeight: 1.1, textAlign: "center", color: "#0F2A4A", fontWeight: 700 }}>
              {d.sub}
            </Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}

// Muestra un saldo (traído de Caja) en modo lectura.
function SaldoBox({ label, value }) {
  return (
    <Box sx={{ minHeight: 40, height: "100%", borderRadius: 1, px: 1.25, py: 0.5, border: "1px solid", borderColor: "divider", bgcolor: "action.hover", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, lineHeight: 1.1 }}>{label}</Typography>
      <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>{value}</Typography>
    </Box>
  );
}

// Celda de nota (texto) que guarda al salir del campo (blur/Enter).
function NoteCell({ value, onCommit, placeholder }) {
  return (
    <TextField
      variant="standard" fullWidth multiline placeholder={placeholder}
      defaultValue={value ?? ""}
      onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (value ?? null)) onCommit(v); }}
      InputProps={{ disableUnderline: true }} inputProps={{ style: { fontSize: 12 } }}
    />
  );
}

// Celda de monto (ARS) que guarda al salir del campo (blur/Enter). Muestra el
// número crudo mientras se edita y el monto formateado cuando no está enfocado.
function MoneyCell({ value, onCommit }) {
  const [local, setLocal] = useState("");
  const [focused, setFocused] = useState(false);
  const display = focused ? local : (num(value) ? fmtMoney(value, "ARS") : "");
  const commit = () => {
    setFocused(false);
    const v = parseMonto(local);
    if (v !== num(value)) onCommit(v);
  };
  return (
    <TextField
      variant="standard" size="small" placeholder="—"
      value={display}
      onFocus={() => { setFocused(true); setLocal(num(value) ? String(value) : ""); }}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      InputProps={{ disableUnderline: true }}
      inputProps={{ inputMode: "decimal", style: { textAlign: "right", fontSize: 13, fontVariantNumeric: "tabular-nums" } }}
      sx={{ width: 130 }}
    />
  );
}
