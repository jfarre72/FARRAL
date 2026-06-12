"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, Grid,
  LinearProgress, Chip, Tooltip
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtMoney, fmtPct } from "@/components/Money";
import { getCache, setCache } from "@/lib/dataCache";

// USD gastado por un movimiento de caja (misma convención que el dashboard).
function gastoUSD(mv) {
  const m = Number(mv.monto || 0);
  if (mv.tipo === "egreso") {
    if (mv.con_cambio) {
      let g = 0;
      if (mv.cambio_moneda_origen === "USD") g += Number(mv.cambio_monto_origen || 0);
      if (m > 0 && mv.moneda === "USD") g += m;
      return g;
    }
    return mv.moneda === "USD" ? m : 0;
  }
  if (mv.tipo === "cambio") {
    return mv.moneda === "USD" ? m : 0;
  }
  return 0;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Genera un path SVG suavizado (Catmull-Rom -> Bézier) a partir de puntos {x,y}.
function smoothPath(pts) {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function LineChart({ data, maxY = 200000 }) {
  // data: [{ label, value }]
  const W = 640, H = 180, pad = { t: 16, r: 14, b: 24, l: 52 };
  if (!data.length) {
    return <Typography color="text.secondary" sx={{ p: 2 }}>Sin movimientos para graficar.</Typography>;
  }
  // El eje Y llega como máximo a maxY (200.000 por defecto).
  const max = maxY;
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const x = (i) => pad.l + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v) => pad.t + innerH - (Math.min(v, max) / max) * innerH;
  const pts = data.map((d, i) => ({ x: x(i), y: y(d.value) }));
  const linePath = smoothPath(pts);
  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${pad.t + innerH} L ${pts[0].x} ${pad.t + innerH} Z`;
  const ticks = 4;

  return (
    <Box sx={{ width: "100%", maxWidth: 560, mx: "auto", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 360, display: "block" }}>
        {/* Grilla horizontal + labels eje Y */}
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const v = (max / ticks) * i;
          const yy = y(v);
          return (
            <g key={i}>
              <line x1={pad.l} y1={yy} x2={W - pad.r} y2={yy} stroke="#eef1f6" strokeWidth="1" />
              <text x={pad.l - 8} y={yy + 3} textAnchor="end" fontSize="10" fill="#8a97a8">
                {fmtMoney(Math.round(v), "USD")}
              </text>
            </g>
          );
        })}
        {/* Área + línea */}
        <path d={areaPath} fill="rgba(224,122,31,0.12)" />
        <path d={linePath} fill="none" stroke="#E07A1F" strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" />
        {/* Puntos + labels eje X */}
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill="#E07A1F" />
            <text x={p.x} y={H - 8} textAnchor="middle" fontSize="10" fill="#8a97a8">
              {data[i].label}
            </text>
          </g>
        ))}
      </svg>
    </Box>
  );
}

function KpiCard({ titulo, valor, sub, color = "text.primary", tip }) {
  const card = (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="caption" color="text.secondary">{titulo}</Typography>
        <Typography variant="h5" sx={{ mt: 0.5, color }}>{valor}</Typography>
        {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
      </CardContent>
    </Card>
  );
  return tip ? <Tooltip title={tip} arrow>{card}</Tooltip> : card;
}

export default function IndicadoresPage() {
  const { proyecto } = useProjects();
  const [movs, setMovs] = useState(() => getCache("indic", proyecto?.id)?.movs ?? []);
  const [aportes, setAportes] = useState(() => getCache("indic", proyecto?.id)?.aportes ?? []);
  const [presTotal, setPresTotal] = useState(() => getCache("indic", proyecto?.id)?.presTotal ?? 0);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!proyecto) return;
    const cached = getCache("indic", proyecto.id);
    if (cached) { setMovs(cached.movs); setAportes(cached.aportes); setPresTotal(cached.presTotal); }
    setLoading(!cached);

    const [{ data: mv }, { data: ap }, { data: pres }] = await Promise.all([
      supabase.from("movimientos_caja").select("*").eq("proyecto_id", proyecto.id),
      supabase.from("aportes").select("*").eq("proyecto_id", proyecto.id),
      supabase.from("presupuestos").select("id").eq("proyecto_id", proyecto.id),
    ]);
    let total = 0;
    const ids = (pres ?? []).map(p => p.id);
    if (ids.length) {
      const { data: items } = await supabase
        .from("presupuesto_items").select("monto_presupuestado,presupuesto_id").in("presupuesto_id", ids);
      total = (items ?? []).reduce((s, it) => s + Number(it.monto_presupuestado || 0), 0);
    }
    setCache("indic", proyecto.id, { movs: mv ?? [], aportes: ap ?? [], presTotal: total });
    setMovs(mv ?? []); setAportes(ap ?? []); setPresTotal(total);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const ind = useMemo(() => {
    const m2 = Number(proyecto?.m2_totales || 0);
    const costoEst = Number(proyecto?.costo_total_estimado || 0);
    const ventaEst = Number(proyecto?.precio_venta_estimado || 0);

    // Gastado total en USD
    const gastadoUSD = movs.reduce((s, mv) => s + gastoUSD(mv), 0);

    // Inversión ejecutada: aportes USD que entran a caja
    const invEjecutada = aportes
      .filter(a => (a.moneda ?? "USD") === "USD" && a.entra_a_caja !== false)
      .reduce((s, a) => s + Number(a.monto || 0), 0);

    // Serie mensual acumulada de gastos en USD
    const porMes = new Map();
    for (const mv of movs) {
      const g = gastoUSD(mv);
      if (g <= 0 || !mv.fecha) continue;
      const key = String(mv.fecha).slice(0, 7); // YYYY-MM
      porMes.set(key, (porMes.get(key) || 0) + g);
    }
    const keys = [...porMes.keys()].sort();
    let acum = 0;
    const serie = keys.map(k => {
      acum += porMes.get(k);
      const [yy, mm] = k.split("-");
      return { label: `${MESES[Number(mm) - 1]} ${yy.slice(2)}`, value: acum };
    });

    return {
      m2, costoEst, ventaEst, gastadoUSD, invEjecutada, serie,
      costoTeoricoM2: m2 > 0 ? costoEst / m2 : 0,
      costoRealM2: m2 > 0 ? gastadoUSD / m2 : 0,
      ventaM2: Number(proyecto?.precio_venta_m2 || 0) || (m2 > 0 ? ventaEst / m2 : 0),
      avanceEconomico: costoEst > 0 ? (gastadoUSD / costoEst) * 100 : null,
      gastadoVsPres: presTotal > 0 ? (gastadoUSD / presTotal) * 100 : null,
      margenEsperado: ventaEst > 0 ? ((ventaEst - costoEst) / ventaEst) * 100 : null,
    };
  }, [movs, aportes, presTotal, proyecto]);

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5">Indicadores</Typography>
        <Typography variant="body2" color="text.secondary">
          Métricas económicas del proyecto y evolución de gastos.
        </Typography>
      </Box>

      {loading && <LinearProgress />}

      {/* Indicadores */}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard titulo="Costo teórico del m²"
            valor={fmtMoney(Math.round(ind.costoTeoricoM2), "USD")}
            sub="Costo total estimado / m² totales" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard titulo="Costo real del m²"
            valor={fmtMoney(Math.round(ind.costoRealM2), "USD")}
            sub="Gastado a la fecha / m² totales"
            color={ind.costoRealM2 > ind.costoTeoricoM2 && ind.costoTeoricoM2 > 0 ? "error.main" : "text.primary"} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard titulo="Precio de venta del m²"
            valor={fmtMoney(Math.round(ind.ventaM2), "USD")}
            sub="Según proyecto" />
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <KpiCard titulo="Inversión ejecutada"
            valor={fmtMoney(Math.round(ind.invEjecutada), "USD")}
            sub="Aportes USD ingresados a caja" />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard titulo="Avance económico"
            valor={ind.avanceEconomico != null ? fmtPct(ind.avanceEconomico, 1) : "—"}
            sub="Gastado / costo total teórico"
            tip="Gastado en USD dividido el costo total estimado del proyecto." />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard titulo="Gastado / Presupuesto"
            valor={ind.gastadoVsPres != null ? fmtPct(ind.gastadoVsPres, 1) : "—"}
            sub={`${fmtMoney(Math.round(ind.gastadoUSD), "USD")} / ${fmtMoney(Math.round(presTotal), "USD")}`}
            tip="Gastado en USD sobre la suma de presupuestos cargados." />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <KpiCard titulo="Margen esperado"
            valor={ind.margenEsperado != null ? fmtPct(ind.margenEsperado, 1) : "—"}
            sub="(Venta estim. − Costo estim.) / Venta estim."
            color={ind.margenEsperado != null && ind.margenEsperado < 0 ? "error.main" : "success.main"} />
        </Grid>
      </Grid>

      {/* Gráfico de gastos acumulados */}
      <Card>
        <CardContent>
          <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1 }}>
            <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
              Gastos acumulados (USD) por mes
            </Typography>
            <Typography variant="h6" color="secondary.main">
              {fmtMoney(Math.round(ind.gastadoUSD), "USD")}
            </Typography>
          </Stack>
          <LineChart data={ind.serie} />
        </CardContent>
      </Card>
    </Stack>
  );
}
