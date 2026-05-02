"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, Grid, TextField,
  Checkbox, FormControlLabel, LinearProgress, Divider, Chip, Button
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";

export default function LineaTiempoPage() {
  const { proyecto } = useProjects();
  const [hitos, setHitos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const reload = async () => {
    if (!proyecto) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("hitos").select("*")
      .eq("proyecto_id", proyecto.id).order("orden");
    if (!error) setHitos(data ?? []);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

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

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  const completados = hitos.filter(h => h.completado).sort((a,b) => b.porcentaje - a.porcentaje);
  const avance = completados[0]?.porcentaje ?? 0;
  const proximo = hitos.find(h => !h.completado);

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Línea de tiempo</Typography>

      {loading && <LinearProgress />}

      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="caption" color="text.secondary">Avance estimado</Typography>
              <Typography variant="h4">{avance}%</Typography>
              <Box sx={{ mt: 1, height: 12, bgcolor: "rgba(15,42,74,0.08)", borderRadius: 6, overflow: "hidden" }}>
                <Box sx={{ height: "100%", width: `${avance}%`, bgcolor: "secondary.main", transition: "width .4s" }} />
              </Box>
            </Box>
            <Stack spacing={0.5}>
              <Chip label={`Inicio estim.: ${proyecto.fecha_inicio ?? "—"}`} variant="outlined" />
              <Chip label={`Fin estim.: ${proyecto.fecha_fin ?? "—"}`} variant="outlined" />
              {proximo && <Chip label={`Próximo: ${proximo.nombre}`} color="primary" />}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {hitos.length === 0 ? (
            <Stack spacing={2} alignItems="flex-start">
              <Typography color="text.secondary">No hay hitos cargados para este proyecto.</Typography>
              <Button variant="contained" color="secondary" onClick={seedDefault}>
                Cargar hitos por defecto
              </Button>
            </Stack>
          ) : (
            <Stack spacing={2}>
              {hitos.map((h, idx) => (
                <Box key={h.id}>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs="auto">
                      {h.completado
                        ? <CheckCircleIcon color="success" />
                        : <RadioButtonUncheckedIcon color="disabled" />}
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Typography fontWeight={600}>{h.nombre}</Typography>
                      <Typography variant="caption" color="text.secondary">{h.porcentaje}% del avance</Typography>
                    </Grid>
                    <Grid item xs={12} sm={3}>
                      <TextField
                        label="Fecha estimada"
                        type="date"
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        value={h.fecha_estimada ?? ""}
                        disabled={savingId === h.id}
                        onChange={(e) => updateHito(h.id, { fecha_estimada: e.target.value || null })}
                      />
                    </Grid>
                    <Grid item xs={12} sm={3}>
                      <TextField
                        label="Fecha real"
                        type="date"
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        value={h.fecha_real ?? ""}
                        disabled={savingId === h.id}
                        onChange={(e) => updateHito(h.id, { fecha_real: e.target.value || null })}
                      />
                    </Grid>
                    <Grid item xs={12} sm={2}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={h.completado}
                            disabled={savingId === h.id}
                            onChange={(e) => updateHito(h.id, { completado: e.target.checked })}
                          />
                        }
                        label="Completado"
                      />
                    </Grid>
                  </Grid>
                  {idx < hitos.length - 1 && <Divider sx={{ mt: 2 }} />}
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
