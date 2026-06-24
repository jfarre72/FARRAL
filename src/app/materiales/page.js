"use client";
import {
  Card, CardContent, Stack, Typography, Alert, Box, Grid, TextField, MenuItem,
  Button, IconButton, Tooltip, LinearProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, Accordion, AccordionSummary, AccordionDetails, Table, TableHead,
  TableBody, TableRow, TableCell, Chip, Link, ToggleButton, ToggleButtonGroup,
  Divider, FormControlLabel, Switch, useMediaQuery,
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

// Formatea una cantidad sin decimales innecesarios (ej. 3, 2.5).
const fmtNum0 = (val) => {
  const n = Number(val || 0);
  return Number.isInteger(n) ? String(n) : n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
};

// Ítem vacío para el formulario de recupero (varios por retiro).
const emptyRecItem = () => ({ unidad: "pallet", cantidad: "", precio: "" });

// Devuelve los ítems de recupero de un retiro como arreglo normalizado.
// Usa recupero_items (V28) si existe; si no, sintetiza el ítem único de la V27.
const itemsRecupero = (r) => {
  if (!r?.recupero) return [];
  if (Array.isArray(r.recupero_items) && r.recupero_items.length) {
    return r.recupero_items.map(it => ({
      unidad: it.unidad === "bolson" ? "bolson" : "pallet",
      cantidad: Number(it.cantidad || 0),
      precio: Number(it.precio || 0),
      total: Number(it.total != null ? it.total : Number(it.cantidad || 0) * Number(it.precio || 0)),
    }));
  }
  // Legado V27: un solo ítem en columnas planas.
  return [{
    unidad: r.recupero_unidad === "bolson" ? "bolson" : "pallet",
    cantidad: Number(r.recupero_cantidad || 0),
    precio: Number(r.recupero_precio || 0),
    total: Number(r.recupero_total || 0),
  }];
};

// Formatea un string numérico con separadores de miles (formato AR: punto miles, coma decimal).
const fmtMiles = (val) => {
  if (val === "" || val === null || val === undefined) return "";
  // El estado guarda el valor en formato JS (punto = decimal, sin separador
  // de miles). Sólo si viene en formato AR (con coma) normalizo coma->punto y
  // descarto los puntos de miles; si no, conservo el punto como decimal.
  let s = String(val);
  s = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (s === "" || s === "-") return s;
  const neg = s.startsWith("-");
  const [intPart, decPart] = s.replace("-", "").split(".");
  const intFmt = (intPart || "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  let out = (neg ? "-" : "") + (intFmt || "0");
  if (decPart !== undefined) out += "," + decPart;
  return out;
};
// Quita los separadores y devuelve un string apto para Number().
const parseMiles = (val) => {
  if (val === "" || val === null || val === undefined) return "";
  // Conserva solo dígitos, coma decimal y signo; coma -> punto.
  const cleaned = String(val).replace(/[^\d,-]/g, "").replace(",", ".");
  return cleaned;
};

export default function MaterialesPage() {
  const { proyecto } = useProjects();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [cuentas, setCuentas] = useState([]);
  const [anticipos, setAnticipos] = useState([]);
  const [retiros, setRetiros] = useState([]);
  const [recuperos, setRecuperos] = useState([]); // ingresos de caja marcados como recupero
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
    let rs = [], rec = [], ant = [];
    if (ids.length) {
      const { data: as } = await supabase
        .from("anticipos_materiales").select("*").in("cuenta_id", ids)
        .order("fecha", { ascending: true }).order("created_at", { ascending: true });
      ant = as ?? [];
      const { data } = await supabase
        .from("retiros_materiales").select("*").in("cuenta_id", ids)
        .order("fecha", { ascending: false }).order("created_at", { ascending: false });
      rs = data ?? [];
      const { data: rc } = await supabase
        .from("movimientos_caja")
        .select("id, fecha, monto, moneda, cuenta_materiales_id, recupero_pallets, recupero_bolsones")
        .eq("proyecto_id", proyecto.id)
        .eq("tipo", "ingreso")
        .eq("recupero_materiales", true)
        .in("cuenta_materiales_id", ids);
      rec = rc ?? [];
    }
    setCuentas(cs ?? []);
    setAnticipos(ant);
    setRetiros(rs);
    setRecuperos(rec);
    setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const retirosDe = (cuentaId) => retiros.filter(r => r.cuenta_id === cuentaId);
  const recuperosDe = (cuentaId) => recuperos.filter(r => r.cuenta_materiales_id === cuentaId);
  const anticiposDe = (cuentaId) => anticipos.filter(a => a.cuenta_id === cuentaId);
  // Anticipo total de la cuenta: suma de sus anticipos; si todavía no tiene
  // (migración no corrida), cae al monto_inicial heredado.
  const totalAnticipoDe = (c) => {
    const as = anticiposDe(c.id);
    return as.length ? as.reduce((s, a) => s + Number(a.monto || 0), 0) : Number(c.monto_inicial || 0);
  };
  const calc = (c) => {
    const rs = retirosDe(c.id);
    const anticipado = totalAnticipoDe(c);
    const retirado = rs.reduce((s, r) => s + Number(r.monto || 0), 0);
    const saldo = anticipado - retirado;
    // Recupero: total a recuperar (de los retiros con recupero) vs ya recuperado (ingresos de caja)
    const rec = recuperosDe(c.id);
    const aRecuperar = rs.reduce((s, r) => s + itemsRecupero(r).reduce((a, it) => a + it.total, 0), 0);
    const recuperado = rec.reduce((s, r) => s + Number(r.monto || 0), 0);
    const pendienteRecupero = aRecuperar - recuperado;
    // Cantidades de pallets / bolsones a devolver (de los retiros) vs devueltos (de los recuperos)
    const palletsADevolver = rs.reduce((s, r) => s + itemsRecupero(r).reduce((a, it) => a + (it.unidad === "pallet" ? it.cantidad : 0), 0), 0);
    const bolsonesADevolver = rs.reduce((s, r) => s + itemsRecupero(r).reduce((a, it) => a + (it.unidad === "bolson" ? it.cantidad : 0), 0), 0);
    const palletsDevueltos = rec.reduce((s, r) => s + Number(r.recupero_pallets || 0), 0);
    const bolsonesDevueltos = rec.reduce((s, r) => s + Number(r.recupero_bolsones || 0), 0);
    return { anticipado, retirado, saldo, n: rs.length, aRecuperar, recuperado, pendienteRecupero,
      palletsADevolver, bolsonesADevolver, palletsDevueltos, bolsonesDevueltos };
  };

  const totales = useMemo(() => {
    let inicial = 0, retirado = 0, aRecuperar = 0, recuperado = 0;
    let palletsADevolver = 0, bolsonesADevolver = 0, palletsDevueltos = 0, bolsonesDevueltos = 0;
    for (const c of cuentas) {
      const k = calc(c);
      inicial += k.anticipado;
      retirado += k.retirado;
      aRecuperar += k.aRecuperar;
      recuperado += k.recuperado;
      palletsADevolver += k.palletsADevolver;
      bolsonesADevolver += k.bolsonesADevolver;
      palletsDevueltos += k.palletsDevueltos;
      bolsonesDevueltos += k.bolsonesDevueltos;
    }
    return { inicial, retirado, saldo: inicial - retirado, aRecuperar, recuperado,
      pendienteRecupero: aRecuperar - recuperado,
      palletsADevolver, bolsonesADevolver, palletsDevueltos, bolsonesDevueltos };
  }, [cuentas, anticipos, retiros, recuperos]);

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
    if (editCuentaId) {
      // En edición no se toca el anticipo: los anticipos se gestionan dentro
      // de la cuenta (varios acopios). Sólo datos de la cuenta.
      const res = await supabase.from("cuentas_materiales").update({
        proveedor: formCuenta.proveedor.trim(),
        descripcion: formCuenta.descripcion || null,
        moneda: formCuenta.moneda,
        fecha: formCuenta.fecha || null,
      }).eq("id", editCuentaId);
      setSaving(false);
      if (res.error) { setErrCuenta(res.error.message); return; }
      setOpenCuenta(false); reload();
      return;
    }
    // Alta: creo la cuenta y su primer anticipo.
    const montoInicial = Math.max(0, Number(parseMiles(formCuenta.monto_inicial)) || 0);
    const ins = await supabase.from("cuentas_materiales").insert({
      proyecto_id: proyecto.id,
      proveedor: formCuenta.proveedor.trim(),
      descripcion: formCuenta.descripcion || null,
      moneda: formCuenta.moneda,
      monto_inicial: montoInicial, // legado; el anticipo real va en anticipos_materiales
      fecha: formCuenta.fecha || null,
    }).select("id").single();
    if (ins.error) { setSaving(false); setErrCuenta(ins.error.message); return; }
    if (montoInicial > 0) {
      const insA = await supabase.from("anticipos_materiales").insert({
        cuenta_id: ins.data.id, monto: montoInicial, fecha: formCuenta.fecha || null,
      });
      if (insA.error) { setSaving(false); setErrCuenta(insA.error.message); return; }
    }
    setSaving(false);
    setOpenCuenta(false); reload();
  };

  // ---- Anticipos (acopios sucesivos de una cuenta) ----
  const [nuevoAnticipo, setNuevoAnticipo] = useState({}); // { [cuentaId]: { monto, fecha } }
  const setAnt = (cuentaId, patch) =>
    setNuevoAnticipo(prev => ({ ...prev, [cuentaId]: { monto: "", fecha: hoyISO(), ...prev[cuentaId], ...patch } }));
  const addAnticipo = async (cuentaId) => {
    const f = nuevoAnticipo[cuentaId] || {};
    const monto = Number(parseMiles(f.monto ?? "")) || 0;
    if (monto <= 0) { alert("Ingresá el monto del anticipo."); return; }
    const { error } = await supabase.from("anticipos_materiales").insert({
      cuenta_id: cuentaId, monto, fecha: f.fecha || hoyISO(),
    });
    if (error) { alert(error.message); return; }
    setNuevoAnticipo(prev => ({ ...prev, [cuentaId]: { monto: "", fecha: hoyISO() } }));
    reload();
  };
  const delAnticipo = async (a) => {
    if (!confirm("¿Eliminar este anticipo?")) return;
    const { error } = await supabase.from("anticipos_materiales").delete().eq("id", a.id);
    if (error) alert(error.message); else reload();
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
    setNuevoRetiro(prev => ({ ...prev, [cuentaId]: { fecha: hoyISO(), descripcion: "", monto: "", file: null, recupero_items: [emptyRecItem()], ...prev[cuentaId], ...patch } }));

  // ---- Ítems de recupero del retiro en curso ----
  const recItemsDe = (cuentaId) => {
    const its = nuevoRetiro[cuentaId]?.recupero_items;
    return Array.isArray(its) && its.length ? its : [emptyRecItem()];
  };
  const addRecItem = (cuentaId) =>
    setRet(cuentaId, { recupero_items: [...recItemsDe(cuentaId), emptyRecItem()] });
  const setRecItem = (cuentaId, idx, patch) =>
    setRet(cuentaId, { recupero_items: recItemsDe(cuentaId).map((it, i) => i === idx ? { ...it, ...patch } : it) });
  const delRecItem = (cuentaId, idx) => {
    const next = recItemsDe(cuentaId).filter((_, i) => i !== idx);
    setRet(cuentaId, { recupero_items: next.length ? next : [emptyRecItem()] });
  };

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
      const recupero = !!f.recupero;
      // Normalizo los ítems cargados: descarto los que no tengan cantidad ni precio.
      const items = recupero
        ? (f.recupero_items || []).map(it => ({
            unidad: it.unidad === "bolson" ? "bolson" : "pallet",
            cantidad: Number(parseMiles(it.cantidad ?? "")) || 0,
            precio: Number(it.precio ?? 0) || 0,
          })).filter(it => it.cantidad > 0 || it.precio > 0)
          .map(it => ({ ...it, total: it.cantidad * it.precio }))
        : [];
      const recuperoTotal = items.reduce((s, it) => s + it.total, 0);
      const { error } = await supabase.from("retiros_materiales").insert({
        cuenta_id: cuentaId,
        fecha: f.fecha || hoyISO(),
        descripcion: (f.descripcion || "").trim() || null,
        monto, remito_url, remito_path,
        recupero: recupero && items.length > 0,
        recupero_items: recupero && items.length > 0 ? items : null,
        recupero_total: recupero && items.length > 0 ? recuperoTotal : null,
        // columnas planas V27 en null: ya se usa recupero_items
        recupero_unidad: null, recupero_cantidad: null, recupero_precio: null,
      });
      if (error) { alert(error.message); setSubiendo(null); return; }
      setNuevoRetiro(prev => ({ ...prev, [cuentaId]: { fecha: hoyISO(), descripcion: "", monto: "", file: null, recupero: false, recupero_items: [emptyRecItem()] } }));
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
            {totales.aRecuperar > 0 && (
              <>
                <Divider sx={{ my: 1.5 }} />
                <Grid container spacing={2}>
                  <Resumen label="Saldo a recuperar" value={fmtMoney(totales.aRecuperar, "ARS")} color="warning.main" />
                  <Resumen label="Recuperado" value={fmtMoney(totales.recuperado, "ARS")} color="success.main" />
                  <Resumen label="Pendiente de recupero" value={fmtMoney(totales.pendienteRecupero, "ARS")}
                    color={totales.pendienteRecupero <= 0 ? "success.main" : "warning.main"} />
                </Grid>
                {(totales.palletsADevolver > 0 || totales.bolsonesADevolver > 0) && (
                  <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap" }} useFlexGap>
                    {totales.palletsADevolver > 0 && (
                      <Chip size="small" variant="outlined"
                        color={totales.palletsDevueltos >= totales.palletsADevolver ? "success" : "warning"}
                        label={`Pallets: ${fmtNum0(totales.palletsDevueltos)} / ${fmtNum0(totales.palletsADevolver)} devueltos`} />
                    )}
                    {totales.bolsonesADevolver > 0 && (
                      <Chip size="small" variant="outlined"
                        color={totales.bolsonesDevueltos >= totales.bolsonesADevolver ? "success" : "warning"}
                        label={`Bolsones: ${fmtNum0(totales.bolsonesDevueltos)} / ${fmtNum0(totales.bolsonesADevolver)} devueltos`} />
                    )}
                  </Stack>
                )}
              </>
            )}
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
          const ant = anticiposDe(c.id);
          const na = nuevoAnticipo[c.id] || {};
          const nr = nuevoRetiro[c.id] || {};
          const pct = k.anticipado > 0 ? Math.min(100, (k.retirado / k.anticipado) * 100) : 0;
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
                  <Resumen sm={2.5} label={ant.length > 1 ? `Anticipo (${ant.length})` : "Anticipo"} value={fmtMoney(k.anticipado, c.moneda)} />
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

                {/* Anticipos / acopios de la cuenta */}
                <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, border: "1px dashed", borderColor: "divider", bgcolor: "rgba(15,42,74,0.02)" }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="subtitle2">Anticipos / acopios</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Total anticipado: <b>{fmtMoney(k.anticipado, c.moneda)}</b>
                    </Typography>
                  </Stack>
                  {ant.length > 0 && (
                    <Stack spacing={0.5} sx={{ mb: 1 }}>
                      {ant.map((a) => (
                        <Stack key={a.id} direction="row" alignItems="center" spacing={1}
                          sx={{ py: 0.25, borderBottom: "1px solid", borderColor: "rgba(15,42,74,0.06)" }}>
                          <Typography variant="body2" sx={{ width: 110, whiteSpace: "nowrap" }}>{a.fecha ? fmtDate(a.fecha) : "—"}</Typography>
                          <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>{fmtMoney(a.monto, c.moneda)}</Typography>
                          <Tooltip title="Eliminar anticipo"><span>
                            <IconButton size="small" disabled={ant.length === 1} onClick={() => delAnticipo(a)}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </span></Tooltip>
                        </Stack>
                      ))}
                    </Stack>
                  )}
                  <Grid container spacing={1.5} alignItems="center">
                    <Grid item xs={6} sm={3}>
                      <TextField type="date" label="Fecha" InputLabelProps={{ shrink: true }} fullWidth size="small"
                        value={na.fecha ?? hoyISO()} onChange={(e) => setAnt(c.id, { fecha: e.target.value })} />
                    </Grid>
                    <Grid item xs={6} sm={4}>
                      <TextField label={`Nuevo anticipo (${c.moneda})`} fullWidth size="small"
                        inputProps={{ inputMode: "decimal" }}
                        value={fmtMiles(na.monto ?? "")}
                        onChange={(e) => setAnt(c.id, { monto: parseMiles(e.target.value) })} />
                    </Grid>
                    <Grid item xs={12} sm={3}>
                      <Button variant="outlined" color="secondary" fullWidth size="small" startIcon={<AddIcon />}
                        onClick={() => addAnticipo(c.id)}>
                        Sumar anticipo
                      </Button>
                    </Grid>
                  </Grid>
                </Box>

                {/* Resumen de recupero de la cuenta */}
                {k.aRecuperar > 0 && (
                  <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap" }} useFlexGap>
                    <Chip size="small" color="warning" variant="outlined" label={`A recuperar: ${fmtMoney(k.aRecuperar, c.moneda)}`} />
                    <Chip size="small" color="success" variant="outlined" label={`Recuperado: ${fmtMoney(k.recuperado, c.moneda)}`} />
                    <Chip size="small" color={k.pendienteRecupero <= 0 ? "success" : "warning"}
                      label={`Pendiente: ${fmtMoney(k.pendienteRecupero, c.moneda)}`} />
                    {k.palletsADevolver > 0 && (
                      <Chip size="small" variant="outlined"
                        color={k.palletsDevueltos >= k.palletsADevolver ? "success" : "warning"}
                        label={`Pallets: ${fmtNum0(k.palletsDevueltos)} / ${fmtNum0(k.palletsADevolver)} devueltos`} />
                    )}
                    {k.bolsonesADevolver > 0 && (
                      <Chip size="small" variant="outlined"
                        color={k.bolsonesDevueltos >= k.bolsonesADevolver ? "success" : "warning"}
                        label={`Bolsones: ${fmtNum0(k.bolsonesDevueltos)} / ${fmtNum0(k.bolsonesADevolver)} devueltos`} />
                    )}
                  </Stack>
                )}

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
                          <TableCell>
                            {r.descripcion || "—"}
                            {r.recupero && itemsRecupero(r).map((it, i) => (
                              <Typography key={i} variant="caption" color="warning.main" sx={{ display: "block" }}>
                                Recupero · {fmtNum0(it.cantidad)} {it.unidad === "bolson" ? "bolsón/es" : "pallet/s"} · {fmtMoney(it.total, c.moneda)}
                              </Typography>
                            ))}
                          </TableCell>
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
                      <TextField label={`Monto (${c.moneda})`} fullWidth size="small"
                        inputProps={{ inputMode: "decimal" }}
                        value={fmtMiles(nr.monto ?? "")}
                        onChange={(e) => setRet(c.id, { monto: parseMiles(e.target.value) })} />
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

                  {/* Recupero del retiro */}
                  <Box sx={{ mt: 1.5 }}>
                    <FormControlLabel
                      control={
                        <Switch size="small" checked={!!nr.recupero}
                          onChange={(e) => setRet(c.id, { recupero: e.target.checked })} />
                      }
                      label={
                        <Stack>
                          <Typography variant="body2" fontWeight={600}>¿Presenta recupero?</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Material (pallets / bolsones) que se devuelve y genera plata a recuperar.
                          </Typography>
                        </Stack>
                      }
                      sx={{ alignItems: "flex-start", m: 0 }}
                    />
                    {nr.recupero && (() => {
                      const items = recItemsDe(c.id);
                      const granTotal = items.reduce((s, it) => {
                        const cant = Number(parseMiles(it.cantidad ?? "")) || 0;
                        const prec = Number(it.precio ?? 0) || 0;
                        return s + cant * prec;
                      }, 0);
                      return (
                        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
                          {items.map((it, idx) => {
                            const cant = Number(parseMiles(it.cantidad ?? "")) || 0;
                            const prec = Number(it.precio ?? 0) || 0;
                            return (
                              <Grid container spacing={1.5} alignItems="center" key={idx}>
                                <Grid item xs={12} sm={3}>
                                  <ToggleButtonGroup exclusive size="small" fullWidth
                                    value={it.unidad ?? "pallet"}
                                    onChange={(_, v) => v && setRecItem(c.id, idx, { unidad: v })}>
                                    <ToggleButton value="pallet">Pallet</ToggleButton>
                                    <ToggleButton value="bolson">Bolsón</ToggleButton>
                                  </ToggleButtonGroup>
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                  <TextField label="Cantidad" fullWidth size="small"
                                    inputProps={{ inputMode: "decimal" }}
                                    value={it.cantidad ?? ""}
                                    onChange={(e) => setRecItem(c.id, idx, { cantidad: e.target.value.replace(/[^\d.,]/g, "") })} />
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                  <TextField label={`Precio unitario (${c.moneda})`} fullWidth size="small"
                                    inputProps={{ inputMode: "decimal" }}
                                    value={fmtMiles(it.precio ?? "")}
                                    onChange={(e) => setRecItem(c.id, idx, { precio: parseMiles(e.target.value) })} />
                                </Grid>
                                <Grid item xs={10} sm={3}>
                                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontSize: 10, letterSpacing: 0.5, display: "block" }}>
                                    Subtotal
                                  </Typography>
                                  <Typography fontWeight={700} color="warning.main" sx={{ fontVariantNumeric: "tabular-nums" }}>
                                    {fmtMoney(cant * prec, c.moneda)}
                                  </Typography>
                                </Grid>
                                <Grid item xs={2} sm={1} sx={{ textAlign: "right" }}>
                                  <Tooltip title="Quitar ítem">
                                    <span>
                                      <IconButton size="small" disabled={items.length === 1}
                                        onClick={() => delRecItem(c.id, idx)}>
                                        <DeleteOutlineIcon fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                </Grid>
                              </Grid>
                            );
                          })}
                          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ flexWrap: "wrap", gap: 1 }}>
                            <Button size="small" startIcon={<AddIcon />} onClick={() => addRecItem(c.id)}>
                              Agregar ítem
                            </Button>
                            <Typography variant="body2">
                              Total a recuperar:{" "}
                              <Typography component="span" fontWeight={700} color="warning.main" sx={{ fontVariantNumeric: "tabular-nums" }}>
                                {fmtMoney(granTotal, c.moneda)}
                              </Typography>
                            </Typography>
                          </Stack>
                        </Stack>
                      );
                    })()}
                  </Box>
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
            {!editCuentaId && (
              <Grid item xs={12} sm={6}>
                <TextField label={`Anticipo inicial (${formCuenta.moneda})`} fullWidth
                  inputProps={{ inputMode: "decimal" }}
                  value={fmtMiles(formCuenta.monto_inicial)}
                  helperText="Primer acopio; después podés sumar más anticipos"
                  onChange={(e) => setFormCuenta({ ...formCuenta, monto_inicial: parseMiles(e.target.value) })} />
              </Grid>
            )}
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
