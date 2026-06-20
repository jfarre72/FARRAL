"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, Grid, TextField,
  Button, IconButton, Tooltip, LinearProgress, Dialog, DialogContent, Chip,
  ToggleButtonGroup, ToggleButton, Autocomplete
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CloseIcon from "@mui/icons-material/Close";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtDate } from "@/components/Money";
import { getCache, setCache } from "@/lib/dataCache";

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const ETIQUETAS_SUGERIDAS = ["Aberturas", "Radiadores", "Sanitarios", "Pisos", "Eléctrico", "Carpintería", "Estructura", "General"];
const esImagen = (f) => (f.mime || "").startsWith("image/");

export default function RepositorioPage() {
  const { proyecto } = useProjects();
  const [archivos, setArchivos] = useState(() => getCache("repositorio", proyecto?.id) ?? []);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [fecha, setFecha] = useState(hoyISO());
  const [etiqueta, setEtiqueta] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  const reload = async () => {
    if (!proyecto) return;
    const cached = getCache("repositorio", proyecto.id);
    setArchivos(cached ?? []);
    setLoading(!cached);
    const { data } = await supabase
      .from("repositorio").select("*").eq("proyecto_id", proyecto.id)
      .order("fecha", { ascending: false }).order("created_at", { ascending: false });
    setCache("repositorio", proyecto.id, data ?? []);
    setArchivos(data ?? []);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const etiquetas = useMemo(
    () => Array.from(new Set(archivos.map(a => a.etiqueta).filter(Boolean))),
    [archivos]
  );
  const visibles = useMemo(
    () => filtro === "todas" ? archivos : archivos.filter(a => (a.etiqueta || "Sin etiqueta") === filtro),
    [archivos, filtro]
  );

  const onPick = () => fileRef.current?.click();

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !proyecto) return;
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
          fecha: fecha || hoyISO(), etiqueta: etiqueta.trim() || null,
        });
        if (insErr) alert(insErr.message);
      }
      reload();
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const borrar = async (a) => {
    if (!confirm(`¿Eliminar "${a.nombre}"?`)) return;
    if (a.path) await supabase.storage.from("repositorio").remove([a.path]);
    const { error } = await supabase.from("repositorio").delete().eq("id", a.id);
    if (error) alert(error.message); else reload();
  };

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5">Repositorio</Typography>
        <Typography variant="body2" color="text.secondary">
          Presupuestos, planos y fichas (PDF o imagen) con su fecha y etiqueta. Se ven sin descargar.
        </Typography>
      </Box>

      {/* Carga */}
      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "flex-end" }}>
            <TextField
              type="date" label="Fecha" InputLabelProps={{ shrink: true }}
              value={fecha} onChange={(e) => setFecha(e.target.value)}
              sx={{ width: { xs: "100%", sm: 180 } }}
            />
            <Autocomplete
              freeSolo options={ETIQUETAS_SUGERIDAS} fullWidth
              inputValue={etiqueta}
              onInputChange={(e, v) => setEtiqueta(v)}
              renderInput={(params) => <TextField {...params} label="Etiqueta" placeholder="Aberturas, radiadores…" />}
            />
            <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple hidden onChange={onFiles} />
            <Button
              variant="contained" color="secondary" startIcon={<UploadFileIcon />}
              onClick={onPick} disabled={subiendo} sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}
            >
              {subiendo ? "Subiendo…" : "Subir archivo"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {(loading || subiendo) && <LinearProgress />}

      {/* Filtro por etiqueta */}
      {etiquetas.length > 0 && (
        <ToggleButtonGroup
          size="small" exclusive value={filtro}
          onChange={(e, v) => { if (v) setFiltro(v); }}
          sx={{ flexWrap: "wrap" }}
        >
          <ToggleButton value="todas">Todas</ToggleButton>
          {etiquetas.map(et => <ToggleButton key={et} value={et}>{et}</ToggleButton>)}
        </ToggleButtonGroup>
      )}

      {visibles.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
          Todavía no hay archivos. Subí el primero arriba.
        </Typography>
      ) : (
        <Grid container spacing={1.5}>
          {visibles.map((a) => (
            <Grid item xs={6} sm={4} md={3} key={a.id}>
              <Card sx={{ position: "relative", "&:hover .delf": { opacity: 1 }, height: "100%", display: "flex", flexDirection: "column" }}>
                <Box
                  onClick={() => setPreview(a)}
                  sx={{ height: 150, cursor: "pointer", bgcolor: "rgba(15,42,74,0.04)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
                >
                  {esImagen(a)
                    ? <Box component="img" src={a.url} alt={a.nombre} sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <PictureAsPdfIcon sx={{ fontSize: 56, color: "error.main", opacity: 0.85 }} />}
                </Box>
                <Tooltip title="Eliminar">
                  <IconButton
                    className="delf" size="small" onClick={() => borrar(a)}
                    sx={{ position: "absolute", top: 4, right: 4, bgcolor: "rgba(255,255,255,0.85)",
                      opacity: { xs: 1, sm: 0 }, transition: "opacity .15s", "&:hover": { bgcolor: "#fff" } }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Box sx={{ p: 0.75, flexGrow: 1 }}>
                  <Typography variant="body2" noWrap title={a.nombre} fontWeight={600}>{a.nombre}</Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" sx={{ mt: 0.25 }}>
                    <Typography variant="caption" color="text.secondary">{fmtDate(a.fecha)}</Typography>
                    {a.etiqueta && <Chip size="small" variant="outlined" label={a.etiqueta} sx={{ height: 18, fontSize: 10 }} />}
                  </Stack>
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>
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
        {preview && (
          <DialogContent>
            <Typography variant="body2" fontWeight={600}>{preview.nombre}</Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25 }}>
              <Typography variant="caption" color="text.secondary">{fmtDate(preview.fecha)}</Typography>
              {preview.etiqueta && <Chip size="small" variant="outlined" label={preview.etiqueta} />}
            </Stack>
          </DialogContent>
        )}
      </Dialog>
    </Stack>
  );
}
