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
      const [{ data: aportes }, { data: hitos }, { data: inversores }, { data: movs }] = await Promise.all([
        supabase.from("aportes").select("*").eq("proyecto_id", proyecto.id),
        supabase.from("hitos").select("*").eq("proyecto_id", proyecto.id).order("orden"),
        supabase.from("inversores").select("id").eq("proyecto_id", proyecto.id),
        supabase.from("movimientos_caja").select("*").eq("proyecto_id", proyecto.id),
      ]);
      // Saldos de caja
      let cajaUSD = 0, cajaARS = 0;
      // USD movido en operaciones de caja (positivo = ingreso, negativo = egreso)
      let ingresoUSD = 0, gastadoUSD = 0;
      for (const a of aportes ?? []) {
        if (a.entra_a_caja === false) continue;
        const m = Number(a.monto || 0);
        if (a.moneda === "USD") { cajaUSD += m; ingresoUSD += m; }
        else cajaARS += m;
      }
      for (const mv of movs ?? []) {
        const m = Number(mv.monto || 0);
        if (mv.tipo === "ingreso") {
          if (mv.moneda === "USD") { cajaUSD += m; ingresoUSD += m; } else cajaARS += m;
        } else if (mv.tipo === "egreso") {
          if (mv.con_cambio) {
            const tc = Number(mv.cambio_tipo_cambio || 0);
            const monOrigen = Number(mv.cambio_monto_origen || 0);
            if (mv.cambio_moneda_origen === "USD") { cajaUSD -= monOrigen; gastadoUSD += monOrigen; }
            else cajaARS -= monOrigen;
            const entrada = mv.cambio_moneda_origen === "USD" ? monOrigen * tc : (tc > 0 ? monOrigen / tc : 0);
            if (mv.moneda === "USD") { cajaUSD += entrada; ingresoUSD += entrada; } else cajaARS += entrada;
            if (m > 0) {
              if (mv.moneda === "USD") { cajaUSD -= m; gastadoUSD += m; } else cajaARS -= m;
            }
          } else {
            if (mv.moneda === "USD") { cajaUSD -= m; gastadoUSD += m; } else cajaARS -= m;
          }
        } else if (mv.tipo === "cambio") {
          const md = Number(mv.monto_destino || 0);
          if (mv.moneda === "USD") { cajaUSD -= m; gastadoUSD += m; } else cajaARS -= m;
          if (mv.moneda_destino === "USD") { cajaUSD += md; ingresoUSD += md; } else cajaARS += md;
        }
      }
      const pctGastado = (Number(proyecto.costo_total_estimado || 0) > 0)
        ? (gastadoUSD / Number(proyecto.costo_total_estimado)) * 100 : 0;
      const hitoIds = (hitos ?? []).map(h => h.id);
      let tareas = [];
      if (hitoIds.length) {
        const { data } = await supabase.from("hito_tareas").select("hito_id,completado").in("hito_id", hitoIds);
        tareas = data ?? [];
      }
      const aportesUSD = (aportes ?? []).filter(a => (a.moneda ?? "USD") === "USD");
      // totUSD = total comprometido (incluye honorarios / no-caja). Cuenta para % recaudado.
      const totUSD = aportesUSD.reduce((s,a) => s + Number(a.monto || 0), 0);
      // efectivoUSD = lo que realmente entró a caja
      const efectivoUSD = aportesUSD.filter(a => a.entra_a_caja !== false).reduce((s,a) => s + Number(a.monto || 0), 0);
      const venta = Number(proyecto.precio_venta_estimado || 0);
      const costo = Number(proyecto.costo_total_estimado  || 0);
      const ganancia = venta - costo;
      const costoM2 = (costo > 0 && Number(proyecto.m2_totales) > 0) ? costo / Number(proyecto.m2_totales) : 0;
      const ventaM2 = (venta > 0 && Number(proyecto.m2_totales) > 0) ? venta / Number(proyecto.m2_totales) : 0;
      const pctRecaudado = costo > 0 ? (totUSD / costo) * 100 : 0;
      // Rendimiento anualizado del proyecto (fórmula simple: ROI × 365 / días)
      const diasProy = (() => {
        if (!proyecto.fecha_inicio || !proyecto.fecha_fin) return 365;
        const a = new Date(proyecto.fecha_inicio + "T00:00:00");
        const b = new Date(proyecto.fecha_fin + "T00:00:00");
        return Math.max(1, Math.round((b - a) / 86400000));
      })();
      const roiProyPct = costo > 0 ? (ganancia / costo) * 100 : 0;
      const anualProy = (costo > 0 && diasProy > 0) ? (roiProyPct * 365 / diasProy) : null;
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
        totUSD, efectivoUSD, venta, costo, ganancia, costoM2, ventaM2, avance,
        pctRecaudado, anualProy, cajaUSD, cajaARS,
        ingresoUSD, gastadoUSD, pctGastado,
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
    <Stack spacing={{ xs: 2, sm: 3 }}>
      <Box>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 1, sm: 1 }} alignItems={{ xs: "flex-start", sm: "center" }}>
          <Box sx={{ flexGrow: 1, width: "100%" }}>
            <Typography variant="h4" sx={{ fontSize: { xs: 24, sm: 32 } }}>{proyecto.nombre}</Typography>
            {proyecto.descripcion && (
              <Typography color="text.secondary">{proyecto.descripcion}</Typography>
            )}
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
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
            {stats && stats.costo > 0 && (
              <Chip
                color="error"
                variant="outlined"
                label={`Gastado · ${fmtPct(stats.pctGastado ?? 0, 1)} · ${fmtMoney(stats.gastadoUSD ?? 0, "USD")}`}
              />
            )}
          </Stack>
        </Stack>
      </Box>

      <Grid container spacing={1.5} justifyContent="center">
        <KPI title="Avance"          value={fmtPct(stats?.avance ?? 0, 0)} hint="ponderado por tareas" />
        <KPI title="Venta estim."    value={fmtMoney(stats?.venta ?? 0, "USD")} hint={`m² ${fmtMoney(stats?.ventaM2 ?? 0, "USD")}`} />
        <KPI title="Costo estim."    value={fmtMoney(stats?.costo ?? 0, "USD")} hint={`m² ${fmtMoney(stats?.costoM2 ?? 0, "USD")}`} />
        <KPI title="Ganancia estim." value={fmtMoney(stats?.ganancia ?? 0, "USD")} hint={stats?.anualProy != null ? `Anualizado ${fmtPct(stats.anualProy, 2)}` : " "} />
        <KPI title="Caja USD"        value={fmtMoney(stats?.cajaUSD ?? 0, "USD")} hint="saldo actual" accent="#1E8E3E" />
        <KPI title="Caja ARS"        value={fmtMoney(stats?.cajaARS ?? 0, "ARS")} hint="saldo actual" accent="#0F2A4A" />
      </Grid>

      {/* Resumen gasto vs presupuesto */}
      {stats && stats.costo > 0 && (
        <Card>
          <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 1.5, sm: 3 }} alignItems={{ sm: "center" }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11 }}>
                  Avance financiero
                </Typography>
                <Typography variant="body1" sx={{ mt: 0.5, fontWeight: 500 }}>
                  Llevamos gastado <Box component="span" sx={{ color: "error.main", fontWeight: 700 }}>
                    {fmtPct(stats.pctGastado ?? 0, 1)}
                  </Box> del presupuesto · equivale a <Box component="span" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {fmtMoney(stats.gastadoUSD ?? 0, "USD")}
                  </Box>
                </Typography>
                <Box sx={{ mt: 1.5, position: "relative", height: 12, bgcolor: "rgba(15,42,74,0.06)", borderRadius: 6, overflow: "hidden" }}>
                  <Box sx={{
                    position: "absolute", top: 0, left: 0, height: "100%",
                    width: `${Math.min(100, (stats.ingresoUSD / stats.costo) * 100)}%`,
                    bgcolor: "rgba(30,142,62,0.35)", transition: "width .4s",
                  }} />
                  <Box sx={{
                    position: "absolute", top: 0, left: 0, height: "100%",
                    width: `${Math.min(100, stats.pctGastado ?? 0)}%`,
                    backgroundImage: "linear-gradient(90deg, #C0392B 0%, #E07A1F 100%)",
                    transition: "width .4s",
                  }} />
                </Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.75 }}>
                  <Typography variant="caption" color="text.secondary">
                    Ingresado · {fmtMoney(stats.ingresoUSD ?? 0, "USD")}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Presupuesto · {fmtMoney(stats.costo, "USD")}
                  </Typography>
                </Stack>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      )}

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

function KPI({ title, value, hint, accent }) {
  return (
    <Grid item xs={6} sm={4} md={2} sx={{ display: "flex" }}>
      <Card sx={{ width: "100%", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
        {accent && <Box sx={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, bgcolor: accent }} />}
        <CardContent sx={{
          flexGrow: 1, display: "flex", flexDirection: "column",
          p: { xs: 1.2, sm: 1.5 },
          "&:last-child": { pb: { xs: 1.2, sm: 1.5 } },
        }}>
          <Typography variant="caption" color="text.secondary"
            sx={{ textTransform: "uppercase", letterSpacing: 0.4, fontSize: { xs: 10, sm: 11 }, lineHeight: 1.25 }}>
            {title}
          </Typography>
          <Typography sx={{
            mt: 0.5, fontWeight: 700, fontVariantNumeric: "tabular-nums",
            fontSize: { xs: 15, sm: 18, md: 19, lg: 21 }, lineHeight: 1.2,
            wordBreak: "break-word",
          }}>
            {value}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: "auto", minHeight: 14, fontSize: { xs: 10, sm: 11 } }}>
            {hint || " "}
          </Typography>
        </CardContent>
      </Card>
    </Grid>
  );
}
