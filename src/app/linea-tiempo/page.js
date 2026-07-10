"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, Grid, TextField,
  Checkbox, LinearProgress, Divider, Chip, Button, IconButton, Tooltip,
  Collapse, useMediaQuery
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import { useEffect, useMemo, useState } from "react";
import { useTheme, alpha } from "@mui/material/styles";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtDate, fmtDuracion } from "@/components/Money";
import { getCache, setCache } from "@/lib/dataCache";
import { printDocument, esc } from "@/lib/printPdf";
import { aplicarFechasReales } from "@/lib/fechasReales";

// Días hábiles (lunes a viernes) entre dos fechas ISO (YYYY-MM-DD).
// Cuenta ambos extremos inclusive: de lunes a viernes son 5 días.
function diasHabiles(desdeISO, hastaISO) {
  if (!desdeISO || !hastaISO) return null;
  const a = new Date(desdeISO + "T00:00:00");
  const b = new Date(hastaISO + "T00:00:00");
  if (isNaN(a) || isNaN(b)) return null;
  const signo = b >= a ? 1 : -1;
  const ini = signo > 0 ? a : b;
  const fin = signo > 0 ? b : a;
  let count = 0;
  const cur = new Date(ini);
  while (cur <= fin) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count * signo;
}

// Cantidad de meses (redondeada) entre dos fechas ISO. Jan→Nov = 10.
function mesesEntre(iniISO, finISO) {
  if (!iniISO || !finISO) return null;
  const a = new Date(iniISO + "T00:00:00");
  const b = new Date(finISO + "T00:00:00");
  if (isNaN(a) || isNaN(b)) return null;
  let meses = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  meses += (b.getDate() - a.getDate()) / 30.44;
  return Math.max(0, Math.round(meses));
}

// Línea de tiempo (Gantt) con la duración de cada etapa en colores.
// Las barras se pueden arrastrar (mover) o estirar desde los bordes (duración).
const GANTT_COLORS = ["#1E8E3E", "#E07A1F", "#0F2A4A", "#C0392B", "#7E57C2", "#0097A7", "#5D8C2F", "#B8860B", "#D81B60", "#3949AB"];
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
// Etiqueta de duración de una ETAPA: en semanas (5 días háb. = 1 sem.) y, a partir
// de 4 semanas, en meses (4 sem. = 1 mes). Las tareas siguen mostrándose en días hábiles.
function duracionEtapaLabel(sIso, eIso) {
  const dh = diasHabiles(sIso, eIso);
  if (dh == null) return "";
  const neg = dh < 0;
  const semanas = Math.abs(dh) / 5;
  let txt;
  if (semanas < 1) {
    const d = Math.abs(dh);
    txt = `${d} día${d === 1 ? "" : "s"} háb.`;
  } else if (semanas < 4) {
    const s = Math.round(semanas * 10) / 10;
    const st = Number.isInteger(s) ? String(s) : s.toFixed(1).replace(".", ",");
    txt = `${st} sem.`;
  } else {
    const meses = Math.floor(semanas / 4);
    const restoSem = Math.round(semanas - meses * 4);
    if (restoSem === 0) txt = `${meses} ${meses === 1 ? "mes" : "meses"}`;
    else if (restoSem === 4) txt = `${meses + 1} ${meses + 1 === 1 ? "mes" : "meses"}`;
    else txt = `${meses} ${meses === 1 ? "mes" : "meses"} ${restoSem} sem.`;
  }
  return neg ? `−${txt}` : txt;
}
// Convierte un color hex (#RRGGBB) a rgba con la opacidad dada.
function fade(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// Estados de una tarea (reemplazan al simple "completado").
const ESTADOS = [
  { value: "no_iniciado", label: "No iniciado", color: "default" },
  { value: "planificado", label: "Planificado", color: "info" },
  { value: "en_curso",    label: "En curso",    color: "warning" },
  { value: "finalizado",  label: "Finalizado",  color: "success" },
];
// Deriva el estado de una tarea (compatibilidad con filas previas a la migración).
const estadoTarea = (t) =>
  t.estado || (t.completado ? "finalizado" : ((t.avance ?? 0) > 0 ? "en_curso" : "no_iniciado"));
const ESTADO_LABEL = Object.fromEntries(ESTADOS.map(e => [e.value, e.label]));
const ESTADO_COLOR = Object.fromEntries(ESTADOS.map(e => [e.value, e.color]));

// Anchos compartidos para alinear las fechas de tareas con las de la etapa.
const DATE_W = 150;   // ancho de cada campo de fecha (Inicio / Fin)
const CHIP_W = 92;    // hueco del chip "días háb." de la etapa
const CHK_W = 42;     // hueco del checkbox de la etapa
function GanttEtapas({ etapas, inicioReal, finReal, onUpdate, getFraccion }) {
  const ini = new Date(inicioReal + "T00:00:00");
  const fin = new Date(finReal + "T00:00:00");
  const span = Math.max(1, (fin - ini) / 86400000);
  const LABEL_W = 150;
  // Posición de "hoy" en la línea de tiempo (null si está fuera del rango).
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const hoyPct = (hoy >= ini && hoy <= fin) ? ((hoy - ini) / 86400000 / span * 100) : null;
  const [drag, setDrag] = useState(null);     // { hitoId, mode, startX, s, e, dayPerPx }
  const [preview, setPreview] = useState({});  // { [hitoId]: { start: Date, end: Date } }

  useEffect(() => {
    if (!drag) return;
    const onMove = (ev) => {
      const clientX = ev.clientX ?? ev.touches?.[0]?.clientX;
      if (clientX == null) return;
      const deltaDays = Math.round((clientX - drag.startX) * drag.dayPerPx);
      let ns = new Date(drag.s), ne = new Date(drag.e);
      if (drag.mode === "move") { ns.setDate(ns.getDate() + deltaDays); ne.setDate(ne.getDate() + deltaDays); }
      else if (drag.mode === "left") { ns.setDate(ns.getDate() + deltaDays); if (ns > ne) ns = new Date(ne); }
      else if (drag.mode === "right") { ne.setDate(ne.getDate() + deltaDays); if (ne < ns) ne = new Date(ns); }
      setPreview((p) => ({ ...p, [drag.hitoId]: { start: ns, end: ne } }));
    };
    const onUp = () => {
      const pv = preview[drag.hitoId];
      if (pv) {
        const sIso = toISODate(pv.start), eIso = toISODate(pv.end);
        if (sIso !== toISODate(drag.s) || eIso !== toISODate(drag.e)) {
          onUpdate(drag.hitoId, { fecha_estimada: sIso, fecha_real: eIso });
        }
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, preview, onUpdate]);

  const begin = (ev, h, mode, s, e) => {
    ev.preventDefault(); ev.stopPropagation();
    const trackEl = ev.currentTarget.closest("[data-gantt-track]");
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    const dayPerPx = span / Math.max(1, rect.width);
    const clientX = ev.clientX ?? ev.touches?.[0]?.clientX;
    setDrag({ hitoId: h.id, mode, startX: clientX, s, e, dayPerPx });
  };

  // Marcas de meses
  const meses = [];
  const cur = new Date(ini.getFullYear(), ini.getMonth(), 1);
  while (cur <= fin) {
    const leftPct = Math.max(0, ((cur - ini) / 86400000) / span * 100);
    meses.push({
      key: `${cur.getFullYear()}-${cur.getMonth()}`,
      label: cur.toLocaleDateString("es-AR", { month: "short" }).replace(".", "") + " " + String(cur.getFullYear()).slice(2),
      leftPct,
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return (
    <Box sx={{ overflow: "hidden" }}>
      <Box sx={{ minWidth: 0 }}>
        {/* Eje de meses */}
        <Stack direction="row" sx={{ mb: 0.5 }}>
          <Box sx={{ width: LABEL_W, flexShrink: 0 }} />
          <Box sx={{ position: "relative", flexGrow: 1, height: 18, borderBottom: "1px solid", borderColor: "divider" }}>
            {meses.map((m) => (
              <Typography key={m.key} variant="caption" color="text.secondary"
                sx={{ position: "absolute", left: `${m.leftPct}%`, whiteSpace: "nowrap", fontSize: 10, lineHeight: 1,
                  transform: m.leftPct > 92 ? "translateX(-100%)" : "none" }}>
                {m.label}
              </Typography>
            ))}
            {hoyPct != null && (
              <Box sx={{ position: "absolute", left: `${hoyPct}%`, top: 0, bottom: -2, width: "2px", bgcolor: "error.main", zIndex: 3 }} />
            )}
          </Box>
        </Stack>
        {/* Una fila por etapa */}
        {etapas.map((h, i) => {
          const pv = preview[h.id];
          const s = pv ? pv.start : (h.fecha_estimada ? new Date(h.fecha_estimada + "T00:00:00") : null);
          const e = pv ? pv.end : (h.fecha_real ? new Date(h.fecha_real + "T00:00:00") : null);
          const has = s && e && !isNaN(s) && !isNaN(e) && e >= s;
          const leftPct = has ? Math.max(0, (s - ini) / 86400000 / span * 100) : 0;
          const widthPct = has ? Math.max(2, (e - s) / 86400000 / span * 100) : 0;
          const durTxt = has ? duracionEtapaLabel(toISODate(s), toISODate(e)) : "";
          const color = GANTT_COLORS[i % GANTT_COLORS.length];
          const isDragging = drag?.hitoId === h.id;
          const frac = Math.max(0, Math.min(1, getFraccion ? getFraccion(h) : 0));
          const pctAvance = Math.round(frac * 100);
          return (
            <Stack key={h.id} direction="row" alignItems="center" sx={{ py: 0.4 }}>
              <Box sx={{ width: LABEL_W, flexShrink: 0, pr: 1 }}>
                <Typography variant="body2" noWrap title={h.nombre} sx={{ fontWeight: 500 }}>{h.nombre}</Typography>
              </Box>
              <Box data-gantt-track sx={{ position: "relative", flexGrow: 1, height: 22, bgcolor: "rgba(15,42,74,0.04)", borderRadius: 1, touchAction: "none" }}>
                {meses.map((m) => (
                  <Box key={m.key} sx={{ position: "absolute", left: `${m.leftPct}%`, top: 0, bottom: 0, width: "1px", bgcolor: "rgba(15,42,74,0.07)" }} />
                ))}
                {has && (
                  <Tooltip title={`${h.nombre}: ${fmtDate(toISODate(s))} → ${fmtDate(toISODate(e))} · ${durTxt} · ${pctAvance}% completado`} open={isDragging || undefined}>
                    <Box
                      onPointerDown={(ev) => begin(ev, h, "move", s, e)}
                      sx={{
                        position: "absolute", left: `${leftPct}%`, width: `${widthPct}%`, top: 3, bottom: 3,
                        bgcolor: fade(color, 0.28), borderRadius: 1,
                        cursor: "grab", boxShadow: isDragging ? 3 : 0, overflow: "hidden",
                        "&:active": { cursor: "grabbing" },
                      }}
                    >
                      {/* Relleno de avance (color pleno) */}
                      <Box sx={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pctAvance}%`, bgcolor: color, transition: "width .3s" }} />
                      {/* Manija izquierda */}
                      <Box
                        onPointerDown={(ev) => begin(ev, h, "left", s, e)}
                        sx={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize", zIndex: 2 }}
                      />
                      {/* Manija derecha */}
                      <Box
                        onPointerDown={(ev) => begin(ev, h, "right", s, e)}
                        sx={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize", zIndex: 2 }}
                      />
                    </Box>
                  </Tooltip>
                )}
                {hoyPct != null && (
                  <Box sx={{ position: "absolute", left: `${hoyPct}%`, top: 0, bottom: 0, width: "2px", bgcolor: "error.main", zIndex: 4, pointerEvents: "none" }} />
                )}
              </Box>
            </Stack>
          );
        })}
      </Box>
    </Box>
  );
}

// Campo de fecha que guarda recién al salir del campo (blur/Enter), no en cada
function DateField({ value, onCommit, disabled, label, fullWidth, sx, size }) {
  const [local, setLocal] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  // Sincroniza con el valor externo cuando el campo no está en edición.
  useEffect(() => { if (!focused) setLocal(value ?? ""); }, [value, focused]);
  const commit = () => {
    setFocused(false);
    const v = local || null;
    if ((value ?? null) !== v) onCommit(v);
  };
  return (
    <TextField
      label={label} type="date" InputLabelProps={{ shrink: true }} size={size}
      fullWidth={fullWidth} sx={sx} disabled={disabled}
      value={local}
      onFocus={() => setFocused(true)}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}

// Input compacto de % (0-100) que guarda al salir del campo (blur/Enter).
function PctField({ value, onCommit }) {
  const [local, setLocal] = useState(String(value ?? 0));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setLocal(String(value ?? 0)); }, [value, focused]);
  const commit = () => {
    setFocused(false);
    const v = Math.max(0, Math.min(100, Math.round(Number(local) || 0)));
    if (v !== Number(value)) onCommit(v);
    setLocal(String(v));
  };
  return (
    <TextField
      type="number" size="small" value={local}
      onFocus={() => setFocused(true)}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      inputProps={{ min: 0, max: 100, style: { textAlign: "right", padding: "4px 4px" } }}
      InputProps={{ endAdornment: <Typography variant="caption" color="text.secondary" sx={{ ml: 0.25 }}>%</Typography> }}
      sx={{ width: 92, flexShrink: 0 }}
    />
  );
}

// Muestra una fecha real (derivada del Diario) en modo lectura. Imita el alto de
// un TextField chico para mantener la grilla alineada.
function RealDate({ label, value }) {
  return (
    <Box sx={{
      width: "100%", minHeight: 40, borderRadius: 1, px: 1, py: 0.5,
      border: "1px solid", borderColor: "divider", bgcolor: "action.hover",
      display: "flex", flexDirection: "column", justifyContent: "center",
    }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, lineHeight: 1.1 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ lineHeight: 1.2, color: value ? "text.primary" : "text.disabled" }}>
        {value ? fmtDate(value) : "— (sin días en Diario)"}
      </Typography>
    </Box>
  );
}

// Nombre de tarea editable que guarda al salir del campo (blur/Enter).
function NameField({ value, onCommit, strike }) {
  const [local, setLocal] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setLocal(value ?? ""); }, [value, focused]);
  const commit = () => {
    setFocused(false);
    const v = local.trim();
    if (v && v !== String(value ?? "")) onCommit(v);
    else setLocal(value ?? "");
  };
  return (
    <TextField
      variant="standard" fullWidth value={local}
      onFocus={() => setFocused(true)}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      InputProps={{ disableUnderline: true }}
      inputProps={{ style: { fontSize: 14, ...(strike ? { color: "rgba(0,0,0,0.55)" } : {}) } }}
    />
  );
}

export default function LineaTiempoPage() {
  const { proyecto } = useProjects();
  const theme = useTheme();
  const isSm = useMediaQuery(theme.breakpoints.down("sm"));
  const [hitos, setHitos] = useState(() => getCache("linea-tiempo", proyecto?.id)?.hitos ?? []);
  const [tareas, setTareas] = useState(() => getCache("linea-tiempo", proyecto?.id)?.tareas ?? []);
  const [diario, setDiario] = useState(() => getCache("linea-tiempo", proyecto?.id)?.diario ?? []);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [nuevaTarea, setNuevaTarea] = useState({});

  const reload = async () => {
    if (!proyecto) return;
    const cached = getCache("linea-tiempo", proyecto.id);
    if (cached) { setHitos(cached.hitos); setTareas(cached.tareas); setDiario(cached.diario ?? []); }
    setLoading(!cached); // con caché mostramos al instante y revalidamos sin bloquear
    const { data: hs } = await supabase
      .from("hitos").select("*")
      .eq("proyecto_id", proyecto.id).order("orden");
    const ids = (hs ?? []).map(h => h.id);
    let ts = [];
    if (ids.length) {
      const { data } = await supabase
        .from("hito_tareas").select("*").in("hito_id", ids).order("orden");
      ts = data ?? [];
    }
    // Días del Diario: fuente de verdad de las fechas reales de las tareas.
    const { data: dr } = await supabase
      .from("seguimiento_diario").select("fecha,trabajado,etapa,tareas").eq("proyecto_id", proyecto.id);
    const diarioData = dr ?? [];
    setCache("linea-tiempo", proyecto.id, { hitos: hs ?? [], tareas: ts, diario: diarioData });
    setHitos(hs ?? []);
    setTareas(ts);
    setDiario(diarioData);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  // Tareas con fechas reales y estado derivados del Diario (sobreescriben lo
  // guardado): las fechas salen de los días cargados y el estado surge de si
  // esos días son futuros (planificado), presentes/pasados (en curso) o si no
  // hay días (no iniciado). "Finalizado" se conserva por marca manual.
  const tareasConReal = useMemo(
    () => aplicarFechasReales(diario, tareas, hitos),
    [diario, tareas, hitos]
  );

  const tareasDe = (hitoId) =>
    tareasConReal.filter(t => t.hito_id === hitoId).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  // Avance de una tarea (0-100): usa 'avance', con fallback a completado.
  const avanceTarea = (t) => (t.avance != null ? Number(t.avance) : (t.completado ? 100 : 0));

  // Fracción completada de un hito (promedio de avance de subtareas).
  const fraccion = (h) => {
    const ts = tareasDe(h.id);
    if (ts.length > 0) return ts.reduce((s, t) => s + avanceTarea(t), 0) / (ts.length * 100);
    return h.completado ? 1 : 0;
  };

  // Peso de cada hito = delta hacia el siguiente milestone (NEXT-delta).
  // Así, completar las tareas de cada etapa suma su porción al avance.
  const conPeso = useMemo(() => {
    const sorted = [...hitos].sort((a, b) => a.orden - b.orden);
    return sorted.map((h, i) => {
      const next = sorted[i + 1];
      const peso = next ? Math.max(0, Number(next.porcentaje) - Number(h.porcentaje)) : 0;
      return { ...h, peso, desde: Number(h.porcentaje), hasta: next ? Number(next.porcentaje) : 100 };
    });
  }, [hitos]);

  const avance = useMemo(() => {
    return Math.round(conPeso.reduce((s, h) => s + h.peso * fraccion(h), 0));
  }, [conPeso, tareas]);

  const proximo = conPeso.find(h => fraccion(h) < 1 && h.peso > 0);

  // Fechas reales del proyecto a partir de las cargadas en cada etapa:
  // inicio real = primera fecha de inicio; fin real = última fecha de fin.
  const { inicioReal, finReal } = useMemo(() => {
    const inicios = hitos.map(h => h.fecha_estimada).filter(Boolean);
    const fines = hitos.map(h => h.fecha_real).filter(Boolean);
    const inicioReal = inicios.length ? inicios.reduce((m, d) => (d < m ? d : m)) : null;
    const finReal = fines.length ? fines.reduce((m, d) => (d > m ? d : m)) : null;
    return { inicioReal, finReal };
  }, [hitos]);

  const seedDefault = async () => {
    if (!proyecto) return;
    const seed = [
      { nombre: "Inicio", porcentaje: 0, orden: 1 },
      { nombre: "Cimentación", porcentaje: 15, orden: 2 },
      { nombre: "Estructura", porcentaje: 40, orden: 3 },
      { nombre: "Obra cerrada", porcentaje: 65, orden: 4 },
      { nombre: "Instalaciones + revoques", porcentaje: 85, orden: 5 },
      { nombre: "Terminada", porcentaje: 100, orden: 6 },
    ].map(h => ({ ...h, proyecto_id: proyecto.id }));
    const { error } = await supabase.from("hitos").insert(seed);
    if (error) alert(error.message);
    reload();
  };

  const updateHito = async (id, patch) => {
    setSavingId(id);
    const { error } = await supabase.from("hitos").update(patch).eq("id", id);
    setSavingId(null);
    if (error) alert(error.message);
    reload();
  };

  // Setea el % de avance de una tarea; 100% la marca como completada.
  const setAvanceTarea = async (t, valor) => {
    const avance = Math.max(0, Math.min(100, Math.round(Number(valor) || 0)));
    const completado = avance >= 100;
    const eraCompleto = avanceTarea(t) >= 100;
    const patch = { avance, completado };
    if (completado && !eraCompleto) patch.completado_at = new Date().toISOString();
    if (!completado) patch.completado_at = null;
    setTareas(prev => prev.map(x => x.id === t.id ? { ...x, ...patch } : x));
    const { error } = await supabase.from("hito_tareas").update(patch).eq("id", t.id);
    if (error) { alert(error.message); reload(); }
  };

  // Marca / desmarca una tarea como finalizada. El resto de los estados
  // (no iniciado / planificado / en curso) se derivan del Diario, así que acá
  // sólo manejamos la finalización manual.
  const setFinalizada = async (t, fin) => {
    const patch = fin
      ? { completado: true, avance: 100, completado_at: new Date().toISOString() }
      : { completado: false, avance: 0, completado_at: null };
    setTareas(prev => prev.map(x => x.id === t.id ? { ...x, ...patch } : x));
    const { error } = await supabase.from("hito_tareas").update(patch).eq("id", t.id);
    if (error) { alert(error.message); reload(); }
  };

  const setNombreTarea = async (t, nombre) => {
    setTareas(prev => prev.map(x => x.id === t.id ? { ...x, nombre } : x));
    const { error } = await supabase.from("hito_tareas").update({ nombre }).eq("id", t.id);
    if (error) { alert(error.message); reload(); }
  };

  const addTarea = async (hitoId) => {
    const nombre = (nuevaTarea[hitoId] || "").trim();
    if (!nombre) return;
    const orden = tareasDe(hitoId).length + 1;
    const { error } = await supabase.from("hito_tareas").insert({ hito_id: hitoId, nombre, orden });
    if (error) { alert(error.message); return; }
    setNuevaTarea(prev => ({ ...prev, [hitoId]: "" }));
    reload();
  };

  const delTarea = async (t) => {
    const { error } = await supabase.from("hito_tareas").delete().eq("id", t.id);
    if (error) alert(error.message); else reload();
  };

  // Drag & drop para reordenar tareas dentro de una etapa
  const [drag, setDrag] = useState(null); // { hitoId, fromId }

  const reordenarTareas = async (hitoId, fromId, toId) => {
    if (fromId === toId) return;
    const lista = tareasDe(hitoId);
    const fromIdx = lista.findIndex(t => t.id === fromId);
    const toIdx = lista.findIndex(t => t.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;

    const nueva = [...lista];
    const [movida] = nueva.splice(fromIdx, 1);
    nueva.splice(toIdx, 0, movida);

    // Reasignar orden 1..n y actualizar estado optimista
    const conOrden = nueva.map((t, i) => ({ ...t, orden: i + 1 }));
    setTareas(prev => prev.map(t => {
      const u = conOrden.find(x => x.id === t.id);
      return u ? { ...t, orden: u.orden } : t;
    }));

    // Persistir nuevos órdenes (sólo los que cambiaron)
    const cambios = conOrden.filter(t => {
      const orig = lista.find(x => x.id === t.id);
      return orig && orig.orden !== t.orden;
    });
    await Promise.all(cambios.map(t =>
      supabase.from("hito_tareas").update({ orden: t.orden }).eq("id", t.id)
    ));
  };

  const exportarPdf = () => {
    const secciones = conPeso.map((h) => {
      const ts = tareasDe(h.id);
      const d = diasHabiles(h.fecha_estimada, h.fecha_real);
      const meta = [
        h.peso > 0 ? `${h.desde}–${h.hasta}%` : `${h.desde}%`,
        h.fecha_estimada ? `Inicio: ${fmtDate(h.fecha_estimada)}` : null,
        h.fecha_real ? `Fin: ${fmtDate(h.fecha_real)}` : null,
        d != null ? `${d} días háb.` : null,
      ].filter(Boolean).join(" · ");
      const simbolo = { finalizado: "✔", en_curso: "◐", no_iniciado: "○" };
      const filas = ts.length
        ? ts.map(t => { const e = estadoTarea(t); return `<tr><td>${simbolo[e]}</td><td><span class="${e === "finalizado" ? "done" : ""}">${esc(t.nombre)}</span></td></tr>`; }).join("")
        : `<tr><td></td><td class="muted">Sin tareas</td></tr>`;
      return `<h2>${esc(h.nombre)} <span class="muted" style="font-weight:400">${esc(meta)}</span></h2>
        <table><tbody>${filas}</tbody></table>`;
    }).join("");
    const inicios = hitos.map(h => h.fecha_estimada).filter(Boolean);
    const fines = hitos.map(h => h.fecha_real).filter(Boolean);
    const iniR = inicios.length ? inicios.reduce((m, d) => (d < m ? d : m)) : null;
    const finR = fines.length ? fines.reduce((m, d) => (d > m ? d : m)) : null;
    const ms = mesesEntre(iniR, finR);
    const realStr = (iniR || finR)
      ? ` · Inicio real ${fmtDate(iniR)} · Fin real ${fmtDate(finR)}${ms != null ? ` · ${ms} ${ms === 1 ? "mes" : "meses"}` : ""}`
      : "";
    printDocument({
      title: "Planificación",
      subtitle: `${esc(proyecto.nombre)} · ${fmtDate(new Date().toISOString())} · Avance estimado ${avance}%${realStr}`,
      bodyHtml: secciones,
    });
  };

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="flex-start" spacing={1}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5">Planificación</Typography>
          <Typography variant="body2">Etapas, tareas y avance del proyecto.</Typography>
          <Typography variant="caption" color="text.secondary">
            Las fechas de la <b>etapa</b> son las <b>planificadas</b>; las fechas <b>reales</b> de cada <b>tarea</b> se toman automáticamente del <b>Diario</b> (primer y último día en que se cargó esa tarea).
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={exportarPdf}>
          PDF
        </Button>
      </Stack>

      {loading && <LinearProgress />}

      {/* Resumen de avance */}
      <Card>
        <CardContent>
          {/* Fechas reales del proyecto (según las etapas) */}
          {(inicioReal || finReal) && (
            <Box sx={{ mb: 2 }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 1.5, sm: 4 }} alignItems={{ sm: "flex-end" }} flexWrap="wrap" useFlexGap>
                <Box>
                  <Typography variant="caption" color="text.secondary">Inicio real</Typography>
                  <Typography variant="h6" sx={{ fontVariantNumeric: "tabular-nums" }}>{fmtDate(inicioReal)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Fin real</Typography>
                  <Typography variant="h6" sx={{ fontVariantNumeric: "tabular-nums" }}>{fmtDate(finReal)}</Typography>
                </Box>
                {(inicioReal && finReal) && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Duración</Typography>
                    <Typography variant="h6" color="secondary.main" fontWeight={700}>
                      {fmtDuracion(inicioReal, finReal)}
                    </Typography>
                  </Box>
                )}
                {proximo && (
                  <Box sx={{ ml: { sm: "auto" } }}>
                    <Chip label={`En curso: ${proximo.nombre}`} color="primary" />
                  </Box>
                )}
              </Stack>
              <Divider sx={{ mt: 2 }} />
            </Box>
          )}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
            <Box sx={{ flexGrow: 1, width: "100%" }}>
              <Typography variant="caption" color="text.secondary">Avance estimado</Typography>
              <Typography variant="h4">{avance}%</Typography>
              <Box sx={{ mt: 1, height: 12, bgcolor: "rgba(15,42,74,0.08)", borderRadius: 6, overflow: "hidden" }}>
                <Box sx={{ height: "100%", width: `${avance}%`, bgcolor: "secondary.main", transition: "width .4s" }} />
              </Box>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Línea de tiempo (Gantt) */}
      {inicioReal && finReal && conPeso.some(h => h.fecha_estimada && h.fecha_real) && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>Línea de tiempo de etapas</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: "block" }}>
              Arrastrá una barra para moverla, o sus bordes para cambiar la cantidad de días. Se guarda al soltar.
            </Typography>
            <GanttEtapas etapas={conPeso} inicioReal={inicioReal} finReal={finReal}
              onUpdate={(id, patch) => updateHito(id, patch)} getFraccion={fraccion} />
          </CardContent>
        </Card>
      )}

      {/* Etapas */}
      <Card>
        <CardContent sx={{ p: { xs: 1, sm: 2 } }}>
          {conPeso.length === 0 ? (
            <Stack spacing={2} alignItems="flex-start" sx={{ p: 2 }}>
              <Typography color="text.secondary">No hay etapas cargadas para este proyecto.</Typography>
              <Button variant="contained" color="secondary" onClick={seedDefault}>
                Cargar etapas por defecto
              </Button>
            </Stack>
          ) : (
            <Stack divider={<Divider />}>
              {conPeso.map((h) => {
                const ts = tareasDe(h.id);
                const f = fraccion(h);
                const done = f >= 1 && (ts.length > 0 || h.completado);
                const isOpen = expanded[h.id] ?? false;
                return (
                  <Box key={h.id} sx={{ py: 1.25, px: { xs: 0.5, sm: 1 } }}>
                    {/* Fila principal: toda la fila es clickeable */}
                    <Stack
                      direction="row" spacing={1.5} alignItems="center"
                      sx={{ cursor: "pointer", borderRadius: 2, p: 0.5, "&:hover": { bgcolor: "rgba(15,42,74,0.03)" } }}
                      onClick={() => setExpanded(p => ({ ...p, [h.id]: !isOpen }))}
                    >
                      {done
                        ? <CheckCircleIcon color="success" />
                        : <RadioButtonUncheckedIcon sx={{ color: "rgba(15,42,74,0.3)" }} />}

                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
                          <Typography fontWeight={600} noWrap>{h.nombre}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {h.peso > 0 ? `${h.desde}–${h.hasta}%` : `${h.desde}%`}
                          </Typography>
                        </Stack>
                        {ts.length > 0 && (
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                            <Box sx={{ flexGrow: 1, maxWidth: 220, height: 6, bgcolor: "rgba(15,42,74,0.08)", borderRadius: 3, overflow: "hidden" }}>
                              <Box sx={{ height: "100%", width: `${f * 100}%`, bgcolor: done ? "success.main" : "secondary.main" }} />
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                              {ts.filter(t => t.completado).length}/{ts.length}
                            </Typography>
                          </Stack>
                        )}
                      </Box>

                      {/* Fechas: ocultas en mobile (van en el detalle) */}
                      {!isSm && (
                        <Box onClick={(e) => e.stopPropagation()} sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
                          <DateField
                            label="Inicio (plan)" sx={{ width: DATE_W }}
                            value={h.fecha_estimada ?? ""}
                            disabled={savingId === h.id}
                            onCommit={(v) => updateHito(h.id, { fecha_estimada: v })}
                          />
                          <DateField
                            label="Fin (plan)" sx={{ width: DATE_W }}
                            value={h.fecha_real ?? ""}
                            disabled={savingId === h.id}
                            onCommit={(v) => updateHito(h.id, { fecha_real: v })}
                          />
                          {(() => {
                            const d = diasHabiles(h.fecha_estimada, h.fecha_real);
                            return (
                              <Box sx={{ width: CHIP_W, display: "flex", justifyContent: "center" }}>
                                {d != null && (
                                  <Chip size="small" variant="outlined"
                                    label={duracionEtapaLabel(h.fecha_estimada, h.fecha_real)}
                                    color={d < 0 ? "error" : "default"} />
                                )}
                              </Box>
                            );
                          })()}
                        </Box>
                      )}

                      {/* Completado SIEMPRE a la derecha */}
                      <Box onClick={(e) => e.stopPropagation()}>
                        <Tooltip title={ts.length > 0 ? "Se completa al tildar todas las tareas" : "Marcar etapa como completada"}>
                          <span>
                            <Checkbox
                              checked={done}
                              disabled={savingId === h.id || ts.length > 0}
                              onChange={(e) => updateHito(h.id, { completado: e.target.checked })}
                            />
                          </span>
                        </Tooltip>
                      </Box>

                      <IconButton size="small" tabIndex={-1} sx={{ pointerEvents: "none" }} onClick={() => setExpanded(p => ({ ...p, [h.id]: !isOpen }))}>
                        {isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </Stack>

                    {/* Detalle expandible: tareas + fechas en mobile */}
                    <Collapse in={isOpen} unmountOnExit>
                      <Box sx={{ pl: { xs: 0, sm: 5 }, pr: 1, pt: 1.5, pb: 0.5 }}>
                        {isSm && (
                          <Grid container spacing={1.5} sx={{ mb: 1.5 }} alignItems="center">
                            <Grid item xs={6}>
                              <DateField fullWidth label="Inicio (plan)"
                                value={h.fecha_estimada ?? ""}
                                onCommit={(v) => updateHito(h.id, { fecha_estimada: v })} />
                            </Grid>
                            <Grid item xs={6}>
                              <DateField fullWidth label="Fin (plan)"
                                value={h.fecha_real ?? ""}
                                onCommit={(v) => updateHito(h.id, { fecha_real: v })} />
                            </Grid>
                            {(() => {
                              const d = diasHabiles(h.fecha_estimada, h.fecha_real);
                              return d != null ? (
                                <Grid item xs={12}>
                                  <Chip size="small" variant="outlined"
                                    label={duracionEtapaLabel(h.fecha_estimada, h.fecha_real)}
                                    color={d < 0 ? "error" : "default"} />
                                </Grid>
                              ) : null;
                            })()}
                          </Grid>
                        )}

                        {ts.length === 0 && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            Esta etapa no tiene tareas. Agregá las principales abajo.
                          </Typography>
                        )}

                        <Stack spacing={1.25}>
                          {ts.map((t) => {
                            const dragging = drag?.fromId === t.id;
                            const isTarget = drag?.hitoId === h.id && drag?.overId === t.id && drag?.fromId !== t.id;
                            const est = estadoTarea(t);
                            const bgEstado =
                              est === "finalizado" ? alpha(theme.palette.success.main, 0.08)
                              : est === "en_curso" ? alpha(theme.palette.info.main, 0.08)
                              : alpha(theme.palette.text.primary, 0.04);
                            return (
                            <Stack
                              key={t.id} direction="row" alignItems="center"
                              onDragOver={(e) => {
                                if (drag?.hitoId !== h.id) return;
                                e.preventDefault();
                                if (drag.overId !== t.id) setDrag(d => ({ ...d, overId: t.id }));
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (drag?.hitoId === h.id) reordenarTareas(h.id, drag.fromId, t.id);
                                setDrag(null);
                              }}
                              sx={{
                                "&:hover .del": { opacity: 1 },
                                "&:hover .drag": { opacity: 1 },
                                opacity: dragging ? 0.4 : 1,
                                bgcolor: bgEstado, borderRadius: 1.5, py: 0.75, px: 1,
                                borderTop: isTarget ? "2px solid" : "2px solid transparent",
                                borderTopColor: isTarget ? "secondary.main" : "transparent",
                              }}
                            >
                              <Tooltip title="Arrastrá para reordenar">
                                <IconButton
                                  className="drag" size="small"
                                  draggable
                                  onDragStart={() => setDrag({ hitoId: h.id, fromId: t.id, overId: t.id })}
                                  onDragEnd={() => setDrag(null)}
                                  sx={{ cursor: "grab", opacity: { xs: 1, sm: 0 }, transition: "opacity .15s", touchAction: "none" }}
                                >
                                  <DragIndicatorIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              {/* nombre (editable) */}
                              <Box onClick={(e) => e.stopPropagation()} sx={{ flexGrow: 1, minWidth: 0, mr: 1 }}>
                                <NameField value={t.nombre} strike={est === "finalizado"}
                                  onCommit={(v) => setNombreTarea(t, v)} />
                              </Box>
                              {/* estado (derivado del Diario) + finalización manual */}
                              <Box onClick={(e) => e.stopPropagation()} sx={{ mr: 1, width: 150, display: "flex", alignItems: "center", gap: 0.5 }}>
                                <Chip
                                  size="small" variant="outlined"
                                  color={ESTADO_COLOR[est] || "default"}
                                  label={ESTADO_LABEL[est] || est}
                                  sx={{ flexGrow: 1 }}
                                />
                                <Tooltip title={est === "finalizado" ? "Reabrir tarea" : "Marcar como finalizada"}>
                                  <Checkbox
                                    size="small" color="success"
                                    checked={est === "finalizado"}
                                    icon={<RadioButtonUncheckedIcon fontSize="small" />}
                                    checkedIcon={<CheckCircleIcon fontSize="small" />}
                                    onChange={(e) => setFinalizada(t, e.target.checked)}
                                    sx={{ p: 0.5 }}
                                  />
                                </Tooltip>
                              </Box>
                              {/* avance (sólo en curso) */}
                              <Box onClick={(e) => e.stopPropagation()} sx={{ mr: 1.5, width: 92, display: "flex", justifyContent: "flex-end" }}>
                                {est === "en_curso" && (
                                  <PctField value={avanceTarea(t)} onCommit={(v) => setAvanceTarea(t, v)} />
                                )}
                              </Box>
                              {/* fechas reales (según el Diario), alineadas con la etapa */}
                              <Box onClick={(e) => e.stopPropagation()} sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
                                <Box sx={{ width: DATE_W }}>
                                  <RealDate label="Inicio (real)" value={t.fecha_inicio} />
                                </Box>
                                <Box sx={{ width: DATE_W }}>
                                  <RealDate label="Fin (real)" value={t.fecha_fin} />
                                </Box>
                                <Box sx={{ width: CHIP_W, display: "flex", justifyContent: "center" }}>
                                  {(() => {
                                    const d = diasHabiles(t.fecha_inicio, t.fecha_fin);
                                    return d != null ? (
                                      <Chip size="small" variant="outlined"
                                        label={`${d} día${Math.abs(d) === 1 ? "" : "s"} háb.`}
                                        color={d < 0 ? "error" : "default"} />
                                    ) : null;
                                  })()}
                                </Box>
                                <Box sx={{ width: CHK_W }} />
                                <Box sx={{ width: CHK_W, display: "flex", justifyContent: "center" }}>
                                  <Tooltip title="Eliminar tarea">
                                    <IconButton className="del" size="small" sx={{ opacity: { xs: 1, sm: 0 }, transition: "opacity .15s" }} onClick={() => delTarea(t)}>
                                      <DeleteOutlineIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </Box>
                            </Stack>
                            );
                          })}
                        </Stack>

                        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                          <TextField
                            size="small" fullWidth placeholder="Agregar tarea…"
                            value={nuevaTarea[h.id] || ""}
                            onChange={(e) => setNuevaTarea(p => ({ ...p, [h.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") addTarea(h.id); }}
                          />
                          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => addTarea(h.id)} sx={{ flexShrink: 0 }}>
                            Agregar
                          </Button>
                        </Stack>
                      </Box>
                    </Collapse>
                  </Box>
                );
              })}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
