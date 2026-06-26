"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, TextField, MenuItem,
  Button, IconButton, Tooltip, LinearProgress, Divider, Checkbox, Chip,
  Dialog, Collapse,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import DescriptionIcon from "@mui/icons-material/Description";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CloseIcon from "@mui/icons-material/Close";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import EditNoteIcon from "@mui/icons-material/EditNote";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import NotesIcon from "@mui/icons-material/Notes";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtDate, fmtMoney } from "@/components/Money";

// Suma de valores por moneda y su texto.
const sumarValores = (lista) => lista.reduce((acc, i) => {
  const v = Number(i.valor);
  if (!v) return acc;
  const m = i.moneda || "USD";
  acc[m] = (acc[m] || 0) + v;
  return acc;
}, {});
const fmtSuma = (s) => {
  const parts = [];
  if (s.USD) parts.push(fmtMoney(s.USD, "USD"));
  if (s.ARS) parts.push(fmtMoney(s.ARS, "ARS"));
  return parts.length ? parts.join(" · ") : null;
};

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
function CommitField({ value, onCommit, placeholder, sx, strike, bold, small, align, autoFocus }) {
  const [local, setLocal] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setLocal(value ?? ""); }, [value, focused]);
  const commit = () => {
    setFocused(false);
    if (String(local) !== String(value ?? "")) onCommit(local);
  };
  return (
    <TextField
      autoFocus={autoFocus}
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

// Valor de referencia (numérico) + moneda (USD/ARS toggle).
function ValorField({ valor, moneda, onCommit }) {
  const [local, setLocal] = useState(valor ?? "");
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setLocal(valor ?? ""); }, [valor, focused]);
  const commit = () => {
    setFocused(false);
    const v = local === "" || local === null ? null : Number(local);
    if ((valor ?? null) !== (v ?? null)) onCommit({ valor: v });
  };
  const cur = moneda || "USD";
  return (
    <Stack direction="row" alignItems="center" spacing={0.25} onClick={(e) => e.stopPropagation()}>
      <Tooltip title="Cambiar moneda">
        <Button size="small" onClick={() => onCommit({ moneda: cur === "USD" ? "ARS" : "USD" })}
          sx={{ minWidth: 0, px: 0.5, fontSize: 11, color: "text.secondary" }}>{cur}</Button>
      </Tooltip>
      <TextField
        size="small" variant="standard" type="number" placeholder="valor"
        value={local}
        onFocus={() => setFocused(true)}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        sx={{ width: 84 }}
        inputProps={{ style: { textAlign: "right", fontSize: 13 } }}
      />
    </Stack>
  );
}

// Nota multilínea que guarda al salir.
function NoteField({ value, onCommit }) {
  const [local, setLocal] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setLocal(value ?? ""); }, [value, focused]);
  const commit = () => {
    setFocused(false);
    const v = local.trim() || null;
    if ((value ?? null) !== v) onCommit(v);
  };
  return (
    <TextField
      fullWidth multiline minRows={2} size="small" label="Nota" placeholder="Agregar nota…"
      value={local}
      onFocus={() => setFocused(true)}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
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
  const [preview, setPreview] = useState(null); // archivo en visor
  const [colapsado, setColapsado] = useState({}); // { [grupo]: true } => cerrado
  const [expandItem, setExpandItem] = useState({}); // { [id]: true } => detalle abierto
  const [editName, setEditName] = useState({}); // { [id]: true } => editando nombre
  const [subiendoId, setSubiendoId] = useState(null);
  const [drag, setDrag] = useState(null); // { grupo, fromId, overId }
  const fileRef = useRef(null);
  const attachTo = useRef(null); // equipamiento al que se adjunta
  const initColapso = useRef(false); // grupos ya colapsados al entrar (una vez por proyecto)

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
  useEffect(() => { initColapso.current = false; reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

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

  // Al entrar (una vez por proyecto) mostramos los grupos colapsados, para ver
  // la estructura agrupada de un vistazo y desplegar sólo lo que haga falta.
  useEffect(() => {
    if (!initColapso.current && grupos.length > 0) {
      initColapso.current = true;
      setColapsado(Object.fromEntries(grupos.map(g => [g, true])));
    }
    /* eslint-disable-next-line */
  }, [grupos.length]);

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

  // Dispara el selector de archivos para un equipamiento.
  const pickAttach = (it) => { attachTo.current = it; fileRef.current?.click(); };

  // Adjunta archivos: se suben al repositorio con etiqueta = nombre del
  // equipamiento, por lo que quedan asociados automáticamente.
  const onAdjuntar = async (e) => {
    const files = Array.from(e.target.files || []);
    const it = attachTo.current;
    if (!files.length || !proyecto || !it) return;
    setSubiendoId(it.id);
    setExpandItem(p => ({ ...p, [it.id]: true }));
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
          fecha: hoyISO(), etiqueta: it.nombre,
        });
        if (insErr) alert(insErr.message);
      }
      await reload();
    } finally {
      setSubiendoId(null);
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
        {totalItems > 0 && (() => {
          const tot = fmtSuma(sumarValores(items));
          return (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              {tot && <Chip label={`Total: ${tot}`} color="secondary" />}
              <Chip label={`${comprados}/${totalItems} comprados`}
                color={comprados === totalItems ? "success" : "default"} variant="outlined" />
            </Stack>
          );
        })()}
        {totalItems === 0 && (
          <Button variant="outlined" onClick={seed} sx={{ flexShrink: 0 }}>
            Cargar checklist sugerido
          </Button>
        )}
      </Stack>

      {/* Input oculto para adjuntar archivos a un equipamiento */}
      <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple hidden onChange={onAdjuntar} />

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
                  {(() => { const s = fmtSuma(sumarValores(lista)); return s ? (
                    <Chip size="small" color="secondary" variant="outlined" label={s} />
                  ) : null; })()}
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
                    const archivos = archivosDe(it);
                    const abierto = !!expandItem[it.id];
                    const editando = !!editName[it.id];
                    const toggleExp = () => setExpandItem(p => ({ ...p, [it.id]: !p[it.id] }));
                    return (
                      <Box
                        key={it.id}
                        onDragOver={(e) => { if (drag?.grupo === g) { e.preventDefault(); if (drag.overId !== it.id) setDrag(d => ({ ...d, overId: it.id })); } }}
                        onDrop={(e) => { e.preventDefault(); if (drag?.grupo === g) reordenar(g, drag.fromId, it.id); setDrag(null); }}
                        sx={{
                          borderRadius: 2,
                          opacity: drag?.fromId === it.id ? 0.4 : 1,
                          bgcolor: it.comprado ? "rgba(30,142,62,0.06)" : "transparent",
                          outline: isTarget ? "2px solid" : "none", outlineColor: "secondary.main",
                          "&:hover .drag, &:hover .del": { opacity: 1 },
                        }}
                      >
                        {/* Fila principal: tocar en cualquier lado despliega el detalle */}
                        <Box onClick={toggleExp}
                          sx={{
                            display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.75,
                            borderRadius: 2, cursor: "pointer",
                            "&:hover": { bgcolor: it.comprado ? "rgba(30,142,62,0.1)" : "rgba(15,42,74,0.035)" },
                          }}
                        >
                          <Tooltip title="Arrastrá para reordenar">
                            <IconButton className="drag" size="small" draggable
                              onClick={(e) => e.stopPropagation()}
                              onDragStart={() => setDrag({ grupo: g, fromId: it.id, overId: it.id })}
                              onDragEnd={() => setDrag(null)}
                              sx={{ cursor: "grab", touchAction: "none", opacity: { xs: 1, sm: 0.25 }, transition: "opacity .15s" }}>
                              <DragIndicatorIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Checkbox size="small" checked={!!it.comprado}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => update(it.id, { comprado: e.target.checked })} sx={{ p: 0.5 }} />
                          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            {editando ? (
                              <CommitField value={it.nombre} autoFocus bold sx={{ width: "100%" }}
                                onCommit={(v) => { const n = String(v).trim(); if (n) update(it.id, { nombre: n }); setEditName(p => ({ ...p, [it.id]: false })); }} />
                            ) : (
                              <Typography variant="body2" noWrap fontWeight={600}
                                sx={{ textDecoration: it.comprado ? "line-through" : "none", color: it.comprado ? "text.secondary" : "text.primary" }}>
                                {it.nombre}
                              </Typography>
                            )}
                          </Box>
                          {it.observacion && <Tooltip title={it.observacion}><NotesIcon sx={{ fontSize: 16, color: "text.disabled" }} /></Tooltip>}
                          <ValorField valor={it.valor} moneda={it.moneda}
                            onCommit={(patch) => update(it.id, patch)} />
                          <Box onClick={(e) => e.stopPropagation()}>
                            <CommitField value={it.cantidad} placeholder="Cant." small align="right"
                              sx={{ width: 56 }} onCommit={(v) => update(it.id, { cantidad: v || null })} />
                          </Box>
                          {archivos.length > 0 && (
                            <Chip size="small" variant="outlined" icon={<DescriptionIcon sx={{ fontSize: 14 }} />}
                              label={archivos.length} sx={{ height: 22 }} />
                          )}
                          <Tooltip title="Editar nombre">
                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); setEditName(p => ({ ...p, [it.id]: !p[it.id] })); }}>
                              <DriveFileRenameOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Notas">
                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); setExpandItem(p => ({ ...p, [it.id]: true })); }}>
                              <EditNoteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Adjuntar archivo">
                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); pickAttach(it); }}>
                              <AttachFileIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Eliminar">
                            <IconButton className="del" size="small" onClick={(e) => { e.stopPropagation(); del(it); }}
                              sx={{ opacity: { xs: 1, sm: 0.25 }, transition: "opacity .15s" }}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <IconButton size="small" sx={{ pointerEvents: "none" }}>
                            {abierto ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                          </IconButton>
                        </Box>

                        {/* Detalle desplegable: nota + archivos adjuntos */}
                        <Collapse in={abierto} unmountOnExit>
                          <Box sx={{ px: 2, pb: 1.5, pt: 0.5 }}>
                            <NoteField value={it.observacion} onCommit={(v) => update(it.id, { observacion: v })} />
                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1.5, mb: 0.5 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
                                Archivos adjuntos
                              </Typography>
                              <Button size="small" startIcon={<UploadFileIcon />} onClick={() => pickAttach(it)} disabled={subiendoId === it.id}>
                                {subiendoId === it.id ? "Subiendo…" : "Adjuntar"}
                              </Button>
                            </Stack>
                            {subiendoId === it.id && <LinearProgress sx={{ mb: 1 }} />}
                            {archivos.length === 0 ? (
                              <Typography variant="body2" color="text.secondary">
                                Sin archivos. Adjuntá presupuestos o planos (se guardan en Repositorio).
                              </Typography>
                            ) : (
                              <Stack spacing={1}>
                                {archivos.map(a => (
                                  <Stack key={a.id} direction="row" spacing={1.5} alignItems="center"
                                    sx={{ p: 1, borderRadius: 1.5, border: "1px solid", borderColor: "divider", cursor: "pointer", "&:hover": { bgcolor: "rgba(15,42,74,0.03)" } }}
                                    onClick={() => setPreview(a)}>
                                    <Box sx={{ width: 40, height: 40, borderRadius: 1, overflow: "hidden", flexShrink: 0, bgcolor: "rgba(15,42,74,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                      {esImagen(a)
                                        ? <Box component="img" src={a.url} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                        : <PictureAsPdfIcon sx={{ color: "error.main" }} />}
                                    </Box>
                                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                      <Typography variant="body2" noWrap fontWeight={600}>{a.nombre}</Typography>
                                      <Typography variant="caption" color="text.secondary">{fmtDate(a.fecha)}</Typography>
                                    </Box>
                                  </Stack>
                                ))}
                              </Stack>
                            )}
                          </Box>
                        </Collapse>
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
