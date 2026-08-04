"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, Chip, Button, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, useMediaQuery,
  ToggleButtonGroup, ToggleButton, TextField, MenuItem, LinearProgress, Tooltip,
  Checkbox, ListItemText, OutlinedInput, Select, InputLabel, FormControl, Grid
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import NotesIcon from "@mui/icons-material/Notes";
import { useEffect, useMemo, useState } from "react";
import { useTheme, alpha } from "@mui/material/styles";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtDate } from "@/components/Money";
import { getCache, setCache } from "@/lib/dataCache";
import { parseCsv, serializeLista } from "@/lib/fechasReales";

// Causas frecuentes de jornada no trabajada.
const CAUSAS = ["Lluvia", "Falta de personal", "Falta de materiales", "Feriado", "Otra"];

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
// Encabezado del calendario arrancando en lunes.
const DIAS_CORTO = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
// Día de la semana (0=Dom … 6=Sáb) corresponde a fin de semana.
const esFinDeSemana = (dow) => dow === 0 || dow === 6;
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const iso = (y, m, d) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const hoyISO = () => {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth(), d.getDate());
};
function diaSemana(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr + "T00:00:00");
  return isNaN(d) ? "" : DIAS[d.getDay()];
}
// Etapas y tareas se serializan como JSON (ver fechasReales.js) para que los
// nombres con comas sobrevivan el ida y vuelta. parseCsv sigue leyendo el
// formato legado separado por comas.
const parseEtapas = parseCsv;
const joinEtapas = serializeLista;

// ¿Una tarea de hito está finalizada? Una tarea se marca finalizada desde
// Línea de tiempo seteando completado=true / avance=100 (sin tocar 'estado', que
// puede quedar en 'no_iniciado'). Por eso NO alcanza con mirar 'estado': la damos
// por finalizada si CUALQUIER señal lo indica (estado, completado o avance 100).
const tareaFinalizada = (t) => {
  if (t?.estado === "finalizado") return true;
  if (t?.completado) return true;
  const av = t?.avance != null ? Number(t.avance) : 0;
  return av >= 100;
};

// --- Gráfico de barras verticales liviano (SVG-free, con divs) ---
// Ocupa todo el alto disponible: la zona de barras crece para que las
// barras queden ancladas al borde inferior del recuadro.
function BarrasVerticales({ data, color }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <Box sx={{ display: "flex", alignItems: "stretch", gap: 0.5, flexGrow: 1, minHeight: 180 }}>
      {data.map((d) => (
        <Box key={d.label} sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {/* valor */}
          <Typography variant="caption" sx={{ fontSize: 10, lineHeight: 1, height: 14, color: "text.secondary" }}>
            {d.value || ""}
          </Typography>
          {/* zona de barras: crece para ocupar el alto y baseline común */}
          <Box sx={{ flexGrow: 1, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", borderBottom: "1px solid", borderColor: "divider" }}>
            <Tooltip title={`${d.full ?? d.label}: ${d.value}`} arrow disableInteractive>
              <Box sx={{
                width: "70%", borderRadius: "4px 4px 0 0",
                height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 3 : 0,
                bgcolor: color, transition: "height .2s",
              }} />
            </Tooltip>
          </Box>
          {/* etiqueta */}
          <Typography variant="caption" sx={{ fontSize: 9.5, lineHeight: 1, mt: 0.5, color: "text.secondary" }}>
            {d.label}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

// --- Gráfico de barras horizontales (mejor para etiquetas largas: etapas) ---
function BarrasHorizontales({ data, color }) {
  const max = Math.max(1, ...data.map(d => d.value));
  if (data.length === 0) {
    return <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>Sin días cargados todavía.</Typography>;
  }
  return (
    <Stack spacing={1}>
      {data.map((d) => (
        <Box key={d.label}>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
            <Typography variant="caption" noWrap sx={{ maxWidth: "80%" }}>{d.label}</Typography>
            <Typography variant="caption" fontWeight={700}>{d.value}</Typography>
          </Stack>
          <Box sx={{ height: 8, borderRadius: 4, bgcolor: "action.hover", overflow: "hidden" }}>
            <Box sx={{ height: "100%", width: `${(d.value / max) * 100}%`, bgcolor: color, borderRadius: 4 }} />
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

export default function SeguimientoDiarioPage() {
  const { proyecto } = useProjects();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  const [registros, setRegistros] = useState(() => getCache("seguimiento-diario", proyecto?.id) ?? []);
  const [etapas, setEtapas] = useState([]);
  const [tareasPorEtapa, setTareasPorEtapa] = useState({}); // { nombreEtapa: [nombreTarea, ...] }
  const [etapasCompletas, setEtapasCompletas] = useState(() => new Set()); // etapas al 100% (se ocultan del selector)
  const [tareasCompletas, setTareasCompletas] = useState(() => new Set()); // tareas finalizadas
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-11

  const [open, setOpen] = useState(false);
  const [fechaSel, setFechaSel] = useState(null);
  const [form, setForm] = useState({ trabajado: true, causa: "", etapas: [], tareas: [], observacion: "" });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [etapasOpen, setEtapasOpen] = useState(false);
  const [tareasOpen, setTareasOpen] = useState(false);
  const [dupDias, setDupDias] = useState(2); // cuántos días copiar al duplicar
  const [dragFrom, setDragFrom] = useState(null); // fecha origen del arrastre
  const [dragOver, setDragOver] = useState(null); // fecha destino resaltada

  const reload = async () => {
    if (!proyecto) return;
    const cached = getCache("seguimiento-diario", proyecto.id);
    setRegistros(cached ?? []);
    setLoading(!cached);
    const [{ data: regs }, { data: hs }] = await Promise.all([
      supabase.from("seguimiento_diario").select("*").eq("proyecto_id", proyecto.id),
      supabase.from("hitos").select("id,nombre,orden,completado").eq("proyecto_id", proyecto.id).order("orden"),
    ]);
    setCache("seguimiento-diario", proyecto.id, regs ?? []);
    setRegistros(regs ?? []);
    setEtapas((hs ?? []).map(h => h.nombre));

    // Tareas (subtareas) de cada etapa/hito, para asociar y para saber el avance
    // (así podemos ocultar del selector las etapas/tareas ya terminadas).
    const ids = (hs ?? []).map(h => h.id);
    const mapa = {};
    const tareasFin = new Set();      // tareas finalizadas (por nombre)
    const tareasPorId = {};           // hito_id -> [tareas]
    if (ids.length) {
      const { data: ts } = await supabase
        .from("hito_tareas").select("hito_id,nombre,orden,avance,completado,estado").in("hito_id", ids).order("orden");
      const idToNombre = Object.fromEntries((hs ?? []).map(h => [h.id, h.nombre]));
      for (const t of ts ?? []) {
        const et = idToNombre[t.hito_id];
        if (!et) continue;
        (mapa[et] ??= []).push(t.nombre);
        (tareasPorId[t.hito_id] ??= []).push(t);
        if (tareaFinalizada(t)) tareasFin.add(t.nombre);
      }
    }
    // Una etapa está completa si tiene tareas y todas están finalizadas, o si no
    // tiene tareas y el hito quedó marcado como completado (mismo criterio que Cronograma).
    const etapasFin = new Set();
    for (const h of hs ?? []) {
      const ts = tareasPorId[h.id] ?? [];
      const fin = ts.length > 0 ? ts.every(tareaFinalizada) : !!h.completado;
      if (fin) etapasFin.add(h.nombre);
    }
    setTareasPorEtapa(mapa);
    setEtapasCompletas(etapasFin);
    setTareasCompletas(tareasFin);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  // Mapa fecha -> registro
  const porFecha = useMemo(() => {
    const m = {};
    for (const r of registros) m[r.fecha] = r;
    return m;
  }, [registros]);

  // Días trabajados por mes — ventana fija de junio 2026 a junio 2027.
  const porMes = useMemo(() => {
    const meses = []; // {y, m(0-11), key, value}
    let y = 2026, m = 5; // junio 2026
    for (let i = 0; i < 13; i++) {
      meses.push({
        y, m,
        label: m === 0 ? `${MESES_CORTO[m]} ${String(y).slice(2)}` : MESES_CORTO[m],
        full: `${MESES[m]} ${y}`,
        value: 0,
      });
      m++;
      if (m > 11) { m = 0; y++; }
    }
    const idx = {};
    meses.forEach((mes, i) => { idx[`${mes.y}-${mes.m}`] = i; });
    for (const r of registros) {
      if (!r.trabajado) continue;
      const [yy, mm] = r.fecha.split("-").map(Number);
      const i = idx[`${yy}-${mm - 1}`];
      if (i != null) meses[i].value += 1;
    }
    return meses;
  }, [registros]);

  // Días trabajados por etapa (acumulado, todo el proyecto)
  const porEtapa = useMemo(() => {
    const acc = {};
    for (const r of registros) {
      if (!r.trabajado) continue;
      const ets = parseEtapas(r.etapa);
      if (ets.length === 0) { acc["Sin etapa"] = (acc["Sin etapa"] ?? 0) + 1; continue; }
      for (const e of ets) acc[e] = (acc[e] ?? 0) + 1;
    }
    return Object.entries(acc)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [registros]);

  // Totales del mes visible
  const statsMes = useMemo(() => {
    const prefijo = `${year}-${String(month + 1).padStart(2, "0")}`;
    const delMes = registros.filter(r => r.fecha.startsWith(prefijo));
    return {
      trabajados: delMes.filter(r => r.trabajado).length,
      noTrabajados: delMes.filter(r => !r.trabajado).length,
    };
  }, [registros, year, month]);

  // Celdas del calendario. Arranca en lunes y rellena el inicio y el final
  // con los días de los meses vecinos (marcados como "otroMes").
  const celdas = useMemo(() => {
    // getDay(): 0=Dom … 6=Sáb. Reordenamos para que lunes sea la 1ª columna.
    const primero = (new Date(year, month, 1).getDay() + 6) % 7;
    const diasMes = new Date(year, month + 1, 0).getDate();
    const arr = [];
    // Cola del mes anterior para completar el inicio.
    const prevDias = new Date(year, month, 0).getDate();
    let py = year, pm = month - 1;
    if (pm < 0) { pm = 11; py--; }
    for (let i = primero - 1; i >= 0; i--) {
      arr.push({ d: prevDias - i, y: py, m: pm, otroMes: true });
    }
    // Días del mes en curso.
    for (let d = 1; d <= diasMes; d++) arr.push({ d, y: year, m: month, otroMes: false });
    // Cabeza del mes siguiente para completar la última semana.
    let ny = year, nm = month + 1;
    if (nm > 11) { nm = 0; ny++; }
    let nd = 1;
    while (arr.length % 7 !== 0) arr.push({ d: nd++, y: ny, m: nm, otroMes: true });
    return arr;
  }, [year, month]);

  const cambiarMes = (delta) => {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y);
  };
  const irHoy = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); };

  const abrirDia = (cell) => {
    if (!cell) return;
    // Si se toca un día de otro mes, navegamos a ese mes.
    if (cell.otroMes) { setYear(cell.y); setMonth(cell.m); }
    const fecha = iso(cell.y, cell.m, cell.d);
    const r = porFecha[fecha];
    setFechaSel(fecha);
    setEditId(r?.id ?? null);
    setForm({
      trabajado: r ? r.trabajado : true,
      causa: r?.causa ?? "",
      etapas: parseEtapas(r?.etapa),
      tareas: parseEtapas(r?.tareas),
      observacion: r?.observacion ?? "",
    });
    setErr(null);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!proyecto || !fechaSel) return;
    setErr(null);
    if (!form.trabajado && !form.causa.trim()) {
      setErr("Indicá la causa por la que no se trabajó.");
      return;
    }
    setSaving(true);
    const payload = {
      proyecto_id: proyecto.id,
      fecha: fechaSel,
      trabajado: form.trabajado,
      causa: form.trabajado ? null : (form.causa.trim() || null),
      etapa: joinEtapas(form.etapas),
      tareas: joinEtapas(form.tareas),
      observacion: form.observacion.trim() || null,
    };
    const res = await supabase
      .from("seguimiento_diario")
      .upsert(payload, { onConflict: "proyecto_id,fecha" });
    setSaving(false);
    if (res.error) { setErr(res.error.message); return; }
    setOpen(false);
    reload();
  };

  const handleDelete = async () => {
    if (!editId) { setOpen(false); return; }
    if (!confirm("¿Borrar el registro de este día?")) return;
    const { error } = await supabase.from("seguimiento_diario").delete().eq("id", editId);
    if (error) { setErr(error.message); return; }
    setOpen(false);
    reload();
  };

  // Mueve el registro de un día a otro (arrastrar y soltar). Si el destino ya
  // tiene registro, pide confirmación y lo reemplaza.
  const moverRegistro = async (fromFecha, toFecha) => {
    if (!fromFecha || !toFecha || fromFecha === toFecha) return;
    const src = porFecha[fromFecha];
    if (!src) return;
    const dst = porFecha[toFecha];
    if (dst) {
      if (!confirm(`El ${fmtDate(toFecha)} ya tiene un registro. ¿Reemplazarlo con el del ${fmtDate(fromFecha)}?`)) return;
      const { error: delErr } = await supabase.from("seguimiento_diario").delete().eq("id", dst.id);
      if (delErr) { alert(delErr.message); return; }
    }
    const { error } = await supabase.from("seguimiento_diario").update({ fecha: toFecha }).eq("id", src.id);
    if (error) { alert(error.message); return; }
    reload();
  };

  // Duplica el contenido del día abierto (incluido él mismo) a los próximos N
  // días consecutivos, sobrescribiendo lo que hubiera en esos días.
  const duplicar = async () => {
    if (!proyecto || !fechaSel) return;
    if (!form.trabajado && !form.causa.trim()) { setErr("Indicá la causa por la que no se trabajó."); return; }
    const n = Math.max(1, Math.min(60, Number(dupDias) || 1));
    const base = new Date(fechaSel + "T00:00:00");
    const datos = {
      trabajado: form.trabajado,
      causa: form.trabajado ? null : (form.causa.trim() || null),
      etapa: joinEtapas(form.etapas),
      tareas: joinEtapas(form.tareas),
      observacion: form.observacion.trim() || null,
    };
    const rows = [];
    for (let i = 0; i <= n; i++) {
      const d = new Date(base); d.setDate(d.getDate() + i);
      rows.push({ proyecto_id: proyecto.id, fecha: iso(d.getFullYear(), d.getMonth(), d.getDate()), ...datos });
    }
    setSaving(true);
    const { error } = await supabase.from("seguimiento_diario").upsert(rows, { onConflict: "proyecto_id,fecha" });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setOpen(false);
    reload();
  };

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  const success = theme.palette.success.main;

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5">Diario</Typography>
        <Typography variant="body2" color="text.secondary">
          Tocá un día para registrar si se trabajó o no. Si no se trabajó, indicá la causa. Podés cargar una o varias etapas.
        </Typography>
      </Box>

      {loading && <LinearProgress />}

      {/* Gráficos */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Días trabajados por mes · Jun 2026 – Jun 2027</Typography>
              <BarrasVerticales data={porMes} color={success} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Días trabajados por etapa</Typography>
              <BarrasHorizontales data={porEtapa} color={alpha(success, 0.45)} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Calendario */}
      <Card>
        <CardContent sx={{ p: { xs: 1, sm: 1.5 } }}>
          {/* Navegación de mes */}
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <IconButton size="small" onClick={() => cambiarMes(-1)}><ChevronLeftIcon /></IconButton>
            <Typography variant="subtitle1" sx={{ flexGrow: 1, textAlign: "center", fontWeight: 700 }}>
              {MESES[month]} {year}
            </Typography>
            <Button size="small" onClick={irHoy}>Hoy</Button>
            <IconButton size="small" onClick={() => cambiarMes(1)}><ChevronRightIcon /></IconButton>
          </Stack>

          {/* Resumen del mes */}
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            <Chip size="small" color="success" variant="outlined" label={`${statsMes.trabajados} trabajados`} />
            <Chip size="small" color="error" variant="outlined" label={`${statsMes.noTrabajados} sin trabajar`} />
          </Stack>

          {/* Encabezado días de la semana */}
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.5, mb: 0.5 }}>
            {DIAS_CORTO.map(d => (
              <Typography key={d} variant="caption" align="center" color="text.secondary" sx={{ fontWeight: 700 }}>
                {d}
              </Typography>
            ))}
          </Box>

          {/* Grilla del calendario */}
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridAutoRows: 64, gap: 0.5 }}>
            {celdas.map((cell, i) => {
              const { d, y, m, otroMes } = cell;
              const fecha = iso(y, m, d);
              const r = porFecha[fecha];
              const esHoy = fecha === hoyISO();
              const ets = r ? parseEtapas(r.etapa) : [];
              const finDeSemana = esFinDeSemana(new Date(y, m, d).getDay());
              let bg = finDeSemana ? alpha(theme.palette.text.primary, 0.06) : "transparent";
              let border = theme.palette.divider;
              if (r) {
                if (r.trabajado) { bg = alpha(theme.palette.success.main, 0.16); border = alpha(theme.palette.success.main, 0.5); }
                else { bg = alpha(theme.palette.error.main, 0.16); border = alpha(theme.palette.error.main, 0.5); }
              }
              const tareasDia = r ? parseEtapas(r.tareas) : [];
              const detalle = r
                ? (r.trabajado
                    ? [ets.join(", "), tareasDia.length ? "Tareas: " + tareasDia.join(", ") : ""].filter(Boolean).join(" · ")
                    : `No: ${r.causa || "—"}`)
                : "";
              return (
                <Tooltip
                  key={fecha}
                  title={detalle + (r?.observacion ? `${detalle ? " · " : ""}${r.observacion}` : "")}
                  arrow disableInteractive
                >
                  <Box
                    onClick={() => abrirDia(cell)}
                    draggable={!!r}
                    onDragStart={(e) => { if (r) { setDragFrom(fecha); e.dataTransfer.effectAllowed = "move"; } }}
                    onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                    onDragOver={(e) => { if (dragFrom && dragFrom !== fecha) { e.preventDefault(); if (dragOver !== fecha) setDragOver(fecha); } }}
                    onDragLeave={() => { if (dragOver === fecha) setDragOver(null); }}
                    onDrop={(e) => { e.preventDefault(); moverRegistro(dragFrom, fecha); setDragFrom(null); setDragOver(null); }}
                    sx={{
                      cursor: r ? "grab" : "pointer", borderRadius: 1.5,
                      border: dragOver === fecha ? "2px dashed" : "1px solid",
                      borderColor: dragOver === fecha ? "primary.main" : border,
                      bgcolor: bg,
                      p: 0.75, overflow: "hidden",
                      display: "flex", flexDirection: "column", alignItems: "center",
                      outline: esHoy ? `2px solid ${theme.palette.primary.main}` : "none",
                      outlineOffset: -2,
                      opacity: (otroMes ? 0.5 : 1) * (dragFrom === fecha ? 0.4 : 1),
                      transition: "background-color .1s",
                      "&:hover": { borderColor: "primary.main" },
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: esHoy ? 800 : 700, lineHeight: 1, color: "text.primary" }}>
                      {d}
                    </Typography>
                    {/* Días sin trabajar: mostramos el motivo. */}
                    {r && !r.trabajado && (
                      <Typography variant="caption" align="center" sx={{
                        fontSize: 9.5, lineHeight: 1.05, mt: 0.4, color: "error.main",
                        overflow: "hidden", textOverflow: "ellipsis",
                        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      }}>
                        No: {r.causa || "—"}
                      </Typography>
                    )}
                    {/* Días trabajados: mostramos la ETAPA y la TAREA. */}
                    {r && r.trabajado && (ets.length > 0 || tareasDia.length > 0) && (
                      <Box sx={{ mt: 0.3, width: "100%", overflow: "hidden" }}>
                        {ets.length > 0 && (
                          <Typography variant="caption" align="center" sx={{
                            display: "block", fontSize: 9, lineHeight: 1.05, color: "text.secondary",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {ets.join(", ")}
                          </Typography>
                        )}
                        {tareasDia.length > 0 && (
                          <Typography variant="caption" align="center" sx={{
                            fontSize: 9.5, lineHeight: 1.05, color: "text.primary",
                            overflow: "hidden", textOverflow: "ellipsis",
                            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                          }}>
                            {tareasDia.join(", ")}
                          </Typography>
                        )}
                      </Box>
                    )}
                    {r?.observacion && (
                      <Stack direction="row" spacing={0.25} alignItems="center" sx={{ mt: "auto", maxWidth: "100%" }}>
                        <NotesIcon sx={{ fontSize: 11, color: "text.secondary", flexShrink: 0 }} />
                        <Typography variant="caption" noWrap sx={{ fontSize: 9, color: "text.secondary" }}>
                          {r.observacion}
                        </Typography>
                      </Stack>
                    )}
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
        </CardContent>
      </Card>

      {/* Dialog de carga rápida */}
      <Dialog open={open} onClose={() => setOpen(false)} fullScreen={fullScreen} fullWidth maxWidth="xs">
        <DialogTitle>
          {fechaSel ? `${diaSemana(fechaSel)} ${fmtDate(fechaSel)}` : "Día"}
        </DialogTitle>
        <DialogContent dividers>
          {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
          <Stack spacing={2}>
            <ToggleButtonGroup
              fullWidth exclusive color="primary"
              value={form.trabajado ? "si" : "no"}
              onChange={(e, v) => { if (v) setForm(f => ({ ...f, trabajado: v === "si" })); }}
            >
              <ToggleButton value="si">Se trabajó</ToggleButton>
              <ToggleButton value="no">No se trabajó</ToggleButton>
            </ToggleButtonGroup>

            {!form.trabajado && (
              <TextField
                select fullWidth label="Causa" value={CAUSAS.includes(form.causa) || form.causa === "" ? form.causa : "Otra"}
                onChange={(e) => setForm(f => ({ ...f, causa: e.target.value === "Otra" ? "" : e.target.value }))}
              >
                {CAUSAS.map(c => <MenuItem key={c} value={c === "Otra" ? "Otra" : c}>{c}</MenuItem>)}
              </TextField>
            )}
            {!form.trabajado && !CAUSAS.slice(0, -1).includes(form.causa) && (
              <TextField
                fullWidth label="Detalle de la causa" value={form.causa}
                onChange={(e) => setForm(f => ({ ...f, causa: e.target.value }))}
              />
            )}

            <FormControl fullWidth>
              <InputLabel id="etapas-lbl">Etapas (opcional)</InputLabel>
              <Select
                labelId="etapas-lbl" multiple
                open={etapasOpen}
                onOpen={() => setEtapasOpen(true)}
                onClose={() => setEtapasOpen(false)}
                value={form.etapas}
                onChange={(e) => {
                  const val = typeof e.target.value === "string" ? e.target.value.split(",") : e.target.value;
                  // Al cambiar etapas, descartar tareas que ya no pertenezcan a ninguna etapa elegida
                  setForm(f => {
                    const disponibles = new Set(val.flatMap(et => tareasPorEtapa[et] ?? []));
                    return { ...f, etapas: val, tareas: f.tareas.filter(t => disponibles.has(t)) };
                  });
                }}
                input={<OutlinedInput label="Etapas (opcional)" />}
                renderValue={(sel) => sel.join(", ")}
                MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
              >
                {etapas
                  .filter(et => !etapasCompletas.has(et) || form.etapas.includes(et))
                  .map(et => (
                  <MenuItem key={et} value={et}>
                    <Checkbox checked={form.etapas.indexOf(et) > -1} />
                    <ListItemText primary={et}
                      secondary={etapasCompletas.has(et) ? "terminada" : undefined} />
                  </MenuItem>
                ))}
                <Box sx={{ position: "sticky", bottom: 0, bgcolor: "background.paper", p: 1, borderTop: "1px solid", borderColor: "divider", display: "flex", justifyContent: "flex-end" }}>
                  <Button size="small" variant="contained" onMouseDown={(e) => { e.preventDefault(); setEtapasOpen(false); }}>
                    OK
                  </Button>
                </Box>
              </Select>
            </FormControl>

            {/* Tareas de las etapas elegidas (opcional, sólo informativo) */}
            {(() => {
              const tareasDisponibles = [...new Set(form.etapas.flatMap(et => tareasPorEtapa[et] ?? []))]
                // Oculto las tareas ya finalizadas, salvo que estén elegidas (editar días viejos).
                .filter(t => !tareasCompletas.has(t) || form.tareas.includes(t));
              if (tareasDisponibles.length === 0) return null;
              return (
                <FormControl fullWidth>
                  <InputLabel id="tareas-lbl">Tareas (opcional)</InputLabel>
                  <Select
                    labelId="tareas-lbl" multiple
                    open={tareasOpen}
                    onOpen={() => setTareasOpen(true)}
                    onClose={() => setTareasOpen(false)}
                    value={form.tareas}
                    onChange={(e) => setForm(f => ({ ...f, tareas: typeof e.target.value === "string" ? e.target.value.split(",") : e.target.value }))}
                    input={<OutlinedInput label="Tareas (opcional)" />}
                    renderValue={(sel) => sel.join(", ")}
                    MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
                  >
                    {tareasDisponibles.map(t => (
                      <MenuItem key={t} value={t}>
                        <Checkbox checked={form.tareas.indexOf(t) > -1} />
                        <ListItemText primary={t} />
                      </MenuItem>
                    ))}
                    <Box sx={{ position: "sticky", bottom: 0, bgcolor: "background.paper", p: 1, borderTop: "1px solid", borderColor: "divider", display: "flex", justifyContent: "flex-end" }}>
                      <Button size="small" variant="contained" onMouseDown={(e) => { e.preventDefault(); setTareasOpen(false); }}>
                        OK
                      </Button>
                    </Box>
                  </Select>
                </FormControl>
              );
            })()}

            <TextField
              fullWidth label="Observación (opcional)" multiline minRows={2}
              value={form.observacion}
              onChange={(e) => setForm(f => ({ ...f, observacion: e.target.value }))}
            />

            {/* Duplicar a los días siguientes (tareas que duran varios días) */}
            <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: "action.hover" }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="body2">Duplicar a los próximos</Typography>
                <TextField
                  type="number" size="small" value={dupDias}
                  onChange={(e) => setDupDias(e.target.value)}
                  inputProps={{ min: 1, max: 60, style: { width: 44, textAlign: "center" } }}
                />
                <Typography variant="body2">días</Typography>
                <Button size="small" variant="outlined" onClick={duplicar} disabled={saving}>
                  Duplicar
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Copia este día (con sus etapas, tareas y observación) a los días consecutivos. Útil para una tarea que dura varios días.
              </Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "space-between" }}>
          {editId ? (
            <IconButton color="error" onClick={handleDelete}><DeleteOutlineIcon /></IconButton>
          ) : <Box />}
          <Box>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="contained" onClick={handleSave} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
