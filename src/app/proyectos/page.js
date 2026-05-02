"use client";
import {
  Card, CardContent, Stack, Typography, Button, Table, TableBody, TableCell,
  TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Grid, Alert, Tooltip, Box
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtNum } from "@/components/Money";

const empty = {
  nombre: "", descripcion: "",
  m2_cubiertos: "", m2_semicubiertos: "", m2_totales: "",
  fecha_inicio: "", fecha_fin: "",
};

export default function ProyectosPage() {
  const { proyectos, refresh, setProyectoId } = useProjects();
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
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5">Proyectos</Typography>
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
                      <TableCell>{p.fecha_inicio ?? "—"}</TableCell>
                      <TableCell>{p.fecha_fin ?? "—"}</TableCell>
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

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
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
              <TextField label="m² totales" type="number" fullWidth value={form.m2_totales}
                onChange={(e) => setForm({ ...form, m2_totales: e.target.value })} />
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
