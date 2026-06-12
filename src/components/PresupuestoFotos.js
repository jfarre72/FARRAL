"use client";
import {
  Stack, Typography, Box, Button, IconButton, Tooltip, Dialog, Grid
} from "@mui/material";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CloseIcon from "@mui/icons-material/Close";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Fotos asociadas a un presupuesto. Carga/guarda en el bucket 'galeria'
// (carpeta presupuestos/<id>) y registra en la tabla presupuesto_fotos.
export default function PresupuestoFotos({ presupuestoId }) {
  const [fotos, setFotos] = useState([]);
  const [subiendo, setSubiendo] = useState(false);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  const reload = async () => {
    const { data } = await supabase
      .from("presupuesto_fotos").select("*")
      .eq("presupuesto_id", presupuestoId)
      .order("created_at", { ascending: false });
    setFotos(data ?? []);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [presupuestoId]);

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setSubiendo(true);
    try {
      for (const file of files) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `presupuestos/${presupuestoId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("galeria").upload(path, file, { upsert: false });
        if (upErr) { alert(upErr.message); continue; }
        const { data: pub } = supabase.storage.from("galeria").getPublicUrl(path);
        const { error: insErr } = await supabase.from("presupuesto_fotos")
          .insert({ presupuesto_id: presupuestoId, url: pub.publicUrl, path });
        if (insErr) alert(insErr.message);
      }
      reload();
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const borrar = async (f) => {
    if (!confirm("¿Eliminar esta foto?")) return;
    if (f.path) await supabase.storage.from("galeria").remove([f.path]);
    const { error } = await supabase.from("presupuesto_fotos").delete().eq("id", f.id);
    if (error) alert(error.message); else reload();
  };

  return (
    <Box sx={{ mt: 1 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
          Fotos {fotos.length > 0 && `(${fotos.length})`}
        </Typography>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
        <Button size="small" variant="outlined" startIcon={<AddPhotoAlternateIcon />}
          onClick={() => fileRef.current?.click()} disabled={subiendo}>
          {subiendo ? "Subiendo…" : "Subir fotos"}
        </Button>
      </Stack>

      {fotos.length === 0 ? (
        <Typography variant="caption" color="text.secondary">Sin fotos cargadas.</Typography>
      ) : (
        <Grid container spacing={1}>
          {fotos.map((f) => (
            <Grid item xs={4} sm={3} md={2} key={f.id}>
              <Box sx={{ position: "relative", "&:hover .delf": { opacity: 1 } }}>
                <Box component="img" src={f.url} alt=""
                  onClick={() => setPreview(f)}
                  sx={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 1, cursor: "pointer", display: "block" }} />
                <Tooltip title="Eliminar">
                  <IconButton className="delf" size="small" onClick={() => borrar(f)}
                    sx={{ position: "absolute", top: 2, right: 2, bgcolor: "rgba(255,255,255,0.85)",
                      opacity: { xs: 1, sm: 0 }, transition: "opacity .15s", "&:hover": { bgcolor: "#fff" } }}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog open={!!preview} onClose={() => setPreview(null)} maxWidth="lg">
        <Box sx={{ position: "relative" }}>
          <IconButton onClick={() => setPreview(null)}
            sx={{ position: "absolute", top: 8, right: 8, bgcolor: "rgba(255,255,255,0.85)", "&:hover": { bgcolor: "#fff" } }}>
            <CloseIcon />
          </IconButton>
          {preview && (
            <Box component="img" src={preview.url} alt=""
              sx={{ maxWidth: "90vw", maxHeight: "85vh", display: "block" }} />
          )}
        </Box>
      </Dialog>
    </Box>
  );
}
