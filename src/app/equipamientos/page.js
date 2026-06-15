"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, TextField, MenuItem,
  Button, IconButton, Tooltip, LinearProgress, Divider, Checkbox, Chip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";

const GENERAL = "General";

// Checklist sugerido por defecto (agrupado por ambiente / etapa).
const SEED = [
  ["Cocina", ["Mesada", "Bajo mesada y alacenas", "Anafe", "Horno", "Campana", "Pileta y grifería", "Heladera"]],
  ["Baños", ["Inodoro", "Bidet", "Vanitory", "Grifería", "Mampara", "Espejo", "Accesorios"]],
  ["Climatización", ["Equipos split", "Caldera / Termotanque", "Radiadores / Losa radiante"]],
  ["Electricidad", ["Tablero", "Artefactos de iluminación", "Llaves y tomas"]],
  ["Carpinterías", ["Puerta de entrada", "Puertas interiores", "Ventanas", "Placares"]],
  ["Pisos y Revestimientos", ["Pisos", "Zócalos", "Revestimientos baños", "Porcelanato"]],
];

// Campo que guarda al salir (blur/Enter), no en cada tecla.
function CommitField({ value, onCommit, placeholder, sx, strike, bold, small, align }) {
  const [local, setLocal] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setLocal(value ?? ""); }, [value, focused]);
  const commit = () => {
    setFocused(false);
    if (String(local) !== String(value ?? "")) onCommit(local);
  };
  return (
    <TextField
      size="small" variant="standard" value={local} sx={{
        ...sx,
        "& .MuiInput-root::before": { borderBottomColor: "transparent" },
        "& .MuiInput-root:hover:not(.Mui-focused)::before": { borderBottomColor: "rgba(15,42,74,0.15) !important" },
      }}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      inputProps={{
        style: {
          ...(strike ? { textDecoration: "line-through", color: "rgba(0,0,0,0.45)" } : {}),
          ...(bold ? { fontWeight: 600 } : {}),
          ...(small ? { fontSize: 13 } : {}),
          ...(align ? { textAlign: align } : {}),
        },
      }}
    />
  );
}

export default function EquipamientosPage() {
  const { proyecto } = useProjects();
  const [etapas, setEtapas] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState({ nombre: "", cantidad: "", etapa: GENERAL });
  const [drag, setDrag] = useState(null); // { grupo, fromId, overId }

  const reload = async () => {
    if (!proyecto) return;
    setLoading(true);
    const [{ data: hs }, { data: eq }] = await Promise.all([
      supabase.from("hitos").select("nombre,orden").eq("proyecto_id", proyecto.id).order("orden"),
      supabase.from("equipamientos").select("*").eq("proyecto_id", proyecto.id).order("orden"),
    ]);
    setEtapas((hs ?? []).map(h => h.nombre));
    setItems(eq ?? []);
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const grupoDe = (it) => it.etapa || GENERAL;
  const itemsDe = (g) => items.filter(i => grupoDe(i) === g).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  // Grupos a mostrar: los que tienen items (en orden de etapas + el resto).
  const gruposConItems = Array.from(new Set(items.map(grupoDe)));
  const grupos = [
    ...etapas.filter(e => gruposConItems.includes(e)),
    ...gruposConItems.filter(g => !etapas.includes(g) && g !== GENERAL),
    ...(gruposConItems.includes(GENERAL) ? [GENERAL] : []),
  ];

  // Opciones de etapa para el alta (etapas del proyecto + grupos existentes + General).
  const opcionesEtapa = Array.from(new Set([...etapas, ...gruposConItems, GENERAL]));

  const update = async (id, patch) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    const { error } = await supabase.from("equipamientos").update(patch).eq("id", id);
    if (error) { alert(error.message); reload(); }
  };

  const add = async () => {
    const nombre = nuevo.nombre.trim();
    if (!nombre || !proyecto) return;
    const etapa = nuevo.etapa === GENERAL ? null : nuevo.etapa;
    const orden = (itemsDe(nuevo.etapa).reduce((m, i) => Math.max(m, i.orden || 0), 0)) + 1;
    const { error } = await supabase.from("equipamientos")
      .insert({ proyecto_id: proyecto.id, etapa, nombre, cantidad: nuevo.cantidad || null, orden });
    if (error) { alert(error.message); return; }
    setNuevo({ nombre: "", cantidad: "", etapa: nuevo.etapa });
    reload();
  };

  const del = async (it) => {
    if (!confirm(`¿Eliminar "${it.nombre}"?`)) return;
    const { error } = await supabase.from("equipamientos").delete().eq("id", it.id);
    if (error) alert(error.message); else reload();
  };

  const seed = async () => {
    if (!proyecto) return;
    const rows = [];
    let orden = 1;
    for (const [grupo, lista] of SEED) {
      for (const nombre of lista) {
        rows.push({ proyecto_id: proyecto.id, etapa: grupo, nombre, orden: orden++ });
      }
    }
    const { error } = await supabase.from("equipamientos").insert(rows);
    if (error) alert(error.message);
    reload();
  };

  const reordenar = async (grupo, fromId, toId) => {
    if (fromId === toId) return;
    const lista = itemsDe(grupo);
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
      supabase.from("equipamientos").update({ orden: i.orden }).eq("id", i.id)
    ));
  };

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  const totalItems = items.length;
  const comprados = items.filter(i => i.comprado).length;

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="flex-start" spacing={1}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5">Equipamientos</Typography>
          <Typography variant="body2" color="text.secondary">
            Listado de compras por etapa. Tildá lo que ya se compró.
          </Typography>
        </Box>
        {totalItems > 0 && (
          <Chip label={`${comprados}/${totalItems} comprados`}
            color={comprados === totalItems ? "success" : "default"} variant="outlined" />
        )}
      </Stack>

      {loading && <LinearProgress />}

      {/* Alta rápida */}
      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "flex-end" }}>
            <TextField label="Nuevo equipamiento" placeholder="Nombre" fullWidth size="small"
              value={nuevo.nombre} onChange={(e) => setNuevo(n => ({ ...n, nombre: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
            <TextField label="Cantidad" size="small" sx={{ width: { xs: "100%", sm: 120 } }}
              value={nuevo.cantidad} onChange={(e) => setNuevo(n => ({ ...n, cantidad: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
            <TextField select label="Etapa" size="small" sx={{ width: { xs: "100%", sm: 200 } }}
              value={nuevo.etapa} onChange={(e) => setNuevo(n => ({ ...n, etapa: e.target.value }))}>
              {opcionesEtapa.map(e => <MenuItem key={e} value={e}>{e}</MenuItem>)}
            </TextField>
            <Button variant="contained" color="secondary" startIcon={<AddIcon />}
              onClick={add} sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}>
              Agregar
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {totalItems === 0 ? (
        <Card>
          <CardContent>
            <Stack spacing={2} alignItems="flex-start">
              <Typography color="text.secondary">No hay equipamientos cargados.</Typography>
              <Button variant="outlined" onClick={seed}>Cargar checklist sugerido</Button>
            </Stack>
          </CardContent>
        </Card>
      ) : (
        grupos.map((g) => {
          const lista = itemsDe(g);
          const compradosG = lista.filter(i => i.comprado).length;
          return (
            <Card key={g}>
              <CardContent>
                <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }} spacing={1}>
                  <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>{g}</Typography>
                  <Chip size="small" variant="outlined"
                    color={lista.length > 0 && compradosG === lista.length ? "success" : "default"}
                    label={`${compradosG}/${lista.length}`} />
                </Stack>
                <Stack spacing={0.5}>
                  {lista.map((it) => {
                    const isTarget = drag && drag.grupo === g && drag.overId === it.id && drag.fromId !== it.id;
                    return (
                      <Box
                        key={it.id}
                        onDragOver={(e) => { if (drag?.grupo === g) { e.preventDefault(); if (drag.overId !== it.id) setDrag(d => ({ ...d, overId: it.id })); } }}
                        onDrop={(e) => { e.preventDefault(); if (drag?.grupo === g) reordenar(g, drag.fromId, it.id); setDrag(null); }}
                        sx={{
                          display: "flex", alignItems: "center", gap: 1,
                          px: 1, py: 0.75, borderRadius: 2,
                          opacity: drag?.fromId === it.id ? 0.4 : 1,
                          bgcolor: it.comprado ? "rgba(30,142,62,0.06)" : "transparent",
                          outline: isTarget ? "2px solid" : "none", outlineColor: "secondary.main",
                          "&:hover": { bgcolor: it.comprado ? "rgba(30,142,62,0.1)" : "rgba(15,42,74,0.035)" },
                          "&:hover .drag, &:hover .del": { opacity: 1 },
                        }}
                      >
                        <Tooltip title="Arrastrá para reordenar">
                          <IconButton className="drag" size="small" draggable
                            onDragStart={() => setDrag({ grupo: g, fromId: it.id, overId: it.id })}
                            onDragEnd={() => setDrag(null)}
                            sx={{ cursor: "grab", touchAction: "none", opacity: { xs: 1, sm: 0.25 }, transition: "opacity .15s" }}>
                            <DragIndicatorIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Checkbox size="small" checked={!!it.comprado}
                          onChange={(e) => update(it.id, { comprado: e.target.checked })} sx={{ p: 0.5 }} />
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                          <CommitField value={it.nombre} sx={{ width: "100%" }} strike={it.comprado} bold
                            onCommit={(v) => { const n = String(v).trim(); if (n) update(it.id, { nombre: n }); else reload(); }} />
                          <CommitField value={it.observacion} placeholder="Agregar nota…" small sx={{ width: "100%" }}
                            onCommit={(v) => update(it.id, { observacion: v || null })} />
                        </Box>
                        <CommitField value={it.cantidad} placeholder="Cant." small align="right"
                          sx={{ width: 64, flexShrink: 0 }}
                          onCommit={(v) => update(it.id, { cantidad: v || null })} />
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
              </CardContent>
            </Card>
          );
        })
      )}
    </Stack>
  );
}
