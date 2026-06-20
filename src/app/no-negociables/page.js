"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, TextField,
  Button, IconButton, Tooltip, LinearProgress
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import GppMaybeIcon from "@mui/icons-material/GppMaybe";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { getCache, setCache } from "@/lib/dataCache";

// Campo que guarda al salir (blur/Enter), no en cada tecla.
function NotaField({ value, onCommit }) {
  const [local, setLocal] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setLocal(value ?? ""); }, [value, focused]);
  const commit = () => {
    setFocused(false);
    const v = local.trim();
    if (v !== String(value ?? "")) onCommit(v);
  };
  return (
    <TextField
      fullWidth multiline variant="standard" value={local}
      onFocus={() => setFocused(true)}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      sx={{
        "& .MuiInput-root::before": { borderBottomColor: "transparent" },
        "& .MuiInput-root:hover:not(.Mui-focused)::before": { borderBottomColor: "rgba(15,42,74,0.2) !important" },
      }}
    />
  );
}

export default function NoNegociablesPage() {
  const { proyecto } = useProjects();
  const [notas, setNotas] = useState(() => getCache("no-negociables", proyecto?.id) ?? []);
  const [loading, setLoading] = useState(true);
  const [nueva, setNueva] = useState("");

  const reload = async () => {
    if (!proyecto) return;
    const cached = getCache("no-negociables", proyecto.id);
    setNotas(cached ?? []);
    setLoading(!cached);
    const { data } = await supabase
      .from("no_negociables").select("*").eq("proyecto_id", proyecto.id)
      .order("orden", { ascending: true }).order("created_at", { ascending: true });
    setCache("no-negociables", proyecto.id, data ?? []);
    setNotas(data ?? []);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const add = async () => {
    const texto = nueva.trim();
    if (!texto || !proyecto) return;
    const orden = notas.reduce((m, n) => Math.max(m, n.orden || 0), 0) + 1;
    const { error } = await supabase.from("no_negociables")
      .insert({ proyecto_id: proyecto.id, texto, orden });
    if (error) { alert(error.message); return; }
    setNueva("");
    reload();
  };

  const update = async (id, texto) => {
    if (!texto) return;
    setNotas(prev => prev.map(n => n.id === id ? { ...n, texto } : n));
    const { error } = await supabase.from("no_negociables").update({ texto }).eq("id", id);
    if (error) { alert(error.message); reload(); }
  };

  const del = async (n) => {
    if (!confirm("¿Eliminar esta nota?")) return;
    const { error } = await supabase.from("no_negociables").delete().eq("id", n.id);
    if (error) alert(error.message); else reload();
  };

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5">No negociables</Typography>
        <Typography variant="body2" color="text.secondary">
          Detalles que sí o sí deben cumplirse en la obra. Notas rápidas, editables.
        </Typography>
      </Box>

      {loading && <LinearProgress />}

      {/* Alta rápida */}
      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <TextField
              size="small" fullWidth multiline placeholder="Agregar no negociable…"
              value={nueva} onChange={(e) => setNueva(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(); } }}
            />
            <Button variant="contained" color="secondary" startIcon={<AddIcon />}
              onClick={add} sx={{ flexShrink: 0 }}>
              Agregar
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {notas.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
          Todavía no hay no negociables. Agregá el primero arriba.
        </Typography>
      ) : (
        <Card>
          <CardContent sx={{ p: { xs: 1, sm: 1.5 } }}>
            <Stack divider={<Box sx={{ borderBottom: "1px solid", borderColor: "divider" }} />}>
              {notas.map((n) => (
                <Stack key={n.id} direction="row" spacing={1} alignItems="flex-start"
                  sx={{ py: 1, px: 0.5, "&:hover .del": { opacity: 1 } }}>
                  <GppMaybeIcon sx={{ color: "warning.main", mt: 0.5, flexShrink: 0 }} fontSize="small" />
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <NotaField value={n.texto} onCommit={(v) => update(n.id, v)} />
                  </Box>
                  <Tooltip title="Eliminar">
                    <IconButton className="del" size="small" onClick={() => del(n)}
                      sx={{ opacity: { xs: 1, sm: 0 }, transition: "opacity .15s", flexShrink: 0 }}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
