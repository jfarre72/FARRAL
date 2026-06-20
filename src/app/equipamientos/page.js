"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, TextField, MenuItem,
  Button, IconButton, Tooltip, LinearProgress, Divider, Checkbox, Chip,
  Badge, Dialog, DialogTitle, DialogContent, Collapse,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import DescriptionIcon from "@mui/icons-material/Description";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CloseIcon from "@mui/icons-material/Close";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtDate } from "@/components/Money";

const esImagen = (f) => (f.mime || "").startsWith("image/");
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

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
  const [repos, setRepos] = useState([]); // archivos del repositorio
  const [loading, setLoading] = useState(true);
  const [nuevoPorGrupo, setNuevoPorGrupo] = useState({}); // { [grupo]: "nombre" }
  const [gruposManual, setGruposManual] = useState([]); // grupos agregados sin items todavía
  const [nuevoGrupo, setNuevoGrupo] = useState("");
  const [detalle, setDetalle] = useState(null); // equipamiento abierto
  const [preview, setPreview] = useState(null); // archivo en visor
  const [colapsado, setColapsado] = useState({}); // { [grupo]: true } => cerrado
  const [subiendo, setSubiendo] = useState(false);
  const [drag, setDrag] = useState(null); // { grupo, fromId, overId }
  const fileRef = useRef(null);

  const reload = async () => {
    if (!proyecto) return;
    setLoading(true);
    const [{ data: hs }, { data: eq }, { data: rp }] = await Promise.all([
      supabase.from("hitos").select("nombre,orden").eq("proyecto_id", proyecto.id).order("orden"),
      supabase.from("equipamientos").select("*").eq("proyecto_id", proyecto.id).order("orden"),
      supabase.from("repositorio").select("*").eq("proyecto_id", proyecto.id).order("fecha", { ascending: false }),
    ]);
    setEtapas((hs ?? []).map(h => h.nombre));
    setItems(eq ?? []);
    setRepos(rp ?? []);
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const grupoDe = (it) => it.etapa || GENERAL;
  const itemsDe = (g) => items.filter(i => grupoDe(i) === g).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  // Archivos del repositorio asociados a un equipamiento (por etiqueta ↔ nombre).
  const archivosDe = (it) => {
    const n = (it.nombre || "").trim().toLowerCase();
    if (!n) return [];
    return repos.filter(r => {
      const et = (r.etiqueta || "").trim().toLowerCase();
      if (!et) return false;
      return et === n || et.includes(n) || n.includes(et);
    });
  };

  // Grupos a mostrar: los que tienen items + los agregados manualmente.
  const gruposConItems = Array.from(new Set(items.map(grupoDe)));
  const grupos = [
    ...etapas.filter(e => gruposConItems.includes(e)),
    ...gruposConItems.filter(g => !etapas.includes(g) && g !== GENERAL),
    ...(gruposConItems.includes(GENERAL) ? [GENERAL] : []),
    ...gruposManual.filter(g => !gruposConItems.includes(g)),
  ];
  // Etapas que todavía no son grupo visible (para el selector "Agregar grupo").
  const etapasDisponibles = [...etapas, GENERAL].filter(e => !grupos.includes(e));

  const agregarGrupo = (g) => {
    const nombre = (g || "").trim();
    if (!nombre || grupos.includes(nombre)) { setNuevoGrupo(""); return; }
    setGruposManual(prev => [...prev, nombre]);
    setNuevoGrupo("");
  };

  // Elimina un grupo de la vista: si tiene items, los borra (con confirmación).
  const eliminarGrupo = async (g) => {
    const lista = itemsDe(g);
    if (lista.length > 0) {
      if (!confirm(`¿Eliminar el grupo "${g}" y sus ${lista.length} equipamiento(s)?`)) return;
      const ids = lista.map(i => i.id);
      const { error } = await supabase.from("equipamientos").delete().in("id", ids);
      if (error) { alert(error.message); return; }
    }
    setGruposManual(prev => prev.filter(x => x !== g));
    reload();
  };

  // Adjunta archivos a un equipamiento: se suben al repositorio con etiqueta =
  // nombre del equipamiento, por lo que quedan asociados automáticamente.
  const onAdjuntar = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !proyecto || !detalle) return;
    setSubiendo(true);
    try {
      for (const file of files) {
        const ext = (file.name.split(".").pop() || "bin").toLowerCase();
        const path = `${proyecto.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("repositorio").upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) { alert(upErr.message); continue; }
        const { data: pub } = supabase.storage.from("repositorio").getPublicUrl(path);
        const { error: insErr } = await supabase.from("repositorio").insert({
          proyecto_id: proyecto.id, url: pub.publicUrl, path,
          nombre: file.name, mime: file.type || null,
          fecha: hoyISO(), etiqueta: detalle.nombre,
        });
        if (insErr) alert(insErr.message);
      }
      await reload();
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const update = async (id, patch) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    const { error } = await supabase.from("equipamientos").update(patch).eq("id", id);
    if (error) { alert(error.message); reload(); }
  };

  const add = async (grupo) => {
    const nombre = (nuevoPorGrupo[grupo] || "").trim();
    if (!nombre || !proyecto) return;
    const etapa = grupo === GENERAL ? null : grupo;
    const orden = (itemsDe(grupo).reduce((m, i) => Math.max(m, i.orden || 0), 0)) + 1;
    const { error } = await supabase.from("equipamientos")
      .insert({ proyecto_id: proyecto.id, etapa, nombre, orden });
    if (error) { alert(error.message); return; }
    setNuevoPorGrupo(p => ({ ...p, [grupo]: "" }));
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
        {totalItems === 0 && (
          <Button variant="outlined" onClick={seed} sx={{ flexShrink: 0 }}>
            Cargar checklist sugerido
          </Button>
        )}
      </Stack>

      {loading && <LinearProgress />}

      {/* Agregar grupo (etapa o nombre libre) */}
      <Card>
        <CardContent sx={{ py: 1.5 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
            <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>Agregar grupo:</Typography>
            {etapasDisponibles.length > 0 && (
              <TextField select size="small" label="Desde una etapa" sx={{ minWidth: 200 }}
                value="" onChange={(e) => agregarGrupo(e.target.value)}>
                {etapasDisponibles.map(e => <MenuItem key={e} value={e}>{e}</MenuItem>)}
              </TextField>
            )}
            <TextField size="small" placeholder="o nombre nuevo…" value={nuevoGrupo}
              onChange={(e) => setNuevoGrupo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") agregarGrupo(nuevoGrupo); }} />
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => agregarGrupo(nuevoGrupo)} sx={{ flexShrink: 0 }}>
              Agregar grupo
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {grupos.length === 0 && (
        <Typography color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
          No hay grupos. Agregá uno arriba o cargá el checklist sugerido.
        </Typography>
      )}

      {(
        grupos.map((g) => {
          const lista = itemsDe(g);
          const compradosG = lista.filter(i => i.comprado).length;
          return (
            <Card key={g}>
              <CardContent>
                <Stack direction="row" alignItems="center" sx={{ mb: colapsado[g] ? 0 : 1.5, cursor: "pointer" }} spacing={1}
                  onClick={() => setColapsado(p => ({ ...p, [g]: !p[g] }))}>
                  <IconButton size="small" sx={{ pointerEvents: "none" }}>
                    {colapsado[g] ? <ExpandMoreIcon /> : <ExpandLessIcon />}
                  </IconButton>
                  <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>{g}</Typography>
                  <Chip size="small" variant="outlined"
                    color={lista.length > 0 && compradosG === lista.length ? "success" : "default"}
                    label={`${compradosG}/${lista.length}`} />
                  <Tooltip title="Eliminar grupo">
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); eliminarGrupo(g); }}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
                <Collapse in={!colapsado[g]} unmountOnExit>
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
                        {(() => {
                          const n = archivosDe(it).length;
                          return (
                            <Tooltip title={n > 0 ? `${n} archivo(s) en repositorio` : "Ver repositorio asociado"}>
                              <IconButton size="small" onClick={() => setDetalle(it)}
                                sx={{ flexShrink: 0, color: n > 0 ? "secondary.main" : "inherit" }}>
                                <Badge badgeContent={n} color="secondary">
                                  <DescriptionIcon fontSize="small" />
                                </Badge>
                              </IconButton>
                            </Tooltip>
                          );
                        })()}
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

                {/* Alta dentro del grupo (como en Planificación) */}
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <TextField
                    size="small" fullWidth placeholder="Agregar equipamiento…"
                    value={nuevoPorGrupo[g] || ""}
                    onChange={(e) => setNuevoPorGrupo(p => ({ ...p, [g]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") add(g); }}
                  />
                  <Button variant="outlined" startIcon={<AddIcon />} onClick={() => add(g)} sx={{ flexShrink: 0 }}>
                    Agregar
                  </Button>
                </Stack>
                </Collapse>
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Detalle: archivos del repositorio asociados al equipamiento */}
      <Dialog open={!!detalle} onClose={() => setDetalle(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Box sx={{ flexGrow: 1 }}>{detalle?.nombre}</Box>
            <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple hidden onChange={onAdjuntar} />
            <Button size="small" variant="contained" color="secondary" startIcon={<UploadFileIcon />}
              onClick={() => fileRef.current?.click()} disabled={subiendo}>
              {subiendo ? "Subiendo…" : "Adjuntar"}
            </Button>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {subiendo && <LinearProgress sx={{ mb: 1.5 }} />}
          {(() => {
            const archivos = detalle ? archivosDe(detalle) : [];
            if (archivos.length === 0) {
              return (
                <Typography variant="body2" color="text.secondary">
                  No hay archivos en el repositorio con la etiqueta “{detalle?.nombre}”.
                  Subí presupuestos/planos en Repositorio con esa etiqueta para verlos acá.
                </Typography>
              );
            }
            return (
              <Stack spacing={1}>
                {archivos.map(a => (
                  <Stack key={a.id} direction="row" spacing={1.5} alignItems="center"
                    sx={{ p: 1, borderRadius: 1.5, border: "1px solid", borderColor: "divider", cursor: "pointer", "&:hover": { bgcolor: "rgba(15,42,74,0.03)" } }}
                    onClick={() => setPreview(a)}>
                    <Box sx={{ width: 44, height: 44, borderRadius: 1, overflow: "hidden", flexShrink: 0, bgcolor: "rgba(15,42,74,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {esImagen(a)
                        ? <Box component="img" src={a.url} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <PictureAsPdfIcon sx={{ color: "error.main" }} />}
                    </Box>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap fontWeight={600}>{a.nombre}</Typography>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="caption" color="text.secondary">{fmtDate(a.fecha)}</Typography>
                        {a.etiqueta && <Chip size="small" variant="outlined" label={a.etiqueta} sx={{ height: 18, fontSize: 10 }} />}
                      </Stack>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Visor en línea (PDF o imagen) */}
      <Dialog open={!!preview} onClose={() => setPreview(null)} maxWidth="lg" fullWidth>
        <Box sx={{ position: "relative", bgcolor: "#000" }}>
          <Stack direction="row" spacing={0.5} sx={{ position: "absolute", top: 8, right: 8, zIndex: 1 }}>
            {preview && (
              <Tooltip title="Abrir en pestaña nueva">
                <IconButton component="a" href={preview.url} target="_blank" rel="noopener"
                  sx={{ bgcolor: "rgba(255,255,255,0.85)", "&:hover": { bgcolor: "#fff" } }}>
                  <OpenInNewIcon />
                </IconButton>
              </Tooltip>
            )}
            <IconButton onClick={() => setPreview(null)}
              sx={{ bgcolor: "rgba(255,255,255,0.85)", "&:hover": { bgcolor: "#fff" } }}>
              <CloseIcon />
            </IconButton>
          </Stack>
          {preview && (esImagen(preview)
            ? <Box component="img" src={preview.url} alt={preview.nombre}
                sx={{ maxWidth: "100%", maxHeight: "85vh", display: "block", m: "0 auto" }} />
            : <Box component="iframe" src={preview.url} title={preview.nombre}
                sx={{ width: "100%", height: "85vh", border: 0, display: "block", bgcolor: "#fff" }} />
          )}
        </Box>
      </Dialog>
    </Stack>
  );
}
