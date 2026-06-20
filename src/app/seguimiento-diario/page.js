"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, Chip, Button, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, useMediaQuery,
  ToggleButtonGroup, ToggleButton, TextField, MenuItem, LinearProgress, Tooltip,
  Checkbox, ListItemText, OutlinedInput, Select, InputLabel, FormControl
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
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

export default function SeguimientoDiarioPage() {
  const { proyecto } = useProjects();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  const [registros, setRegistros] = useState(() => getCache("seguimiento-diario", proyecto?.id) ?? []);
  const [etapas, setEtapas] = useState([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-11

  const [open, setOpen] = useState(false);
  const [fechaSel, setFechaSel] = useState(null);
  const [form, setForm] = useState({ trabajado: true, causa: "", etapas: [], observacion: "" });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const reload = async () => {
    if (!proyecto) return;
    const cached = getCache("seguimiento-diario", proyecto.id);
    setRegistros(cached ?? []);
    setLoading(!cached);
    const [{ data: regs }, { data: hs }] = await Promise.all([
      supabase.from("seguimiento_diario").select("*").eq("proyecto_id", proyecto.id),
      supabase.from("hitos").select("nombre,orden").eq("proyecto_id", proyecto.id).order("orden"),
    ]);
    setCache("seguimiento-diario", proyecto.id, regs ?? []);
    setRegistros(regs ?? []);
    setEtapas((hs ?? []).map(h => h.nombre));
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  // Mapa fecha -> registro
  const porFecha = useMemo(() => {
    const m = {};
    for (const r of registros) m[r.fecha] = r;
    return m;
  }, [registros]);

  // Estadísticas del mes visible (totales + desglose por etapa de días trabajados)
  const stats = useMemo(() => {
    const prefijo = `${year}-${String(month + 1).padStart(2, "0")}`;
    const delMes = registros.filter(r => r.fecha.startsWith(prefijo));
    const porEtapa = {};
    for (const r of delMes) {
      if (!r.trabajado) continue;
      const ets = parseEtapas(r.etapa);
      if (ets.length === 0) { porEtapa["Sin etapa"] = (porEtapa["Sin etapa"] ?? 0) + 1; continue; }
      for (const e of ets) porEtapa[e] = (porEtapa[e] ?? 0) + 1;
    }
    return {
      trabajados: delMes.filter(r => r.trabajado).length,
      noTrabajados: delMes.filter(r => !r.trabajado).length,
      porEtapa,
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
  const filas = celdas.length / 7;

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
      observacion: form.observacion.trim() || null,
    };
    // upsert por (proyecto_id, fecha)
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

  return (
    <Stack spacing={1.5} sx={{ height: "calc(100vh - 96px)" }}>
      <Box>
        <Typography variant="h5">Diario</Typography>
        <Typography variant="body2" color="text.secondary">
          Tocá un día para registrar si se trabajó o no. Si no se trabajó, indicá la causa. Podés cargar una o varias etapas.
        </Typography>
      </Box>

      {loading && <LinearProgress />}

      <Card sx={{ display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
        <CardContent sx={{ p: { xs: 1, sm: 1.5 }, display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0, "&:last-child": { pb: 1.5 } }}>
          {/* Navegación de mes */}
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <IconButton size="small" onClick={() => cambiarMes(-1)}><ChevronLeftIcon /></IconButton>
            <Typography variant="subtitle1" sx={{ flexGrow: 1, textAlign: "center", fontWeight: 700 }}>
              {MESES[month]} {year}
            </Typography>
            <Button size="small" onClick={irHoy}>Hoy</Button>
            <IconButton size="small" onClick={() => cambiarMes(1)}><ChevronRightIcon /></IconButton>
          </Stack>

          {/* Resumen: totales + por etapa */}
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            <Chip size="small" color="success" variant="outlined" label={`${stats.trabajados} trabajados`} />
            <Chip size="small" color="error" variant="outlined" label={`${stats.noTrabajados} sin trabajar`} />
            {Object.entries(stats.porEtapa).map(([et, n]) => (
              <Chip key={et} size="small" variant="filled"
                sx={{ bgcolor: "action.selected" }}
                label={`${et}: ${n}`} />
            ))}
          </Stack>

          {/* Encabezado días de la semana */}
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.5, mb: 0.5 }}>
            {DIAS_CORTO.map(d => (
              <Typography key={d} variant="caption" align="center" color="text.secondary" sx={{ fontWeight: 700 }}>
                {d}
              </Typography>
            ))}
          </Box>

          {/* Grilla del calendario: ocupa el alto restante sin scroll */}
          <Box sx={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gridTemplateRows: `repeat(${filas}, 1fr)`,
            gap: 0.5, flexGrow: 1, minHeight: 0,
          }}>
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
              return (
                <Tooltip
                  key={fecha}
                  title={r ? (r.trabajado ? `Trabajado${ets.length ? " · " + ets.join(", ") : ""}` : `No: ${r.causa || "—"}`) : ""}
                  arrow disableInteractive
                >
                  <Box
                    onClick={() => abrirDia(d)}
                    sx={{
                      cursor: "pointer", borderRadius: 1.5,
                      border: "1px solid", borderColor: border,
                      bgcolor: bg,
                      minHeight: 0, p: 0.5, overflow: "hidden",
                      display: "flex", flexDirection: "column",
                      outline: esHoy ? `2px solid ${theme.palette.primary.main}` : "none",
                      outlineOffset: -2,
                      transition: "background-color .1s",
                      "&:hover": { borderColor: "primary.main" },
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: esHoy ? 800 : 600, lineHeight: 1, color: "text.primary" }}>
                      {d}
                    </Typography>
                    {ets.length > 0 && (
                      <Typography variant="caption" sx={{
                        fontSize: 9.5, lineHeight: 1.1, mt: 0.25, color: "text.secondary",
                        overflow: "hidden", textOverflow: "ellipsis",
                        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      }}>
                        {ets.join(", ")}
                      </Typography>
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
                value={form.etapas}
                onChange={(e) => setForm(f => ({ ...f, etapas: typeof e.target.value === "string" ? e.target.value.split(",") : e.target.value }))}
                input={<OutlinedInput label="Etapas (opcional)" />}
                renderValue={(sel) => sel.join(", ")}
              >
                {etapas.map(et => (
                  <MenuItem key={et} value={et}>
                    <Checkbox checked={form.etapas.indexOf(et) > -1} />
                    <ListItemText primary={et} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

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
