"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, Grid, TextField,
  Checkbox, LinearProgress, Divider, Chip, Button, IconButton, Tooltip,
  Collapse, FormControlLabel, useMediaQuery
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";

export default function LineaTiempoPage() {
  const { proyecto } = useProjects();
  const theme = useTheme();
  const isSm = useMediaQuery(theme.breakpoints.down("sm"));
  const [hitos, setHitos] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [nuevaTarea, setNuevaTarea] = useState({});

  const reload = async () => {
    if (!proyecto) return;
    setLoading(true);
    const { data: hs } = await supabase
      .from("hitos").select("*")
      .eq("proyecto_id", proyecto.id).order("orden");
    const ids = (hs ?? []).map(h => h.id);
    let ts = [];
    if (ids.length) {
      const { data } = await supabase
        .from("hito_tareas").select("*").in("hito_id", ids).order("orden");
      ts = data ?? [];
    }
    setHitos(hs ?? []);
    setTareas(ts);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const tareasDe = (hitoId) => tareas.filter(t => t.hito_id === hitoId);

  // Fracción completada de un hito (por subtareas, o por flag completado)
  const fraccion = (h) => {
    const ts = tareasDe(h.id);
    if (ts.length > 0) return ts.filter(t => t.completado).length / ts.length;
    return h.completado ? 1 : 0;
  };

  // Peso de cada hito = delta hacia el siguiente milestone (NEXT-delta).
  // Así, completar las tareas de cada etapa suma su porción al avance.
  const conPeso = useMemo(() => {
    const sorted = [...hitos].sort((a, b) => a.orden - b.orden);
    return sorted.map((h, i) => {
      const next = sorted[i + 1];
      const peso = next ? Math.max(0, Number(next.porcentaje) - Number(h.porcentaje)) : 0;
      return { ...h, peso, desde: Number(h.porcentaje), hasta: next ? Number(next.porcentaje) : 100 };
    });
  }, [hitos]);

  const avance = useMemo(() => {
    return Math.round(conPeso.reduce((s, h) => s + h.peso * fraccion(h), 0));
  }, [conPeso, tareas]);

  const proximo = conPeso.find(h => fraccion(h) < 1 && h.peso > 0);

  const seedDefault = async () => {
    if (!proyecto) return;
    const seed = [
      { nombre: "Inicio", porcentaje: 0, orden: 1 },
      { nombre: "Cimentación", porcentaje: 15, orden: 2 },
      { nombre: "Estructura", porcentaje: 40, orden: 3 },
      { nombre: "Obra cerrada", porcentaje: 65, orden: 4 },
      { nombre: "Instalaciones + revoques", porcentaje: 85, orden: 5 },
      { nombre: "Terminada", porcentaje: 100, orden: 6 },
    ].map(h => ({ ...h, proyecto_id: proyecto.id }));
    const { error } = await supabase.from("hitos").insert(seed);
    if (error) alert(error.message);
    reload();
  };

  const updateHito = async (id, patch) => {
    setSavingId(id);
    const { error } = await supabase.from("hitos").update(patch).eq("id", id);
    setSavingId(null);
    if (error) alert(error.message);
    reload();
  };

  const toggleTarea = async (t) => {
    // Optimista
    setTareas(prev => prev.map(x => x.id === t.id ? { ...x, completado: !x.completado } : x));
    const { error } = await supabase.from("hito_tareas")
      .update({ completado: !t.completado }).eq("id", t.id);
    if (error) { alert(error.message); reload(); }
  };

  const addTarea = async (hitoId) => {
    const nombre = (nuevaTarea[hitoId] || "").trim();
    if (!nombre) return;
    const orden = tareasDe(hitoId).length + 1;
    const { error } = await supabase.from("hito_tareas").insert({ hito_id: hitoId, nombre, orden });
    if (error) { alert(error.message); return; }
    setNuevaTarea(prev => ({ ...prev, [hitoId]: "" }));
    reload();
  };

  const delTarea = async (t) => {
    const { error } = await supabase.from("hito_tareas").delete().eq("id", t.id);
    if (error) alert(error.message); else reload();
  };

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5">Hitos plan</Typography>
        <Typography variant="body2">Etapas, tareas y avance del proyecto.</Typography>
      </Box>

      {loading && <LinearProgress />}

      {/* Resumen de avance */}
      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
            <Box sx={{ flexGrow: 1, width: "100%" }}>
              <Typography variant="caption" color="text.secondary">Avance estimado</Typography>
              <Typography variant="h4">{avance}%</Typography>
              <Box sx={{ mt: 1, height: 12, bgcolor: "rgba(15,42,74,0.08)", borderRadius: 6, overflow: "hidden" }}>
                <Box sx={{ height: "100%", width: `${avance}%`, bgcolor: "secondary.main", transition: "width .4s" }} />
              </Box>
            </Box>
            <Stack spacing={0.5} sx={{ width: { xs: "100%", sm: "auto" } }}>
              <Chip label={`Inicio estim.: ${proyecto.fecha_inicio ?? "—"}`} variant="outlined" />
              <Chip label={`Fin estim.: ${proyecto.fecha_fin ?? "—"}`} variant="outlined" />
              {proximo && <Chip label={`En curso: ${proximo.nombre}`} color="primary" />}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* Etapas */}
      <Card>
        <CardContent sx={{ p: { xs: 1, sm: 2 } }}>
          {conPeso.length === 0 ? (
            <Stack spacing={2} alignItems="flex-start" sx={{ p: 2 }}>
              <Typography color="text.secondary">No hay etapas cargadas para este proyecto.</Typography>
              <Button variant="contained" color="secondary" onClick={seedDefault}>
                Cargar etapas por defecto
              </Button>
            </Stack>
          ) : (
            <Stack divider={<Divider />}>
              {conPeso.map((h) => {
                const ts = tareasDe(h.id);
                const f = fraccion(h);
                const done = f >= 1 && (ts.length > 0 || h.completado);
                const isOpen = expanded[h.id] ?? false;
                return (
                  <Box key={h.id} sx={{ py: 1.25, px: { xs: 0.5, sm: 1 } }}>
                    {/* Fila principal: todo en una línea en desktop */}
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      {done
                        ? <CheckCircleIcon color="success" />
                        : <RadioButtonUncheckedIcon sx={{ color: "rgba(15,42,74,0.3)" }} />}

                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
                          <Typography fontWeight={600} noWrap>{h.nombre}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {h.peso > 0 ? `${h.desde}–${h.hasta}%` : `${h.desde}%`}
                          </Typography>
                        </Stack>
                        {ts.length > 0 && (
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                            <Box sx={{ flexGrow: 1, maxWidth: 220, height: 6, bgcolor: "rgba(15,42,74,0.08)", borderRadius: 3, overflow: "hidden" }}>
                              <Box sx={{ height: "100%", width: `${f * 100}%`, bgcolor: done ? "success.main" : "secondary.main" }} />
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                              {ts.filter(t => t.completado).length}/{ts.length}
                            </Typography>
                          </Stack>
                        )}
                      </Box>

                      {/* Fechas: ocultas en mobile (van en el detalle) */}
                      {!isSm && (
                        <>
                          <TextField
                            label="Estimada" type="date" InputLabelProps={{ shrink: true }}
                            sx={{ width: 165 }}
                            value={h.fecha_estimada ?? ""}
                            disabled={savingId === h.id}
                            onChange={(e) => updateHito(h.id, { fecha_estimada: e.target.value || null })}
                          />
                          <TextField
                            label="Real" type="date" InputLabelProps={{ shrink: true }}
                            sx={{ width: 165 }}
                            value={h.fecha_real ?? ""}
                            disabled={savingId === h.id}
                            onChange={(e) => updateHito(h.id, { fecha_real: e.target.value || null })}
                          />
                        </>
                      )}

                      {/* Completado SIEMPRE a la derecha */}
                      <Tooltip title={ts.length > 0 ? "Se completa al tildar todas las tareas" : "Marcar etapa como completada"}>
                        <span>
                          <Checkbox
                            checked={done}
                            disabled={savingId === h.id || ts.length > 0}
                            onChange={(e) => updateHito(h.id, { completado: e.target.checked })}
                          />
                        </span>
                      </Tooltip>

                      <IconButton size="small" onClick={() => setExpanded(p => ({ ...p, [h.id]: !isOpen }))}>
                        {isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </Stack>

                    {/* Detalle expandible: tareas + fechas en mobile */}
                    <Collapse in={isOpen} unmountOnExit>
                      <Box sx={{ pl: { xs: 0, sm: 5 }, pr: 1, pt: 1.5, pb: 0.5 }}>
                        {isSm && (
                          <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
                            <Grid item xs={6}>
                              <TextField fullWidth label="Estimada" type="date" InputLabelProps={{ shrink: true }}
                                value={h.fecha_estimada ?? ""}
                                onChange={(e) => updateHito(h.id, { fecha_estimada: e.target.value || null })} />
                            </Grid>
                            <Grid item xs={6}>
                              <TextField fullWidth label="Real" type="date" InputLabelProps={{ shrink: true }}
                                value={h.fecha_real ?? ""}
                                onChange={(e) => updateHito(h.id, { fecha_real: e.target.value || null })} />
                            </Grid>
                          </Grid>
                        )}

                        {ts.length === 0 && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            Esta etapa no tiene tareas. Agregá las principales abajo.
                          </Typography>
                        )}

                        <Stack spacing={0}>
                          {ts.map((t) => (
                            <Stack key={t.id} direction="row" alignItems="center" sx={{ "&:hover .del": { opacity: 1 } }}>
                              <FormControlLabel
                                sx={{ flexGrow: 1, m: 0 }}
                                control={<Checkbox size="small" checked={t.completado} onChange={() => toggleTarea(t)} />}
                                label={
                                  <Typography variant="body2" sx={{ textDecoration: t.completado ? "line-through" : "none", color: t.completado ? "text.secondary" : "text.primary" }}>
                                    {t.nombre}
                                  </Typography>
                                }
                              />
                              <Tooltip title="Eliminar tarea">
                                <IconButton className="del" size="small" sx={{ opacity: { xs: 1, sm: 0 }, transition: "opacity .15s" }} onClick={() => delTarea(t)}>
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          ))}
                        </Stack>

                        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                          <TextField
                            size="small" fullWidth placeholder="Agregar tarea…"
                            value={nuevaTarea[h.id] || ""}
                            onChange={(e) => setNuevaTarea(p => ({ ...p, [h.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") addTarea(h.id); }}
                          />
                          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => addTarea(h.id)} sx={{ flexShrink: 0 }}>
                            Agregar
                          </Button>
                        </Stack>
                      </Box>
                    </Collapse>
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
