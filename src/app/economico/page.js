"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, LinearProgress,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtMoney, fmtPct } from "@/components/Money";
import { getCache, setCache } from "@/lib/dataCache";

// USD gastado por un movimiento (misma convención que Caja/Indicadores).
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
  if (mv.tipo === "cambio") return mv.moneda === "USD" ? m : 0;
  return 0;
}

function Barra({ pct }) {
  const p = Math.min(100, Math.max(0, pct || 0));
  const over = (pct || 0) > 100;
  return (
    <Box sx={{ height: 6, bgcolor: "rgba(15,42,74,0.08)", borderRadius: 3, overflow: "hidden", minWidth: 80 }}>
      <Box sx={{ height: "100%", width: `${p}%`, bgcolor: over ? "error.main" : "secondary.main" }} />
    </Box>
  );
}

function TablaSeguimiento({ titulo, filas, totalPlan, totalReal }) {
  const pctTot = totalPlan > 0 ? (totalReal / totalPlan) * 100 : null;
  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" gutterBottom>{titulo}</Typography>
        <TableContainer>
          <Table size="small" sx={{ minWidth: 560 }}>
            <TableHead>
              <TableRow>
                <TableCell>{titulo.includes("etapa") ? "Etapa" : "Concepto"}</TableCell>
                <TableCell align="right">Plan (USD)</TableCell>
                <TableCell align="right">Real (USD)</TableCell>
                <TableCell align="right">%</TableCell>
                <TableCell sx={{ width: 140 }}>Avance</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filas.map((f) => {
                const pct = f.plan > 0 ? (f.real / f.plan) * 100 : null;
                return (
                  <TableRow key={f.nombre} hover sx={f.otros ? { bgcolor: "rgba(15,42,74,0.03)" } : undefined}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontStyle: f.otros ? "italic" : "normal" }}>{f.nombre}</Typography>
                    </TableCell>
                    <TableCell align="right">{fmtMoney(f.plan, "USD")}</TableCell>
                    <TableCell align="right">{fmtMoney(f.real, "USD")}</TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color={pct != null && pct > 100 ? "error.main" : "text.primary"}>
                        {pct != null ? fmtPct(pct, 0) : "—"}
                      </Typography>
                    </TableCell>
                    <TableCell><Barra pct={pct ?? 0} /></TableCell>
                  </TableRow>
                );
              })}
              <TableRow sx={{ "& > td": { borderTop: "2px solid", borderColor: "divider", fontWeight: 700 } }}>
                <TableCell><Typography fontWeight={700}>Total</Typography></TableCell>
                <TableCell align="right"><Typography fontWeight={700}>{fmtMoney(totalPlan, "USD")}</Typography></TableCell>
                <TableCell align="right"><Typography fontWeight={700}>{fmtMoney(totalReal, "USD")}</Typography></TableCell>
                <TableCell align="right"><Typography fontWeight={700}>{pctTot != null ? fmtPct(pctTot, 0) : "—"}</Typography></TableCell>
                <TableCell><Barra pct={pctTot ?? 0} /></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}

export default function EconomicoPage() {
  const { proyecto } = useProjects();
  const cacheInit = getCache("economico", proyecto?.id);
  const [conceptos, setConceptos] = useState(cacheInit?.conceptos ?? []);
  const [hitos, setHitos] = useState(cacheInit?.hitos ?? []);
  const [movs, setMovs] = useState(cacheInit?.movs ?? []);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!proyecto) return;
    const cached = getCache("economico", proyecto.id);
    setLoading(!cached);
    const [{ data: cs }, { data: hs }, { data: mv }] = await Promise.all([
      supabase.from("conceptos").select("*").eq("proyecto_id", proyecto.id).order("orden"),
      supabase.from("hitos").select("*").eq("proyecto_id", proyecto.id).order("orden"),
      supabase.from("movimientos_caja").select("*").eq("proyecto_id", proyecto.id),
    ]);
    setCache("economico", proyecto.id, { conceptos: cs ?? [], hitos: hs ?? [], movs: mv ?? [] });
    setConceptos(cs ?? []); setHitos(hs ?? []); setMovs(mv ?? []);
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const { filasConcepto, totPlanC, totRealC, filasEtapa, totPlanE, totRealE } = useMemo(() => {
    // Real por concepto / etapa (USD)
    const realPorConcepto = {};
    const realPorEtapa = {};
    let totalReal = 0;
    for (const mv of movs) {
      const g = gastoUSD(mv);
      if (g <= 0) continue;
      totalReal += g;
      if (mv.concepto) realPorConcepto[mv.concepto] = (realPorConcepto[mv.concepto] || 0) + g;
      if (mv.etapa) realPorEtapa[mv.etapa] = (realPorEtapa[mv.etapa] || 0) + g;
    }

    const filasConcepto = conceptos.map(c => ({
      nombre: c.nombre, plan: Number(c.valor_plan || 0), real: realPorConcepto[c.nombre] || 0,
    }));
    // Gastos con concepto no listado (o sin concepto)
    const nombresC = new Set(conceptos.map(c => c.nombre));
    const otrosReal = Object.entries(realPorConcepto)
      .filter(([k]) => !nombresC.has(k)).reduce((s, [, v]) => s + v, 0);
    const sinConcepto = totalReal - Object.values(realPorConcepto).reduce((s, v) => s + v, 0);
    const otrosTotal = otrosReal + sinConcepto;
    if (otrosTotal > 0.5) filasConcepto.push({ nombre: "Sin concepto / otros", plan: 0, real: otrosTotal, otros: true });

    const totPlanC = filasConcepto.reduce((s, f) => s + f.plan, 0);
    const totRealC = filasConcepto.reduce((s, f) => s + f.real, 0);

    const filasEtapa = hitos.map(h => ({
      nombre: h.nombre, plan: Number(h.valor_plan || 0), real: realPorEtapa[h.nombre] || 0,
    }));
    const totPlanE = filasEtapa.reduce((s, f) => s + f.plan, 0);
    const totRealE = filasEtapa.reduce((s, f) => s + f.real, 0);

    return { filasConcepto, totPlanC, totRealC, filasEtapa, totPlanE, totRealE };
  }, [conceptos, hitos, movs]);

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5">Seguimiento económico</Typography>
        <Typography variant="body2" color="text.secondary">
          Plan vs. real (en USD) por concepto y por etapa. El “real” suma los egresos cargados.
        </Typography>
      </Box>

      {loading && <LinearProgress />}

      <TablaSeguimiento titulo="Por concepto" filas={filasConcepto} totalPlan={totPlanC} totalReal={totRealC} />
      <TablaSeguimiento titulo="Por etapa (Obra)" filas={filasEtapa} totalPlan={totPlanE} totalReal={totRealE} />

      <Typography variant="caption" color="text.secondary">
        El “real” se calcula en USD con la misma convención que Caja (egresos en USD y la parte USD de los cambios).
        Los egresos sólo en ARS no impactan en este total.
      </Typography>
    </Stack>
  );
}
