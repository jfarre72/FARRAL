"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, TextField,
  Button, LinearProgress, Divider, Chip, Grid, FormGroup, FormControlLabel, Checkbox
} from "@mui/material";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtMoney, fmtDate, fmtPct } from "@/components/Money";
import { printDocument, esc } from "@/lib/printPdf";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hoyISO = () => isoDe(new Date());
const inicioMesISO = () => { const d = new Date(); return isoDe(new Date(d.getFullYear(), d.getMonth(), 1)); };

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

// Genera un <svg> (string) de líneas con la serie acumulada por mes.
function svgChart(serie, hastaKey) {
  const W = 640, H = 220, pad = { t: 16, r: 16, b: 26, l: 64 };
  if (!serie.length) return "";
  const max = Math.max(...serie.map(s => s.value), 1);
  const innerW = W - pad.l - pad.r, innerH = H - pad.t - pad.b;
  const x = (i) => pad.l + (serie.length === 1 ? innerW / 2 : (i / (serie.length - 1)) * innerW);
  const y = (v) => pad.t + innerH - (v / max) * innerH;
  const pts = serie.map((s, i) => `${x(i)},${y(s.value)}`).join(" ");
  const ticks = 4;
  let grid = "";
  for (let i = 0; i <= ticks; i++) {
    const v = (max / ticks) * i, yy = y(v);
    grid += `<line x1="${pad.l}" y1="${yy}" x2="${W - pad.r}" y2="${yy}" stroke="#eef1f6"/>
      <text x="${pad.l - 8}" y="${yy + 3}" text-anchor="end" font-size="10" fill="#8a97a8">${Math.round(v).toLocaleString("es-AR")}</text>`;
  }
  const dots = serie.map((s, i) => {
    const cx = x(i), cy = y(s.value);
    const hl = s.key === hastaKey;
    return `<circle cx="${cx}" cy="${cy}" r="${hl ? 4 : 2.5}" fill="#E07A1F"/>
      <text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#8a97a8">${s.label}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:640px">
    ${grid}
    <polyline points="${pts}" fill="none" stroke="#E07A1F" stroke-width="2.5" stroke-linejoin="round"/>
    ${dots}
  </svg>`;
}

export default function ReporteriaPage() {
  const { proyecto } = useProjects();
  const [desde, setDesde] = useState(inicioMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [hitos, setHitos] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [movs, setMovs] = useState([]);
  const [fotos, setFotos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Qué secciones incluir en el reporte (vista previa y PDF). Todo activo por defecto.
  const [inc, setInc] = useState({ resumen: true, tareas: true, grafico: true, fotos: true });
  const toggle = (k) => setInc((s) => ({ ...s, [k]: !s[k] }));
  const SECCIONES = [
    { key: "resumen", label: "Resumen (avance y gastos)" },
    { key: "tareas", label: "Tareas realizadas / en curso" },
    { key: "grafico", label: "Gráfico económico" },
    { key: "fotos", label: "Fotos" },
  ];

  const reload = async () => {
    if (!proyecto) return;
    setLoading(true);
    const [{ data: hs }, { data: mv }, { data: ft }] = await Promise.all([
      supabase.from("hitos").select("*").eq("proyecto_id", proyecto.id).order("orden"),
      supabase.from("movimientos_caja").select("*").eq("proyecto_id", proyecto.id),
      supabase.from("fotos").select("*").eq("proyecto_id", proyecto.id).order("fecha"),
    ]);
    const ids = (hs ?? []).map(h => h.id);
    let ts = [];
    if (ids.length) {
      const { data } = await supabase.from("hito_tareas").select("*").in("hito_id", ids).order("orden");
      ts = data ?? [];
    }
    setHitos(hs ?? []); setTareas(ts); setMovs(mv ?? []); setFotos(ft ?? []);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const rep = useMemo(() => {
    const inRango = (iso) => { if (!iso) return false; const d = String(iso).slice(0, 10); return d >= desde && d <= hasta; };

    // Avance global ponderado por etapa
    const sorted = [...hitos].sort((a, b) => a.orden - b.orden);
    const fracc = (h) => {
      const ts = tareas.filter(t => t.hito_id === h.id);
      if (ts.length) return ts.reduce((s, t) => s + (t.avance != null ? Number(t.avance) : (t.completado ? 100 : 0)), 0) / (ts.length * 100);
      return h.completado ? 1 : 0;
    };
    let avance = 0;
    sorted.forEach((h, i) => {
      const next = sorted[i + 1];
      const peso = next ? Math.max(0, Number(next.porcentaje) - Number(h.porcentaje)) : 0;
      avance += peso * fracc(h);
    });

    // Tareas completadas en el rango (por completado_at)
    const hitoNombre = Object.fromEntries(hitos.map(h => [h.id, h.nombre]));
    const tareasRango = tareas
      .filter(t => t.completado && inRango(t.completado_at))
      .map(t => ({ nombre: t.nombre, hito: hitoNombre[t.hito_id] || "—" }));
    const tareasPorHito = {};
    for (const t of tareasRango) { (tareasPorHito[t.hito] ||= []).push(t.nombre); }

    // Tareas en curso dentro del período: estado en_curso e iniciadas a más
    // tardar al fin del rango (siguen activas durante el período reportado).
    const estadoDe = (t) => t.estado || (t.completado ? "finalizado" : ((t.avance ?? 0) > 0 ? "en_curso" : "no_iniciado"));
    const tareasEnCurso = tareas
      .filter(t => estadoDe(t) === "en_curso" && t.fecha_inicio && String(t.fecha_inicio).slice(0, 10) <= hasta)
      .map(t => ({ nombre: t.nombre, hito: hitoNombre[t.hito_id] || "—", avance: t.avance ?? 0 }));
    const enCursoPorHito = {};
    for (const t of tareasEnCurso) { (enCursoPorHito[t.hito] ||= []).push(t); }

    // Gasto del rango, total acumulado + serie mensual (historial completo)
    const porMes = new Map();
    let totalUSD = 0, gastoRango = 0, acumHasta = 0;
    for (const mv of movs) {
      const g = gastoUSD(mv);
      if (g <= 0 || !mv.fecha) continue;
      totalUSD += g;
      const f = String(mv.fecha).slice(0, 10);
      if (f >= desde && f <= hasta) gastoRango += g;
      if (f <= hasta) acumHasta += g;
      const k = f.slice(0, 7);
      porMes.set(k, (porMes.get(k) || 0) + g);
    }
    const keys = [...porMes.keys()].sort();
    let acum = 0;
    const hastaKey = String(hasta).slice(0, 7);
    const serie = keys.map(k => {
      acum += porMes.get(k);
      const [yy, mm] = k.split("-");
      return { key: k, label: `${MES_CORTO[Number(mm) - 1]} ${yy.slice(2)}`, value: acum };
    });

    // Fotos del rango (por fecha de carga)
    const fotosRango = fotos.filter(f => inRango(f.fecha));

    return { avance: Math.round(avance), tareasPorHito, nTareasRango: tareasRango.length, enCursoPorHito, nEnCurso: tareasEnCurso.length, gastoRango, totalUSD, acumHasta, serie, hastaKey, fotosRango };
  }, [hitos, tareas, movs, fotos, desde, hasta]);

  const rangoLabel = `${fmtDate(desde)} a ${fmtDate(hasta)}`;

  const generarPdf = () => {
    const tareasHtml = Object.keys(rep.tareasPorHito).length
      ? Object.entries(rep.tareasPorHito).map(([hito, ts]) =>
          `<p style="margin:6px 0 2px"><b>${esc(hito)}</b></p><ul style="margin:0">${ts.map(n => `<li>${esc(n)}</li>`).join("")}</ul>`
        ).join("")
      : `<p class="muted">No se registraron tareas completadas en el período.</p>`;

    const enCursoHtml = Object.keys(rep.enCursoPorHito).length
      ? Object.entries(rep.enCursoPorHito).map(([hito, ts]) =>
          `<p style="margin:6px 0 2px"><b>${esc(hito)}</b></p><ul style="margin:0">${ts.map(t => `<li>${esc(t.nombre)}${t.avance ? ` <span class="muted">(${t.avance}%)</span>` : ""}</li>`).join("")}</ul>`
        ).join("")
      : `<p class="muted">No hay tareas en curso en el período.</p>`;

    const fotosHtml = rep.fotosRango.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${rep.fotosRango.map(f =>
          `<div style="width:170px"><img src="${esc(f.url)}" style="width:170px;height:120px;object-fit:cover;border-radius:6px"/>
            <div style="font-size:10px;color:#8a97a8">${fmtDate(f.fecha)}${f.descripcion ? " · " + esc(f.descripcion) : ""}</div></div>`
        ).join("")}</div>`
      : `<p class="muted">Sin fotos cargadas para este período.</p>`;

    const partes = [];
    if (inc.resumen) partes.push(`
      <h2>Resumen del período</h2>
      <table><tbody>
        <tr><td>Avance estimado del proyecto</td><td style="text-align:right">${rep.avance}%</td></tr>
        <tr><td>Gastado en el período</td><td style="text-align:right">${esc(fmtMoney(Math.round(rep.gastoRango), "USD"))}</td></tr>
        <tr><td>Gastado acumulado (hasta ${fmtDate(hasta)})</td><td style="text-align:right">${esc(fmtMoney(Math.round(rep.acumHasta), "USD"))}</td></tr>
        <tr><td>Tareas completadas en el período</td><td style="text-align:right">${rep.nTareasRango}</td></tr>
      </tbody></table>`);
    if (inc.tareas) partes.push(`
      <h2>Tareas realizadas (${esc(rangoLabel)})</h2>
      ${tareasHtml}

      <h2>Tareas en curso (${esc(rangoLabel)})</h2>
      ${enCursoHtml}`);
    if (inc.grafico) partes.push(`
      <h2>Evolución de gastos (USD acumulado)</h2>
      ${svgChart(rep.serie, rep.hastaKey)}`);
    if (inc.fotos) partes.push(`
      <h2>Fotos del período</h2>
      ${fotosHtml}`);
    const body = partes.join("\n");
    printDocument({
      title: `Reporte de avance — ${rangoLabel}`,
      subtitle: `${esc(proyecto.nombre)} · Generado el ${fmtDate(new Date().toISOString())}`,
      bodyHtml: body,
      logoUrl: `${window.location.origin}/logo-farral.png`,
    });
  };

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="flex-start" spacing={1} flexWrap="wrap">
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5">Reportería</Typography>
          <Typography variant="body2" color="text.secondary">
            Reporte de avance para inversores: tareas, gastos y fotos del período.
          </Typography>
        </Box>
        <TextField
          type="date" label="Desde" InputLabelProps={{ shrink: true }}
          value={desde} onChange={(e) => setDesde(e.target.value)}
          sx={{ width: 160 }}
        />
        <TextField
          type="date" label="Hasta" InputLabelProps={{ shrink: true }}
          value={hasta} onChange={(e) => setHasta(e.target.value)}
          sx={{ width: 160 }}
        />
        <Button variant="contained" color="secondary" startIcon={<PictureAsPdfIcon />} onClick={generarPdf}
          disabled={!SECCIONES.some(s => inc[s.key])}>
          Generar PDF
        </Button>
      </Stack>

      {/* Selector de secciones a incluir en el reporte */}
      <Card>
        <CardContent sx={{ py: 1.5 }}>
          <Typography variant="subtitle2" gutterBottom>Incluir en el reporte</Typography>
          <FormGroup row>
            {SECCIONES.map(s => (
              <FormControlLabel key={s.key}
                control={<Checkbox size="small" checked={inc[s.key]} onChange={() => toggle(s.key)} />}
                label={s.label} />
            ))}
          </FormGroup>
        </CardContent>
      </Card>

      {loading && <LinearProgress />}

      {/* Vista previa */}
      {inc.resumen && (
      <Grid container spacing={2}>
        <Grid item xs={6} sm={3}>
          <Card><CardContent>
            <Typography variant="caption" color="text.secondary">Avance estimado</Typography>
            <Typography variant="h5">{rep.avance}%</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card><CardContent>
            <Typography variant="caption" color="text.secondary">Gastado en el período</Typography>
            <Typography variant="h5">{fmtMoney(Math.round(rep.gastoRango), "USD")}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card><CardContent>
            <Typography variant="caption" color="text.secondary">Gastado acumulado</Typography>
            <Typography variant="h5">{fmtMoney(Math.round(rep.acumHasta), "USD")}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card><CardContent>
            <Typography variant="caption" color="text.secondary">Tareas del período</Typography>
            <Typography variant="h5">{rep.nTareasRango}</Typography>
          </CardContent></Card>
        </Grid>
      </Grid>
      )}

      {inc.tareas && (
      <Card>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>Tareas realizadas ({rangoLabel})</Typography>
          {Object.keys(rep.tareasPorHito).length === 0 ? (
            <Typography variant="body2" color="text.secondary">No se registraron tareas completadas en el período.</Typography>
          ) : (
            Object.entries(rep.tareasPorHito).map(([hito, ts]) => (
              <Box key={hito} sx={{ mb: 1 }}>
                <Typography variant="body2" fontWeight={700}>{hito}</Typography>
                <ul style={{ margin: "2px 0" }}>
                  {ts.map((n, i) => <li key={i}><Typography variant="body2" component="span">{n}</Typography></li>)}
                </ul>
              </Box>
            ))
          )}

          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle1" gutterBottom>Tareas en curso ({rangoLabel})</Typography>
          {Object.keys(rep.enCursoPorHito).length === 0 ? (
            <Typography variant="body2" color="text.secondary">No hay tareas en curso en el período.</Typography>
          ) : (
            Object.entries(rep.enCursoPorHito).map(([hito, ts]) => (
              <Box key={hito} sx={{ mb: 1 }}>
                <Typography variant="body2" fontWeight={700}>{hito}</Typography>
                <ul style={{ margin: "2px 0" }}>
                  {ts.map((t, i) => (
                    <li key={i}>
                      <Typography variant="body2" component="span">
                        {t.nombre}{t.avance ? ` (${t.avance}%)` : ""}
                      </Typography>
                    </li>
                  ))}
                </ul>
              </Box>
            ))
          )}

        </CardContent>
      </Card>
      )}

      {inc.fotos && (
      <Card>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>Fotos del período</Typography>
          {rep.fotosRango.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Sin fotos en este período. Cargá fotos en la sección Galería con fecha dentro del rango.
            </Typography>
          ) : (
            <Grid container spacing={1}>
              {rep.fotosRango.map(f => (
                <Grid item xs={4} sm={3} md={2} key={f.id}>
                  <Box component="img" src={f.url} alt=""
                    sx={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 1 }} />
                </Grid>
              ))}
            </Grid>
          )}
        </CardContent>
      </Card>
      )}
    </Stack>
  );
}
