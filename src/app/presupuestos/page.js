"use client";
import {
  Card, CardContent, Stack, Typography, Button, Grid, Tabs, Tab, Alert,
  Table, TableBody, TableCell, TableHead, TableRow, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Box,
  Chip, Tooltip, Divider, LinearProgress, Accordion, AccordionSummary,
  AccordionDetails, useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PersonAddAlt1Icon from "@mui/icons-material/PersonAddAlt1";
import RequestQuoteIcon from "@mui/icons-material/RequestQuote";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtMoney, fmtNum, fmtPct } from "@/components/Money";

const emptyContratista = { nombre: "", telefono: "", rubro: "", observaciones: "" };
const emptyPresupuesto = {
  nombre: "", contratista_id: "", fecha: new Date().toISOString().slice(0,10),
  moneda: "ARS", estado: "activo", observaciones: "",
};
const emptyItem = { nombre: "", etapa: "", monto_presupuestado: "", avance_pct: 0, estado: "pendiente", observaciones: "" };

export default function PresupuestosPage() {
  const { proyecto } = useProjects();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);

  const [contratistas, setContratistas] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [items, setItems] = useState([]);
  const [imputaciones, setImputaciones] = useState([]); // {item_id, monto}
  const [filtroContratista, setFiltroContratista] = useState("all");

  // Dialogs
  const [openCont, setOpenCont] = useState(false);
  const [formCont, setFormCont] = useState(emptyContratista);
  const [editContId, setEditContId] = useState(null);
  const [errCont, setErrCont] = useState(null);

  const [openPres, setOpenPres] = useState(false);
  const [formPres, setFormPres] = useState(emptyPresupuesto);
  const [editPresId, setEditPresId] = useState(null);
  const [errPres, setErrPres] = useState(null);

  const [openItem, setOpenItem] = useState(false);
  const [formItem, setFormItem] = useState(emptyItem);
  const [editItemId, setEditItemId] = useState(null);
  const [itemPresId, setItemPresId] = useState(null);
  const [errItem, setErrItem] = useState(null);

  const reload = async () => {
    if (!proyecto) return;
    setLoading(true);
    const [r1, r2, r3] = await Promise.all([
      supabase.from("contratistas").select("*").eq("proyecto_id", proyecto.id).order("nombre"),
      supabase.from("presupuestos").select("*").eq("proyecto_id", proyecto.id).order("fecha", { ascending: false }),
      supabase.from("presupuesto_items").select("*").order("orden"),
    ]);
    setContratistas(r1.data ?? []);
    setPresupuestos(r2.data ?? []);
    const allItems = r3.data ?? [];
    // Solo los items de presupuestos del proyecto
    const presIds = new Set((r2.data ?? []).map(p => p.id));
    const localItems = allItems.filter(it => presIds.has(it.presupuesto_id));
    setItems(localItems);
    // Imputaciones por ítem
    const itemIds = localItems.map(i => i.id);
    if (itemIds.length > 0) {
      const { data: imp } = await supabase.from("imputaciones_pago")
        .select("item_id, monto")
        .in("item_id", itemIds);
      setImputaciones(imp ?? []);
    } else {
      setImputaciones([]);
    }
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  if (!proyecto) {
    return <Alert severity="info">Seleccioná o creá un proyecto para gestionar presupuestos.</Alert>;
  }

  const pagadoPorItem = useMemo(() => {
    const m = {};
    for (const r of imputaciones) m[r.item_id] = (m[r.item_id] || 0) + Number(r.monto || 0);
    return m;
  }, [imputaciones]);

  const itemsDe = (presId) => items.filter(it => it.presupuesto_id === presId);
  const contratistaName = (id) => contratistas.find(c => c.id === id)?.nombre ?? "—";

  // Cálculos por presupuesto
  const calcPresupuesto = (p) => {
    const its = itemsDe(p.id);
    const tot = its.reduce((s, it) => s + Number(it.monto_presupuestado || 0), 0);
    const valAvance = its.reduce((s, it) => s + Number(it.monto_presupuestado || 0) * Number(it.avance_pct || 0) / 100, 0);
    const pagado = its.reduce((s, it) => s + (pagadoPorItem[it.id] || 0), 0);
    const saldo = tot - pagado;
    const dif = valAvance - pagado;
    return { tot, valAvance, pagado, saldo, dif, nItems: its.length };
  };

  // Resumen por contratista
  const porContratista = useMemo(() => {
    return contratistas.map(c => {
      const pres = presupuestos.filter(p => p.contratista_id === c.id);
      const totales = pres.reduce((acc, p) => {
        const k = calcPresupuesto(p);
        acc.tot += k.tot;
        acc.valAvance += k.valAvance;
        acc.pagado += k.pagado;
        acc.saldo += k.saldo;
        acc.dif += k.dif;
        return acc;
      }, { tot: 0, valAvance: 0, pagado: 0, saldo: 0, dif: 0 });
      return { ...c, nPres: pres.length, ...totales };
    });
  }, [contratistas, presupuestos, items, imputaciones]);

  const presFiltrados = presupuestos.filter(p => filtroContratista === "all" || p.contratista_id === filtroContratista);

  // Dialog contratista
  const openNewCont = () => { setFormCont(emptyContratista); setEditContId(null); setErrCont(null); setOpenCont(true); };
  const openEditCont = (c) => {
    setFormCont({ nombre: c.nombre, telefono: c.telefono ?? "", rubro: c.rubro ?? "", observaciones: c.observaciones ?? "" });
    setEditContId(c.id); setErrCont(null); setOpenCont(true);
  };
  const saveCont = async () => {
    setErrCont(null);
    if (!formCont.nombre.trim()) { setErrCont("Nombre obligatorio."); return; }
    const payload = {
      proyecto_id: proyecto.id,
      nombre: formCont.nombre.trim(),
      telefono: formCont.telefono || null,
      rubro: formCont.rubro || null,
      observaciones: formCont.observaciones || null,
    };
    const res = editContId
      ? await supabase.from("contratistas").update(payload).eq("id", editContId)
      : await supabase.from("contratistas").insert(payload);
    if (res.error) { setErrCont(res.error.message); return; }
    setOpenCont(false); reload();
  };
  const delCont = async (id) => {
    if (!confirm("¿Eliminar contratista? Se eliminan también todos sus presupuestos.")) return;
    const { error } = await supabase.from("contratistas").delete().eq("id", id);
    if (error) alert(error.message); else reload();
  };

  // Dialog presupuesto
  const openNewPres = () => {
    setFormPres({ ...emptyPresupuesto, contratista_id: filtroContratista !== "all" ? filtroContratista : "" });
    setEditPresId(null); setErrPres(null); setOpenPres(true);
  };
  const openEditPres = (p) => {
    setFormPres({
      nombre: p.nombre, contratista_id: p.contratista_id, fecha: p.fecha,
      moneda: p.moneda, estado: p.estado, observaciones: p.observaciones ?? "",
    });
    setEditPresId(p.id); setErrPres(null); setOpenPres(true);
  };
  const savePres = async () => {
    setErrPres(null);
    if (!formPres.nombre.trim()) { setErrPres("Nombre obligatorio."); return; }
    if (!formPres.contratista_id) { setErrPres("Elegí un contratista."); return; }
    const payload = {
      proyecto_id: proyecto.id,
      contratista_id: formPres.contratista_id,
      nombre: formPres.nombre.trim(),
      fecha: formPres.fecha,
      moneda: formPres.moneda,
      estado: formPres.estado,
      observaciones: formPres.observaciones || null,
    };
    const res = editPresId
      ? await supabase.from("presupuestos").update(payload).eq("id", editPresId)
      : await supabase.from("presupuestos").insert(payload);
    if (res.error) { setErrPres(res.error.message); return; }
    setOpenPres(false); reload();
  };
  const delPres = async (id) => {
    if (!confirm("¿Eliminar presupuesto? También se eliminan sus ítems.")) return;
    const { error } = await supabase.from("presupuestos").delete().eq("id", id);
    if (error) alert(error.message); else reload();
  };

  // Dialog item
  const openNewItem = (presId) => {
    setItemPresId(presId);
    setFormItem(emptyItem);
    setEditItemId(null); setErrItem(null); setOpenItem(true);
  };
  const openEditItem = (it) => {
    setItemPresId(it.presupuesto_id);
    setFormItem({
      nombre: it.nombre, etapa: it.etapa ?? "",
      monto_presupuestado: it.monto_presupuestado ?? "",
      avance_pct: it.avance_pct ?? 0,
      estado: it.estado, observaciones: it.observaciones ?? "",
    });
    setEditItemId(it.id); setErrItem(null); setOpenItem(true);
  };
  const saveItem = async () => {
    setErrItem(null);
    if (!formItem.nombre.trim()) { setErrItem("Nombre obligatorio."); return; }
    const monto = Number(formItem.monto_presupuestado || 0);
    if (monto < 0) { setErrItem("Monto no puede ser negativo."); return; }
    const av = Number(formItem.avance_pct || 0);
    if (av < 0 || av > 100) { setErrItem("Avance debe estar entre 0 y 100."); return; }
    const payload = {
      presupuesto_id: itemPresId,
      nombre: formItem.nombre.trim(),
      etapa: formItem.etapa || null,
      monto_presupuestado: monto,
      avance_pct: av,
      estado: formItem.estado,
      observaciones: formItem.observaciones || null,
    };
    const res = editItemId
      ? await supabase.from("presupuesto_items").update(payload).eq("id", editItemId)
      : await supabase.from("presupuesto_items").insert(payload);
    if (res.error) { setErrItem(res.error.message); return; }
    setOpenItem(false); reload();
  };
  const delItem = async (id) => {
    if (!confirm("¿Eliminar ítem?")) return;
    const { error } = await supabase.from("presupuesto_items").delete().eq("id", id);
    if (error) alert(error.message); else reload();
  };

  // Inline update of avance %
  const updateAvance = async (itemId, av) => {
    const v = Math.max(0, Math.min(100, Number(av || 0)));
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, avance_pct: v } : it));
    const { error } = await supabase.from("presupuesto_items").update({ avance_pct: v }).eq("id", itemId);
    if (error) { alert(error.message); reload(); }
  };

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        spacing={1.5}
      >
        <Box>
          <Typography variant="h5">Presupuestos</Typography>
          <Typography variant="body2">Contratistas, ítems, avance y pagos imputados.</Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" }, "& > button": { flex: { xs: 1, sm: "initial" } } }}>
          <Button startIcon={<PersonAddAlt1Icon />} variant="outlined" onClick={openNewCont}>
            Nuevo contratista
          </Button>
          <Button startIcon={<RequestQuoteIcon />} variant="contained" color="secondary"
            disabled={contratistas.length === 0} onClick={openNewPres}>
            Nuevo presupuesto
          </Button>
        </Stack>
      </Stack>

      {loading && <LinearProgress />}

      <Box>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
          <Tab label="Presupuestos" />
          <Tab label="Resumen por contratista" />
          <Tab label="Contratistas" />
        </Tabs>
        <Divider />
      </Box>

      {/* TAB 0: Presupuestos */}
      {tab === 0 && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <TextField
              size="small" select label="Filtrar por contratista" sx={{ minWidth: 240 }}
              value={filtroContratista}
              onChange={(e) => setFiltroContratista(e.target.value)}
            >
              <MenuItem value="all">Todos los contratistas</MenuItem>
              {contratistas.map(c => <MenuItem key={c.id} value={c.id}>{c.nombre}</MenuItem>)}
            </TextField>
          </Stack>

          {presFiltrados.length === 0 ? (
            <Card><CardContent>
              <Stack alignItems="center" sx={{ py: 4 }}>
                <Typography color="text.secondary">
                  {contratistas.length === 0
                    ? "Empezá creando un contratista y luego un presupuesto."
                    : "No hay presupuestos para mostrar."}
                </Typography>
              </Stack>
            </CardContent></Card>
          ) : presFiltrados.map(p => {
            const k = calcPresupuesto(p);
            return (
              <Accordion key={p.id} disableGutters defaultExpanded={presFiltrados.length === 1}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Grid container spacing={1} alignItems="center">
                    <Grid item xs={12} sm={4}>
                      <Stack>
                        <Typography fontWeight={700}>{p.nombre}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {contratistaName(p.contratista_id)} · {p.fecha} · {p.moneda}
                        </Typography>
                      </Stack>
                    </Grid>
                    <Grid item xs={6} sm={2}>
                      <KPIInline title="Total" value={fmtMoney(k.tot, p.moneda)} />
                    </Grid>
                    <Grid item xs={6} sm={2}>
                      <KPIInline title="Avance" value={fmtMoney(k.valAvance, p.moneda)} />
                    </Grid>
                    <Grid item xs={6} sm={2}>
                      <KPIInline title="Pagado" value={fmtMoney(k.pagado, p.moneda)} />
                    </Grid>
                    <Grid item xs={6} sm={2}>
                      <KPIInline title="Saldo" value={fmtMoney(k.saldo, p.moneda)} />
                    </Grid>
                  </Grid>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mb: 1 }}>
                    <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={() => openNewItem(p.id)}>
                      Nuevo ítem
                    </Button>
                    <Button size="small" startIcon={<EditIcon />} onClick={() => openEditPres(p)}>Editar</Button>
                    <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => delPres(p.id)}>Eliminar</Button>
                  </Stack>
                  {itemsDe(p.id).length === 0 ? (
                    <Typography color="text.secondary" variant="body2">
                      Sin ítems. Agregá uno con el botón de arriba.
                    </Typography>
                  ) : (
                    <Box sx={{ overflowX: "auto" }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Ítem</TableCell>
                            <TableCell align="right">Presupuestado</TableCell>
                            <TableCell align="right" sx={{ minWidth: 110 }}>Avance %</TableCell>
                            <TableCell align="right">Valor avance</TableCell>
                            <TableCell align="right">Pagado</TableCell>
                            <TableCell align="right">Saldo</TableCell>
                            <TableCell align="right">Avance − Pagado</TableCell>
                            <TableCell align="right"></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {itemsDe(p.id).map(it => {
                            const presup = Number(it.monto_presupuestado || 0);
                            const av = Number(it.avance_pct || 0);
                            const valAv = presup * av / 100;
                            const pag = pagadoPorItem[it.id] || 0;
                            const saldo = presup - pag;
                            const dif = valAv - pag;
                            return (
                              <TableRow key={it.id} hover>
                                <TableCell>
                                  <Stack>
                                    <Typography fontWeight={600}>{it.nombre}</Typography>
                                    {it.etapa && <Typography variant="caption" color="text.secondary">{it.etapa}</Typography>}
                                  </Stack>
                                </TableCell>
                                <TableCell align="right">{fmtMoney(presup, p.moneda)}</TableCell>
                                <TableCell align="right">
                                  <TextField
                                    size="small" type="number" sx={{ width: 90 }}
                                    inputProps={{ min: 0, max: 100, step: 1 }}
                                    value={it.avance_pct ?? 0}
                                    onChange={(e) => updateAvance(it.id, e.target.value)}
                                  />
                                </TableCell>
                                <TableCell align="right">{fmtMoney(valAv, p.moneda)}</TableCell>
                                <TableCell align="right">{fmtMoney(pag, p.moneda)}</TableCell>
                                <TableCell align="right">{fmtMoney(saldo, p.moneda)}</TableCell>
                                <TableCell align="right">
                                  <Typography component="span" fontWeight={600}
                                    color={dif > 0 ? "success.main" : dif < 0 ? "error.main" : "text.primary"}>
                                    {fmtMoney(dif, p.moneda)}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right">
                                  <Tooltip title="Editar"><IconButton size="small" onClick={() => openEditItem(it)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                                  <Tooltip title="Eliminar"><IconButton size="small" onClick={() => delItem(it.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </Box>
                  )}
                  {p.observaciones && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                      {p.observaciones}
                    </Typography>
                  )}
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Stack>
      )}

      {/* TAB 1: Resumen por contratista */}
      {tab === 1 && (
        <Card>
          <CardContent>
            {porContratista.length === 0 ? (
              <Typography color="text.secondary">Sin contratistas cargados.</Typography>
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Contratista</TableCell>
                      <TableCell align="right">Presupuestos</TableCell>
                      <TableCell align="right">Total</TableCell>
                      <TableCell align="right">Avance valorizado</TableCell>
                      <TableCell align="right">Pagado</TableCell>
                      <TableCell align="right">Saldo</TableCell>
                      <TableCell align="right">Avance − Pagado</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {porContratista.map(c => (
                      <TableRow key={c.id} hover>
                        <TableCell>
                          <Stack>
                            <Typography fontWeight={600}>{c.nombre}</Typography>
                            {c.rubro && <Typography variant="caption" color="text.secondary">{c.rubro}</Typography>}
                          </Stack>
                        </TableCell>
                        <TableCell align="right">{c.nPres}</TableCell>
                        <TableCell align="right">{fmtNum(c.tot, 0)}</TableCell>
                        <TableCell align="right">{fmtNum(c.valAvance, 0)}</TableCell>
                        <TableCell align="right">{fmtNum(c.pagado, 0)}</TableCell>
                        <TableCell align="right">{fmtNum(c.saldo, 0)}</TableCell>
                        <TableCell align="right">
                          <Typography component="span" fontWeight={600}
                            color={c.dif > 0 ? "success.main" : c.dif < 0 ? "error.main" : "text.primary"}>
                            {fmtNum(c.dif, 0)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              Totales en cifras absolutas (cada presupuesto puede tener su propia moneda).
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* TAB 2: Contratistas */}
      {tab === 2 && (
        <Card>
          <CardContent>
            {contratistas.length === 0 ? (
              <Stack alignItems="center" sx={{ py: 4 }} spacing={1.5}>
                <Typography color="text.secondary">Aún no hay contratistas.</Typography>
                <Button startIcon={<PersonAddAlt1Icon />} variant="contained" color="secondary" onClick={openNewCont}>
                  Nuevo contratista
                </Button>
              </Stack>
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Nombre</TableCell>
                      <TableCell>Rubro</TableCell>
                      <TableCell>Teléfono</TableCell>
                      <TableCell>Observaciones</TableCell>
                      <TableCell align="right">Acciones</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {contratistas.map(c => (
                      <TableRow key={c.id} hover>
                        <TableCell>{c.nombre}</TableCell>
                        <TableCell>{c.rubro ?? "—"}</TableCell>
                        <TableCell>{c.telefono ?? "—"}</TableCell>
                        <TableCell>{c.observaciones ?? "—"}</TableCell>
                        <TableCell align="right">
                          <Tooltip title="Editar"><IconButton size="small" onClick={() => openEditCont(c)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Eliminar"><IconButton size="small" onClick={() => delCont(c.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
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

      {/* DIALOG: contratista */}
      <Dialog open={openCont} onClose={() => setOpenCont(false)} fullWidth maxWidth="sm" fullScreen={fullScreen}>
        <DialogTitle>{editContId ? "Editar contratista" : "Nuevo contratista"}</DialogTitle>
        <DialogContent dividers>
          {errCont && <Alert severity="error" sx={{ mb: 2 }}>{errCont}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={12}><TextField label="Nombre" fullWidth required value={formCont.nombre}
              onChange={e => setFormCont({ ...formCont, nombre: e.target.value })} /></Grid>
            <Grid item xs={12} sm={6}><TextField label="Teléfono" fullWidth value={formCont.telefono}
              onChange={e => setFormCont({ ...formCont, telefono: e.target.value })} /></Grid>
            <Grid item xs={12} sm={6}><TextField label="Rubro" fullWidth value={formCont.rubro}
              onChange={e => setFormCont({ ...formCont, rubro: e.target.value })} /></Grid>
            <Grid item xs={12}><TextField label="Observaciones" fullWidth multiline minRows={2}
              value={formCont.observaciones}
              onChange={e => setFormCont({ ...formCont, observaciones: e.target.value })} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenCont(false)}>Cancelar</Button>
          <Button variant="contained" color="secondary" onClick={saveCont}>
            {editContId ? "Guardar" : "Crear"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* DIALOG: presupuesto */}
      <Dialog open={openPres} onClose={() => setOpenPres(false)} fullWidth maxWidth="sm" fullScreen={fullScreen}>
        <DialogTitle>{editPresId ? "Editar presupuesto" : "Nuevo presupuesto"}</DialogTitle>
        <DialogContent dividers>
          {errPres && <Alert severity="error" sx={{ mb: 2 }}>{errPres}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={8}>
              <TextField label="Nombre" fullWidth required value={formPres.nombre}
                onChange={e => setFormPres({ ...formPres, nombre: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField select label="Moneda" fullWidth value={formPres.moneda}
                onChange={e => setFormPres({ ...formPres, moneda: e.target.value })}>
                <MenuItem value="ARS">ARS ($)</MenuItem>
                <MenuItem value="USD">USD</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField select label="Contratista" fullWidth required value={formPres.contratista_id}
                onChange={e => setFormPres({ ...formPres, contratista_id: e.target.value })}>
                {contratistas.length === 0 && <MenuItem value="" disabled>Sin contratistas</MenuItem>}
                {contratistas.map(c => <MenuItem key={c.id} value={c.id}>{c.nombre}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField label="Fecha" type="date" fullWidth InputLabelProps={{ shrink: true }}
                value={formPres.fecha}
                onChange={e => setFormPres({ ...formPres, fecha: e.target.value })} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField select label="Estado" fullWidth value={formPres.estado}
                onChange={e => setFormPres({ ...formPres, estado: e.target.value })}>
                <MenuItem value="activo">Activo</MenuItem>
                <MenuItem value="cerrado">Cerrado</MenuItem>
                <MenuItem value="cancelado">Cancelado</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField label="Observaciones" fullWidth multiline minRows={2}
                value={formPres.observaciones}
                onChange={e => setFormPres({ ...formPres, observaciones: e.target.value })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenPres(false)}>Cancelar</Button>
          <Button variant="contained" color="secondary" onClick={savePres}>
            {editPresId ? "Guardar" : "Crear"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* DIALOG: item */}
      <Dialog open={openItem} onClose={() => setOpenItem(false)} fullWidth maxWidth="sm" fullScreen={fullScreen}>
        <DialogTitle>{editItemId ? "Editar ítem" : "Nuevo ítem"}</DialogTitle>
        <DialogContent dividers>
          {errItem && <Alert severity="error" sx={{ mb: 2 }}>{errItem}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={8}>
              <TextField label="Nombre" fullWidth required value={formItem.nombre}
                onChange={e => setFormItem({ ...formItem, nombre: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField select label="Estado" fullWidth value={formItem.estado}
                onChange={e => setFormItem({ ...formItem, estado: e.target.value })}>
                <MenuItem value="pendiente">Pendiente</MenuItem>
                <MenuItem value="en_curso">En curso</MenuItem>
                <MenuItem value="terminado">Terminado</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Etapa (opcional)" fullWidth value={formItem.etapa}
                onChange={e => setFormItem({ ...formItem, etapa: e.target.value })} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField label="Monto presupuestado" type="number" fullWidth
                value={formItem.monto_presupuestado}
                onChange={e => setFormItem({ ...formItem, monto_presupuestado: e.target.value })} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField label="Avance %" type="number" fullWidth
                inputProps={{ min: 0, max: 100, step: 1 }}
                value={formItem.avance_pct}
                onChange={e => setFormItem({ ...formItem, avance_pct: e.target.value })} />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Observaciones" fullWidth multiline minRows={2}
                value={formItem.observaciones}
                onChange={e => setFormItem({ ...formItem, observaciones: e.target.value })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenItem(false)}>Cancelar</Button>
          <Button variant="contained" color="secondary" onClick={saveItem}>
            {editItemId ? "Guardar" : "Crear"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function KPIInline({ title, value }) {
  return (
    <Stack>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.4, fontSize: 10 }}>
        {title}
      </Typography>
      <Typography fontWeight={700} sx={{ fontSize: { xs: 14, sm: 15 }, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Typography>
    </Stack>
  );
}
