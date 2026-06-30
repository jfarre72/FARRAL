"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, Grid, TextField,
  Button, IconButton, Tooltip, LinearProgress, Dialog, DialogContent, Chip,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CloseIcon from "@mui/icons-material/Close";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtDate } from "@/components/Money";
import { getCache, setCache } from "@/lib/dataCache";

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const esImagen = (f) => (f.mime || "").startsWith("image/");
const esPdf = (f) => (f.mime || "") === "application/pdf";

export default function NotasPage() {
  const { proyecto } = useProjects();
  const [notas, setNotas] = useState(() => getCache("notas", proyecto?.id) ?? []);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [pendientes, setPendientes] = useState([]); // File[] a subir con la nota nueva
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  const reload = async () => {
    if (!proyecto) return;
    const cached = getCache("notas", proyecto.id);
    setNotas(cached ?? []);
    setLoading(!cached);
    const { data } = await supabase
      .from("notas")
      .select("*, archivos:nota_archivos(*)")
      .eq("proyecto_id", proyecto.id)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });
    setCache("notas", proyecto.id, data ?? []);
    setNotas(data ?? []);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const onPick = () => fileRef.current?.click();
  const onFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) setPendientes(prev => [...prev, ...files]);
    if (fileRef.current) fileRef.current.value = "";
  };
  const quitarPendiente = (i) => setPendientes(prev => prev.filter((_, idx) => idx !== i));

  const limpiar = () => { setTitulo(""); setTexto(""); setFecha(hoyISO()); setPendientes([]); };

  const guardar = async () => {
    if (!proyecto) return;
    if (!texto.trim() && !titulo.trim() && pendientes.length === 0) return;
    setGuardando(true);
    try {
      const { data: nota, error: insErr } = await supabase
        .from("notas")
        .insert({
          proyecto_id: proyecto.id,
          titulo: titulo.trim() || null,
          texto: texto.trim() || null,
          fecha: fecha || hoyISO(),
        })
        .select()
        .single();
      if (insErr) { alert(insErr.message); return; }

      for (const file of pendientes) {
        const ext = (file.name.split(".").pop() || "bin").toLowerCase();
        const path = `${proyecto.id}/${nota.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("notas").upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) { alert(upErr.message); continue; }
        const { data: pub } = supabase.storage.from("notas").getPublicUrl(path);
        const { error: aErr } = await supabase.from("nota_archivos").insert({
          nota_id: nota.id, url: pub.publicUrl, path,
          nombre: file.name, mime: file.type || null,
        });
        if (aErr) alert(aErr.message);
      }
      limpiar();
      reload();
    } finally {
      setGuardando(false);
    }
  };

  const borrarNota = async (n) => {
    if (!confirm("¿Eliminar esta nota y sus archivos?")) return;
    const paths = (n.archivos || []).map(a => a.path).filter(Boolean);
    if (paths.length) await supabase.storage.from("notas").remove(paths);
    const { error } = await supabase.from("notas").delete().eq("id", n.id);
    if (error) alert(error.message); else reload();
  };

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5">Notas</Typography>
        <Typography variant="body2" color="text.secondary">
          Anotaciones del proyecto con archivos o fotos adjuntas. Ej: «Calculé que 1000 ladrillos cubren X m²».
        </Typography>
      </Box>

      {/* Nueva nota */}
      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <TextField
                label="Título (opcional)" value={titulo}
                onChange={(e) => setTitulo(e.target.value)} fullWidth
              />
              <TextField
                type="date" label="Fecha" InputLabelProps={{ shrink: true }}
                value={fecha} onChange={(e) => setFecha(e.target.value)}
                sx={{ width: { xs: "100%", sm: 180 } }}
              />
            </Stack>
            <TextField
              label="Nota" value={texto} multiline minRows={3}
              onChange={(e) => setTexto(e.target.value)} fullWidth
              placeholder="Escribí tu anotación…"
            />

            {pendientes.length > 0 && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {pendientes.map((f, i) => (
                  <Chip key={i} label={f.name} onDelete={() => quitarPendiente(i)} variant="outlined" />
                ))}
              </Stack>
            )}

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="space-between">
              <input ref={fileRef} type="file" accept="image/*,application/pdf,*/*" multiple hidden onChange={onFiles} />
              <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={onPick}>
                Adjuntar archivos / fotos
              </Button>
              <Button
                variant="contained" color="secondary" onClick={guardar}
                disabled={guardando || (!texto.trim() && !titulo.trim() && pendientes.length === 0)}
              >
                {guardando ? "Guardando…" : "Guardar nota"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {(loading || guardando) && <LinearProgress />}

      {notas.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
          Todavía no hay notas. Cargá la primera arriba.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {notas.map((n) => (
            <Card key={n.id}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box sx={{ minWidth: 0 }}>
                    {n.titulo && <Typography variant="subtitle1" fontWeight={700}>{n.titulo}</Typography>}
                    <Typography variant="caption" color="text.secondary">{fmtDate(n.fecha)}</Typography>
                  </Box>
                  <Tooltip title="Eliminar nota">
                    <IconButton size="small" onClick={() => borrarNota(n)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
                {n.texto && (
                  <Typography variant="body2" sx={{ mt: 1, whiteSpace: "pre-wrap" }}>{n.texto}</Typography>
                )}
                {(n.archivos || []).length > 0 && (
                  <Grid container spacing={1} sx={{ mt: 0.5 }}>
                    {n.archivos.map((a) => (
                      <Grid item xs={4} sm={3} md={2} key={a.id}>
                        <Box
                          onClick={() => setPreview(a)}
                          sx={{
                            height: 90, cursor: "pointer", borderRadius: 1,
                            border: "1px solid", borderColor: "divider",
                            bgcolor: "rgba(15,42,74,0.04)", overflow: "hidden",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          {esImagen(a)
                            ? <Box component="img" src={a.url} alt={a.nombre} sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : esPdf(a)
                              ? <PictureAsPdfIcon sx={{ fontSize: 40, color: "error.main", opacity: 0.85 }} />
                              : <InsertDriveFileIcon sx={{ fontSize: 40, color: "text.secondary" }} />}
                        </Box>
                        <Typography variant="caption" noWrap display="block" title={a.nombre}>{a.nombre}</Typography>
                      </Grid>
                    ))}
                  </Grid>
                )}
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      {/* Visor */}
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
            : esPdf(preview)
              ? <Box component="iframe" src={preview.url} title={preview.nombre}
                  sx={{ width: "100%", height: "85vh", border: 0, display: "block", bgcolor: "#fff" }} />
              : <Box sx={{ p: 4, bgcolor: "#fff", textAlign: "center" }}>
                  <InsertDriveFileIcon sx={{ fontSize: 64, color: "text.secondary" }} />
                  <Typography variant="body2" sx={{ mt: 1 }}>{preview.nombre}</Typography>
                  <Button href={preview.url} target="_blank" rel="noopener" sx={{ mt: 1 }} startIcon={<OpenInNewIcon />}>
                    Descargar / abrir
                  </Button>
                </Box>
          )}
        </Box>
        {preview && (
          <DialogContent>
            <Typography variant="body2" fontWeight={600}>{preview.nombre}</Typography>
          </DialogContent>
        )}
      </Dialog>
    </Stack>
  );
}
