"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, Grid, TextField,
  Checkbox, LinearProgress, Chip, Button, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, useMediaQuery,
  ToggleButtonGroup, ToggleButton, MenuItem, Table, TableHead, TableBody,
  TableRow, TableCell, TableContainer
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import NotesIcon from "@mui/icons-material/Notes";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtDate } from "@/components/Money";

const empty = { titulo: "", responsable: "", fecha: "", etiqueta: "NORMAL", observacion: "" };
const ETIQUETAS = ["NORMAL", "URGENTE"];

// Fecha de hoy en formato ISO (YYYY-MM-DD), zona local
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Estado de un tema: hecho | vencido | pendiente
const estadoDe = (t) => {
  if (t.completado) return "hecho";
  if (t.fecha && t.fecha < hoyISO()) return "vencido";
  return "pendiente";
};

const ETIQUETA_COLOR = { URGENTE: "error", NORMAL: "default" };
const ESTADO_META = {
  hecho:     { label: "Hecho",     color: "success" },
  vencido:   { label: "Vencido",   color: "error" },
  pendiente: { label: "Pendiente", color: "default" },
};

export default function TemasPage() {
  const { proyecto } = useProjects();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  const [temas, setTemas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("todos"); // todos | pendientes | hechos | vencidos
  const [nuevo, setNuevo] = useState("");

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    if (!proyecto) return;
    setLoading(true);
    const { data } = await supabase
      .from("temas").select("*")
      .eq("proyecto_id", proyecto.id);
    setTemas(data ?? []);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  // Orden: por fecha ascendente (más cercana primero); sin fecha al final.
  const ordenados = useMemo(() => {
    return [...temas].sort((a, b) => {
      if (a.fecha && b.fecha) return a.fecha.localeCompare(b.fecha);
      if (a.fecha) return -1;
      if (b.fecha) return 1;
      return (a.orden ?? 0) - (b.orden ?? 0);
    });
  }, [temas]);

  const visibles = useMemo(() => {
    if (filtro === "pendientes") return ordenados.filter(t => estadoDe(t) === "pendiente");
    if (filtro === "hechos") return ordenados.filter(t => estadoDe(t) === "hecho");
    if (filtro === "vencidos") return ordenados.filter(t => estadoDe(t) === "vencido");
    return ordenados;
  }, [ordenados, filtro]);

  const hechos = temas.filter(t => t.completado).length;
  const vencidos = temas.filter(t => estadoDe(t) === "vencido").length;

  const toggle = async (t) => {
    setTemas(prev => prev.map(x => x.id === t.id ? { ...x, completado: !x.completado } : x));
    const { error } = await supabase.from("temas")
      .update({ completado: !t.completado }).eq("id", t.id);
    if (error) { alert(error.message); reload(); }
  };

  const addRapido = async () => {
    const titulo = nuevo.trim();
    if (!titulo || !proyecto) return;
    const orden = temas.length + 1;
    const { error } = await supabase.from("temas")
      .insert({ proyecto_id: proyecto.id, titulo, orden });
    if (error) { alert(error.message); return; }
    setNuevo("");
    reload();
  };

  const openNew = () => { setForm(empty); setEditId(null); setErr(null); setOpen(true); };
  const openEdit = (t) => {
    setForm({
      titulo: t.titulo ?? "",
      responsable: t.responsable ?? "",
      fecha: t.fecha ?? "",
      etiqueta: t.etiqueta ?? "NORMAL",
      observacion: t.observacion ?? "",
    });
    setEditId(t.id); setErr(null); setOpen(true);
  };

  const handleSave = async () => {
    setErr(null);
    if (!form.titulo.trim()) { setErr("El título es obligatorio."); return; }
    if (!proyecto) return;
    setSaving(true);
    const payload = {
      titulo: form.titulo.trim(),
      responsable: form.responsable.trim() || null,
      fecha: form.fecha || null,
      etiqueta: form.etiqueta || "NORMAL",
      observacion: form.observacion.trim() || null,
    };
    let res;
    if (editId) {
      res = await supabase.from("temas").update(payload).eq("id", editId);
    } else {
      res = await supabase.from("temas")
        .insert({ ...payload, proyecto_id: proyecto.id, orden: temas.length + 1 });
    }
    setSaving(false);
    if (res.error) { setErr(res.error.message); return; }
    setOpen(false);
    reload();
  };

  const handleDelete = async (t) => {
    if (!confirm(`¿Eliminar "${t.titulo}"?`)) return;
    const { error } = await supabase.from("temas").delete().eq("id", t.id);
    if (error) alert(error.message); else reload();
  };

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  return (
    <Stack spacing={3}>
      <Box>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
          <Typography variant="h5" sx={{ flexGrow: 1 }}>Seguimiento de tareas</Typography>
          <Button variant="contained" color="secondary" startIcon={<AddIcon />} onClick={openNew}>
            Nuevo tema
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Temas operativos para revisar en reunión: responsable, fecha, estado y observaciones.
        </Typography>
      </Box>

      {loading && <LinearProgress />}

      <Card>
        <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
          {/* Encabezado: avance + filtros */}
          <Stack
            direction={{ xs: "column", sm: "row" }} spacing={1.5}
            alignItems={{ sm: "center" }} sx={{ mb: 2 }}
          >
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
              <Chip
                label={`${hechos}/${temas.length} hechos`}
                color={temas.length > 0 && hechos === temas.length ? "success" : "default"}
                variant="outlined"
              />
              {vencidos > 0 && (
                <Chip label={`${vencidos} vencido${vencidos > 1 ? "s" : ""}`} color="error" variant="outlined" />
              )}
            </Stack>
            <Box sx={{ flexGrow: 1 }} />
            <ToggleButtonGroup
              size="small" exclusive value={filtro}
              onChange={(e, v) => { if (v) setFiltro(v); }}
            >
              <ToggleButton value="todos">Todos</ToggleButton>
              <ToggleButton value="pendientes">Pendientes</ToggleButton>
              <ToggleButton value="vencidos">Vencidos</ToggleButton>
              <ToggleButton value="hechos">Hechos</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {/* Alta rápida */}
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <TextField
              size="small" fullWidth placeholder="Agregar tema rápido…"
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addRapido(); }}
            />
            <Button variant="outlined" startIcon={<AddIcon />} onClick={addRapido} sx={{ flexShrink: 0 }}>
              Agregar
            </Button>
          </Stack>

          {visibles.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
              {temas.length === 0
                ? "No hay temas cargados. Agregá el primero arriba."
                : "No hay temas con este filtro."}
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small" sx={{ minWidth: 720 }}>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell sx={{ width: 36 }}>#</TableCell>
                    <TableCell>Tema</TableCell>
                    <TableCell>Responsable</TableCell>
                    <TableCell>Etiqueta</TableCell>
                    <TableCell>Fecha</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibles.map((t, i) => {
                    const est = estadoDe(t);
                    const meta = ESTADO_META[est];
                    return (
                      <TableRow key={t.id} hover>
                        <TableCell padding="checkbox">
                          <Checkbox size="small" checked={t.completado} onChange={() => toggle(t)} />
                        </TableCell>
                        <TableCell sx={{ color: "text.secondary" }}>{i + 1}</TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 500,
                              textDecoration: t.completado ? "line-through" : "none",
                              color: t.completado ? "text.secondary" : "text.primary",
                            }}
                          >
                            {t.titulo}
                          </Typography>
                          {t.observacion && (
                            <Stack direction="row" spacing={0.5} alignItems="flex-start" sx={{ mt: 0.25 }}>
                              <NotesIcon sx={{ fontSize: 14, color: "text.secondary", mt: 0.3 }} />
                              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                                {t.observacion}
                              </Typography>
                            </Stack>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color={t.responsable ? "text.primary" : "text.disabled"}>
                            {t.responsable || "—"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={t.etiqueta || "NORMAL"}
                            color={ETIQUETA_COLOR[t.etiqueta] ?? "default"}
                            variant={t.etiqueta === "URGENTE" ? "filled" : "outlined"}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            color={est === "vencido" ? "error.main" : t.fecha ? "text.primary" : "text.disabled"}
                            sx={{ fontWeight: est === "vencido" ? 600 : 400, whiteSpace: "nowrap" }}
                          >
                            {t.fecha ? fmtDate(t.fecha) : "—"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={meta.label} color={meta.color}
                            variant={est === "pendiente" ? "outlined" : "filled"} />
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Editar">
                            <IconButton size="small" onClick={() => openEdit(t)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Eliminar">
                            <IconButton size="small" onClick={() => handleDelete(t)}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Dialog alta/edición */}
      <Dialog open={open} onClose={() => setOpen(false)} fullScreen={fullScreen} fullWidth maxWidth="sm">
        <DialogTitle>{editId ? "Editar tema" : "Nuevo tema"}</DialogTitle>
        <DialogContent dividers>
          {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth label="Tema / tarea" autoFocus
                value={form.titulo}
                onChange={(e) => setForm(f => ({ ...f, titulo: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth label="Responsable" placeholder="JUAN, RODRI, RODRI|JUAN…"
                value={form.responsable}
                onChange={(e) => setForm(f => ({ ...f, responsable: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth label="Fecha" type="date" InputLabelProps={{ shrink: true }}
                value={form.fecha}
                onChange={(e) => setForm(f => ({ ...f, fecha: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select fullWidth label="Etiqueta"
                value={form.etiqueta}
                onChange={(e) => setForm(f => ({ ...f, etiqueta: e.target.value }))}
              >
                {ETIQUETAS.map(op => <MenuItem key={op} value={op}>{op}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth label="Observación" multiline minRows={2}
                value={form.observacion}
                onChange={(e) => setForm(f => ({ ...f, observacion: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
