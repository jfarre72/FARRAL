"use client";
import {
  Card, CardContent, Stack, Typography, Button, Grid, Tabs, Tab, Alert,
  Table, TableBody, TableCell, TableHead, TableRow, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Box,
  Chip, Tooltip, Divider, LinearProgress, ToggleButtonGroup, ToggleButton,
  FormControlLabel, Switch, Link
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtMoney, fmtNum } from "@/components/Money";

const BUCKET = "comprobantes";

const emptyMov = {
  tipo: "egreso",
  fecha: new Date().toISOString().slice(0, 10),
  // Para egreso/ingreso: moneda + monto del movimiento real (caja del gasto/ingreso)
  moneda: "ARS",
  monto: "",
  categoria: "",
  descripcion: "",
  // Cambio integrado dentro de egreso:
  con_cambio: false,
  cambio_moneda_origen: "USD",
  cambio_monto_origen: "",
  cambio_tipo_cambio: "",
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
    for (const a of aportes) {
      const m = Number(a.monto || 0);
      if (a.moneda === "USD") { usd += m; ingUSD += m; }
      else { ars += m; ingARS += m; }
    }
    for (const mv of movs) {
      const m = Number(mv.monto || 0);
      if (mv.tipo === "ingreso") {
        if (mv.moneda === "USD") { usd += m; ingUSD += m; } else { ars += m; ingARS += m; }
      } else if (mv.tipo === "egreso") {
        if (mv.con_cambio) {
          const origen = mv.cambio_moneda_origen;
          const tc = Number(mv.cambio_tipo_cambio || 0);
          const monOrigen = Number(mv.cambio_monto_origen || 0);
          // 1) Sale de caja origen
          if (origen === "USD") usd -= monOrigen; else ars -= monOrigen;
          // 2) Entra a caja del gasto (conversión)
          const entrada = origen === "USD" ? monOrigen * tc : (tc > 0 ? monOrigen / tc : 0);
          if (mv.moneda === "USD") usd += entrada; else ars += entrada;
          // 3) Sale el gasto de la caja destino
          if (mv.moneda === "USD") usd -= m; else ars -= m;
          if (mv.moneda === "USD") egrUSD += m; else egrARS += m;
        } else {
          if (mv.moneda === "USD") { usd -= m; egrUSD += m; }
          else { ars -= m; egrARS += m; }
        }
      } else if (mv.tipo === "cambio") {
        // Legacy (V2): cambio sin egreso asociado
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

  // --------- Movimientos unificados (aportes + movs) ---------
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
      categoria: mv.categoria, comprobante_url: mv.comprobante_url, raw: mv,
      moneda_destino: mv.moneda_destino, monto_destino: mv.monto_destino,
      con_cambio: mv.con_cambio,
      cambio_moneda_origen: mv.cambio_moneda_origen,
      cambio_monto_origen: mv.cambio_monto_origen,
      cambio_tipo_cambio: mv.cambio_tipo_cambio,
    }));
    return [...fromAportes, ...fromMovs].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }, [aportes, movs, inversores]);

  if (!proyecto) return <Alert severity="info">Seleccioná o creá un proyecto para gestionar la caja.</Alert>;

  // --------- Cálculos del dialog ---------
  const monto = Number(form.monto || 0);
  const tc = Number(form.cambio_tipo_cambio || 0);
  const monOrigen = Number(form.cambio_monto_origen || 0);
  const entradaPorCambio = form.cambio_moneda_origen === "USD"
    ? monOrigen * tc
    : (tc > 0 ? monOrigen / tc : 0);

  const openNew = (tipo) => {
    setForm({ ...emptyMov, tipo, moneda: "ARS", con_cambio: false });
    setFile(null); setErr(null); setOpen(true);
  };

  const publicUrl = (path) => {
    if (!path) return null;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl ?? null;
  };

  const save = async () => {
    setErr(null);
    if (!form.monto || monto <= 0) { setErr("Ingresá un monto válido."); return; }
    if (form.tipo === "egreso" && form.con_cambio) {
      if (!form.cambio_moneda_origen) { setErr("Elegí la caja de origen del cambio."); return; }
      if (form.cambio_moneda_origen === form.moneda) { setErr("La caja origen del cambio debe ser distinta de la caja del gasto."); return; }
      if (!monOrigen || monOrigen <= 0) { setErr("Ingresá el monto a convertir."); return; }
      if (!tc || tc <= 0) { setErr("Ingresá el tipo de cambio."); return; }
    }
    setSaving(true);

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
      monto: monto,
      categoria: form.tipo === "egreso" ? (form.categoria || null) : null,
      descripcion: form.descripcion || null,
      comprobante_url,
      con_cambio: form.tipo === "egreso" ? form.con_cambio : false,
      cambio_moneda_origen: form.tipo === "egreso" && form.con_cambio ? form.cambio_moneda_origen : null,
      cambio_monto_origen:  form.tipo === "egreso" && form.con_cambio ? monOrigen : null,
      cambio_tipo_cambio:   form.tipo === "egreso" && form.con_cambio ? tc : null,
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

  const tipoChip = (m) => {
    if (m.tipo === "ingreso") return <Chip size="small" color="success" variant="outlined" icon={<ArrowUpwardIcon />} label="Ingreso" />;
    if (m.tipo === "egreso") {
      return (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Chip size="small" color="error" variant="outlined" icon={<ArrowDownwardIcon />} label="Egreso" />
          {m.con_cambio && <Chip size="small" color="primary" variant="outlined" icon={<SwapHorizIcon />} label="con cambio" />}
        </Stack>
      );
    }
    return <Chip size="small" color="primary" variant="outlined" icon={<SwapHorizIcon />} label="Cambio" />;
  };

  return (
    <Stack spacing={3}>
      {/* Header */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        spacing={1.5}
      >
        <Box>
          <Typography variant="h5">Caja</Typography>
          <Typography variant="body2">Saldos, ingresos, egresos y cambios del proyecto.</Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <Button
            startIcon={<ArrowUpwardIcon />}
            variant="outlined"
            color="success"
            onClick={() => openNew("ingreso")}
          >
            Ingreso
          </Button>
          <Button
            startIcon={<ArrowDownwardIcon />}
            variant="contained"
            color="secondary"
            onClick={() => openNew("egreso")}
          >
            Egreso
          </Button>
        </Stack>
      </Stack>

      {loading && <LinearProgress />}

      {/* Saldos */}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <SaldoCard
            label="Saldo caja USD"
            saldo={saldos.usd}
            currency="USD"
            ingresos={saldos.ingUSD}
            egresos={saldos.egrUSD}
            accent="#1E8E3E"
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <SaldoCard
            label="Saldo caja ARS"
            saldo={saldos.ars}
            currency="ARS"
            ingresos={saldos.ingARS}
            egresos={saldos.egrARS}
            accent="#0F2A4A"
          />
        </Grid>
      </Grid>

      {/* Tabs */}
      <Box>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Movimientos" />
          <Tab label="Egresos por categoría" />
        </Tabs>
        <Divider />
      </Box>

      {tab === 0 && (
        <Card>
          <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
            {unified.length === 0 ? (
              <EmptyState text="Aún no hay movimientos. Los aportes aparecen como ingresos automáticamente." />
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
                        <TableCell sx={{ whiteSpace: "nowrap" }}>{m.fecha}</TableCell>
                        <TableCell>{tipoChip(m)}</TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.primary">{m.detalle}</Typography>
                          {m.con_cambio && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              {`Cambio: ${fmtMoney(m.cambio_monto_origen, m.cambio_moneda_origen)} @ ${fmtNum(m.cambio_tipo_cambio, 2)}`}
                            </Typography>
                          )}
                          {m.tipo === "cambio" && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              → {fmtMoney(m.monto_destino, m.moneda_destino)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>{m.categoria ? <Chip size="small" label={m.categoria} /> : <Typography variant="body2" color="text.secondary">—</Typography>}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                          <Typography
                            component="span"
                            color={m.tipo === "ingreso" ? "success.main" : m.tipo === "egreso" ? "error.main" : "text.primary"}
                            fontWeight={700}
                          >
                            {m.tipo === "egreso" ? "−" : m.tipo === "ingreso" ? "+" : ""}{fmtMoney(m.monto, m.moneda)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {m.comprobante_url
                            ? <Tooltip title="Ver comprobante"><IconButton size="small" component={Link} href={publicUrl(m.comprobante_url)} target="_blank"><ReceiptLongIcon fontSize="small" /></IconButton></Tooltip>
                            : <Typography variant="body2" color="text.secondary">—</Typography>}
                        </TableCell>
                        <TableCell align="right">
                          {m.kind === "mov"
                            ? <Tooltip title="Eliminar"><IconButton size="small" onClick={() => delMov(m)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                            : <span />}
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
          <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
            {porCategoria.length === 0 ? (
              <EmptyState text="Aún no hay egresos registrados." />
            ) : (
              <Box sx={{ overflowX: "auto" }}>
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
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          {form.tipo === "ingreso" ? "Registrar ingreso" : "Registrar egreso"}
        </DialogTitle>
        <DialogContent dividers>
          {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField label="Fecha" type="date" fullWidth InputLabelProps={{ shrink: true }}
                value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} />
            </Grid>

            <Grid item xs={12} sm={6}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                {form.tipo === "ingreso" ? "Caja de destino" : "Caja del gasto"}
              </Typography>
              <ToggleButtonGroup
                exclusive size="small" color="primary" fullWidth
                value={form.moneda}
                onChange={(_, v) => v && setForm({ ...form, moneda: v })}
              >
                <ToggleButton value="ARS">Caja ARS ($)</ToggleButton>
                <ToggleButton value="USD">Caja USD</ToggleButton>
              </ToggleButtonGroup>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                label={form.tipo === "ingreso" ? "Monto" : "Monto del gasto"}
                type="number" fullWidth
                value={form.monto}
                onChange={e => setForm({ ...form, monto: e.target.value })}
              />
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

            <Grid item xs={12}>
              <TextField label="Descripción" fullWidth multiline minRows={2}
                value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} />
            </Grid>

            {/* Cambio integrado: solo egresos */}
            {form.tipo === "egreso" && (
              <>
                <Grid item xs={12}>
                  <Box sx={{
                    p: 1.5, borderRadius: 2,
                    border: "1px solid", borderColor: "divider",
                    bgcolor: "rgba(15,42,74,0.025)",
                  }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={form.con_cambio}
                          onChange={(e) => {
                            const next = e.target.checked;
                            setForm({
                              ...form,
                              con_cambio: next,
                              // Origen por defecto: la opuesta a la caja del gasto
                              cambio_moneda_origen: next ? (form.moneda === "ARS" ? "USD" : "ARS") : "USD",
                            });
                          }}
                        />
                      }
                      label={
                        <Stack>
                          <Typography fontWeight={600}>¿Necesita cambio de moneda?</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Activar si para pagar este gasto primero hay que vender divisa de otra caja.
                          </Typography>
                        </Stack>
                      }
                      sx={{ alignItems: "flex-start", m: 0 }}
                    />

                    {form.con_cambio && (
                      <Stack spacing={2} sx={{ mt: 2 }}>
                        <Grid container spacing={2}>
                          <Grid item xs={12} sm={4}>
                            <TextField
                              select fullWidth label="Caja origen"
                              value={form.cambio_moneda_origen}
                              onChange={(e) => setForm({ ...form, cambio_moneda_origen: e.target.value })}
                            >
                              <MenuItem value="USD" disabled={form.moneda === "USD"}>Caja USD</MenuItem>
                              <MenuItem value="ARS" disabled={form.moneda === "ARS"}>Caja ARS ($)</MenuItem>
                            </TextField>
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <TextField
                              fullWidth type="number"
                              label={`Monto a vender (${form.cambio_moneda_origen})`}
                              value={form.cambio_monto_origen}
                              onChange={(e) => setForm({ ...form, cambio_monto_origen: e.target.value })}
                            />
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <TextField
                              fullWidth type="number"
                              label="Tipo de cambio (ARS por 1 USD)"
                              value={form.cambio_tipo_cambio}
                              onChange={(e) => setForm({ ...form, cambio_tipo_cambio: e.target.value })}
                            />
                          </Grid>
                        </Grid>

                        <Alert severity="info" icon={<SwapHorizIcon />} sx={{ alignItems: "flex-start" }}>
                          <Typography variant="body2" sx={{ mb: 0.5 }}>
                            Este registro impacta en <b>3 movimientos</b>:
                          </Typography>
                          <Stack component="ol" sx={{ pl: 2.5, m: 0 }} spacing={0.25}>
                            <li>
                              Caja {form.cambio_moneda_origen}: <b style={{ color: "#C0392B" }}>−{fmtMoney(monOrigen, form.cambio_moneda_origen)}</b>
                            </li>
                            <li>
                              Caja {form.moneda}: <b style={{ color: "#1E8E3E" }}>+{fmtMoney(entradaPorCambio, form.moneda)}</b> (conversión)
                            </li>
                            <li>
                              Caja {form.moneda}: <b style={{ color: "#C0392B" }}>−{fmtMoney(monto, form.moneda)}</b> (pago del gasto)
                            </li>
                          </Stack>
                          {monto > 0 && entradaPorCambio > 0 && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                              Sobrante en caja {form.moneda} luego del pago: <b>{fmtMoney(entradaPorCambio - monto, form.moneda)}</b>
                            </Typography>
                          )}
                        </Alert>
                      </Stack>
                    )}
                  </Box>
                </Grid>
              </>
            )}

            <Grid item xs={12}>
              <Button variant="outlined" component="label" startIcon={<AttachFileIcon />} fullWidth>
                {file ? file.name : "Adjuntar comprobante (opcional)"}
                <input hidden type="file" accept="image/*,application/pdf"
                  onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </Button>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" color="secondary" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Registrar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function SaldoCard({ label, saldo, currency, ingresos, egresos, accent }) {
  return (
    <Card sx={{ position: "relative", overflow: "hidden" }}>
      <Box sx={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, bgcolor: accent }} />
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
          <Chip size="small" label={currency} sx={{ bgcolor: "rgba(15,42,74,0.06)" }} />
        </Stack>
        <Typography variant="h4" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {fmtMoney(saldo, currency)}
        </Typography>
        <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <ArrowUpwardIcon sx={{ fontSize: 14, color: "success.main" }} />
            <Typography variant="caption" color="text.secondary">
              Ingresos {fmtMoney(ingresos, currency)}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <ArrowDownwardIcon sx={{ fontSize: 14, color: "error.main" }} />
            <Typography variant="caption" color="text.secondary">
              Egresos {fmtMoney(egresos, currency)}
            </Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }) {
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ py: 6 }}>
      <Typography color="text.secondary">{text}</Typography>
    </Stack>
  );
}
