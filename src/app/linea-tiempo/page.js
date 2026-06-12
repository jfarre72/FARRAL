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
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtDate } from "@/components/Money";
import { getCache, setCache } from "@/lib/dataCache";
import { printDocument, esc } from "@/lib/printPdf";

// Días hábiles (lunes a viernes) entre dos fechas ISO (YYYY-MM-DD).
// Cuenta los días posteriores a 'desde' hasta 'hasta' inclusive.
function diasHabiles(desdeISO, hastaISO) {
  if (!desdeISO || !hastaISO) return null;
  const a = new Date(desdeISO + "T00:00:00");
  const b = new Date(hastaISO + "T00:00:00");
  if (isNaN(a) || isNaN(b)) return null;
  const signo = b >= a ? 1 : -1;
  let ini = signo > 0 ? a : b;
  const fin = signo > 0 ? b : a;
  let count = 0;
  const cur = new Date(ini);
  cur.setDate(cur.getDate() + 1); // excluye el día de inicio
  while (cur <= fin) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count * signo;
}

// Campo de fecha que guarda recién al salir del campo (blur/Enter), no en cada
// tecla, para poder tipear el año con el teclado sin que se interrumpa.
function DateField({ value, onCommit, disabled, label, fullWidth, sx }) {
  const [local, setLocal] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  // Sincroniza con el valor externo cuando el campo no está en edición.
  useEffect(() => { if (!focused) setLocal(value ?? ""); }, [value, focused]);
  const commit = () => {
    setFocused(false);
    const v = local || null;
    if ((value ?? null) !== v) onCommit(v);
  };
  return (
    <TextField
      label={label} type="date" InputLabelProps={{ shrink: true }}
      fullWidth={fullWidth} sx={sx} disabled={disabled}
      value={local}
      onFocus={() => setFocused(true)}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}

// Input compacto de % (0-100) que guarda al salir del campo (blur/Enter).
function PctField({ value, onCommit }) {
  const [local, setLocal] = useState(String(value ?? 0));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setLocal(String(value ?? 0)); }, [value, focused]);
  const commit = () => {
    setFocused(false);
    const v = Math.max(0, Math.min(100, Math.round(Number(local) || 0)));
    if (v !== Number(value)) onCommit(v);
    setLocal(String(v));
  };
  return (
    <TextField
      type="number" size="small" value={local}
      onFocus={() => setFocused(true)}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      inputProps={{ min: 0, max: 100, style: { textAlign: "right", padding: "4px 6px", width: 38 } }}
      InputProps={{ endAdornment: <Typography variant="caption" color="text.secondary">%</Typography> }}
      sx={{ width: 78, flexShrink: 0 }}
    />
  );
}

export default function LineaTiempoPage() {
  const { proyecto } = useProjects();
  const theme = useTheme();
  const isSm = useMediaQuery(theme.breakpoints.down("sm"));
  const [hitos, setHitos] = useState(() => getCache("linea-tiempo", proyecto?.id)?.hitos ?? []);
  const [tareas, setTareas] = useState(() => getCache("linea-tiempo", proyecto?.id)?.tareas ?? []);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [nuevaTarea, setNuevaTarea] = useState({});

  const reload = async () => {
    if (!proyecto) return;
    const cached = getCache("linea-tiempo", proyecto.id);
    if (cached) { setHitos(cached.hitos); setTareas(cached.tareas); }
    setLoading(!cached); // con caché mostramos al instante y revalidamos sin bloquear
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
    setCache("linea-tiempo", proyecto.id, { hitos: hs ?? [], tareas: ts });
    setHitos(hs ?? []);
    setTareas(ts);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const tareasDe = (hitoId) =>
    tareas.filter(t => t.hito_id === hitoId).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  // Avance de una tarea (0-100): usa 'avance', con fallback a completado.
  const avanceTarea = (t) => (t.avance != null ? Number(t.avance) : (t.completado ? 100 : 0));

  // Fracción completada de un hito (promedio de avance de subtareas).
  const fraccion = (h) => {
    const ts = tareasDe(h.id);
    if (ts.length > 0) return ts.reduce((s, t) => s + avanceTarea(t), 0) / (ts.length * 100);
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
    const avance = t.completado ? 0 : 100;
    const patch = { completado: !t.completado, avance, completado_at: !t.completado ? new Date().toISOString() : null };
    setTareas(prev => prev.map(x => x.id === t.id ? { ...x, ...patch } : x));
    const { error } = await supabase.from("hito_tareas").update(patch).eq("id", t.id);
    if (error) { alert(error.message); reload(); }
  };

  // Setea el % de avance de una tarea; 100% la marca como completada.
  const setAvanceTarea = async (t, valor) => {
    const avance = Math.max(0, Math.min(100, Math.round(Number(valor) || 0)));
    const completado = avance >= 100;
    const eraCompleto = avanceTarea(t) >= 100;
    const patch = { avance, completado };
    if (completado && !eraCompleto) patch.completado_at = new Date().toISOString();
    if (!completado) patch.completado_at = null;
    setTareas(prev => prev.map(x => x.id === t.id ? { ...x, ...patch } : x));
    const { error } = await supabase.from("hito_tareas").update(patch).eq("id", t.id);
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

  // Drag & drop para reordenar tareas dentro de una etapa
  const [drag, setDrag] = useState(null); // { hitoId, fromId }

  const reordenarTareas = async (hitoId, fromId, toId) => {
    if (fromId === toId) return;
    const lista = tareasDe(hitoId);
    const fromIdx = lista.findIndex(t => t.id === fromId);
    const toIdx = lista.findIndex(t => t.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;

    const nueva = [...lista];
    const [movida] = nueva.splice(fromIdx, 1);
    nueva.splice(toIdx, 0, movida);

    // Reasignar orden 1..n y actualizar estado optimista
    const conOrden = nueva.map((t, i) => ({ ...t, orden: i + 1 }));
    setTareas(prev => prev.map(t => {
      const u = conOrden.find(x => x.id === t.id);
      return u ? { ...t, orden: u.orden } : t;
    }));

    // Persistir nuevos órdenes (sólo los que cambiaron)
    const cambios = conOrden.filter(t => {
      const orig = lista.find(x => x.id === t.id);
      return orig && orig.orden !== t.orden;
    });
    await Promise.all(cambios.map(t =>
      supabase.from("hito_tareas").update({ orden: t.orden }).eq("id", t.id)
    ));
  };

  const exportarPdf = () => {
    const secciones = conPeso.map((h) => {
      const ts = tareasDe(h.id);
      const d = diasHabiles(h.fecha_estimada, h.fecha_real);
      const meta = [
        h.peso > 0 ? `${h.desde}–${h.hasta}%` : `${h.desde}%`,
        h.fecha_estimada ? `Inicio: ${fmtDate(h.fecha_estimada)}` : null,
        h.fecha_real ? `Fin: ${fmtDate(h.fecha_real)}` : null,
        d != null ? `${d} días háb.` : null,
      ].filter(Boolean).join(" · ");
      const filas = ts.length
        ? ts.map(t => `<tr><td>${t.completado ? "✔" : "○"}</td><td><span class="${t.completado ? "done" : ""}">${esc(t.nombre)}</span></td></tr>`).join("")
        : `<tr><td></td><td class="muted">Sin tareas</td></tr>`;
      return `<h2>${esc(h.nombre)} <span class="muted" style="font-weight:400">${esc(meta)}</span></h2>
        <table><tbody>${filas}</tbody></table>`;
    }).join("");
    printDocument({
      title: "Hitos plan",
      subtitle: `${esc(proyecto.nombre)} · ${fmtDate(new Date().toISOString())} · Avance estimado ${avance}%`,
      bodyHtml: secciones,
    });
  };

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="flex-start" spacing={1}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5">Hitos plan</Typography>
          <Typography variant="body2">Etapas, tareas y avance del proyecto.</Typography>
        </Box>
        <Button variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={exportarPdf}>
          PDF
        </Button>
      </Stack>

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
              <Chip label={`Inicio estim.: ${fmtDate(proyecto.fecha_inicio)}`} variant="outlined" />
              <Chip label={`Fin estim.: ${fmtDate(proyecto.fecha_fin)}`} variant="outlined" />
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
                    {/* Fila principal: toda la fila es clickeable */}
                    <Stack
                      direction="row" spacing={1.5} alignItems="center"
                      sx={{ cursor: "pointer", borderRadius: 2, p: 0.5, "&:hover": { bgcolor: "rgba(15,42,74,0.03)" } }}
                      onClick={() => setExpanded(p => ({ ...p, [h.id]: !isOpen }))}
                    >
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
                        <Box onClick={(e) => e.stopPropagation()} sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
                          <DateField
                            label="Inicio" sx={{ width: 155 }}
                            value={h.fecha_estimada ?? ""}
                            disabled={savingId === h.id}
                            onCommit={(v) => updateHito(h.id, { fecha_estimada: v })}
                          />
                          <DateField
                            label="Fin" sx={{ width: 155 }}
                            value={h.fecha_real ?? ""}
                            disabled={savingId === h.id}
                            onCommit={(v) => updateHito(h.id, { fecha_real: v })}
                          />
                          {(() => {
                            const d = diasHabiles(h.fecha_estimada, h.fecha_real);
                            return d != null ? (
                              <Chip size="small" variant="outlined"
                                label={`${d} día${Math.abs(d) === 1 ? "" : "s"} háb.`}
                                color={d < 0 ? "error" : "default"} />
                            ) : <Box sx={{ width: 70 }} />;
                          })()}
                        </Box>
                      )}

                      {/* Completado SIEMPRE a la derecha */}
                      <Box onClick={(e) => e.stopPropagation()}>
                        <Tooltip title={ts.length > 0 ? "Se completa al tildar todas las tareas" : "Marcar etapa como completada"}>
                          <span>
                            <Checkbox
                              checked={done}
                              disabled={savingId === h.id || ts.length > 0}
                              onChange={(e) => updateHito(h.id, { completado: e.target.checked })}
                            />
                          </span>
                        </Tooltip>
                      </Box>

                      <IconButton size="small" tabIndex={-1} sx={{ pointerEvents: "none" }} onClick={() => setExpanded(p => ({ ...p, [h.id]: !isOpen }))}>
                        {isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </Stack>

                    {/* Detalle expandible: tareas + fechas en mobile */}
                    <Collapse in={isOpen} unmountOnExit>
                      <Box sx={{ pl: { xs: 0, sm: 5 }, pr: 1, pt: 1.5, pb: 0.5 }}>
                        {isSm && (
                          <Grid container spacing={1.5} sx={{ mb: 1.5 }} alignItems="center">
                            <Grid item xs={6}>
                              <DateField fullWidth label="Inicio"
                                value={h.fecha_estimada ?? ""}
                                onCommit={(v) => updateHito(h.id, { fecha_estimada: v })} />
                            </Grid>
                            <Grid item xs={6}>
                              <DateField fullWidth label="Fin"
                                value={h.fecha_real ?? ""}
                                onCommit={(v) => updateHito(h.id, { fecha_real: v })} />
                            </Grid>
                            {(() => {
                              const d = diasHabiles(h.fecha_estimada, h.fecha_real);
                              return d != null ? (
                                <Grid item xs={12}>
                                  <Chip size="small" variant="outlined"
                                    label={`${d} día${Math.abs(d) === 1 ? "" : "s"} hábiles (lun–vie)`}
                                    color={d < 0 ? "error" : "default"} />
                                </Grid>
                              ) : null;
                            })()}
                          </Grid>
                        )}

                        {ts.length === 0 && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            Esta etapa no tiene tareas. Agregá las principales abajo.
                          </Typography>
                        )}

                        <Stack spacing={0}>
                          {ts.map((t) => {
                            const dragging = drag?.fromId === t.id;
                            const isTarget = drag?.hitoId === h.id && drag?.overId === t.id && drag?.fromId !== t.id;
                            return (
                            <Stack
                              key={t.id} direction="row" alignItems="center"
                              onDragOver={(e) => {
                                if (drag?.hitoId !== h.id) return;
                                e.preventDefault();
                                if (drag.overId !== t.id) setDrag(d => ({ ...d, overId: t.id }));
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (drag?.hitoId === h.id) reordenarTareas(h.id, drag.fromId, t.id);
                                setDrag(null);
                              }}
                              sx={{
                                "&:hover .del": { opacity: 1 },
                                "&:hover .drag": { opacity: 1 },
                                opacity: dragging ? 0.4 : 1,
                                borderTop: isTarget ? "2px solid" : "2px solid transparent",
                                borderTopColor: isTarget ? "secondary.main" : "transparent",
                              }}
                            >
                              <Tooltip title="Arrastrá para reordenar">
                                <IconButton
                                  className="drag" size="small"
                                  draggable
                                  onDragStart={() => setDrag({ hitoId: h.id, fromId: t.id, overId: t.id })}
                                  onDragEnd={() => setDrag(null)}
                                  sx={{ cursor: "grab", opacity: { xs: 1, sm: 0 }, transition: "opacity .15s", touchAction: "none" }}
                                >
                                  <DragIndicatorIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <FormControlLabel
                                sx={{ flexGrow: 1, m: 0 }}
                                control={<Checkbox size="small" checked={t.completado} onChange={() => toggleTarea(t)} />}
                                label={
                                  <Typography variant="body2" sx={{ textDecoration: t.completado ? "line-through" : "none", color: t.completado ? "text.secondary" : "text.primary" }}>
                                    {t.nombre}
                                  </Typography>
                                }
                              />
                              <Box sx={{ px: 0.5 }} onClick={(e) => e.stopPropagation()}>
                                <PctField value={avanceTarea(t)} onCommit={(v) => setAvanceTarea(t, v)} />
                              </Box>
                              <Tooltip title="Eliminar tarea">
                                <IconButton className="del" size="small" sx={{ opacity: { xs: 1, sm: 0 }, transition: "opacity .15s" }} onClick={() => delTarea(t)}>
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                            );
                          })}
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
