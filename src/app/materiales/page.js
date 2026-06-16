"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, Grid, TextField, MenuItem,
  Button, IconButton, Tooltip, LinearProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, Accordion, AccordionSummary, AccordionDetails, Table, TableHead,
  TableBody, TableRow, TableCell, Chip, Link, ToggleButton, ToggleButtonGroup,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtMoney, fmtDate } from "@/components/Money";

const BUCKET = "galeria"; // reutilizamos el bucket público existente

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const emptyCuenta = { proveedor: "", descripcion: "", moneda: "ARS", monto_inicial: "", fecha: hoyISO() };

export default function MaterialesPage() {
  const { proyecto } = useProjects();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [cuentas, setCuentas] = useState([]);
  const [retiros, setRetiros] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dialog cuenta
  const [openCuenta, setOpenCuenta] = useState(false);
  const [formCuenta, setFormCuenta] = useState(emptyCuenta);
  const [editCuentaId, setEditCuentaId] = useState(null);
  const [errCuenta, setErrCuenta] = useState(null);
  const [saving, setSaving] = useState(false);

  // Alta de retiro por cuenta
  const [nuevoRetiro, setNuevoRetiro] = useState({}); // { [cuentaId]: { fecha, descripcion, monto, file } }
  const [subiendo, setSubiendo] = useState(null); // cuentaId en curso

  const reload = async () => {
    if (!proyecto) return;
    setLoading(true);
    const { data: cs } = await supabase
      .from("cuentas_materiales").select("*").eq("proyecto_id", proyecto.id)
      .order("fecha", { ascending: false });
    const ids = (cs ?? []).map(c => c.id);
    let rs = [];
    if (ids.length) {
      const { data } = await supabase
        .from("retiros_materiales").select("*").in("cuenta_id", ids)
        .order("fecha", { ascending: false }).order("created_at", { ascending: false });
      rs = data ?? [];
    }
    setCuentas(cs ?? []);
    setRetiros(rs);
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const retirosDe = (cuentaId) => retiros.filter(r => r.cuenta_id === cuentaId);
  const calc = (c) => {
    const rs = retirosDe(c.id);
    const retirado = rs.reduce((s, r) => s + Number(r.monto || 0), 0);
    const saldo = Number(c.monto_inicial || 0) - retirado;
    return { retirado, saldo, n: rs.length };
  };

  const totales = useMemo(() => {
    let inicial = 0, retirado = 0;
    for (const c of cuentas) {
      inicial += Number(c.monto_inicial || 0);
      retirado += retirosDe(c.id).reduce((s, r) => s + Number(r.monto || 0), 0);
    }
    return { inicial, retirado, saldo: inicial - retirado };
  }, [cuentas, retiros]);

  // ---- Cuenta ----
  const openNewCuenta = () => { setFormCuenta(emptyCuenta); setEditCuentaId(null); setErrCuenta(null); setOpenCuenta(true); };
  const openEditCuenta = (c) => {
    setFormCuenta({
      proveedor: c.proveedor ?? "", descripcion: c.descripcion ?? "",
      moneda: c.moneda ?? "ARS", monto_inicial: c.monto_inicial ?? "", fecha: c.fecha ?? hoyISO(),
    });
    setEditCuentaId(c.id); setErrCuenta(null); setOpenCuenta(true);
  };
  const saveCuenta = async () => {
    setErrCuenta(null);
    if (!formCuenta.proveedor.trim()) { setErrCuenta("El proveedor es obligatorio."); return; }
    setSaving(true);
    const payload = {
      proyecto_id: proyecto.id,
      proveedor: formCuenta.proveedor.trim(),
      descripcion: formCuenta.descripcion || null,
      moneda: formCuenta.moneda,
      monto_inicial: Math.max(0, Number(formCuenta.monto_inicial) || 0),
      fecha: formCuenta.fecha || null,
    };
    const res = editCuentaId
      ? await supabase.from("cuentas_materiales").update(payload).eq("id", editCuentaId)
      : await supabase.from("cuentas_materiales").insert(payload);
    setSaving(false);
    if (res.error) { setErrCuenta(res.error.message); return; }
    setOpenCuenta(false); reload();
  };
  const delCuenta = async (c) => {
    if (!confirm(`¿Eliminar la cuenta de "${c.proveedor}" y todos sus retiros?`)) return;
    const paths = retirosDe(c.id).map(r => r.remito_path).filter(Boolean);
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    const { error } = await supabase.from("cuentas_materiales").delete().eq("id", c.id);
    if (error) alert(error.message); else reload();
  };

  // ---- Retiro ----
  const setRet = (cuentaId, patch) =>
    setNuevoRetiro(prev => ({ ...prev, [cuentaId]: { fecha: hoyISO(), descripcion: "", monto: "", file: null, ...prev[cuentaId], ...patch } }));

  const addRetiro = async (cuentaId) => {
    const f = nuevoRetiro[cuentaId] || {};
    const monto = Number(f.monto || 0);
    if (!monto || monto <= 0) { alert("Ingresá el monto del retiro."); return; }
    setSubiendo(cuentaId);
    try {
      let remito_url = null, remito_path = null;
      if (f.file) {
        const ext = (f.file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${proyecto.id}/materiales/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, f.file, { upsert: false });
        if (upErr) { alert(upErr.message); setSubiendo(null); return; }
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        remito_url = pub.publicUrl; remito_path = path;
      }
      const { error } = await supabase.from("retiros_materiales").insert({
        cuenta_id: cuentaId,
        fecha: f.fecha || hoyISO(),
        descripcion: (f.descripcion || "").trim() || null,
        monto, remito_url, remito_path,
      });
      if (error) { alert(error.message); setSubiendo(null); return; }
      setNuevoRetiro(prev => ({ ...prev, [cuentaId]: { fecha: hoyISO(), descripcion: "", monto: "", file: null } }));
      reload();
    } finally {
      setSubiendo(null);
    }
  };

  const delRetiro = async (r) => {
    if (!confirm("¿Eliminar este retiro?")) return;
    if (r.remito_path) await supabase.storage.from(BUCKET).remove([r.remito_path]);
    const { error } = await supabase.from("retiros_materiales").delete().eq("id", r.id);
    if (error) alert(error.message); else reload();
  };

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto.</Alert>;

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1.5}>
        <Box>
          <Typography variant="h5">Materiales</Typography>
          <Typography variant="body2" color="text.secondary">
            Cuentas con anticipo (precio congelado). Se descuentan los retiros con su remito hasta llegar a saldo cero.
          </Typography>
        </Box>
        <Button variant="contained" color="secondary" startIcon={<AddIcon />}
          onClick={openNewCuenta} sx={{ flexShrink: 0 }}>
          Nueva cuenta
        </Button>
      </Stack>

      {loading && <LinearProgress />}

      {/* Resumen */}
      {cuentas.length > 0 && (
        <Card>
          <CardContent>
            <Grid container spacing={2}>
              <Resumen label="Anticipado" value={fmtMoney(totales.inicial, "ARS")} />
              <Resumen label="Retirado" value={fmtMoney(totales.retirado, "ARS")} color="error.main" />
              <Resumen label="Saldo disponible" value={fmtMoney(totales.saldo, "ARS")} color="success.main" />
            </Grid>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
              Totales sumando todas las cuentas (mezcla monedas si tenés en ARS y USD; mirá cada cuenta para el detalle exacto).
            </Typography>
          </CardContent>
        </Card>
      )}

      {cuentas.length === 0 ? (
        <Card><CardContent>
          <Stack spacing={2} alignItems="flex-start">
            <Typography color="text.secondary">No hay cuentas de materiales. Creá la primera.</Typography>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={openNewCuenta}>Nueva cuenta</Button>
          </Stack>
        </CardContent></Card>
      ) : (
        cuentas.map((c) => {
          const k = calc(c);
          const rs = retirosDe(c.id);
          const nr = nuevoRetiro[c.id] || {};
          const pct = Number(c.monto_inicial || 0) > 0 ? Math.min(100, (k.retirado / Number(c.monto_inicial)) * 100) : 0;
          return (
            <Accordion key={c.id} disableGutters defaultExpanded={false}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Grid container spacing={1} alignItems="center">
                  <Grid item xs={12} sm={4}>
                    <Stack>
                      <Typography fontWeight={700}>{c.proveedor}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {c.descripcion ? `${c.descripcion} · ` : ""}{c.fecha ? fmtDate(c.fecha) : ""} · {c.moneda}
                      </Typography>
                    </Stack>
                  </Grid>
                  <Resumen sm={2.5} label="Anticipo" value={fmtMoney(c.monto_inicial, c.moneda)} />
                  <Resumen sm={2.5} label="Retirado" value={fmtMoney(k.retirado, c.moneda)} color="error.main" />
                  <Grid item xs={12} sm={3}>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5 }}>Saldo</Typography>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography fontWeight={700} color={k.saldo <= 0 ? "text.secondary" : "success.main"}>
                        {fmtMoney(k.saldo, c.moneda)}
                      </Typography>
                      {k.saldo <= 0 && <Chip size="small" color="success" label="Saldado" />}
                    </Stack>
                  </Grid>
                </Grid>
              </AccordionSummary>
              <AccordionDetails>
                {/* Barra de consumo */}
                <Box sx={{ mb: 2, height: 8, bgcolor: "rgba(15,42,74,0.08)", borderRadius: 4, overflow: "hidden" }}>
                  <Box sx={{ height: "100%", width: `${pct}%`, bgcolor: pct >= 100 ? "error.main" : "secondary.main", transition: "width .4s" }} />
                </Box>

                {/* Tabla de retiros */}
                <Box sx={{ overflowX: "auto" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ width: 110 }}>Fecha</TableCell>
                        <TableCell>Detalle</TableCell>
                        <TableCell align="right">Monto</TableCell>
                        <TableCell align="center" sx={{ width: 80 }}>Remito</TableCell>
                        <TableCell align="right" sx={{ width: 56 }}></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rs.length === 0 && (
                        <TableRow><TableCell colSpan={5}>
                          <Typography variant="body2" color="text.secondary">Todavía no hay retiros en esta cuenta.</Typography>
                        </TableCell></TableRow>
                      )}
                      {rs.map((r) => (
                        <TableRow key={r.id} hover>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtDate(r.fecha)}</TableCell>
                          <TableCell>{r.descripcion || "—"}</TableCell>
                          <TableCell align="right" sx={{ whiteSpace: "nowrap", color: "error.main", fontWeight: 600 }}>
                            −{fmtMoney(r.monto, c.moneda)}
                          </TableCell>
                          <TableCell align="center">
                            {r.remito_url
                              ? <Tooltip title="Ver remito"><IconButton size="small" component={Link} href={r.remito_url} target="_blank"><ReceiptLongIcon fontSize="small" /></IconButton></Tooltip>
                              : <Typography variant="body2" color="text.disabled">—</Typography>}
                          </TableCell>
                          <TableCell align="right">
                            <Tooltip title="Eliminar retiro"><IconButton size="small" onClick={() => delRetiro(r)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>

                {/* Alta de retiro */}
                <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, border: "1px dashed", borderColor: "divider", bgcolor: "rgba(15,42,74,0.02)" }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Nuevo retiro</Typography>
                  <Grid container spacing={1.5} alignItems="center">
                    <Grid item xs={6} sm={2.5}>
                      <TextField type="date" label="Fecha" InputLabelProps={{ shrink: true }} fullWidth size="small"
                        value={nr.fecha ?? hoyISO()} onChange={(e) => setRet(c.id, { fecha: e.target.value })} />
                    </Grid>
                    <Grid item xs={6} sm={2.5}>
                      <TextField type="number" label={`Monto (${c.moneda})`} fullWidth size="small"
                        value={nr.monto ?? ""} onChange={(e) => setRet(c.id, { monto: e.target.value })} />
                    </Grid>
                    <Grid item xs={12} sm={3}>
                      <TextField label="Detalle" fullWidth size="small"
                        value={nr.descripcion ?? ""} onChange={(e) => setRet(c.id, { descripcion: e.target.value })} />
                    </Grid>
                    <Grid item xs={8} sm={2.5}>
                      <Button component="label" variant="outlined" startIcon={<AttachFileIcon />} fullWidth size="small" sx={{ overflow: "hidden" }}>
                        {nr.file ? nr.file.name : "Remito"}
                        <input hidden type="file" accept="image/*,application/pdf"
                          onChange={(e) => setRet(c.id, { file: e.target.files?.[0] ?? null })} />
                      </Button>
                    </Grid>
                    <Grid item xs={4} sm={1.5}>
                      <Button variant="contained" color="secondary" fullWidth size="small"
                        disabled={subiendo === c.id} onClick={() => addRetiro(c.id)}>
                        {subiendo === c.id ? "…" : "Agregar"}
                      </Button>
                    </Grid>
                  </Grid>
                </Box>

                <Stack direction="row" spacing={1} sx={{ mt: 2 }} justifyContent="flex-end">
                  <Button size="small" startIcon={<EditIcon />} onClick={() => openEditCuenta(c)}>Editar cuenta</Button>
                  <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => delCuenta(c)}>Eliminar cuenta</Button>
                </Stack>
              </AccordionDetails>
            </Accordion>
          );
        })
      )}

      {/* Dialog nueva/editar cuenta */}
      <Dialog open={openCuenta} onClose={() => setOpenCuenta(false)} fullWidth maxWidth="sm" fullScreen={fullScreen}>
        <DialogTitle>{editCuentaId ? "Editar cuenta" : "Nueva cuenta de materiales"}</DialogTitle>
        <DialogContent dividers>
          {errCuenta && <Alert severity="error" sx={{ mb: 2 }}>{errCuenta}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={7}>
              <TextField label="Proveedor" fullWidth value={formCuenta.proveedor}
                onChange={(e) => setFormCuenta({ ...formCuenta, proveedor: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={5}>
              <TextField type="date" label="Fecha" InputLabelProps={{ shrink: true }} fullWidth
                value={formCuenta.fecha} onChange={(e) => setFormCuenta({ ...formCuenta, fecha: e.target.value })} />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Descripción (opcional)" fullWidth value={formCuenta.descripcion}
                onChange={(e) => setFormCuenta({ ...formCuenta, descripcion: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>Moneda</Typography>
              <ToggleButtonGroup exclusive size="small" fullWidth value={formCuenta.moneda}
                onChange={(_, v) => v && setFormCuenta({ ...formCuenta, moneda: v })}>
                <ToggleButton value="ARS">ARS ($)</ToggleButton>
                <ToggleButton value="USD">USD</ToggleButton>
              </ToggleButtonGroup>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField type="number" label={`Anticipo (${formCuenta.moneda})`} fullWidth value={formCuenta.monto_inicial}
                helperText="Monto congelado pagado al proveedor"
                onChange={(e) => setFormCuenta({ ...formCuenta, monto_inicial: e.target.value })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenCuenta(false)}>Cancelar</Button>
          <Button variant="contained" color="secondary" onClick={saveCuenta} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function Resumen({ label, value, color = "text.primary", sm = 4 }) {
  return (
    <Grid item xs={6} sm={sm}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5 }}>{label}</Typography>
      <Typography fontWeight={700} sx={{ color, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
    </Grid>
  );
}
