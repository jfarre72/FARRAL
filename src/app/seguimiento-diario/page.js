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

// Causas frecuentes de jornada no trabajada.
const CAUSAS = ["Lluvia", "Falta de personal", "Falta de materiales", "Feriado", "Otra"];

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DIAS_CORTO = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];
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
// Las etapas se guardan como texto separado por comas. Helpers de ida y vuelta.
const parseEtapas = (s) => (s ? s.split(",").map(x => x.trim()).filter(Boolean) : []);
const joinEtapas = (arr) => (arr && arr.length ? arr.join(", ") : null);

// --- Gráfico de barras verticales liviano (SVG-free, con divs) ---
// Estructura en 3 zonas alineadas: valor (arriba), barras (alto fijo,
// baseline común) y etiqueta de mes (abajo). Así ninguna columna queda
// desfasada respecto del resto.
function BarrasVerticales({ data, color, alto = 150 }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <Box sx={{ display: "flex", alignItems: "stretch", gap: 0.5 }}>
      {data.map((d) => (
        <Box key={d.label} sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
          {/* valor */}
          <Typography variant="caption" sx={{ fontSize: 10, lineHeight: 1, height: 14, color: "text.secondary" }}>
            {d.value || ""}
          </Typography>
          {/* zona de barras con baseline común */}
          <Box sx={{ height: alto, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", borderBottom: "1px solid", borderColor: "divider" }}>
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

  const reload = async () => {
    if (!proyecto) return;
    const cached = getCache("seguimiento-diario", proyecto.id);
    setRegistros(cached ?? []);
    setLoading(!cached);
    const [{ data: regs }, { data: hs }] = await Promise.all([
      supabase.from("seguimiento_diario").select("*").eq("proyecto_id", proyecto.id),
      supabase.from("hitos").select("id,nombre,orden").eq("proyecto_id", proyecto.id).order("orden"),
    ]);
    setCache("seguimiento-diario", proyecto.id, regs ?? []);
    setRegistros(regs ?? []);
    setEtapas((hs ?? []).map(h => h.nombre));

    // Tareas (subtareas) de cada etapa/hito, sólo para asociar (no marca avance)
    const ids = (hs ?? []).map(h => h.id);
    const mapa = {};
    if (ids.length) {
      const { data: ts } = await supabase
        .from("hito_tareas").select("hito_id,nombre,orden").in("hito_id", ids).order("orden");
      const idToNombre = Object.fromEntries((hs ?? []).map(h => [h.id, h.nombre]));
      for (const t of ts ?? []) {
        const et = idToNombre[t.hito_id];
        if (!et) continue;
        (mapa[et] ??= []).push(t.nombre);
      }
    }
    setTareasPorEtapa(mapa);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  // Mapa fecha -> registro
  const porFecha = useMemo(() => {
    const m = {};
    for (const r of registros) m[r.fecha] = r;
    return m;
  }, [registros]);

  // Días trabajados por mes (del año visible)
  const porMes = useMemo(() => {
    const arr = MESES_CORTO.map((lbl, i) => ({ label: lbl, full: MESES[i], value: 0 }));
    for (const r of registros) {
      if (!r.trabajado) continue;
      const [y, m] = r.fecha.split("-").map(Number);
      if (y === year) arr[m - 1].value += 1;
    }
    return arr;
  }, [registros, year]);

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

  // Celdas del calendario (incluye huecos al inicio)
  const celdas = useMemo(() => {
    const primero = new Date(year, month, 1).getDay(); // 0=Dom
    const diasMes = new Date(year, month + 1, 0).getDate();
    const arr = [];
    for (let i = 0; i < primero; i++) arr.push(null);
    for (let d = 1; d <= diasMes; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [year, month]);

  const cambiarMes = (delta) => {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y);
  };
  const irHoy = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); };

  const abrirDia = (d) => {
    if (!d) return;
    const fecha = iso(year, month, d);
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
            <CardContent>
              <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Días trabajados por mes · {year}</Typography>
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
            {celdas.map((d, i) => {
              if (!d) return <Box key={`e${i}`} />;
              const fecha = iso(year, month, d);
              const r = porFecha[fecha];
              const esHoy = fecha === hoyISO();
              const ets = r ? parseEtapas(r.etapa) : [];
              let bg = "transparent", border = theme.palette.divider;
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
                    onClick={() => abrirDia(d)}
                    sx={{
                      cursor: "pointer", borderRadius: 1.5,
                      border: "1px solid", borderColor: border,
                      bgcolor: bg,
                      p: 0.75, overflow: "hidden",
                      display: "flex", flexDirection: "column", alignItems: "center",
                      outline: esHoy ? `2px solid ${theme.palette.primary.main}` : "none",
                      outlineOffset: -2,
                      transition: "background-color .1s",
                      "&:hover": { borderColor: "primary.main" },
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: esHoy ? 800 : 700, lineHeight: 1, color: "text.primary" }}>
                      {d}
                    </Typography>
                    {ets.length > 0 && (
                      <Typography variant="caption" align="center" sx={{
                        fontSize: 9.5, lineHeight: 1.05, mt: 0.4, color: "text.secondary",
                        overflow: "hidden", textOverflow: "ellipsis",
                        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      }}>
                        {ets.join(", ")}
                      </Typography>
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
                {etapas.map(et => (
                  <MenuItem key={et} value={et}>
                    <Checkbox checked={form.etapas.indexOf(et) > -1} />
                    <ListItemText primary={et} />
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
              const tareasDisponibles = [...new Set(form.etapas.flatMap(et => tareasPorEtapa[et] ?? []))];
              if (tareasDisponibles.length === 0) return null;
              return (
                <FormControl fullWidth>
                  <InputLabel id="tareas-lbl">Tareas (opcional)</InputLabel>
                  <Select
                    labelId="tareas-lbl" multiple
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
                  </Select>
                </FormControl>
              );
            })()}

            <TextField
              fullWidth label="Observación (opcional)" multiline minRows={2}
              value={form.observacion}
              onChange={(e) => setForm(f => ({ ...f, observacion: e.target.value }))}
            />
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
