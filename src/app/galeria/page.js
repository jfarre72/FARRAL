"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, Grid, TextField,
  Button, IconButton, Tooltip, LinearProgress, Dialog, DialogContent, Chip
} from "@mui/material";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CloseIcon from "@mui/icons-material/Close";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtDate } from "@/components/Money";
import { getCache, setCache } from "@/lib/dataCache";

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function GaleriaPage() {
  const { proyecto } = useProjects();
  const [fotos, setFotos] = useState(() => getCache("fotos", proyecto?.id) ?? []);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [fecha, setFecha] = useState(hoyISO());
  const [desc, setDesc] = useState("");
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  const reload = async () => {
    if (!proyecto) return;
    const cached = getCache("fotos", proyecto.id);
    setFotos(cached ?? []);
    setLoading(!cached);
    const { data } = await supabase
      .from("fotos").select("*").eq("proyecto_id", proyecto.id)
      .order("fecha", { ascending: false }).order("created_at", { ascending: false });
    setCache("fotos", proyecto.id, data ?? []);
    setFotos(data ?? []);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  // Agrupadas por mes (según fecha de la foto)
  const grupos = useMemo(() => {
    const map = new Map();
    for (const f of fotos) {
      const key = String(f.fecha).slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(f);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [fotos]);

  const onPick = () => fileRef.current?.click();

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !proyecto) return;
    setSubiendo(true);
    try {
      for (const file of files) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${proyecto.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("galeria").upload(path, file, { upsert: false });
        if (upErr) { alert(upErr.message); continue; }
        const { data: pub } = supabase.storage.from("galeria").getPublicUrl(path);
        const { error: insErr } = await supabase.from("fotos").insert({
          proyecto_id: proyecto.id, url: pub.publicUrl, path,
          fecha: fecha || hoyISO(), descripcion: desc.trim() || null,
        });
        if (insErr) alert(insErr.message);
      }
      setDesc("");
      reload();
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const borrar = async (f) => {
    if (!confirm("¿Eliminar esta foto?")) return;
    if (f.path) await supabase.storage.from("galeria").remove([f.path]);
    const { error } = await supabase.from("fotos").delete().eq("id", f.id);
    if (error) alert(error.message); else reload();
  };

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5">Galería</Typography>
        <Typography variant="body2" color="text.secondary">
          Fotos del avance de obra, con su fecha. Se agrupan por mes.
        </Typography>
      </Box>

      {/* Carga */}
      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "flex-end" }}>
            <TextField
              type="date" label="Fecha de las fotos" InputLabelProps={{ shrink: true }}
              value={fecha} onChange={(e) => setFecha(e.target.value)}
              sx={{ width: { xs: "100%", sm: 200 } }}
            />
            <TextField
              label="Descripción (opcional)" fullWidth
              value={desc} onChange={(e) => setDesc(e.target.value)}
            />
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
            <Button
              variant="contained" color="secondary" startIcon={<AddPhotoAlternateIcon />}
              onClick={onPick} disabled={subiendo} sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}
            >
              {subiendo ? "Subiendo…" : "Subir fotos"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {(loading || subiendo) && <LinearProgress />}

      {grupos.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
          Todavía no hay fotos. Subí las primeras arriba.
        </Typography>
      ) : (
        grupos.map(([mes, items]) => {
          const [yy, mm] = mes.split("-");
          return (
            <Box key={mes}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  {MESES[Number(mm) - 1]} {yy}
                </Typography>
                <Chip size="small" label={`${items.length} foto${items.length > 1 ? "s" : ""}`} variant="outlined" />
              </Stack>
              <Grid container spacing={1.5}>
                {items.map((f) => (
                  <Grid item xs={6} sm={4} md={3} key={f.id}>
                    <Card sx={{ position: "relative", "&:hover .delf": { opacity: 1 } }}>
                      <Box
                        component="img" src={f.url} alt={f.descripcion || ""}
                        onClick={() => setPreview(f)}
                        sx={{ width: "100%", height: 150, objectFit: "cover", display: "block", cursor: "pointer" }}
                      />
                      <Tooltip title="Eliminar">
                        <IconButton
                          className="delf" size="small" onClick={() => borrar(f)}
                          sx={{ position: "absolute", top: 4, right: 4, bgcolor: "rgba(255,255,255,0.85)",
                            opacity: { xs: 1, sm: 0 }, transition: "opacity .15s", "&:hover": { bgcolor: "#fff" } }}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Box sx={{ p: 0.75 }}>
                        <Typography variant="caption" color="text.secondary">{fmtDate(f.fecha)}</Typography>
                        {f.descripcion && (
                          <Typography variant="body2" noWrap title={f.descripcion}>{f.descripcion}</Typography>
                        )}
                      </Box>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          );
        })
      )}

      {/* Visor */}
      <Dialog open={!!preview} onClose={() => setPreview(null)} maxWidth="lg">
        <Box sx={{ position: "relative" }}>
          <IconButton onClick={() => setPreview(null)}
            sx={{ position: "absolute", top: 8, right: 8, bgcolor: "rgba(255,255,255,0.85)", "&:hover": { bgcolor: "#fff" } }}>
            <CloseIcon />
          </IconButton>
          {preview && (
            <Box component="img" src={preview.url} alt={preview.descripcion || ""}
              sx={{ maxWidth: "90vw", maxHeight: "85vh", display: "block" }} />
          )}
        </Box>
        {preview && (preview.descripcion || preview.fecha) && (
          <DialogContent>
            <Typography variant="caption" color="text.secondary">{fmtDate(preview.fecha)}</Typography>
            {preview.descripcion && <Typography variant="body2">{preview.descripcion}</Typography>}
          </DialogContent>
        )}
      </Dialog>
    </Stack>
  );
}
