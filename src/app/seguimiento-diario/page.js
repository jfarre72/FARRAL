"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, Chip, Button, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, useMediaQuery,
  ToggleButtonGroup, ToggleButton, TextField, MenuItem, LinearProgress, Tooltip
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
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
  const [form, setForm] = useState({ trabajado: true, causa: "", etapa: "", observacion: "" });
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

  // Estadísticas del mes visible
  const stats = useMemo(() => {
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
      etapa: r?.etapa ?? "",
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
      etapa: form.etapa.trim() || null,
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
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5">Seguimiento Diario</Typography>
        <Typography variant="body2" color="text.secondary">
          Tocá un día para registrar si se trabajó o no. Si no se trabajó, indicá la causa
          (lluvia, falta de personal, materiales…). La etapa es opcional.
        </Typography>
      </Box>

      {loading && <LinearProgress />}

      <Card>
        <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
          {/* Navegación de mes */}
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <IconButton onClick={() => cambiarMes(-1)}><ChevronLeftIcon /></IconButton>
            <Typography variant="h6" sx={{ flexGrow: 1, textAlign: "center" }}>
              {MESES[month]} {year}
            </Typography>
            <Button size="small" onClick={irHoy}>Hoy</Button>
            <IconButton onClick={() => cambiarMes(1)}><ChevronRightIcon /></IconButton>
          </Stack>

          {/* Resumen + leyenda */}
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1, mb: 2 }}>
            <Chip size="small" color="success" variant="outlined" label={`${stats.trabajados} trabajados`} />
            <Chip size="small" color="error" variant="outlined" label={`${stats.noTrabajados} sin trabajar`} />
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
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.5 }}>
            {celdas.map((d, i) => {
              if (!d) return <Box key={`e${i}`} />;
              const fecha = iso(year, month, d);
              const r = porFecha[fecha];
              const esHoy = fecha === hoyISO();
              let bg = "transparent", border = "divider", color = "text.primary";
              if (r) {
                if (r.trabajado) { bg = "success.main"; color = "success.contrastText"; border = "success.main"; }
                else { bg = "error.main"; color = "error.contrastText"; border = "error.main"; }
              }
              return (
                <Tooltip
                  key={fecha}
                  title={r ? (r.trabajado ? `Trabajado${r.etapa ? " · " + r.etapa : ""}` : `No: ${r.causa || "—"}`) : ""}
                  arrow disableInteractive
                >
                  <Box
                    onClick={() => abrirDia(d)}
                    sx={{
                      cursor: "pointer", borderRadius: 1.5,
                      border: "1px solid", borderColor: border,
                      bgcolor: bg, color,
                      aspectRatio: "1 / 1", minHeight: 40,
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                      outline: esHoy ? `2px solid ${theme.palette.primary.main}` : "none",
                      outlineOffset: -2,
                      transition: "transform .08s",
                      "&:hover": { transform: "scale(1.05)" },
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: esHoy ? 800 : 500, lineHeight: 1 }}>
                      {d}
                    </Typography>
                    {r && r.etapa && (
                      <Typography variant="caption" sx={{ fontSize: 9, lineHeight: 1, mt: 0.25, px: 0.25, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                        {r.etapa}
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

            <TextField
              select fullWidth label="Etapa (opcional)" value={form.etapa}
              onChange={(e) => setForm(f => ({ ...f, etapa: e.target.value }))}
            >
              <MenuItem value="">—</MenuItem>
              {etapas.map(et => <MenuItem key={et} value={et}>{et}</MenuItem>)}
            </TextField>

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
