"use client";
import {
  Card, CardContent, Stack, Typography, Box, Grid, Tooltip
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtMoney, fmtPct, fmtNum } from "@/components/Money";
import { getCache, setCache } from "@/lib/dataCache";

// Gasto REAL en USD (misma convención que Caja / Económico).
function gastoUSD(mv) {
  if (mv.tipo !== "egreso") return 0;
  const m = Number(mv.monto || 0);
  if (m <= 0) return 0;
  if (mv.moneda === "USD") return m;
  const tc = Number(mv.cambio_tipo_cambio || mv.tipo_cambio_gasto || 0);
  return tc > 0 ? m / tc : 0;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

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
  const W = 920, H = 360, pad = { t: 20, r: 18, b: 30, l: 70 };
  const [hover, setHover] = useState(null);
  if (!data.length) {
    return <Typography color="text.secondary" sx={{ p: 2 }}>Sin movimientos para graficar.</Typography>;
  }
  const max = maxY;
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const x = (i) => pad.l + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v) => pad.t + innerH - (Math.min(v, max) / max) * innerH;
  const pts = data.map((d, i) => ({ x: x(i), y: y(d.value) }));
  const linePath = smoothPath(pts);
  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${pad.t + innerH} L ${pts[0].x} ${pad.t + innerH} Z`;
  const ticks = 4;

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0, bestD = Infinity;
    pts.forEach((p, i) => { const d = Math.abs(p.x - mx); if (d < bestD) { bestD = d; best = i; } });
    setHover(best);
  };

  const last = pts.length - 1;
  const lastP = pts[last];
  const hp = hover != null ? pts[hover] : null;

  return (
    <Box sx={{ width: "100%", mx: "auto", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 440, display: "block" }}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const v = (max / ticks) * i;
          const yy = y(v);
          return (
            <g key={i}>
              <line x1={pad.l} y1={yy} x2={W - pad.r} y2={yy} stroke="#eef1f6" strokeWidth="1" />
              <text x={pad.l - 8} y={yy + 3} textAnchor="end" fontSize="10" fill="#8a97a8">{fmtNum(Math.round(v), 0)}</text>
            </g>
          );
        })}
        <path d={areaPath} fill="rgba(224,122,31,0.12)" />
        <path d={linePath} fill="none" stroke="#E07A1F" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill="#E07A1F" />
            <text x={p.x} y={H - 8} textAnchor="middle" fontSize="10" fill="#8a97a8">{data[i].label}</text>
          </g>
        ))}
        {lastP && (
          <text x={Math.min(lastP.x + 6, W - pad.r)} y={Math.max(lastP.y - 8, pad.t + 8)}
            textAnchor={lastP.x > W - 80 ? "end" : "start"} fontSize="11" fontWeight="700" fill="#E07A1F">
            {fmtMoney(Math.round(data[last].value), "USD")}
          </text>
        )}
        {hp && (
          <g>
            <line x1={hp.x} y1={pad.t} x2={hp.x} y2={pad.t + innerH} stroke="#cdd5e0" strokeDasharray="3 3" />
            <circle cx={hp.x} cy={hp.y} r="5" fill="#E07A1F" stroke="#fff" strokeWidth="2" />
            {(() => {
              const txt = fmtMoney(Math.round(data[hover].value), "USD");
              const w = Math.max(54, txt.length * 6.5 + 16);
              const bx = Math.min(Math.max(hp.x - w / 2, pad.l), W - pad.r - w);
              const by = Math.max(hp.y - 34, pad.t);
              return (
                <g>
                  <rect x={bx} y={by} width={w} height="26" rx="5" fill="#0F2A4A" />
                  <text x={bx + w / 2} y={by + 11} textAnchor="middle" fontSize="9" fill="#aebccd">{data[hover].label}</text>
                  <text x={bx + w / 2} y={by + 21} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{txt}</text>
                </g>
              );
            })()}
          </g>
        )}
      </svg>
    </Box>
  );
}

function KpiCard({ titulo, valor, sub, color = "text.primary", tip }) {
  const card = (
    <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CardContent sx={{
        flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
        p: { xs: 1.2, sm: 1.5 }, "&:last-child": { pb: { xs: 1.2, sm: 1.5 } },
      }}>
        <Typography variant="caption" color="text.secondary"
          sx={{ textTransform: "uppercase", letterSpacing: 0.4, fontSize: { xs: 10, sm: 11 }, lineHeight: 1.25, minHeight: { xs: 26, sm: 28 }, display: "flex", alignItems: "center" }}>
          {titulo}
        </Typography>
        <Typography sx={{
          mt: 0.5, fontWeight: 700, fontVariantNumeric: "tabular-nums",
          fontSize: { xs: 15, sm: 18, md: 19, lg: 21 }, lineHeight: 1.2, color, wordBreak: "break-word",
        }}>
          {valor}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mt: "auto", minHeight: 14, fontSize: { xs: 10, sm: 11 } }}>
          {sub || " "}
        </Typography>
      </CardContent>
    </Card>
  );
  return tip ? <Tooltip title={tip} arrow>{card}</Tooltip> : card;
}

export default function IndicadoresPanel({ beforeChart }) {
  const { proyecto } = useProjects();
  const [movs, setMovs] = useState(() => getCache("indic", proyecto?.id)?.movs ?? []);
  const [aportes, setAportes] = useState(() => getCache("indic", proyecto?.id)?.aportes ?? []);
  const [presTotal, setPresTotal] = useState(() => getCache("indic", proyecto?.id)?.presTotal ?? 0);

  const reload = async () => {
    if (!proyecto) return;
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
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const ind = useMemo(() => {
    const m2 = Number(proyecto?.m2_totales || 0);
    const costoEst = Number(proyecto?.costo_total_estimado || 0);
    const ventaEst = Number(proyecto?.precio_venta_estimado || 0);
    const gastadoUSD = movs.reduce((s, mv) => s + gastoUSD(mv), 0);
    const invEjecutada = aportes
      .filter(a => (a.moneda ?? "USD") === "USD" && a.entra_a_caja !== false)
      .reduce((s, a) => s + Number(a.monto || 0), 0);
    const porMes = new Map();
    for (const mv of movs) {
      const g = gastoUSD(mv);
      if (g <= 0 || !mv.fecha) continue;
      const key = String(mv.fecha).slice(0, 7);
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
      margenEsperado: costoEst > 0 ? ((ventaEst - costoEst) / costoEst) * 100 : null,
    };
  }, [movs, aportes, presTotal, proyecto]);

  return (
    <Stack spacing={3}>
      <Grid container spacing={1.5} justifyContent="center">
        <Grid item xs={6} sm={4} md={2} sx={{ display: "flex" }}>
          <KpiCard titulo="Costo teórico del m²" valor={fmtMoney(Math.round(ind.costoTeoricoM2), "USD")}
            sub="Costo estim. / m² totales" />
        </Grid>
        <Grid item xs={6} sm={4} md={2} sx={{ display: "flex" }}>
          <KpiCard titulo="Costo real del m²" valor={fmtMoney(Math.round(ind.costoRealM2), "USD")}
            sub="Gastado / m² totales"
            color={ind.costoRealM2 > ind.costoTeoricoM2 && ind.costoTeoricoM2 > 0 ? "error.main" : "text.primary"} />
        </Grid>
        <Grid item xs={6} sm={4} md={2} sx={{ display: "flex" }}>
          <KpiCard titulo="Precio venta del m²" valor={fmtMoney(Math.round(ind.ventaM2), "USD")} sub="Según proyecto" />
        </Grid>
        <Grid item xs={6} sm={4} md={2} sx={{ display: "flex" }}>
          <KpiCard titulo="Inversión ejecutada" valor={fmtMoney(Math.round(ind.invEjecutada), "USD")}
            sub="Aportes USD en caja" />
        </Grid>
        <Grid item xs={6} sm={4} md={2} sx={{ display: "flex" }}>
          <KpiCard titulo="Avance económico" valor={ind.avanceEconomico != null ? fmtPct(ind.avanceEconomico, 1) : "—"}
            sub="Gastado / costo teórico" tip="Gastado en USD dividido el costo total estimado del proyecto." />
        </Grid>
        <Grid item xs={6} sm={4} md={2} sx={{ display: "flex" }}>
          <KpiCard titulo="Margen esperado" valor={ind.margenEsperado != null ? fmtPct(ind.margenEsperado, 1) : "—"}
            sub="(Venta − Costo) / Costo"
            color={ind.margenEsperado != null && ind.margenEsperado < 0 ? "error.main" : "success.main"} />
        </Grid>
      </Grid>

      {beforeChart}

      <Card>
        <CardContent>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Gastos acumulados (USD) por mes</Typography>
          <LineChart data={ind.serie} />
        </CardContent>
      </Card>
    </Stack>
  );
}
