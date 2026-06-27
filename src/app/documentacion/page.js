"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, TextField,
  Checkbox, LinearProgress, Chip, Button, IconButton, Tooltip, Divider,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";

// Checklist sugerido de planos/documentos habituales de obra.
const SEED = [
  "Plano de arquitectura", "Plano de estructura", "Plano de desagües cloacales",
  "Plano de desagües pluviales", "Plano de agua", "Plano de gas",
  "Plano de electricidad", "Plano de instalación contra incendio", "Plano municipal aprobado",
];

// Campo de nombre editable que guarda al salir (blur/Enter), no en cada tecla.
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
      inputProps={{ style: { fontSize: 14, ...(strike ? { textDecoration: "line-through", color: "rgba(0,0,0,0.45)" } : {}) } }}
    />
  );
}

export default function DocumentacionPage() {
  const { proyecto } = useProjects();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState("");
  const [drag, setDrag] = useState(null); // { fromId, overId }

  const reload = async () => {
    if (!proyecto) return;
    setLoading(true);
    const { data } = await supabase
      .from("documentacion").select("*").eq("proyecto_id", proyecto.id).order("orden");
    setItems(data ?? []);
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const ordenados = useMemo(
    () => [...items].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
    [items]
  );
  const completados = items.filter(i => i.completado).length;

  const toggle = async (it) => {
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, completado: !x.completado } : x));
    const { error } = await supabase.from("documentacion")
      .update({ completado: !it.completado }).eq("id", it.id);
    if (error) { alert(error.message); reload(); }
  };

  const add = async () => {
    const nombre = nuevo.trim();
    if (!nombre || !proyecto) return;
    const orden = (items.reduce((m, i) => Math.max(m, i.orden || 0), 0)) + 1;
    const { error } = await supabase.from("documentacion")
      .insert({ proyecto_id: proyecto.id, nombre, orden });
    if (error) { alert(error.message); return; }
    setNuevo("");
    reload();
  };

  const setNombre = async (it, nombre) => {
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, nombre } : x));
    const { error } = await supabase.from("documentacion").update({ nombre }).eq("id", it.id);
    if (error) { alert(error.message); reload(); }
  };

  const del = async (it) => {
    if (!confirm(`¿Eliminar "${it.nombre}"?`)) return;
    const { error } = await supabase.from("documentacion").delete().eq("id", it.id);
    if (error) alert(error.message); else reload();
  };

  const seed = async () => {
    if (!proyecto) return;
    const rows = SEED.map((nombre, i) => ({ proyecto_id: proyecto.id, nombre, orden: i + 1 }));
    const { error } = await supabase.from("documentacion").insert(rows);
    if (error) alert(error.message);
    reload();
  };

  const reordenar = async (fromId, toId) => {
    if (fromId === toId) return;
    const lista = ordenados;
    const fromIdx = lista.findIndex(i => i.id === fromId);
    const toIdx = lista.findIndex(i => i.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const nueva = [...lista];
    const [m] = nueva.splice(fromIdx, 1);
    nueva.splice(toIdx, 0, m);
    const conOrden = nueva.map((i, idx) => ({ ...i, orden: idx + 1 }));
    setItems(prev => prev.map(i => {
      const u = conOrden.find(x => x.id === i.id);
      return u ? { ...i, orden: u.orden } : i;
    }));
    const cambios = conOrden.filter(i => {
      const o = lista.find(x => x.id === i.id);
      return o && o.orden !== i.orden;
    });
    await Promise.all(cambios.map(i =>
      supabase.from("documentacion").update({ orden: i.orden }).eq("id", i.id)
    ));
  };

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="flex-start" spacing={1}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5">Documentación</Typography>
          <Typography variant="body2" color="text.secondary">
            Checklist de planos y documentos del proyecto. Tildá lo que ya esté listo.
          </Typography>
        </Box>
        {items.length > 0 && (
          <Chip label={`${completados}/${items.length} completados`}
            color={completados === items.length ? "success" : "default"} variant="outlined" />
        )}
      </Stack>

      {loading && <LinearProgress />}

      <Card>
        <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
          {/* Alta rápida */}
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <TextField
              size="small" fullWidth placeholder="Agregar documento… (ej. Plano de estructura)"
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            />
            <Button variant="outlined" startIcon={<AddIcon />} onClick={add} sx={{ flexShrink: 0 }}>
              Agregar
            </Button>
          </Stack>

          {ordenados.length === 0 ? (
            <Stack spacing={2} alignItems="flex-start" sx={{ p: 2 }}>
              <Typography color="text.secondary">
                No hay documentos cargados. Agregá el primero arriba o cargá el checklist sugerido.
              </Typography>
              <Button variant="contained" color="secondary" onClick={seed}>
                Cargar checklist sugerido
              </Button>
            </Stack>
          ) : (
            <Stack divider={<Divider />}>
              {ordenados.map((it) => {
                const isTarget = drag && drag.overId === it.id && drag.fromId !== it.id;
                return (
                  <Box
                    key={it.id}
                    onDragOver={(e) => { e.preventDefault(); if (drag && drag.overId !== it.id) setDrag(d => ({ ...d, overId: it.id })); }}
                    onDrop={(e) => { e.preventDefault(); if (drag) reordenar(drag.fromId, it.id); setDrag(null); }}
                    sx={{
                      display: "flex", alignItems: "center", gap: 1, py: 0.75, px: 0.5,
                      opacity: drag?.fromId === it.id ? 0.4 : 1,
                      bgcolor: it.completado ? "rgba(30,142,62,0.06)" : "transparent",
                      borderTop: isTarget ? "2px solid" : "2px solid transparent",
                      borderTopColor: isTarget ? "secondary.main" : "transparent",
                      "&:hover .del, &:hover .drag": { opacity: 1 },
                    }}
                  >
                    <Tooltip title="Arrastrá para reordenar">
                      <IconButton className="drag" size="small" draggable
                        onDragStart={() => setDrag({ fromId: it.id, overId: it.id })}
                        onDragEnd={() => setDrag(null)}
                        sx={{ cursor: "grab", touchAction: "none", opacity: { xs: 1, sm: 0.25 }, transition: "opacity .15s" }}>
                        <DragIndicatorIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Checkbox size="small" checked={!!it.completado}
                      onChange={() => toggle(it)} sx={{ p: 0.5 }} />
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <NameField value={it.nombre} strike={it.completado}
                        onCommit={(v) => setNombre(it, v)} />
                    </Box>
                    <Tooltip title="Eliminar">
                      <IconButton className="del" size="small" onClick={() => del(it)}
                        sx={{ opacity: { xs: 1, sm: 0.25 }, transition: "opacity .15s" }}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
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
