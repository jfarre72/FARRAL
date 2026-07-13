"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, Grid, TextField,
  LinearProgress, Table, TableHead, TableBody, TableRow, TableCell, Chip,
  Tooltip, Accordion, AccordionSummary, AccordionDetails, IconButton, Switch,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
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
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

const totalTarea = (t) => parseMonto(t.est_mod) + parseMonto(t.est_maq) + parseMonto(t.est_mat);

const ESTADO_CHIP = {
  planificado: { label: "Planificado", color: "info" },
  en_curso: { label: "En curso", color: "warning" },
  finalizado: { label: "Finalizado", color: "success" },
  no_iniciado: { label: "Sin planificar", color: "default" },
};

export default function PlanFinancieroPage() {
  const { proyecto, refresh } = useProjects();

  const [hitos, setHitos] = useState([]);
  const [tareas, setTareas] = useState([]); // ya con fechas/estado del Diario
  const [saldos, setSaldos] = useState({ ars: 0, usd: 0 }); // saldos reales de Caja
  const [loading, setLoading] = useState(true);

  // El dólar de venta queda guardado en el proyecto; se edita y persiste al salir del campo.
  const [tc, setTc] = useState("");
  useEffect(() => {
    setTc(proyecto?.dolar_venta != null ? String(proyecto.dolar_venta) : "");
  }, [proyecto?.dolar_venta]);
  const guardarTc = async () => {
    if (!proyecto) return;
    const v = parseMonto(tc);
    if (v === num(proyecto.dolar_venta)) return;
    const { error } = await supabase.from("proyectos").update({ dolar_venta: v || null }).eq("id", proyecto.id);
    if (error) alert(error.message); else refresh();
  };

  const reload = async () => {
    if (!proyecto) return;
    setLoading(true);
    const { data: hs } = await supabase
      .from("hitos").select("id,nombre,orden,valor_plan,plan_incluir").eq("proyecto_id", proyecto.id).order("orden");
    const ids = (hs ?? []).map(h => h.id);
    let ts = [];
    if (ids.length) {
      const { data } = await supabase.from("hito_tareas").select("*").in("hito_id", ids).order("orden");
      ts = data ?? [];
    }
    const [{ data: dr }, { data: aportes }, { data: movs }] = await Promise.all([
      supabase.from("seguimiento_diario").select("fecha,trabajado,etapa,tareas").eq("proyecto_id", proyecto.id),
      supabase.from("aportes").select("monto,moneda,entra_a_caja").eq("proyecto_id", proyecto.id),
      supabase.from("movimientos_caja").select("*").eq("proyecto_id", proyecto.id),
    ]);
    setHitos(hs ?? []);
    setTareas(aplicarFechasReales(dr ?? [], ts, hs ?? []));
    setSaldos(saldosCaja(aportes ?? [], movs ?? []));
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  // Guarda una columna de estimación de la tarea (optimista, sin recargar todo).
  const setEst = async (tareaId, patch) => {
    setTareas(prev => prev.map(t => t.id === tareaId ? { ...t, ...patch } : t));
    const { error } = await supabase.from("hito_tareas").update(patch).eq("id", tareaId);
    if (error) { alert(error.message); reload(); }
  };
  // Incluir / quitar una tarea del plan (no borra la tarea real).
  const setTareaIncluir = (t, incl) => setEst(t.id, { plan_incluir: incl });
  // Incluir / quitar una etapa entera del plan.
  const setHitoIncluir = async (hitoId, incl) => {
    setHitos(prev => prev.map(h => h.id === hitoId ? { ...h, plan_incluir: incl } : h));
    const { error } = await supabase.from("hitos").update({ plan_incluir: incl }).eq("id", hitoId);
    if (error) { alert(error.message); reload(); }
  };

  const tcNum = parseMonto(tc);
  const tareaIncluida = (h, t) => h.plan_incluir !== false && t.plan_incluir !== false;

  // Tareas por etapa (en orden de etapa y de tarea). El subtotal sólo suma las
  // tareas incluidas de una etapa incluida.
  const porEtapa = useMemo(() => {
    return hitos.map(h => {
      const etapaIncl = h.plan_incluir !== false;
      const ts = tareas.filter(t => t.hito_id === h.id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
      const subtotal = ts.reduce((s, t) => s + (etapaIncl && t.plan_incluir !== false ? totalTarea(t) : 0), 0);
      return { hito: h, tareas: ts, subtotal, etapaIncl };
    });
  }, [hitos, tareas]);

  // Semanas (lun-dom) según la fecha planificada (inicio) de cada tarea, con el
  // USD a vender por semana y su ACUMULADO.
  const calcSemanas = useMemo(() => {
    const hitoIncl = Object.fromEntries(hitos.map(h => [h.id, h.plan_incluir !== false]));
    const conFecha = tareas.filter(t => t.fecha_inicio && totalTarea(t) > 0 && t.plan_incluir !== false && hitoIncl[t.hito_id]);
    const map = new Map();
    for (const t of conFecha) {
      const ini = lunesDe(t.fecha_inicio);
      const key = toISO(ini);
      if (!map.has(key)) map.set(key, { key, ini, fin: addDays(ini, 6), total: 0 });
      map.get(key).total += totalTarea(t);
    }
    const arr = [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
    // Sólo el saldo ARS positivo se usa para cubrir pagos (un saldo negativo no
    // aumenta lo que hay que vender). Cubre primero las semanas más cercanas.
    let saldoRest = Math.max(0, num(saldos.ars));
    let acumUSD = 0;
    return arr.map(s => {
      const cubierto = Math.min(saldoRest, s.total);
      saldoRest -= cubierto;
      const deficit = Math.max(0, s.total - cubierto);
      const usdVender = tcNum > 0 ? deficit / tcNum : null;
      if (usdVender != null) acumUSD += usdVender;
      return { ...s, usdVender, acumUSD: tcNum > 0 ? acumUSD : null };
    });
  }, [tareas, hitos, saldos.ars, tcNum]);

  const usdVenderTotal = calcSemanas.reduce((s, w) => s + (w.usdVender || 0), 0);
  const saldoUSDNum = num(saldos.usd);

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5">Plan financiero</Typography>
        <Typography variant="body2" color="text.secondary">
          Estimá cada tarea planificada (materiales, mano de obra y máquina). La app suma por etapa y la compara con
          el valor planificado que cargaste en Ajustes, y te dice cuántos USD vender por semana.
        </Typography>
      </Box>

      {loading && <LinearProgress />}

      {/* Tesorería: dólar de venta y saldos → USD a vender */}
      <Card>
        <CardContent>
          <Grid container spacing={2} alignItems="flex-end">
            <Grid item xs={12} sm={3}>
              <TextField label="Dólar de venta (ARS/USD)" fullWidth size="small" inputProps={{ inputMode: "decimal" }}
                value={tc} onChange={(e) => setTc(e.target.value)}
                onBlur={guardarTc}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                placeholder="1520" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <SaldoBox label="Saldo ARS (Caja)" value={fmtMoney(saldos.ars, "ARS")} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <SaldoBox label="Saldo USD (Caja)" value={fmtMoney(saldos.usd, "USD")} />
            </Grid>
            <Grid item xs={12} sm={3}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5, display: "block" }}>
                USD a vender (total)
              </Typography>
              <Stack direction="row" spacing={1} alignItems="baseline" sx={{ flexWrap: "wrap" }}>
                <Typography fontWeight={800} sx={{ color: "#0F2A4A", fontVariantNumeric: "tabular-nums" }}>
                  {tcNum > 0 ? fmtMoney(usdVenderTotal, "USD") : "—"}
                </Typography>
                {tcNum > 0 && (
                  <Chip size="small" color={saldoUSDNum >= usdVenderTotal ? "success" : "error"} variant="outlined"
                    label={saldoUSDNum >= usdVenderTotal ? "Alcanza con el USD en caja" : `Faltan ${fmtMoney(usdVenderTotal - saldoUSDNum, "USD")}`} />
                )}
              </Stack>
            </Grid>
          </Grid>

          {calcSemanas.length > 0 && (
            <Box sx={{ overflowX: "auto", mt: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Semana</TableCell>
                    <TableCell align="right">A pagar (ARS)</TableCell>
                    <TableCell align="right">USD a vender</TableCell>
                    <TableCell align="right">USD acumulado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {calcSemanas.map((s) => (
                    <TableRow key={s.key} hover>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtDate(toISO(s.ini))} – {fmtDate(toISO(s.fin))}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", color: "#C0392B", fontWeight: 600 }}>{fmtMoney(s.total, "ARS")}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "#0F2A4A" }}>
                        {s.usdVender != null ? fmtMoney(s.usdVender, "USD") : "—"}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", color: "text.secondary" }}>
                        {s.acumUSD != null ? fmtMoney(s.acumUSD, "USD") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: "block" }}>
            Los saldos salen de <b>Caja</b>. Las semanas salen de la <b>fecha planificada</b> de cada tarea (según el Diario); el saldo ARS cubre primero las semanas más cercanas y el acumulado suma los USD a vender.
          </Typography>
        </CardContent>
      </Card>

      {/* Estimación por tarea (tomadas de Planificación / Diario) */}
      <Card>
        <CardContent sx={{ p: { xs: 1, sm: 2 } }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ px: { xs: 0.5, sm: 0 } }}>Estimación por tarea</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: "block", px: { xs: 0.5, sm: 0 } }}>
            Las tareas salen de Planificación. Completá lo que va a costar cada una; la app suma por etapa.
          </Typography>

          {porEtapa.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
              No hay etapas ni tareas cargadas. Definilas en Planificación.
            </Typography>
          )}

          <Box>
            {porEtapa.map(({ hito, tareas: ts, subtotal, etapaIncl }) => {
              const objetivo = num(hito.valor_plan);
              const estimadoUSD = tcNum > 0 ? subtotal / tcNum : null;
              const dif = (etapaIncl && objetivo > 0 && estimadoUSD != null) ? objetivo - estimadoUSD : null;
              return (
              <Accordion key={hito.id} disableGutters defaultExpanded={false}
                sx={{ "&:before": { display: "none" }, border: "1px solid", borderColor: "divider", borderRadius: 1, mb: 1, overflow: "hidden", opacity: etapaIncl ? 1 : 0.55 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: "rgba(15,42,74,0.05)", borderLeft: `4px solid ${etapaIncl ? "#0F2A4A" : "#9AA5B1"}` }}>
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ width: "100%", pr: 1, flexWrap: "wrap" }} useFlexGap>
                    <Tooltip title={etapaIncl ? "Quitar etapa del plan (no la borra)" : "Volver a incluir la etapa"}>
                      <Switch size="small" checked={etapaIncl}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setHitoIncluir(hito.id, e.target.checked)} />
                    </Tooltip>
                    <Typography variant="subtitle2" fontWeight={800} sx={{ flexGrow: 1, minWidth: 120, textDecoration: etapaIncl ? "none" : "line-through" }}>
                      {hito.nombre}
                    </Typography>
                    {etapaIncl ? (
                      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: "wrap" }} useFlexGap>
                        <Typography variant="body2">
                          Real <b style={{ color: "#0F2A4A" }}>{fmtMoney(subtotal, "ARS")}</b>
                          {estimadoUSD != null && <> · <b style={{ color: "#0F2A4A" }}>{fmtMoney(estimadoUSD, "USD")}</b></>}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">Obj. {objetivo > 0 ? fmtMoney(objetivo, "USD") : "—"}</Typography>
                        {dif == null
                          ? <Tooltip title="Cargá el objetivo en Ajustes (Etapas) y el dólar de venta arriba"><Chip size="small" variant="outlined" label="Sin comparar" /></Tooltip>
                          : dif < -0.5
                            ? <Chip size="small" color="error" variant="outlined" label={`Por encima ${fmtMoney(-dif, "USD")}`} />
                            : dif > 0.5
                              ? <Chip size="small" color="success" variant="outlined" label={`Por debajo ${fmtMoney(dif, "USD")}`} />
                              : <Chip size="small" label="En objetivo" />}
                      </Stack>
                    ) : (
                      <Chip size="small" label="Quitada del plan" />
                    )}
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
                      <TableCell align="center" sx={{ width: 48 }}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {ts.length === 0 && (
                      <TableRow><TableCell colSpan={10}>
                        <Typography variant="body2" color="text.secondary">Esta etapa no tiene tareas cargadas.</Typography>
                      </TableCell></TableRow>
                    )}
                    {ts.map((t) => {
                      const est = ESTADO_CHIP[t.estado] || ESTADO_CHIP.no_iniciado;
                      const incl = etapaIncl && t.plan_incluir !== false;
                      return (
                        <TableRow key={t.id} hover sx={{ opacity: incl ? 1 : 0.45 }}>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>{t.fecha_inicio ? fmtDate(t.fecha_inicio) : "—"}</TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 500, textDecoration: t.plan_incluir === false ? "line-through" : "none" }}>{t.nombre}</Typography>
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
                          <TableCell align="center">
                            <Tooltip title={t.plan_incluir === false ? "Volver a incluir la tarea" : "Quitar tarea del plan"}>
                              <IconButton size="small" onClick={() => setTareaIncluir(t, t.plan_incluir === false)}>
                                {t.plan_incluir === false ? <AddCircleOutlineIcon fontSize="small" /> : <RemoveCircleOutlineIcon fontSize="small" />}
                              </IconButton>
                            </Tooltip>
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
    </Stack>
  );
}

// Muestra un saldo (traído de Caja) en modo lectura, con el mismo alto que un
// campo chico para que la fila quede alineada.
function SaldoBox({ label, value }) {
  return (
    <Box sx={{ minHeight: 40, borderRadius: 1, px: 1.25, py: 0.5, border: "1px solid", borderColor: "divider", bgcolor: "action.hover", display: "flex", flexDirection: "column", justifyContent: "center" }}>
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
      sx={{ width: 120 }}
    />
  );
}
