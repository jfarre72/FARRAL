"use client";
import { Card, CardContent, Grid, Typography, Stack, Button, Alert, Box, LinearProgress } from "@mui/material";
import Link from "next/link";
import { useProjects } from "@/components/ProjectContext";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fmtMoney, fmtNum, fmtPct } from "@/components/Money";

export default function Home() {
  const { proyecto, loading, error } = useProjects();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!proyecto) { setStats(null); return; }
    (async () => {
      const [{ data: aportes }, { data: hitos }, { data: inversores }] = await Promise.all([
        supabase.from("aportes").select("*").eq("proyecto_id", proyecto.id),
        supabase.from("hitos").select("*").eq("proyecto_id", proyecto.id).order("orden"),
        supabase.from("inversores").select("id").eq("proyecto_id", proyecto.id),
      ]);
      const hitoIds = (hitos ?? []).map(h => h.id);
      let tareas = [];
      if (hitoIds.length) {
        const { data } = await supabase.from("hito_tareas").select("hito_id,completado").in("hito_id", hitoIds);
        tareas = data ?? [];
      }
      const totUSD = (aportes ?? []).filter(a => a.moneda === "USD").reduce((s,a) => s + Number(a.monto || 0), 0);
      const totARS = (aportes ?? []).filter(a => a.moneda === "ARS").reduce((s,a) => s + Number(a.monto || 0), 0);
      const m2Vendidos = (aportes ?? []).reduce((s,a) => s + Number(a.cantidad_m2 || 0), 0);
      const pctVendido = proyecto.m2_totales > 0 ? (m2Vendidos / Number(proyecto.m2_totales)) * 100 : 0;
      // Avance ponderado por subtareas (mismo criterio que Línea de tiempo)
      const sorted = [...(hitos ?? [])].sort((a, b) => a.orden - b.orden);
      const fraccion = (h) => {
        const ts = tareas.filter(t => t.hito_id === h.id);
        if (ts.length > 0) return ts.filter(t => t.completado).length / ts.length;
        return h.completado ? 1 : 0;
      };
      const avance = Math.round(sorted.reduce((s, h, i) => {
        const next = sorted[i + 1];
        const peso = next ? Math.max(0, Number(next.porcentaje) - Number(h.porcentaje)) : 0;
        return s + peso * fraccion(h);
      }, 0));
      setStats({
        totUSD, totARS, m2Vendidos, pctVendido, avance,
        nInversores: inversores?.length ?? 0,
        hitos: hitos ?? [],
      });
    })();
  }, [proyecto]);

  if (error) {
    return (
      <Alert severity="warning" sx={{ mt: 2 }}>
        {error}
      </Alert>
    );
  }

  if (loading) return <LinearProgress />;

  if (!proyecto) {
    return (
      <Card>
        <CardContent>
          <Stack spacing={2} alignItems="flex-start">
            <Typography variant="h5">Bienvenido a FARRALAPP</Typography>
            <Typography color="text.secondary">
              Aún no tenés proyectos cargados. Empezá creando el primero.
            </Typography>
            <Button component={Link} href="/proyectos" variant="contained" color="secondary">
              Crear proyecto
            </Button>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">{proyecto.nombre}</Typography>
        {proyecto.descripcion && (
          <Typography color="text.secondary">{proyecto.descripcion}</Typography>
        )}
      </Box>

      <Grid container spacing={2}>
        <KPI title="Avance de obra" value={fmtPct(stats?.avance ?? 0, 0)} hint="último hito completado" />
        <KPI title="m² vendidos"    value={`${fmtNum(stats?.m2Vendidos ?? 0)} m²`} hint={`de ${fmtNum(proyecto.m2_totales)} totales`} />
        <KPI title="% vendido"      value={fmtPct(stats?.pctVendido ?? 0)} />
        <KPI title="Inversores"     value={fmtNum(stats?.nInversores ?? 0, 0)} />
        <KPI title="Aportes USD"    value={fmtMoney(stats?.totUSD ?? 0, "USD")} />
        <KPI title="Aportes ARS"    value={fmtMoney(stats?.totARS ?? 0, "ARS")} />
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Próximos hitos</Typography>
          <Stack spacing={1.2}>
            {(stats?.hitos ?? []).map(h => (
              <Stack key={h.id} direction="row" alignItems="center" spacing={2}>
                <Typography sx={{ minWidth: 56 }} color="text.secondary">{h.porcentaje}%</Typography>
                <Typography sx={{ flexGrow: 1, textDecoration: h.completado ? "line-through" : "none" }}>
                  {h.nombre}
                </Typography>
                <Typography color="text.secondary" variant="body2">
                  {h.fecha_estimada ?? "—"}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

function KPI({ title, value, hint }) {
  return (
    <Grid item xs={12} sm={6} md={4} lg={2}>
      <Card>
        <CardContent>
          <Typography variant="caption" color="text.secondary">{title}</Typography>
          <Typography variant="h5" sx={{ mt: 0.5 }}>{value}</Typography>
          {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
        </CardContent>
      </Card>
    </Grid>
  );
}
