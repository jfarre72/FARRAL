"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, LinearProgress, Chip,
  Collapse, Tooltip, Divider, useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtDate } from "@/components/Money";

// ---- Utilidades de fecha ----
const MS_DAY = 86400000;
const pd = (iso) => { if (!iso) return null; const d = new Date(iso + "T00:00:00"); return isNaN(d) ? null : d; };
const hoy0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + Math.round(n)); return r; };
const diffDays = (a, b) => Math.round((b - a) / MS_DAY);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Avance 0-100 de una tarea.
const avanceT = (t) => (t.avance != null ? Number(t.avance) : (t.completado ? 100 : 0));
const estadoT = (t) => t.estado || (t.completado ? "finalizado" : (avanceT(t) > 0 ? "en_curso" : "no_iniciado"));

const COLOR = {
  finalizado: "#1E8E3E",
  en_curso: "#E07A1F",
  planificado: "#0097A7",
  no_iniciado: "#9AA5B1",
};

// Texto de N días de desfase.
const desfaseTxt = (n) => {
  if (n == null) return "—";
  if (n === 0) return "En fecha";
  const abs = Math.abs(n);
  return n > 0 ? `+${abs} día${abs === 1 ? "" : "s"} (atraso)` : `−${abs} día${abs === 1 ? "" : "s"} (adelanto)`;
};

export default function CronogramaPage() {
  const { proyecto } = useProjects();
  const theme = useTheme();
  const isSm = useMediaQuery(theme.breakpoints.down("sm"));
  const [hitos, setHitos] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState({}); // etapas expandidas

  const reload = async () => {
    if (!proyecto) return;
    setLoading(true);
    const { data: hs } = await supabase
      .from("hitos").select("*").eq("proyecto_id", proyecto.id).order("orden");
    const ids = (hs ?? []).map(h => h.id);
    let ts = [];
    if (ids.length) {
      const { data } = await supabase.from("hito_tareas").select("*").in("hito_id", ids).order("orden");
      ts = data ?? [];
    }
    setHitos(hs ?? []);
    setTareas(ts);
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const tareasDe = (hitoId) => tareas.filter(t => t.hito_id === hitoId);

  // ---- Cálculo del cronograma con proyección secuencial ----
  const { filas, dominio, proyeccion } = useMemo(() => {
    const hoy = hoy0();
    const sorted = [...hitos].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    let cascada = 0; // días de atraso acumulados que empujan a las etapas siguientes
    const filas = [];
    for (const h of sorted) {
      const ts = tareasDe(h.id);
      const planStart = pd(h.fecha_estimada);
      const planEnd = pd(h.fecha_real);
      const planDur = (planStart && planEnd) ? Math.max(0, diffDays(planStart, planEnd)) : null;

      // Real, a partir de las fechas de las tareas.
      const ini = ts.map(t => pd(t.fecha_inicio)).filter(Boolean);
      const fin = ts.map(t => pd(t.fecha_fin)).filter(Boolean);
      const realStart = ini.length ? new Date(Math.min(...ini)) : null;
      const realEnd = fin.length ? new Date(Math.max(...fin)) : null;
      const avance = ts.length
        ? Math.round(ts.reduce((s, t) => s + avanceT(t), 0) / ts.length)
        : (h.completado ? 100 : 0);
      const finalizado = ts.length > 0 ? ts.every(t => estadoT(t) === "finalizado") : !!h.completado;
      const tieneDatos = !!(planStart && planEnd) || ts.length > 0;

      // Plan efectivo desplazado por el atraso aguas arriba.
      const effPlanStart = planStart ? addDays(planStart, cascada) : null;
      const effPlanEnd = planEnd ? addDays(planEnd, cascada) : null;

      // Fin proyectado de la etapa.
      let projEnd = null, projStart = null;
      if (finalizado && realEnd) {
        projStart = realStart || effPlanStart;
        projEnd = realEnd;
      } else if (avance > 0 && realStart) {
        projStart = realStart;
        const transcurridos = Math.max(1, diffDays(realStart, hoy));
        const totalDur = transcurridos / (avance / 100);
        projEnd = addDays(realStart, totalDur);
        if (projEnd < hoy) projEnd = hoy;
      } else if (realStart && realEnd) {
        // Planificada (tareas con fechas reales cargadas, todavía sin avance).
        projStart = realStart;
        projEnd = realEnd < hoy ? hoy : realEnd;
      } else if (planDur != null) {
        // No arrancó: arranca cuando pueda (su plan o cuando se libere la anterior),
        // sin empezar en el pasado.
        let start = realStart || effPlanStart;
        if (start && start < hoy && !finalizado) start = hoy;
        projStart = start;
        projEnd = start ? addDays(start, planDur) : null;
      }

      const desfase = (planEnd && projEnd) ? diffDays(planEnd, projEnd) : null;
      // Sólo los atrasos empujan a las siguientes (los adelantos no aceleran).
      if (desfase != null && desfase > 0) cascada += desfase;

      // Tareas vencidas (alerta temprana): fin pasado y no finalizada.
      const vencidas = ts.filter(t => {
        const f = pd(t.fecha_fin);
        return f && f < hoy && estadoT(t) !== "finalizado";
      }).length;

      filas.push({
        h, ts, planStart, planEnd, realStart, realEnd, projStart, projEnd,
        effPlanStart, effPlanEnd, avance, finalizado, tieneDatos, desfase, vencidas,
      });
    }

    // Dominio temporal (rango visible).
    const fechas = [];
    for (const f of filas) {
      for (const d of [f.planStart, f.planEnd, f.realStart, f.realEnd, f.projStart, f.projEnd]) if (d) fechas.push(d);
    }
    fechas.push(hoy);
    let dominio = null;
    if (fechas.length) {
      let min = new Date(Math.min(...fechas)), max = new Date(Math.max(...fechas));
      // margen de unos días a cada lado
      min = addDays(min, -3); max = addDays(max, 3);
      dominio = { min, max, span: Math.max(1, diffDays(min, max)) };
    }

    // Proyección global de fin de obra.
    const planFin = filas.map(f => f.planEnd).filter(Boolean).reduce((m, d) => (!m || d > m ? d : m), null);
    const projFin = filas.map(f => f.projEnd).filter(Boolean).reduce((m, d) => (!m || d > m ? d : m), null);
    const atrasoTotal = (planFin && projFin) ? diffDays(planFin, projFin) : null;
    const proyeccion = { planFin, projFin, atrasoTotal };

    return { filas, dominio, proyeccion };
  }, [hitos, tareas]);

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  const pct = (d) => dominio ? clamp(diffDays(dominio.min, d) / dominio.span * 100, 0, 100) : 0;
  const hoyPct = dominio ? pct(hoy0()) : null;
  const LABEL_W = isSm ? 120 : 200;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5">Cronograma · Plan vs Real</Typography>
        <Typography variant="body2" color="text.secondary">
          La barra clara es el <b>plan</b> de cada etapa; la barra de color es el <b>real</b> (según las fechas de sus tareas).
          El desfase de la etapa en curso se proyecta sobre las siguientes para anticipar el impacto en la fecha de fin.
        </Typography>
      </Box>

      {loading && <LinearProgress />}

      {/* Proyección global */}
      {proyeccion.planFin && (
        <Card>
          <CardContent>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} divider={<Divider orientation={isSm ? "horizontal" : "vertical"} flexItem />}>
              <Indicador label="Fin planificado" value={fmtDate(proyeccion.planFin)} />
              <Indicador label="Fin proyectado" value={proyeccion.projFin ? fmtDate(proyeccion.projFin) : "—"}
                color={proyeccion.atrasoTotal > 0 ? "error.main" : "success.main"} />
              <Indicador label="Atraso proyectado"
                value={proyeccion.atrasoTotal != null ? desfaseTxt(proyeccion.atrasoTotal) : "—"}
                color={proyeccion.atrasoTotal > 0 ? "error.main" : proyeccion.atrasoTotal < 0 ? "success.main" : "text.primary"} />
            </Stack>
            {proyeccion.atrasoTotal > 0 && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                Si la etapa en curso mantiene este ritmo, la obra termina <b>{proyeccion.atrasoTotal} día{proyeccion.atrasoTotal === 1 ? "" : "s"}</b> más tarde de lo planificado. Revisá las etapas marcadas en rojo y sus tareas vencidas para corregir a tiempo.
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {filas.length === 0 ? (
        <Card><CardContent><Typography color="text.secondary">No hay etapas cargadas. Definilas en Planificación.</Typography></CardContent></Card>
      ) : (
        <Card>
          <CardContent sx={{ p: { xs: 1, sm: 2 } }}>
            {/* Cabecera con escala de meses */}
            {dominio && (
              <Box sx={{ display: "flex", mb: 1 }}>
                <Box sx={{ width: LABEL_W, flexShrink: 0 }} />
                <Box sx={{ position: "relative", flexGrow: 1, height: 18 }}>
                  {mesesEscala(dominio).map((mk, i) => (
                    <Typography key={i} variant="caption" color="text.secondary"
                      sx={{ position: "absolute", left: `${mk.pct}%`, transform: "translateX(-50%)", fontSize: 10, whiteSpace: "nowrap" }}>
                      {mk.label}
                    </Typography>
                  ))}
                </Box>
                <Box sx={{ width: 96, flexShrink: 0 }} />
              </Box>
            )}

            <Stack divider={<Divider flexItem />}>
              {filas.map((f) => {
                const estadoChip = estadoEtapa(f);
                const abierto = !!open[f.h.id];
                return (
                  <Box key={f.h.id} sx={{ py: 0.75 }}>
                    <Box sx={{ display: "flex", alignItems: "center", cursor: f.ts.length ? "pointer" : "default" }}
                      onClick={() => f.ts.length && setOpen(p => ({ ...p, [f.h.id]: !p[f.h.id] }))}>
                      {/* Etiqueta */}
                      <Box sx={{ width: LABEL_W, flexShrink: 0, pr: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          {f.ts.length > 0 && (
                            <ExpandMoreIcon fontSize="small" sx={{ transform: abierto ? "rotate(0)" : "rotate(-90deg)", transition: "transform .2s", color: "text.secondary" }} />
                          )}
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={600} noWrap>{f.h.nombre}</Typography>
                            <Typography variant="caption" color="text.secondary">{f.avance}%{f.vencidas > 0 ? ` · ${f.vencidas} venc.` : ""}</Typography>
                          </Box>
                        </Stack>
                      </Box>
                      {/* Track */}
                      <Box sx={{ position: "relative", flexGrow: 1, height: 34 }}>
                        {hoyPct != null && (
                          <Box sx={{ position: "absolute", left: `${hoyPct}%`, top: -2, bottom: -2, width: "2px", bgcolor: "rgba(192,57,43,0.55)", zIndex: 2 }} />
                        )}
                        {/* Barra plan (clara) */}
                        {f.planStart && f.planEnd && (
                          <Tooltip title={`Plan: ${fmtDate(f.planStart)} → ${fmtDate(f.planEnd)}`}>
                            <Box sx={{
                              position: "absolute", left: `${pct(f.planStart)}%`, width: `${Math.max(0.7, pct(f.planEnd) - pct(f.planStart))}%`,
                              top: 4, height: 9, borderRadius: 4, border: "1px solid", borderColor: "rgba(15,42,74,0.35)", bgcolor: "rgba(15,42,74,0.06)",
                            }} />
                          </Tooltip>
                        )}
                        {/* Barra real / proyectada (color) */}
                        {f.projStart && f.projEnd && (
                          <Tooltip title={`${f.finalizado ? "Real" : "Proyectado"}: ${fmtDate(f.projStart)} → ${fmtDate(f.projEnd)}${f.desfase != null ? ` · ${desfaseTxt(f.desfase)}` : ""}`}>
                            <Box sx={{
                              position: "absolute", left: `${pct(f.projStart)}%`, width: `${Math.max(0.7, pct(f.projEnd) - pct(f.projStart))}%`,
                              top: 16, height: 11, borderRadius: 4, overflow: "hidden",
                              bgcolor: f.desfase > 0 ? "rgba(192,57,43,0.18)" : "rgba(30,142,62,0.18)",
                              border: "1px solid", borderColor: f.desfase > 0 ? "rgba(192,57,43,0.5)" : "rgba(30,142,62,0.5)",
                              borderStyle: f.finalizado ? "solid" : "dashed",
                            }}>
                              <Box sx={{ height: "100%", width: `${f.avance}%`, bgcolor: f.desfase > 0 ? "rgba(192,57,43,0.55)" : "rgba(30,142,62,0.55)" }} />
                            </Box>
                          </Tooltip>
                        )}
                      </Box>
                      {/* Estado */}
                      <Box sx={{ width: 96, flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
                        <Chip size="small" variant="outlined" color={estadoChip.color} label={estadoChip.label} />
                      </Box>
                    </Box>

                    {/* Detalle de tareas */}
                    <Collapse in={abierto} unmountOnExit>
                      <Box sx={{ pl: `${LABEL_W}px` }}>
                        {f.ts.map((t) => {
                          const s = pd(t.fecha_inicio), e = pd(t.fecha_fin);
                          const est = estadoT(t);
                          const venc = e && e < hoy0() && est !== "finalizado";
                          return (
                            <Box key={t.id} sx={{ display: "flex", alignItems: "center", height: 26 }}>
                              <Box sx={{ position: "relative", flexGrow: 1, height: "100%" }}>
                                {s && e && (
                                  <Tooltip title={`${t.nombre}: ${fmtDate(s)} → ${fmtDate(e)}`}>
                                    <Box sx={{
                                      position: "absolute", left: `${pct(s)}%`, width: `${Math.max(0.7, pct(e) - pct(s))}%`,
                                      top: 7, height: 11, borderRadius: 3,
                                      bgcolor: fadeColor(COLOR[est] || COLOR.no_iniciado, 0.85),
                                      outline: venc ? "2px solid #C0392B" : "none",
                                    }} />
                                  </Tooltip>
                                )}
                              </Box>
                              <Box sx={{ width: 96, flexShrink: 0 }} />
                            </Box>
                          );
                        })}
                        <Box sx={{ display: "flex" }}>
                          <Stack sx={{ flexGrow: 1, py: 0.5 }} spacing={0.25}>
                            {f.ts.map((t) => {
                              const est = estadoT(t);
                              const venc = pd(t.fecha_fin) && pd(t.fecha_fin) < hoy0() && est !== "finalizado";
                              return (
                                <Stack key={t.id} direction="row" spacing={1} alignItems="center">
                                  <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: COLOR[est] || COLOR.no_iniciado, flexShrink: 0 }} />
                                  <Typography variant="caption" sx={{ minWidth: 0 }} noWrap>{t.nombre}</Typography>
                                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                                    {t.fecha_inicio ? fmtDate(t.fecha_inicio) : "—"} → {t.fecha_fin ? fmtDate(t.fecha_fin) : "—"}
                                  </Typography>
                                  {venc && <Chip size="small" color="error" variant="outlined" label="Vencida" sx={{ height: 18 }} />}
                                </Stack>
                              );
                            })}
                            {f.ts.length === 0 && <Typography variant="caption" color="text.secondary">Sin tareas cargadas.</Typography>}
                          </Stack>
                          <Box sx={{ width: 96, flexShrink: 0 }} />
                        </Box>
                      </Box>
                    </Collapse>
                  </Box>
                );
              })}
            </Stack>

            {/* Referencias */}
            <Stack direction="row" spacing={2} sx={{ mt: 2, flexWrap: "wrap" }} useFlexGap>
              <Ref color="rgba(15,42,74,0.2)" outline label="Plan" />
              <Ref color="rgba(30,142,62,0.55)" label="Real/proyectado en fecha" />
              <Ref color="rgba(192,57,43,0.55)" label="Real/proyectado con atraso" />
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Box sx={{ width: 2, height: 14, bgcolor: "rgba(192,57,43,0.55)" }} />
                <Typography variant="caption" color="text.secondary">Hoy</Typography>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

// Estado de la etapa para el chip.
function estadoEtapa(f) {
  if (!f.tieneDatos) return { label: "Sin datos", color: "default" };
  if (f.finalizado) {
    const d = f.desfase;
    if (d != null && d > 0) return { label: "Terminó tarde", color: "error" };
    if (d != null && d < 0) return { label: "Terminó antes", color: "success" };
    return { label: "Terminada", color: "success" };
  }
  if (f.desfase != null && f.desfase > 0) return { label: desfaseTxt(f.desfase), color: "error" };
  if (f.avance > 0) return { label: "En curso", color: "warning" };
  return { label: "Pendiente", color: "default" };
}

// Marcas de mes dentro del dominio.
function mesesEscala(dom) {
  const out = [];
  const d = new Date(dom.min.getFullYear(), dom.min.getMonth(), 1);
  while (d <= dom.max) {
    if (d >= dom.min) {
      const pct = clamp((d - dom.min) / MS_DAY / dom.span * 100, 0, 100);
      out.push({ pct, label: d.toLocaleDateString("es-AR", { month: "short", year: "2-digit" }) });
    }
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

function fadeColor(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function Indicador({ label, value, color = "text.primary" }) {
  return (
    <Box sx={{ flex: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5, display: "block" }}>{label}</Typography>
      <Typography fontWeight={700} sx={{ color }}>{value}</Typography>
    </Box>
  );
}

function Ref({ color, outline, label }) {
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Box sx={{ width: 18, height: 10, borderRadius: 2, bgcolor: outline ? "rgba(15,42,74,0.06)" : color, border: outline ? "1px solid rgba(15,42,74,0.35)" : "none" }} />
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Stack>
  );
}
