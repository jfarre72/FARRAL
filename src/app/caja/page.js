"use client";
import {
  Card, CardContent, Stack, Typography, Button, Grid, Tabs, Tab, Alert,
  Table, TableBody, TableCell, TableHead, TableRow, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Box,
  Chip, Tooltip, Divider, LinearProgress, ToggleButtonGroup, ToggleButton, Link
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtMoney, fmtNum } from "@/components/Money";

const BUCKET = "comprobantes";

const emptyMov = {
  tipo: "egreso",
  fecha: new Date().toISOString().slice(0, 10),
  moneda: "ARS",
  monto: "",
  categoria: "",
  descripcion: "",
  // cambio
  tipo_cambio: "",
};

export default function CajaPage() {
  const { proyecto } = useProjects();
  const [tab, setTab] = useState(0);
  const [aportes, setAportes] = useState([]);
  const [inversores, setInversores] = useState([]);
  const [movs, setMovs] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyMov);
  const [file, setFile] = useState(null);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    if (!proyecto) return;
    setLoading(true);
    const [r1, r2, r3, r4] = await Promise.all([
      supabase.from("aportes").select("*").eq("proyecto_id", proyecto.id).order("fecha", { ascending: false }),
      supabase.from("inversores").select("id,nombre").eq("proyecto_id", proyecto.id),
      supabase.from("movimientos_caja").select("*").eq("proyecto_id", proyecto.id).order("fecha", { ascending: false }),
      supabase.from("categorias_egreso").select("nombre").order("nombre"),
    ]);
    setAportes(r1.data ?? []);
    setInversores(r2.data ?? []);
    setMovs(r3.data ?? []);
    setCategorias((r4.data ?? []).map(c => c.nombre));
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  // --------- Saldos ---------
  const saldos = useMemo(() => {
    let usd = 0, ars = 0;
    let ingUSD = 0, ingARS = 0, egrUSD = 0, egrARS = 0;
    // Aportes = ingresos
    for (const a of aportes) {
      const m = Number(a.monto || 0);
      if (a.moneda === "USD") { usd += m; ingUSD += m; }
      else { ars += m; ingARS += m; }
    }
    // Movimientos
    for (const mv of movs) {
      const m = Number(mv.monto || 0);
      if (mv.tipo === "ingreso") {
        if (mv.moneda === "USD") { usd += m; ingUSD += m; } else { ars += m; ingARS += m; }
      } else if (mv.tipo === "egreso") {
        if (mv.moneda === "USD") { usd -= m; egrUSD += m; } else { ars -= m; egrARS += m; }
      } else if (mv.tipo === "cambio") {
        const md = Number(mv.monto_destino || 0);
        if (mv.moneda === "USD") usd -= m; else ars -= m;
        if (mv.moneda_destino === "USD") usd += md; else ars += md;
      }
    }
    return { usd, ars, ingUSD, ingARS, egrUSD, egrARS };
  }, [aportes, movs]);

  // --------- Egresos por categoría ---------
  const porCategoria = useMemo(() => {
    const map = {};
    for (const mv of movs) {
      if (mv.tipo !== "egreso") continue;
      const k = mv.categoria || "Sin categoría";
      if (!map[k]) map[k] = { ARS: 0, USD: 0 };
      map[k][mv.moneda] += Number(mv.monto || 0);
    }
    return Object.entries(map).map(([cat, v]) => ({ cat, ...v }))
      .sort((a, b) => (b.ARS + b.USD) - (a.ARS + a.USD));
  }, [movs]);

  // --------- Lista unificada de movimientos ---------
  const invName = (id) => inversores.find(i => i.id === id)?.nombre ?? "—";
  const unified = useMemo(() => {
    const fromAportes = aportes.map(a => ({
      id: "ap_" + a.id, kind: "aporte", fecha: a.fecha, tipo: "ingreso",
      moneda: a.moneda, monto: Number(a.monto || 0),
      detalle: `Aporte · ${invName(a.inversor_id)}`,
      categoria: null, comprobante_url: null, raw: a,
    }));
    const fromMovs = movs.map(mv => ({
      id: "mv_" + mv.id, kind: "mov", fecha: mv.fecha, tipo: mv.tipo,
      moneda: mv.moneda, monto: Number(mv.monto || 0),
      detalle: mv.tipo === "cambio"
        ? `Cambio ${mv.moneda}→${mv.moneda_destino} @ ${fmtNum(mv.tipo_cambio, 2)}`
        : (mv.descripcion || (mv.tipo === "ingreso" ? "Ingreso" : "Egreso")),
      categoria: mv.categoria, comprobante_url: mv.comprobante_url,
      moneda_destino: mv.moneda_destino, monto_destino: mv.monto_destino, raw: mv,
    }));
    return [...fromAportes, ...fromMovs].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }, [aportes, movs, inversores]);

  if (!proyecto) return <Alert severity="info">Seleccioná o creá un proyecto para gestionar la caja.</Alert>;

  // --------- Guardar movimiento ---------
  const monedaDestino = form.moneda === "USD" ? "ARS" : "USD";
  const montoDestino = (() => {
    const m = Number(form.monto || 0);
    const tc = Number(form.tipo_cambio || 0);
    if (!m || !tc) return null;
    // tipo_cambio = ARS por 1 USD
    return form.moneda === "USD" ? m * tc : m / tc;
  })();

  const openNew = (tipo) => {
    setForm({ ...emptyMov, tipo, moneda: tipo === "cambio" ? "USD" : "ARS" });
    setFile(null); setErr(null); setOpen(true);
  };

  const publicUrl = (path) => {
    if (!path) return null;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl ?? null;
  };

  const save = async () => {
    setErr(null);
    if (!form.monto || Number(form.monto) <= 0) { setErr("Ingresá un monto válido."); return; }
    if (form.tipo === "cambio" && (!form.tipo_cambio || Number(form.tipo_cambio) <= 0)) {
      setErr("Ingresá el tipo de cambio."); return;
    }
    setSaving(true);

    // Subir comprobante si hay
    let comprobante_url = null;
    if (file) {
      const safe = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${proyecto.id}/${Date.now()}_${safe}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (up.error) { setSaving(false); setErr("Error subiendo comprobante: " + up.error.message); return; }
      comprobante_url = path;
    }

    const payload = {
      proyecto_id: proyecto.id,
      fecha: form.fecha,
      tipo: form.tipo,
      moneda: form.moneda,
      monto: Number(form.monto),
      categoria: form.tipo === "egreso" ? (form.categoria || null) : null,
      descripcion: form.descripcion || null,
      comprobante_url,
      moneda_destino: form.tipo === "cambio" ? monedaDestino : null,
      tipo_cambio: form.tipo === "cambio" ? Number(form.tipo_cambio) : null,
      monto_destino: form.tipo === "cambio" ? montoDestino : null,
    };

    const { error } = await supabase.from("movimientos_caja").insert(payload);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setOpen(false); reload();
  };

  const delMov = async (mv) => {
    if (!confirm("¿Eliminar este movimiento de caja?")) return;
    if (mv.comprobante_url) {
      await supabase.storage.from(BUCKET).remove([mv.comprobante_url]);
    }
    const realId = mv.id.replace("mv_", "");
    const { error } = await supabase.from("movimientos_caja").delete().eq("id", realId);
    if (error) alert(error.message); else reload();
  };

  const tipoChip = (tipo) => {
    if (tipo === "ingreso") return <Chip size="small" color="success" variant="outlined" icon={<ArrowUpwardIcon />} label="Ingreso" />;
    if (tipo === "egreso")  return <Chip size="small" color="error"   variant="outlined" icon={<ArrowDownwardIcon />} label="Egreso" />;
    return <Chip size="small" color="primary" variant="outlined" icon={<SwapHorizIcon />} label="Cambio" />;
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Typography variant="h5">Caja</Typography>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<ArrowUpwardIcon />} variant="outlined" color="success" onClick={() => openNew("ingreso")}>Ingreso</Button>
          <Button startIcon={<ArrowDownwardIcon />} variant="outlined" color="error" onClick={() => openNew("egreso")}>Egreso</Button>
          <Button startIcon={<SwapHorizIcon />} variant="contained" color="secondary" onClick={() => openNew("cambio")}>Cambio</Button>
        </Stack>
      </Stack>

      {loading && <LinearProgress />}

      {/* Saldos */}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <Card sx={{ borderTop: "4px solid #1E8E3E" }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">Saldo caja USD</Typography>
              <Typography variant="h4">{fmtMoney(saldos.usd, "USD")}</Typography>
              <Typography variant="caption" color="text.secondary">
                Ingresos {fmtMoney(saldos.ingUSD, "USD")} · Egresos {fmtMoney(saldos.egrUSD, "USD")}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6}>
          <Card sx={{ borderTop: "4px solid #0F2A4A" }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">Saldo caja ARS</Typography>
              <Typography variant="h4">{fmtMoney(saldos.ars, "ARS")}</Typography>
              <Typography variant="caption" color="text.secondary">
                Ingresos {fmtMoney(saldos.ingARS, "ARS")} · Egresos {fmtMoney(saldos.egrARS, "ARS")}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label="Movimientos" />
        <Tab label="Egresos por categoría" />
      </Tabs>

      {tab === 0 && (
        <Card>
          <CardContent>
            {unified.length === 0 ? (
              <Typography color="text.secondary">Aún no hay movimientos. Los aportes aparecen como ingresos automáticamente.</Typography>
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Fecha</TableCell>
                      <TableCell>Tipo</TableCell>
                      <TableCell>Detalle</TableCell>
                      <TableCell>Categoría</TableCell>
                      <TableCell align="right">Monto</TableCell>
                      <TableCell>Comprob.</TableCell>
                      <TableCell align="right"></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {unified.map((m) => (
                      <TableRow key={m.id} hover>
                        <TableCell>{m.fecha}</TableCell>
                        <TableCell>{tipoChip(m.tipo)}</TableCell>
                        <TableCell>
                          {m.detalle}
                          {m.tipo === "cambio" && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              → {fmtMoney(m.monto_destino, m.moneda_destino)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>{m.categoria ? <Chip size="small" label={m.categoria} /> : "—"}</TableCell>
                        <TableCell align="right">
                          <Typography
                            component="span"
                            color={m.tipo === "ingreso" ? "success.main" : m.tipo === "egreso" ? "error.main" : "text.primary"}
                            fontWeight={600}
                          >
                            {m.tipo === "egreso" ? "−" : m.tipo === "ingreso" ? "+" : ""}{fmtMoney(m.monto, m.moneda)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {m.comprobante_url
                            ? <Tooltip title="Ver comprobante"><IconButton size="small" component={Link} href={publicUrl(m.comprobante_url)} target="_blank"><ReceiptLongIcon fontSize="small" /></IconButton></Tooltip>
                            : "—"}
                        </TableCell>
                        <TableCell align="right">
                          {m.kind === "mov"
                            ? <Tooltip title="Eliminar"><IconButton size="small" onClick={() => delMov(m)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                            : <Tooltip title="Editar desde Inversores"><span><IconButton size="small" disabled><DeleteIcon fontSize="small" /></IconButton></span></Tooltip>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 1 && (
        <Card>
          <CardContent>
            {porCategoria.length === 0 ? (
              <Typography color="text.secondary">Aún no hay egresos registrados.</Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Categoría</TableCell>
                    <TableCell align="right">Total ARS</TableCell>
                    <TableCell align="right">Total USD</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {porCategoria.map((c) => (
                    <TableRow key={c.cat} hover>
                      <TableCell><Chip size="small" label={c.cat} /></TableCell>
                      <TableCell align="right">{c.ARS ? fmtMoney(c.ARS, "ARS") : "—"}</TableCell>
                      <TableCell align="right">{c.USD ? fmtMoney(c.USD, "USD") : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog movimiento */}
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          {form.tipo === "ingreso" ? "Registrar ingreso" : form.tipo === "egreso" ? "Registrar egreso / compra" : "Registrar cambio de divisa"}
        </DialogTitle>
        <DialogContent dividers>
          {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

          <ToggleButtonGroup
            exclusive size="small" color="primary" sx={{ mb: 2 }}
            value={form.tipo}
            onChange={(_, v) => v && setForm({ ...form, tipo: v, moneda: v === "cambio" ? "USD" : form.moneda })}
          >
            <ToggleButton value="ingreso">Ingreso</ToggleButton>
            <ToggleButton value="egreso">Egreso</ToggleButton>
            <ToggleButton value="cambio">Cambio</ToggleButton>
          </ToggleButtonGroup>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField label="Fecha" type="date" fullWidth InputLabelProps={{ shrink: true }}
                value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField select label={form.tipo === "cambio" ? "Caja origen" : "Caja / moneda"} fullWidth
                value={form.moneda} onChange={e => setForm({ ...form, moneda: e.target.value })}>
                <MenuItem value="ARS">ARS ($)</MenuItem>
                <MenuItem value="USD">USD</MenuItem>
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField label={form.tipo === "cambio" ? "Monto a vender" : "Monto"} type="number" fullWidth
                value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} />
            </Grid>

            {form.tipo === "egreso" && (
              <Grid item xs={12} sm={6}>
                <TextField select label="Categoría" fullWidth
                  value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
                  <MenuItem value="">(Sin categoría)</MenuItem>
                  {categorias.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </TextField>
              </Grid>
            )}

            {form.tipo === "cambio" && (
              <>
                <Grid item xs={12} sm={6}>
                  <TextField label="Tipo de cambio (ARS por 1 USD)" type="number" fullWidth
                    value={form.tipo_cambio} onChange={e => setForm({ ...form, tipo_cambio: e.target.value })} />
                </Grid>
                <Grid item xs={12}>
                  <Alert severity="info" icon={<SwapHorizIcon />}>
                    Sale {fmtMoney(Number(form.monto || 0), form.moneda)} de caja {form.moneda} ·
                    {" "}entra <b>{montoDestino !== null ? fmtMoney(montoDestino, monedaDestino) : "—"}</b> a caja {monedaDestino}.
                  </Alert>
                </Grid>
              </>
            )}

            <Grid item xs={12}>
              <TextField label="Descripción" fullWidth multiline minRows={2}
                value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} />
            </Grid>

            {form.tipo !== "cambio" && (
              <Grid item xs={12}>
                <Button variant="outlined" component="label" startIcon={<ReceiptLongIcon />} fullWidth>
                  {file ? file.name : "Adjuntar comprobante (opcional)"}
                  <input hidden type="file" accept="image/*,application/pdf"
                    onChange={e => setFile(e.target.files?.[0] ?? null)} />
                </Button>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Registrar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
