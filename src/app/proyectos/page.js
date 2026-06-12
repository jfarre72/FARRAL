"use client";
import {
  Card, CardContent, Stack, Typography, Button, Table, TableBody, TableCell,
  TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Grid, Alert, Tooltip, Box, Divider, useMediaQuery
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtNum, fmtDate } from "@/components/Money";

const empty = {
  nombre: "", descripcion: "",
  m2_cubiertos: "", m2_semicubiertos: "", m2_totales: "", m2_terreno: "",
  costo_m2_pozo: "", precio_venta_m2: "",
  precio_venta_estimado: "", costo_total_estimado: "",
  fecha_inversor_faltante: "",
  fecha_inicio: "", fecha_fin: "",
};

export default function ProyectosPage() {
  const { proyectos, refresh, setProyectoId } = useProjects();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  const openNew  = () => { setForm(empty); setEditId(null); setErr(null); setOpen(true); };
  const openEdit = (p) => {
    setForm({
      nombre: p.nombre ?? "",
      descripcion: p.descripcion ?? "",
      m2_cubiertos: p.m2_cubiertos ?? "",
      m2_semicubiertos: p.m2_semicubiertos ?? "",
      m2_totales: p.m2_totales ?? "",
      m2_terreno: p.m2_terreno ?? "",
      costo_m2_pozo: p.costo_m2_pozo ?? "",
      precio_venta_m2: p.precio_venta_m2 ?? "",
      precio_venta_estimado: p.precio_venta_estimado ?? "",
      costo_total_estimado: p.costo_total_estimado ?? "",
      fecha_inversor_faltante: p.fecha_inversor_faltante ?? "",
      fecha_inicio: p.fecha_inicio ?? "",
      fecha_fin: p.fecha_fin ?? "",
    });
    setEditId(p.id); setErr(null); setOpen(true);
  };

  const handleSave = async () => {
    setErr(null);
    if (!form.nombre.trim()) { setErr("El nombre es obligatorio."); return; }
    setSaving(true);
    const payload = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion || null,
      m2_cubiertos: numOrNull(form.m2_cubiertos),
      m2_semicubiertos: numOrNull(form.m2_semicubiertos),
      m2_totales: numOrNull(form.m2_totales),
      m2_terreno: numOrNull(form.m2_terreno),
      costo_m2_pozo: numOrNull(form.costo_m2_pozo),
      precio_venta_m2: numOrNull(form.precio_venta_m2),
      precio_venta_estimado: numOrNull(form.precio_venta_estimado),
      costo_total_estimado: numOrNull(form.costo_total_estimado),
      fecha_inversor_faltante: form.fecha_inversor_faltante || null,
      fecha_inicio: form.fecha_inicio || null,
      fecha_fin: form.fecha_fin || null,
    };
    let res;
    if (editId) {
      res = await supabase.from("proyectos").update(payload).eq("id", editId).select().single();
    } else {
      res = await supabase.from("proyectos").insert(payload).select().single();
    }
    setSaving(false);
    if (res.error) { setErr(res.error.message); return; }
    if (!editId && res.data) setProyectoId(res.data.id);
    setOpen(false);
    refresh();
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar el proyecto y todos sus inversores, aportes e hitos?")) return;
    const { error } = await supabase.from("proyectos").delete().eq("id", id);
    if (error) alert(error.message);
    refresh();
  };

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        spacing={1.5}
      >
        <Box>
          <Typography variant="h5">Proyectos</Typography>
          <Typography variant="body2">Listado de obras y datos base.</Typography>
        </Box>
        <Button startIcon={<AddIcon />} variant="contained" color="secondary" onClick={openNew}>
          Nuevo proyecto
        </Button>
      </Stack>

      <Card>
        <CardContent>
          {proyectos.length === 0 ? (
            <Typography color="text.secondary">Aún no hay proyectos. Creá el primero.</Typography>
          ) : (
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Nombre</TableCell>
                    <TableCell align="right">m² cub.</TableCell>
                    <TableCell align="right">m² semi.</TableCell>
                    <TableCell align="right">m² totales</TableCell>
                    <TableCell align="right">m² terreno</TableCell>
                    <TableCell>Inicio</TableCell>
                    <TableCell>Fin estim.</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {proyectos.map((p) => (
                    <TableRow key={p.id} hover>
                      <TableCell>
                        <Stack>
                          <Typography fontWeight={600}>{p.nombre}</Typography>
                          {p.descripcion && <Typography variant="caption" color="text.secondary">{p.descripcion}</Typography>}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">{fmtNum(p.m2_cubiertos)}</TableCell>
                      <TableCell align="right">{fmtNum(p.m2_semicubiertos)}</TableCell>
                      <TableCell align="right">{fmtNum(p.m2_totales)}</TableCell>
                      <TableCell align="right">{fmtNum(p.m2_terreno)}</TableCell>
                      <TableCell>{fmtDate(p.fecha_inicio)}</TableCell>
                      <TableCell>{fmtDate(p.fecha_fin)}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="Editar"><IconButton onClick={() => openEdit(p)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Eliminar"><IconButton onClick={() => handleDelete(p.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" fullScreen={fullScreen}>
        <DialogTitle>{editId ? "Editar proyecto" : "Nuevo proyecto"}</DialogTitle>
        <DialogContent dividers>
          {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField label="Nombre" fullWidth required value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Descripción" fullWidth multiline minRows={2} value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="m² cubiertos" type="number" fullWidth value={form.m2_cubiertos}
                onChange={(e) => setForm({ ...form, m2_cubiertos: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="m² semicubiertos" type="number" fullWidth value={form.m2_semicubiertos}
                onChange={(e) => setForm({ ...form, m2_semicubiertos: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="m² totales (vendibles)" type="number" fullWidth value={form.m2_totales}
                onChange={(e) => setForm({ ...form, m2_totales: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="m² terreno (total)" type="number" fullWidth value={form.m2_terreno}
                onChange={(e) => setForm({ ...form, m2_terreno: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Costo m² pozo (precarga)" type="number" fullWidth value={form.costo_m2_pozo}
                helperText="Se precarga al crear un aporte"
                onChange={(e) => setForm({ ...form, costo_m2_pozo: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Precio venta m² (precarga)" type="number" fullWidth value={form.precio_venta_m2}
                helperText="Se precarga al crear un aporte"
                onChange={(e) => setForm({ ...form, precio_venta_m2: e.target.value })} />
            </Grid>
            <Grid item xs={12}>
              <Divider><Typography variant="caption" color="text.secondary">ESTIMACIÓN FINANCIERA (USD)</Typography></Divider>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Precio de venta estimado" type="number" fullWidth value={form.precio_venta_estimado}
                helperText="Ingreso total esperado"
                onChange={(e) => setForm({ ...form, precio_venta_estimado: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Costo total estimado" type="number" fullWidth value={form.costo_total_estimado}
                helperText="Costo total esperado"
                onChange={(e) => setForm({ ...form, costo_total_estimado: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Costo m² (calculado)" fullWidth disabled
                value={
                  Number(form.costo_total_estimado || 0) > 0 && Number(form.m2_totales || 0) > 0
                    ? (Number(form.costo_total_estimado) / Number(form.m2_totales)).toLocaleString("es-AR", { maximumFractionDigits: 2 })
                    : "—"
                }
                helperText="costo total / m² totales" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Fecha del inversor 'Faltante'" type="date" fullWidth
                InputLabelProps={{ shrink: true }}
                value={form.fecha_inversor_faltante}
                helperText="Desde cuándo se considera el capital faltante para la ponderación"
                onChange={(e) => setForm({ ...form, fecha_inversor_faltante: e.target.value })} />
            </Grid>
            <Grid item xs={12}>
              <Divider />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Fecha inicio estim." type="date" fullWidth InputLabelProps={{ shrink: true }}
                value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Fecha fin estim." type="date" fullWidth InputLabelProps={{ shrink: true }}
                value={form.fecha_fin} onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {editId ? "Guardar" : "Crear"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

const numOrNull = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
