"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, TextField,
  Button, IconButton, Tooltip, LinearProgress, Divider, Table, TableHead,
  TableBody, TableRow, TableCell, TableContainer
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";

// Campo que guarda al salir (blur/Enter), no en cada tecla.
function CommitField({ value, onCommit, type = "text", sx, align, suffix }) {
  const [local, setLocal] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setLocal(value ?? ""); }, [value, focused]);
  const commit = () => {
    setFocused(false);
    if (String(local) !== String(value ?? "")) onCommit(local);
  };
  return (
    <TextField
      size="small" type={type} value={local} sx={sx}
      onFocus={() => setFocused(true)}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      inputProps={align ? { style: { textAlign: align } } : undefined}
      InputProps={suffix ? { endAdornment: <Typography variant="caption" color="text.secondary">{suffix}</Typography> } : undefined}
    />
  );
}

export default function ConfiguracionPage() {
  const { proyecto } = useProjects();
  const [hitos, setHitos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState("");
  const [pct, setPct] = useState("");

  const reload = async () => {
    if (!proyecto) return;
    setLoading(true);
    const { data } = await supabase.from("hitos").select("*")
      .eq("proyecto_id", proyecto.id).order("orden");
    setHitos(data ?? []);
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const updateHito = async (id, patch) => {
    setHitos(prev => prev.map(h => h.id === id ? { ...h, ...patch } : h));
    const { error } = await supabase.from("hitos").update(patch).eq("id", id);
    if (error) { alert(error.message); reload(); }
  };

  const addEtapa = async () => {
    const nom = nombre.trim();
    if (!nom || !proyecto) return;
    const porcentaje = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    const orden = (hitos.reduce((m, h) => Math.max(m, h.orden || 0), 0)) + 1;
    const { error } = await supabase.from("hitos")
      .insert({ proyecto_id: proyecto.id, nombre: nom, porcentaje, orden });
    if (error) { alert(error.message); return; }
    setNombre(""); setPct("");
    reload();
  };

  // Drag & drop para reordenar etapas
  const [drag, setDrag] = useState(null); // { fromId, overId }
  const reordenar = async (fromId, toId) => {
    if (fromId === toId) return;
    const lista = [...hitos].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    const fromIdx = lista.findIndex(h => h.id === fromId);
    const toIdx = lista.findIndex(h => h.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const nueva = [...lista];
    const [m] = nueva.splice(fromIdx, 1);
    nueva.splice(toIdx, 0, m);
    const conOrden = nueva.map((h, i) => ({ ...h, orden: i + 1 }));
    setHitos(conOrden);
    const cambios = conOrden.filter(h => {
      const o = lista.find(x => x.id === h.id);
      return o && o.orden !== h.orden;
    });
    await Promise.all(cambios.map(h =>
      supabase.from("hitos").update({ orden: h.orden }).eq("id", h.id)
    ));
  };

  const delEtapa = async (h) => {
    if (!confirm(`¿Eliminar la etapa "${h.nombre}"? Se borran también sus tareas.`)) return;
    const { error } = await supabase.from("hitos").delete().eq("id", h.id);
    if (error) alert(error.message); else reload();
  };

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5">Configuración</Typography>
        <Typography variant="body2" color="text.secondary">
          Etapas de obra del proyecto. Se usan en Hitos plan y al registrar un egreso.
        </Typography>
      </Box>

      {loading && <LinearProgress />}

      <Card>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>Etapas</Typography>
          <TableContainer>
            <Table size="small" sx={{ minWidth: 420 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 36 }}></TableCell>
                  <TableCell sx={{ width: 90 }}>% hito</TableCell>
                  <TableCell>Nombre</TableCell>
                  <TableCell align="right" sx={{ width: 60 }}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {hitos.map((h) => {
                  const isTarget = drag && drag.overId === h.id && drag.fromId !== h.id;
                  return (
                  <TableRow
                    key={h.id} hover
                    onDragOver={(e) => { e.preventDefault(); if (drag && drag.overId !== h.id) setDrag(d => ({ ...d, overId: h.id })); }}
                    onDrop={(e) => { e.preventDefault(); if (drag) reordenar(drag.fromId, h.id); setDrag(null); }}
                    sx={{ opacity: drag?.fromId === h.id ? 0.4 : 1,
                      "& > td": { borderTop: isTarget ? "2px solid" : undefined, borderTopColor: isTarget ? "secondary.main" : undefined } }}
                  >
                    <TableCell sx={{ pr: 0 }}>
                      <Tooltip title="Arrastrá para reordenar">
                        <IconButton
                          size="small" draggable
                          onDragStart={() => setDrag({ fromId: h.id, overId: h.id })}
                          onDragEnd={() => setDrag(null)}
                          sx={{ cursor: "grab", touchAction: "none" }}
                        >
                          <DragIndicatorIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <CommitField
                        type="number" value={h.porcentaje} align="right" suffix="%"
                        sx={{ width: 80 }}
                        onCommit={(v) => updateHito(h.id, { porcentaje: Math.max(0, Math.min(100, Math.round(Number(v) || 0))) })}
                      />
                    </TableCell>
                    <TableCell>
                      <CommitField
                        value={h.nombre} sx={{ width: "100%", maxWidth: 360 }}
                        onCommit={(v) => { const n = String(v).trim(); if (n) updateHito(h.id, { nombre: n }); else reload(); }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Eliminar etapa">
                        <IconButton size="small" onClick={() => delEtapa(h)}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                  );
                })}
                {hitos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Typography variant="body2" color="text.secondary">No hay etapas cargadas.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Divider sx={{ my: 2 }} />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "flex-end" }}>
            <TextField
              label="Nueva etapa" placeholder="Nombre de la etapa" fullWidth size="small"
              value={nombre} onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addEtapa(); }}
            />
            <TextField
              label="% hito" type="number" size="small" sx={{ width: { xs: "100%", sm: 120 } }}
              value={pct} onChange={(e) => setPct(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addEtapa(); }}
              InputProps={{ endAdornment: <Typography variant="caption" color="text.secondary">%</Typography> }}
            />
            <Button variant="contained" color="secondary" startIcon={<AddIcon />}
              onClick={addEtapa} sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}>
              Agregar etapa
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            El “% hito” marca el avance acumulado del proyecto al iniciar esa etapa (0 = inicio, 100 = terminada).
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}
