"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, LinearProgress,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Chip
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtMoney, fmtPct, fmtDate, fmtNum } from "@/components/Money";
import { getCache, setCache } from "@/lib/dataCache";

// USD imputable a la etapa/concepto = el gasto REAL valuado en USD.
// - Gasto en USD: ese monto.
// - Gasto en ARS: monto / tipo de cambio (el del cambio integrado si lo hubo,
//   o el tipo_cambio_gasto cargado al registrar el pago en pesos).
// Un cambio puro de divisa (sin gasto) no imputa nada.
function gastoUSD(mv) {
  if (mv.tipo !== "egreso") return 0;
  const m = Number(mv.monto || 0);
  if (m <= 0) return 0;
  if (mv.moneda === "USD") return m;
  const tc = Number(mv.cambio_tipo_cambio || mv.tipo_cambio_gasto || 0);
  return tc > 0 ? m / tc : 0;
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

function TablaSeguimiento({ titulo, filas, totalPlan, totalReal, onRowClick }) {
  const pctTot = totalPlan > 0 ? (totalReal / totalPlan) * 100 : null;
  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" gutterBottom>{titulo}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
          Tocá una fila para ver el detalle de los gastos imputados.
        </Typography>
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
                const clickable = f.real > 0;
                return (
                  <TableRow
                    key={f.nombre} hover
                    onClick={clickable ? () => onRowClick(f) : undefined}
                    sx={{
                      ...(f.otros ? { bgcolor: "rgba(15,42,74,0.03)" } : {}),
                      cursor: clickable ? "pointer" : "default",
                    }}
                  >
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
  const [detalle, setDetalle] = useState(null); // { tipo: 'concepto'|'etapa', nombre, otros }

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

  // Egresos que componen la fila seleccionada, con su USD imputado.
  const detalleGastos = useMemo(() => {
    if (!detalle) return [];
    const nombresC = new Set(conceptos.map(c => c.nombre));
    return movs
      .map(mv => ({ mv, usd: gastoUSD(mv) }))
      .filter(({ mv, usd }) => {
        if (usd <= 0) return false;
        if (detalle.tipo === "etapa") return mv.etapa === detalle.nombre;
        // concepto
        if (detalle.otros) return !mv.concepto || !nombresC.has(mv.concepto);
        return mv.concepto === detalle.nombre;
      })
      .sort((a, b) => (a.mv.fecha < b.mv.fecha ? 1 : -1));
  }, [detalle, movs, conceptos]);

  const totalDetalle = detalleGastos.reduce((s, d) => s + d.usd, 0);

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

      <TablaSeguimiento titulo="Por concepto" filas={filasConcepto} totalPlan={totPlanC} totalReal={totRealC}
        onRowClick={(f) => setDetalle({ tipo: "concepto", nombre: f.nombre, otros: !!f.otros })} />
      <TablaSeguimiento titulo="Por etapa (Obra)" filas={filasEtapa} totalPlan={totPlanE} totalReal={totRealE}
        onRowClick={(f) => setDetalle({ tipo: "etapa", nombre: f.nombre })} />

      <Dialog open={!!detalle} onClose={() => setDetalle(null)} fullWidth maxWidth="md">
        <DialogTitle>
          Gastos imputados · {detalle?.nombre}
        </DialogTitle>
        <DialogContent dividers>
          {detalleGastos.length === 0 ? (
            <Alert severity="info">No hay gastos imputados.</Alert>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Fecha</TableCell>
                    <TableCell>Detalle</TableCell>
                    <TableCell>Categoría</TableCell>
                    <TableCell align="right">Monto</TableCell>
                    <TableCell align="right">TC</TableCell>
                    <TableCell align="right">Imputado (USD)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detalleGastos.map(({ mv, usd }) => {
                    const tc = Number(mv.cambio_tipo_cambio || mv.tipo_cambio_gasto || 0);
                    return (
                    <TableRow key={mv.id} hover>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtDate(mv.fecha)}</TableCell>
                      <TableCell>{mv.descripcion || "—"}</TableCell>
                      <TableCell>{mv.categoria ? <Chip size="small" label={mv.categoria} /> : "—"}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{fmtMoney(mv.monto, mv.moneda)}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{tc > 0 ? fmtNum(tc, 2) : "—"}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap", fontWeight: 600 }}>{fmtMoney(usd, "USD")}</TableCell>
                    </TableRow>
                    );
                  })}
                  <TableRow sx={{ "& > td": { borderTop: "2px solid", borderColor: "divider" } }}>
                    <TableCell colSpan={5}><Typography fontWeight={700}>Total imputado</Typography></TableCell>
                    <TableCell align="right"><Typography fontWeight={700}>{fmtMoney(totalDetalle, "USD")}</Typography></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetalle(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <Typography variant="caption" color="text.secondary">
        El “real” se imputa siempre en USD: los gastos en USD por su monto, y los gastos en ARS convertidos por el
        tipo de cambio (el del cambio integrado, o el tipo de cambio cargado al registrar el pago en pesos).
        Un gasto en ARS sin tipo de cambio cargado no se puede valuar y no impacta en el total.
      </Typography>
    </Stack>
  );
}
