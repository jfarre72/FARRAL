"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, TextField,
  Button, IconButton, Tooltip, LinearProgress, Divider, Table, TableHead,
  TableBody, TableRow, TableCell, TableContainer, Switch, FormControlLabel, Chip
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtMoney } from "@/components/Money";

// Campo que guarda al salir (blur/Enter), no en cada tecla.
// money=true: muestra el valor formateado en USD (con separador de miles)
// cuando no está enfocado, y el número crudo mientras se edita.
function CommitField({ value, onCommit, type = "text", money = false, sx, align, suffix }) {
  const [local, setLocal] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setLocal(value ?? ""); }, [value, focused]);
  const commit = () => {
    setFocused(false);
    if (String(local) !== String(value ?? "")) onCommit(local);
  };
  const display = money && !focused ? fmtMoney(value, "USD") : local;
  return (
    <TextField
      size="small" type={money ? "text" : type} value={display} sx={sx}
      onFocus={() => { setFocused(true); setLocal(value ?? ""); }}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      inputProps={{
        ...(align ? { style: { textAlign: align } } : {}),
        ...(money ? { inputMode: "numeric" } : {}),
      }}
      InputProps={suffix ? { endAdornment: <Typography variant="caption" color="text.secondary">{suffix}</Typography> } : undefined}
    />
  );
}

// Línea de resumen: compara una suma con un total de referencia editable.
function ResumenRelacion({ totalLabel, sumaLabel, total, onCommitTotal, suma }) {
  const diff = Number(suma || 0) - Number(total || 0);
  const ok = Math.abs(diff) < 0.5;
  return (
    <Box sx={{ p: 1.5, mb: 2, borderRadius: 1, bgcolor: "rgba(15,42,74,0.04)" }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }} flexWrap="wrap">
        <Stack direction="row" alignItems="center" spacing={1} sx={{ flexGrow: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{totalLabel}</Typography>
          <CommitField money value={total ?? 0} align="right" sx={{ width: 170 }} onCommit={onCommitTotal} />
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {sumaLabel}: <b>{fmtMoney(suma, "USD")}</b>
        </Typography>
        <Chip
          size="small"
          color={ok ? "success" : "warning"}
          variant={ok ? "filled" : "outlined"}
          label={ok ? "Coincide" : `Dif. ${fmtMoney(Math.abs(diff), "USD")}`}
        />
      </Stack>
    </Box>
  );
}

export default function ConfiguracionPage() {
  const { proyecto, refresh } = useProjects();
  const [hitos, setHitos] = useState([]);
  const [conceptos, setConceptos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState("");
  const [pct, setPct] = useState("");
  const [cNombre, setCNombre] = useState("");
  const [cValor, setCValor] = useState("");

  const reload = async () => {
    if (!proyecto) return;
    setLoading(true);
    const [{ data: hs }, { data: cs }] = await Promise.all([
      supabase.from("hitos").select("*").eq("proyecto_id", proyecto.id).order("orden"),
      supabase.from("conceptos").select("*").eq("proyecto_id", proyecto.id).order("orden"),
    ]);
    setHitos(hs ?? []);
    setConceptos(cs ?? []);
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const updateHito = async (id, patch) => {
    setHitos(prev => prev.map(h => h.id === id ? { ...h, ...patch } : h));
    const { error } = await supabase.from("hitos").update(patch).eq("id", id);
    if (error) { alert(error.message); reload(); }
  };

  const updateProyectoCosto = async (val) => {
    const v = Math.max(0, Number(val) || 0);
    const { error } = await supabase.from("proyectos")
      .update({ costo_total_estimado: v }).eq("id", proyecto.id);
    if (error) alert(error.message); else refresh();
  };

  // ---- Conceptos ----
  const updateConcepto = async (id, patch) => {
    setConceptos(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    const { error } = await supabase.from("conceptos").update(patch).eq("id", id);
    if (error) { alert(error.message); reload(); }
  };
  const addConcepto = async () => {
    const nom = cNombre.trim();
    if (!nom || !proyecto) return;
    const valor_plan = Math.max(0, Number(cValor) || 0);
    const orden = (conceptos.reduce((m, c) => Math.max(m, c.orden || 0), 0)) + 1;
    const { error } = await supabase.from("conceptos")
      .insert({ proyecto_id: proyecto.id, nombre: nom, valor_plan, orden });
    if (error) { alert(error.message); return; }
    setCNombre(""); setCValor("");
    reload();
  };
  const delConcepto = async (c) => {
    if (!confirm(`¿Eliminar el concepto "${c.nombre}"?`)) return;
    const { error } = await supabase.from("conceptos").delete().eq("id", c.id);
    if (error) alert(error.message); else reload();
  };
  const seedConceptos = async () => {
    if (!proyecto) return;
    const seed = [
      { nombre: "Terreno", valor_plan: 0, usa_etapas: false, orden: 1 },
      { nombre: "Tasas + Mto + Expensas", valor_plan: 0, usa_etapas: false, orden: 2 },
      { nombre: "Obra", valor_plan: 0, usa_etapas: true, orden: 3 },
      { nombre: "Honorarios", valor_plan: 0, usa_etapas: false, orden: 4 },
    ].map(c => ({ ...c, proyecto_id: proyecto.id }));
    const { error } = await supabase.from("conceptos").insert(seed);
    if (error) alert(error.message);
    reload();
  };

  const addEtapa = async () => {
    const nom = nombre.trim();
    if (!nom || !proyecto) return;
    const porcentaje = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    const orden = (hitos.reduce((m, h) => Math.max(m, h.orden || 0), 0)) + 1;
    const { error } = await supabase.from("hitos")
      .insert({ proyecto_id: proyecto.id, nombre: nom, porcentaje, orden });
    if (error) { alert(error.message); return; }
    setNombre(""); setPct("");
    reload();
  };

  // Drag & drop para reordenar etapas
  const [drag, setDrag] = useState(null); // { fromId, overId }
  const reordenar = async (fromId, toId) => {
    if (fromId === toId) return;
    const lista = [...hitos].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    const fromIdx = lista.findIndex(h => h.id === fromId);
    const toIdx = lista.findIndex(h => h.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const nueva = [...lista];
    const [m] = nueva.splice(fromIdx, 1);
    nueva.splice(toIdx, 0, m);
    const conOrden = nueva.map((h, i) => ({ ...h, orden: i + 1 }));
    setHitos(conOrden);
    const cambios = conOrden.filter(h => {
      const o = lista.find(x => x.id === h.id);
      return o && o.orden !== h.orden;
    });
    await Promise.all(cambios.map(h =>
      supabase.from("hitos").update({ orden: h.orden }).eq("id", h.id)
    ));
  };

  const delEtapa = async (h) => {
    if (!confirm(`¿Eliminar la etapa "${h.nombre}"? Se borran también sus tareas.`)) return;
    const { error } = await supabase.from("hitos").delete().eq("id", h.id);
    if (error) alert(error.message); else reload();
  };

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  const sumaConceptos = conceptos.reduce((s, c) => s + Number(c.valor_plan || 0), 0);
  const sumaEtapas = hitos.reduce((s, h) => s + Number(h.valor_plan || 0), 0);
  const conceptoObra = conceptos.find(c => c.usa_etapas) || null;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5">Configuración</Typography>
        <Typography variant="body2" color="text.secondary">
          Conceptos y etapas del proyecto, con su valor planificado en USD. Se usan al registrar egresos y en el seguimiento económico.
        </Typography>
      </Box>

      {loading && <LinearProgress />}

      {/* Conceptos */}
      <Card>
        <CardContent>
          <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>Conceptos</Typography>
            {conceptos.length === 0 && (
              <Button size="small" variant="outlined" onClick={seedConceptos}>Cargar por defecto</Button>
            )}
          </Stack>
          <ResumenRelacion
            totalLabel="Costo total estimado del proyecto"
            sumaLabel="Suma de conceptos"
            total={proyecto.costo_total_estimado}
            onCommitTotal={updateProyectoCosto}
            suma={sumaConceptos}
          />
          <TableContainer>
            <Table size="small" sx={{ minWidth: 460 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Concepto</TableCell>
                  <TableCell align="right" sx={{ width: 140 }}>Plan (USD)</TableCell>
                  <TableCell align="center" sx={{ width: 130 }}>Usa etapas</TableCell>
                  <TableCell align="right" sx={{ width: 60 }}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {conceptos.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell>
                      <CommitField
                        value={c.nombre} sx={{ width: "100%", maxWidth: 320 }}
                        onCommit={(v) => { const n = String(v).trim(); if (n) updateConcepto(c.id, { nombre: n }); else reload(); }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <CommitField
                        money value={c.valor_plan ?? 0} align="right" sx={{ width: 150 }}
                        onCommit={(v) => updateConcepto(c.id, { valor_plan: Math.max(0, Number(v) || 0) })}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Al registrar un egreso con este concepto se habilita la etapa">
                        <Switch size="small" checked={!!c.usa_etapas}
                          onChange={(e) => updateConcepto(c.id, { usa_etapas: e.target.checked })} />
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Eliminar concepto">
                        <IconButton size="small" onClick={() => delConcepto(c)}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {conceptos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Typography variant="body2" color="text.secondary">No hay conceptos cargados.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Divider sx={{ my: 2 }} />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "flex-end" }}>
            <TextField
              label="Nuevo concepto" placeholder="Nombre del concepto" fullWidth size="small"
              value={cNombre} onChange={(e) => setCNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addConcepto(); }}
            />
            <TextField
              label="Plan (USD)" type="number" size="small" sx={{ width: { xs: "100%", sm: 160 } }}
              value={cValor} onChange={(e) => setCValor(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addConcepto(); }}
            />
            <Button variant="contained" color="secondary" startIcon={<AddIcon />}
              onClick={addConcepto} sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}>
              Agregar concepto
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            “Usa etapas” marca el concepto (típicamente Obra) que, al registrar un egreso, habilita además la selección de la etapa.
          </Typography>
        </CardContent>
      </Card>

      {/* Etapas */}
      <Card>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>Etapas</Typography>
          {conceptoObra ? (
            <ResumenRelacion
              totalLabel={`Valor de "${conceptoObra.nombre}"`}
              sumaLabel="Suma de etapas"
              total={conceptoObra.valor_plan}
              onCommitTotal={(v) => updateConcepto(conceptoObra.id, { valor_plan: Math.max(0, Number(v) || 0) })}
              suma={sumaEtapas}
            />
          ) : (
            <Alert severity="info" sx={{ mb: 2 }}>
              Marcá un concepto con “Usa etapas” (típicamente Obra) para relacionar su valor con la suma de las etapas.
            </Alert>
          )}
          <TableContainer>
            <Table size="small" sx={{ minWidth: 420 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 36 }}></TableCell>
                  <TableCell sx={{ width: 110 }}>% hito</TableCell>
                  <TableCell>Nombre</TableCell>
                  <TableCell align="right" sx={{ width: 160 }}>Plan (USD)</TableCell>
                  <TableCell align="right" sx={{ width: 60 }}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {hitos.map((h) => {
                  const isTarget = drag && drag.overId === h.id && drag.fromId !== h.id;
                  return (
                  <TableRow
                    key={h.id} hover
                    onDragOver={(e) => { e.preventDefault(); if (drag && drag.overId !== h.id) setDrag(d => ({ ...d, overId: h.id })); }}
                    onDrop={(e) => { e.preventDefault(); if (drag) reordenar(drag.fromId, h.id); setDrag(null); }}
                    sx={{ opacity: drag?.fromId === h.id ? 0.4 : 1,
                      "& > td": { borderTop: isTarget ? "2px solid" : undefined, borderTopColor: isTarget ? "secondary.main" : undefined } }}
                  >
                    <TableCell sx={{ pr: 0 }}>
                      <Tooltip title="Arrastrá para reordenar">
                        <IconButton
                          size="small" draggable
                          onDragStart={() => setDrag({ fromId: h.id, overId: h.id })}
                          onDragEnd={() => setDrag(null)}
                          sx={{ cursor: "grab", touchAction: "none" }}
                        >
                          <DragIndicatorIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <CommitField
                        type="number" value={h.porcentaje} align="right" suffix="%"
                        sx={{ width: 100 }}
                        onCommit={(v) => updateHito(h.id, { porcentaje: Math.max(0, Math.min(100, Math.round(Number(v) || 0))) })}
                      />
                    </TableCell>
                    <TableCell>
                      <CommitField
                        value={h.nombre} sx={{ width: "100%", maxWidth: 360 }}
                        onCommit={(v) => { const n = String(v).trim(); if (n) updateHito(h.id, { nombre: n }); else reload(); }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <CommitField
                        money value={h.valor_plan ?? 0} align="right"
                        sx={{ width: 150 }}
                        onCommit={(v) => updateHito(h.id, { valor_plan: Math.max(0, Number(v) || 0) })}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Eliminar etapa">
                        <IconButton size="small" onClick={() => delEtapa(h)}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                  );
                })}
                {hitos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography variant="body2" color="text.secondary">No hay etapas cargadas.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Divider sx={{ my: 2 }} />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "flex-end" }}>
            <TextField
              label="Nueva etapa" placeholder="Nombre de la etapa" fullWidth size="small"
              value={nombre} onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addEtapa(); }}
            />
            <TextField
              label="% hito" type="number" size="small" sx={{ width: { xs: "100%", sm: 120 } }}
              value={pct} onChange={(e) => setPct(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addEtapa(); }}
              InputProps={{ endAdornment: <Typography variant="caption" color="text.secondary">%</Typography> }}
            />
            <Button variant="contained" color="secondary" startIcon={<AddIcon />}
              onClick={addEtapa} sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}>
              Agregar etapa
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            El “% hito” marca el avance acumulado del proyecto al iniciar esa etapa (0 = inicio, 100 = terminada).
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}
