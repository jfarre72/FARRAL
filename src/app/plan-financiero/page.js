"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, Grid, TextField,
  LinearProgress, Table, TableHead, TableBody, TableRow, TableCell, Chip, Divider,
  Tooltip,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtMoney, fmtDate } from "@/components/Money";
import { aplicarFechasReales } from "@/lib/fechasReales";

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
  const { proyecto } = useProjects();

  const [hitos, setHitos] = useState([]);
  const [tareas, setTareas] = useState([]); // ya con fechas/estado del Diario
  const [loading, setLoading] = useState(true);

  const [tc, setTc] = useState("");
  const [saldoARS, setSaldoARS] = useState("");
  const [saldoUSD, setSaldoUSD] = useState("");

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
    const { data: dr } = await supabase
      .from("seguimiento_diario").select("fecha,trabajado,etapa,tareas").eq("proyecto_id", proyecto.id);
    setHitos(hs ?? []);
    setTareas(aplicarFechasReales(dr ?? [], ts, hs ?? []));
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  // Guarda una columna de estimación de la tarea (optimista, sin recargar todo).
  const setEst = async (tareaId, patch) => {
    setTareas(prev => prev.map(t => t.id === tareaId ? { ...t, ...patch } : t));
    const { error } = await supabase.from("hito_tareas").update(patch).eq("id", tareaId);
    if (error) { alert(error.message); reload(); }
  };

  const tcNum = parseMonto(tc);

  // Tareas por etapa (en orden de etapa y de tarea).
  const porEtapa = useMemo(() => {
    return hitos.map(h => {
      const ts = tareas.filter(t => t.hito_id === h.id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
      const subtotal = ts.reduce((s, t) => s + totalTarea(t), 0);
      return { hito: h, tareas: ts, subtotal };
    });
  }, [hitos, tareas]);

  // Semanas (lun-dom) según la fecha planificada (inicio) de cada tarea.
  const calcSemanas = useMemo(() => {
    const conFecha = tareas.filter(t => t.fecha_inicio && totalTarea(t) > 0);
    const map = new Map();
    for (const t of conFecha) {
      const ini = lunesDe(t.fecha_inicio);
      const key = toISO(ini);
      if (!map.has(key)) map.set(key, { key, ini, fin: addDays(ini, 6), total: 0 });
      map.get(key).total += totalTarea(t);
    }
    const arr = [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
    let saldoRest = parseMonto(saldoARS);
    return arr.map(s => {
      const cubierto = Math.min(saldoRest, s.total);
      saldoRest -= cubierto;
      const deficit = Math.max(0, s.total - cubierto);
      return { ...s, usdVender: tcNum > 0 ? deficit / tcNum : null };
    });
  }, [tareas, saldoARS, tcNum]);

  const usdVenderTotal = calcSemanas.reduce((s, w) => s + (w.usdVender || 0), 0);
  const saldoUSDNum = parseMonto(saldoUSD);

  const totalGeneralARS = porEtapa.reduce((s, e) => s + e.subtotal, 0);

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
                USD a vender (total)
              </Typography>
              <Stack direction="row" spacing={1} alignItems="baseline" sx={{ flexWrap: "wrap" }}>
                <Typography fontWeight={800} sx={{ color: "#0F2A4A", fontVariantNumeric: "tabular-nums" }}>
                  {tcNum > 0 ? fmtMoney(usdVenderTotal, "USD") : "—"}
                </Typography>
                {tcNum > 0 && saldoUSDNum > 0 && (
                  <Chip size="small" color={saldoUSDNum >= usdVenderTotal ? "success" : "error"} variant="outlined"
                    label={saldoUSDNum >= usdVenderTotal ? "Alcanza" : `Faltan ${fmtMoney(usdVenderTotal - saldoUSDNum, "USD")}`} />
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: "block" }}>
            Las semanas salen de la <b>fecha planificada</b> de cada tarea (según el Diario). El saldo ARS cubre primero las semanas más cercanas.
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

          <Box sx={{ overflowX: "auto" }}>
            {porEtapa.map(({ hito, tareas: ts, subtotal }) => (
              <Box key={hito.id} sx={{ mb: 2.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center"
                  sx={{ bgcolor: "rgba(15,42,74,0.05)", px: 1.5, py: 0.75, borderRadius: 1, borderLeft: "4px solid #0F2A4A" }}>
                  <Typography variant="subtitle2" fontWeight={800}>{hito.nombre}</Typography>
                  <Typography variant="body2">Subtotal etapa <b style={{ color: "#0F2A4A" }}>{fmtMoney(subtotal, "ARS")}</b></Typography>
                </Stack>
                <Table size="small" sx={{ mt: 0.5, minWidth: 900 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 110 }}>Fecha plan</TableCell>
                      <TableCell sx={{ minWidth: 160 }}>Tarea</TableCell>
                      <TableCell sx={{ minWidth: 220 }}>Materiales a pedir (notas)</TableCell>
                      <TableCell align="right" sx={{ width: 130 }}>MAT $</TableCell>
                      <TableCell align="right" sx={{ width: 130 }}>MOD</TableCell>
                      <TableCell align="right" sx={{ width: 130 }}>MAQ</TableCell>
                      <TableCell align="right" sx={{ width: 130 }}>Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {ts.length === 0 && (
                      <TableRow><TableCell colSpan={7}>
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
                          <TableCell>
                            <TextField variant="standard" fullWidth multiline placeholder="Ej: Hierro Ø8/Ø10, arena, cemento…"
                              defaultValue={t.est_notas ?? ""}
                              onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (t.est_notas ?? null)) setEst(t.id, { est_notas: v }); }}
                              InputProps={{ disableUnderline: true }} inputProps={{ style: { fontSize: 13 } }} />
                          </TableCell>
                          <TableCell align="right"><MoneyCell value={t.est_mat} onCommit={(v) => setEst(t.id, { est_mat: v })} /></TableCell>
                          <TableCell align="right"><MoneyCell value={t.est_mod} onCommit={(v) => setEst(t.id, { est_mod: v })} /></TableCell>
                          <TableCell align="right"><MoneyCell value={t.est_maq} onCommit={(v) => setEst(t.id, { est_maq: v })} /></TableCell>
                          <TableCell align="right" sx={{ whiteSpace: "nowrap", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                            {fmtMoney(totalTarea(t), "ARS")}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>

      {/* Comparación por etapa: planificado vs objetivo de Ajustes */}
      <Card>
        <CardContent sx={{ p: { xs: 1, sm: 2 } }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ px: { xs: 0.5, sm: 0 } }}>Planificado vs objetivo por etapa</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: "block", px: { xs: 0.5, sm: 0 } }}>
            Compara lo que estás estimando (en USD, al dólar de venta) contra el valor planificado de la etapa (Ajustes → Etapas). Cargá el dólar de venta arriba.
          </Typography>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Etapa</TableCell>
                  <TableCell align="right">Objetivo (USD)</TableCell>
                  <TableCell align="right">Estimado (ARS)</TableCell>
                  <TableCell align="right">Estimado (USD)</TableCell>
                  <TableCell align="right">Diferencia (USD)</TableCell>
                  <TableCell sx={{ width: 130 }}>Estado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {porEtapa.map(({ hito, subtotal }) => {
                  const objetivo = num(hito.valor_plan);
                  const estimadoUSD = tcNum > 0 ? subtotal / tcNum : null;
                  const dif = (objetivo > 0 && estimadoUSD != null) ? objetivo - estimadoUSD : null;
                  return (
                    <TableRow key={hito.id} hover>
                      <TableCell>{hito.nombre}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: objetivo > 0 ? "text.primary" : "text.disabled" }}>
                        {objetivo > 0 ? fmtMoney(objetivo, "USD") : "—"}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(subtotal, "ARS")}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        {estimadoUSD != null ? fmtMoney(estimadoUSD, "USD") : "—"}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", fontWeight: 700,
                        color: dif == null ? "text.disabled" : dif < 0 ? "error.main" : "success.main" }}>
                        {dif != null ? fmtMoney(dif, "USD") : "—"}
                      </TableCell>
                      <TableCell>
                        {dif == null
                          ? <Tooltip title="Cargá el objetivo en Ajustes y el dólar de venta arriba"><Typography variant="caption" color="text.disabled">—</Typography></Tooltip>
                          : dif < -0.5
                            ? <Chip size="small" color="error" variant="outlined" label="Por encima" />
                            : dif > 0.5
                              ? <Chip size="small" color="success" variant="outlined" label="Por debajo" />
                              : <Chip size="small" label="En objetivo" />}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow>
                  <TableCell sx={{ fontWeight: 800 }}>Total</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                    {fmtMoney(porEtapa.reduce((s, e) => s + num(e.hito.valor_plan), 0), "USD")}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(totalGeneralARS, "ARS")}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                    {tcNum > 0 ? fmtMoney(totalGeneralARS / tcNum, "USD") : "—"}
                  </TableCell>
                  <TableCell align="right" />
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>
    </Stack>
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
