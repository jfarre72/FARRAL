"use client";
import { Card, CardContent, Grid, Typography, Stack, Button, Alert, Box, LinearProgress, Chip } from "@mui/material";
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
      const venta = Number(proyecto.precio_venta_estimado || 0);
      const costo = Number(proyecto.costo_total_estimado  || 0);
      const ganancia = venta - costo;
      const costoM2 = (costo > 0 && Number(proyecto.m2_totales) > 0) ? costo / Number(proyecto.m2_totales) : 0;
      const pctRecaudado = costo > 0 ? (totUSD / costo) * 100 : 0;
      // Rendimiento anualizado del proyecto
      const diasProy = (() => {
        if (!proyecto.fecha_inicio || !proyecto.fecha_fin) return 365;
        const a = new Date(proyecto.fecha_inicio + "T00:00:00");
        const b = new Date(proyecto.fecha_fin + "T00:00:00");
        return Math.max(1, Math.round((b - a) / 86400000));
      })();
      const roiProy = costo > 0 ? ganancia / costo : 0;
      const anualProy = (costo > 0 && (1 + roiProy) > 0)
        ? (Math.pow(1 + roiProy, 365/diasProy) - 1) * 100
        : null;
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
        totUSD, venta, costo, ganancia, costoM2, avance,
        pctRecaudado, anualProy,
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
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h4">{proyecto.nombre}</Typography>
            {proyecto.descripcion && (
              <Typography color="text.secondary">{proyecto.descripcion}</Typography>
            )}
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {stats?.anualProy != null && (
              <Chip
                color="success"
                variant="filled"
                label={`Rendimiento anualizado · ${fmtPct(stats.anualProy, 2)}`}
                sx={{ fontWeight: 700 }}
              />
            )}
            <Chip
              color="primary"
              variant="outlined"
              label={`Recaudado · ${fmtPct(stats?.pctRecaudado ?? 0, 1)}`}
            />
          </Stack>
        </Stack>
      </Box>

      <Grid container spacing={2}>
        <KPI title="Avance de obra"   value={fmtPct(stats?.avance ?? 0, 0)} hint="ponderado por tareas" />
        <KPI title="Inversores"       value={fmtNum(stats?.nInversores ?? 0, 0)} />
        <KPI title="Venta estimada"   value={fmtMoney(stats?.venta ?? 0, "USD")} />
        <KPI title="Costo estimado"   value={fmtMoney(stats?.costo ?? 0, "USD")} hint={`Costo m² ${fmtMoney(stats?.costoM2 ?? 0, "USD")}`} />
        <KPI title="Ganancia estim."  value={fmtMoney(stats?.ganancia ?? 0, "USD")} hint={stats?.anualProy != null ? `Anualizado ${fmtPct(stats.anualProy, 2)}` : " "} />
        <KPI title="Aportes USD"      value={fmtMoney(stats?.totUSD ?? 0, "USD")} hint={`${fmtPct(stats?.pctRecaudado ?? 0, 1)} del costo`} />
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
    <Grid item xs={12} sm={6} md={4} lg={3} sx={{ display: "flex" }}>
      <Card sx={{ width: "100%", display: "flex", flexDirection: "column" }}>
        <CardContent sx={{ flexGrow: 1, display: "flex", flexDirection: "column", "&:last-child": { pb: 2 } }}>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.4 }}>
            {title}
          </Typography>
          <Typography variant="h5" sx={{ mt: 0.5, fontVariantNumeric: "tabular-nums" }}>
            {value}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: "auto", minHeight: 16 }}>
            {hint || " "}
          </Typography>
        </CardContent>
      </Card>
    </Grid>
  );
}
