"use client";
import {
  Card, CardContent, Stack, Typography, Box, Button, TextField, MenuItem,
  Alert, IconButton, Chip, LinearProgress, Tooltip, Grid,
  ToggleButton, ToggleButtonGroup,
} from "@mui/material";
import KeyboardVoiceIcon from "@mui/icons-material/KeyboardVoice";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import CloseIcon from "@mui/icons-material/Close";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtMoney } from "@/components/Money";

const TITULARES = ["Rodrigo", "Juan"];
const MONEDAS = ["ARS", "USD"];
const ETIQUETAS = ["NORMAL", "URGENTE"];
const TIPOS_CAJA = [
  { value: "egreso", label: "Egreso (gasto)" },
  { value: "ingreso", label: "Ingreso" },
  { value: "cambio", label: "Cambio de moneda" },
  { value: "traspaso", label: "Traspaso entre cajas" },
];
const hoyISO = () => new Date().toISOString().slice(0, 10);

function faltantesCaja(d) {
  if (!d) return [];
  const f = [];
  const monto = Number(d.monto || 0);
  if (d.tipo === "cambio") {
    if (!(monto > 0)) f.push("monto");
    if (!(Number(d.tipo_cambio) > 0)) f.push("tipo_cambio");
    if (!d.moneda) f.push("moneda");
    if (!d.moneda_destino) f.push("moneda_destino");
    if (d.moneda && d.moneda_destino && d.moneda === d.moneda_destino) f.push("moneda_destino");
  } else if (d.tipo === "traspaso") {
    if (!d.titular) f.push("titular");
    if (!d.titular_destino) f.push("titular_destino");
    if (d.titular && d.titular_destino && d.titular === d.titular_destino) f.push("titular_destino");
    if (!d.moneda) f.push("moneda");
    if (!(monto > 0)) f.push("monto");
  } else {
    if (!d.titular) f.push("titular");
    if (!d.moneda) f.push("moneda");
    if (!(monto > 0)) f.push("monto");
  }
  return f;
}
function faltantesTarea(d) {
  if (!d) return [];
  return (d.titulo || "").trim() ? [] : ["titulo"];
}
function faltantesRetiro(d) {
  if (!d) return [];
  const f = [];
  if (!d.proveedor) f.push("proveedor");
  if (!(Number(d.monto) > 0)) f.push("monto");
  return f;
}

function buildCajaPayload(d, proyectoId, categoriaFinal, comprobante_url) {
  const monto = Number(d.monto || 0);
  const base = {
    proyecto_id: proyectoId,
    fecha: d.fecha || hoyISO(),
    descripcion: (d.descripcion || "").trim() || null,
    comprobante_url: comprobante_url || null,
  };
  if (d.tipo === "traspaso") {
    return { ...base, tipo: "traspaso", titular: d.titular, titular_destino: d.titular_destino,
      moneda: d.moneda, monto, categoria: null, concepto: null, etapa: null,
      moneda_destino: null, tipo_cambio: null, monto_destino: null,
      con_cambio: false, cambio_moneda_origen: null, cambio_monto_origen: null, cambio_tipo_cambio: null };
  }
  if (d.tipo === "cambio") {
    const tc = Number(d.tipo_cambio || 0);
    const monto_destino = d.moneda === "USD" ? monto * tc : (tc > 0 ? monto / tc : 0);
    return { ...base, tipo: "cambio", titular: d.titular || null, titular_destino: d.titular_destino || null,
      moneda: d.moneda, monto, categoria: null, etapa: null,
      moneda_destino: d.moneda_destino, tipo_cambio: tc, monto_destino,
      con_cambio: false, cambio_moneda_origen: null, cambio_monto_origen: null, cambio_tipo_cambio: null };
  }
  const esEgreso = d.tipo === "egreso";
  return { ...base, tipo: d.tipo, titular: d.titular || null, moneda: d.moneda, monto,
    categoria: esEgreso ? (categoriaFinal || null) : null, concepto: null,
    etapa: esEgreso ? (d.etapa || null) : null,
    moneda_destino: null, tipo_cambio: null, monto_destino: null,
    con_cambio: false, cambio_moneda_origen: null, cambio_monto_origen: null, cambio_tipo_cambio: null,
    tipo_cambio_gasto: esEgreso && d.moneda === "ARS" && Number(d.tipo_cambio) > 0 ? Number(d.tipo_cambio) : null,
    recupero_materiales: false, cuenta_materiales_id: null, anticipo_materiales: false };
}

export default function CargaPage() {
  const { proyecto } = useProjects();

  const [tipoCarga, setTipoCarga] = useState("caja"); // caja | tarea | retiro
  const [soportaVoz, setSoportaVoz] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [texto, setTexto] = useState("");
  const [interpretando, setInterpretando] = useState(false);
  const [draft, setDraft] = useState(null);
  const [nota, setNota] = useState(null);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(null);
  const [file, setFile] = useState(null);

  const [etapas, setEtapas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [gastoMesUSD, setGastoMesUSD] = useState(0);

  const recRef = useRef(null);
  const fileRef = useRef(null);
  const escuchandoRef = useRef(false); // intención de seguir escuchando (tocar para frenar)
  const baseRef = useRef("");          // texto acumulado de sesiones previas
  const sesionRef = useRef("");        // texto de la sesión de reconocimiento en curso

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSoportaVoz(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  const cargarGasto = async () => {
    const desde = hoyISO().slice(0, 8) + "01";
    const { data } = await supabase.from("ia_uso").select("costo_usd").gte("fecha", desde);
    setGastoMesUSD((data ?? []).reduce((s, r) => s + Number(r.costo_usd || 0), 0));
  };
  const cargarContexto = async () => {
    if (!proyecto) return;
    const [hs, cats, cms] = await Promise.all([
      supabase.from("hitos").select("nombre,orden").eq("proyecto_id", proyecto.id).order("orden"),
      supabase.from("categorias_egreso").select("nombre").order("nombre"),
      supabase.from("cuentas_materiales").select("id,proveedor,moneda").eq("proyecto_id", proyecto.id).order("fecha", { ascending: false }),
    ]);
    setEtapas((hs.data ?? []).map((h) => h.nombre));
    setCategorias((cats.data ?? []).map((c) => c.nombre));
    setCuentas(cms.data ?? []);
    await cargarGasto();
  };
  useEffect(() => { cargarContexto(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const escuchar = () => {
    setError(null); setOk(null);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    // Arranca a partir de lo que ya hubiera en el campo (permite agregar dictando).
    baseRef.current = texto ? texto.replace(/\s+$/, "") + " " : "";
    sesionRef.current = "";
    escuchandoRef.current = true;
    setEscuchando(true);
    arrancarRec(SR);
  };

  // Crea y arranca una sesión de reconocimiento. Mientras el usuario no toque
  // "frenar", se reinicia sola en cada corte (silencio / fin de móvil).
  const arrancarRec = (SR) => {
    const rec = new SR();
    rec.lang = "es-AR";
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = true;
    rec.onresult = (e) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      sesionRef.current = s;
      setTexto(baseRef.current + s);
    };
    rec.onerror = (ev) => {
      // Sin permiso de micrófono: cortamos de verdad.
      if (ev?.error === "not-allowed" || ev?.error === "service-not-allowed") {
        escuchandoRef.current = false;
        setEscuchando(false);
        setError("No hay permiso de micrófono. Habilitalo en el navegador o dictá con el teclado.");
      }
    };
    rec.onend = () => {
      // Acumulo lo dicho en esta sesión.
      if (sesionRef.current) baseRef.current = (baseRef.current + sesionRef.current).replace(/\s+$/, "") + " ";
      sesionRef.current = "";
      // Si el usuario no frenó, reinicio para que no se corte en los silencios.
      if (escuchandoRef.current) {
        try { rec.start(); } catch { escuchandoRef.current = false; setEscuchando(false); }
      } else {
        setEscuchando(false);
      }
    };
    recRef.current = rec;
    try { rec.start(); } catch {}
  };

  const parar = () => {
    escuchandoRef.current = false;
    try { recRef.current?.stop(); } catch {}
    setEscuchando(false);
  };
  useEffect(() => () => { escuchandoRef.current = false; try { recRef.current?.stop(); } catch {} }, []);

  const cambiarTipo = (t) => {
    if (!t) return;
    setTipoCarga(t);
    setDraft(null); setNota(null); setError(null); setOk(null); setFile(null);
  };

  const cuentaDe = (prov) => cuentas.find((c) => (c.proveedor || "").toLowerCase() === String(prov || "").toLowerCase());

  const interpretar = async () => {
    const t = texto.trim();
    if (!t) { setError("Primero dictá o escribí lo que querés cargar."); return; }
    setError(null); setOk(null); setInterpretando(true); setDraft(null); setNota(null);
    try {
      const res = await fetch("/api/ia/captura", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tipo: tipoCarga, texto: t, hoy: hoyISO(),
          titulares: TITULARES, etapas, categorias,
          cuentas: cuentas.map((c) => ({ proveedor: c.proveedor, moneda: c.moneda })),
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        const msg = {
          FALTA_API_KEY: "Falta configurar la API key (ANTHROPIC_API_KEY) en Vercel.",
          SIN_TEXTO: "No se entendió el texto. Probá de nuevo.",
          PARSEO: "No pude interpretar la respuesta. Reformulá la frase.",
          API_ERROR: "Error del asistente: " + (data.detalle || ""),
          RED: "Error de red: " + (data.detalle || ""),
        }[data.error] || ("Error: " + (data.error || "desconocido"));
        setError(msg);
        return;
      }
      if (data.usage) {
        await supabase.from("ia_uso").insert({
          proyecto_id: proyecto?.id ?? null, tipo: tipoCarga, modelo: data.usage.modelo,
          input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens, costo_usd: data.usage.costo_usd,
        });
        cargarGasto();
      }
      const d = data.draft || {};
      if (tipoCarga === "tarea") {
        setDraft({
          titulo: d.titulo || "", responsable: d.responsable || "", fecha: d.fecha || "",
          etiqueta: ETIQUETAS.includes(d.etiqueta) ? d.etiqueta : "NORMAL", observacion: d.observacion || "",
        });
      } else if (tipoCarga === "retiro") {
        const c = cuentaDe(d.proveedor);
        setDraft({
          proveedor: c?.proveedor || "", monto: d.monto ?? "",
          etapa: etapas.includes(d.etapa) ? d.etapa : "", fecha: d.fecha || hoyISO(),
          remito_nro: d.remito_nro || "", tipo_cambio: d.tipo_cambio ?? "", descripcion: d.descripcion || "",
        });
      } else {
        setDraft({
          tipo: d.tipo || "egreso", fecha: d.fecha || hoyISO(),
          titular: TITULARES.includes(d.titular) ? d.titular : "",
          titular_destino: TITULARES.includes(d.titular_destino) ? d.titular_destino : "",
          moneda: MONEDAS.includes(d.moneda) ? d.moneda : "ARS", monto: d.monto ?? "",
          moneda_destino: MONEDAS.includes(d.moneda_destino) ? d.moneda_destino : "ARS",
          tipo_cambio: d.tipo_cambio ?? "", categoria: d.categoria || "",
          etapa: etapas.includes(d.etapa) ? d.etapa : "", descripcion: d.descripcion || "",
        });
      }
      setNota(d.nota || (Array.isArray(d.faltantes) && d.faltantes.length ? `Faltan datos: ${d.faltantes.join(", ")}` : null));
    } catch (e) {
      setError("Error: " + String(e?.message || e));
    } finally {
      setInterpretando(false);
    }
  };

  const ensureCategoria = async (nombre) => {
    const n = (nombre ?? "").trim();
    if (!n) return null;
    if (categorias.some((c) => c.toLowerCase() === n.toLowerCase())) return n;
    const { error } = await supabase.from("categorias_egreso").insert({ nombre: n });
    if (error && !String(error.message).toLowerCase().includes("duplicate")) throw error;
    return n;
  };

  const subirArchivo = async (bucket, path) => {
    const up = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
    if (up.error) throw new Error("Subiendo archivo: " + up.error.message);
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl ?? null;
  };

  const confirmar = async () => {
    if (!proyecto) { setError("Seleccioná un proyecto."); return; }
    const falta = faltaActual;
    if (falta.length) { setError("Completá los campos marcados antes de confirmar."); return; }
    setGuardando(true); setError(null);
    try {
      if (tipoCarga === "tarea") {
        const { error } = await supabase.from("temas").insert({
          proyecto_id: proyecto.id, titulo: draft.titulo.trim(),
          responsable: (draft.responsable || "").trim() || null,
          fecha: draft.fecha || null, etiqueta: draft.etiqueta || "NORMAL",
          observacion: (draft.observacion || "").trim() || null, completado: false, orden: 0,
        });
        if (error) { setError(error.message); return; }
        setOk("Tarea guardada ✔");
      } else if (tipoCarga === "retiro") {
        const c = cuentaDe(draft.proveedor);
        if (!c) { setError("La cuenta del proveedor no existe. Creala primero en Materiales."); return; }
        let remito_url = null, remito_path = null;
        if (file) {
          const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
          remito_path = `${proyecto.id}/materiales/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
          remito_url = await subirArchivo("galeria", remito_path);
        }
        const { error } = await supabase.from("retiros_materiales").insert({
          cuenta_id: c.id, fecha: draft.fecha || hoyISO(),
          descripcion: (draft.descripcion || "").trim() || null,
          monto: Number(draft.monto || 0),
          etapa: draft.etapa || null,
          tipo_cambio: c.moneda === "ARS" && Number(draft.tipo_cambio) > 0 ? Number(draft.tipo_cambio) : null,
          remito_nro: (draft.remito_nro || "").trim() || null,
          remito_url, remito_path, recupero: false,
        });
        if (error) { setError(error.message); return; }
        setOk("Retiro de materiales guardado ✔");
      } else {
        let categoriaFinal = null;
        if (draft.tipo === "egreso" && draft.categoria) categoriaFinal = await ensureCategoria(draft.categoria);
        let comprobante_url = null;
        if (file) {
          const safe = file.name.replace(/[^\w.\-]/g, "_");
          const path = `${proyecto.id}/${Date.now()}_${safe}`;
          await subirArchivo("comprobantes", path);
          comprobante_url = path; // Caja guarda el path y resuelve la URL al mostrar
        }
        const payload = buildCajaPayload(draft, proyecto.id, categoriaFinal, comprobante_url);
        const { error } = await supabase.from("movimientos_caja").insert(payload);
        if (error) { setError(error.message); return; }
        setOk("Movimiento guardado en Caja ✔");
      }
      setDraft(null); setTexto(""); setNota(null); setFile(null);
    } catch (e) {
      setError("Error guardando: " + String(e?.message || e));
    } finally {
      setGuardando(false);
    }
  };

  const cancelar = () => { setDraft(null); setNota(null); setError(null); setFile(null); };

  const faltaActual = useMemo(() => {
    if (tipoCarga === "tarea") return faltantesTarea(draft);
    if (tipoCarga === "retiro") return faltantesRetiro(draft);
    return faltantesCaja(draft);
  }, [tipoCarga, draft]);
  const falta = useMemo(() => new Set(faltaActual), [faltaActual]);
  const upd = (campo, val) => setDraft((d) => ({ ...d, [campo]: val }));

  const placeholder = {
    caja: 'Ej: "Pagué 200 mil a Juan por el contrapiso, de la caja de Rodrigo"',
    tarea: 'Ej: "Recordale a Juan comprar la membrana el viernes, urgente"',
    retiro: 'Ej: "Retiré 80 mil de la cuenta de Materiales Moreno para la estructura"',
  }[tipoCarga];

  const conArchivo = tipoCarga === "caja" || tipoCarga === "retiro";
  const labelArchivo = tipoCarga === "retiro" ? "Adjuntar remito (foto)" : "Adjuntar comprobante";

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto para cargar.</Alert>;

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 640, mx: "auto" }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5">Carga rápida por voz</Typography>
          <Typography variant="body2" color="text.secondary">
            Elegí qué cargar, contalo, revisá y confirmá.
          </Typography>
        </Box>
        <Tooltip title="Gasto del asistente este mes (USD)">
          <Chip size="small" variant="outlined" label={`IA: ${fmtMoney(gastoMesUSD, "USD")}/mes`} />
        </Tooltip>
      </Stack>

      <ToggleButtonGroup exclusive fullWidth value={tipoCarga} onChange={(_, v) => cambiarTipo(v)} size="small">
        <ToggleButton value="caja">Caja</ToggleButton>
        <ToggleButton value="tarea">Tarea</ToggleButton>
        <ToggleButton value="retiro">Retiro material</ToggleButton>
      </ToggleButtonGroup>

      {/* Captura */}
      <Card>
        <CardContent>
          <Stack spacing={2} alignItems="center">
            {soportaVoz ? (
              <IconButton onClick={escuchando ? parar : escuchar}
                sx={{ width: 96, height: 96, color: "#fff",
                  bgcolor: escuchando ? "error.main" : "secondary.main",
                  "&:hover": { bgcolor: escuchando ? "error.dark" : "secondary.dark" }, boxShadow: 3 }}>
                {escuchando ? <StopCircleIcon sx={{ fontSize: 48 }} /> : <KeyboardVoiceIcon sx={{ fontSize: 48 }} />}
              </IconButton>
            ) : (
              <Alert severity="info" sx={{ width: "100%" }}>
                Este navegador no tiene dictado por voz. Usá el micrófono del teclado del celular en el campo de abajo.
              </Alert>
            )}
            <Typography variant="caption" color="text.secondary">
              {escuchando ? "Escuchando… tocá para frenar" : soportaVoz ? "Tocá para hablar" : "Dictá con el teclado"}
            </Typography>
            <TextField fullWidth multiline minRows={2} label="Lo que dijiste (podés editarlo)"
              placeholder={placeholder} value={texto} onChange={(e) => setTexto(e.target.value)} />
            <Button fullWidth variant="contained" startIcon={<AutoAwesomeIcon />}
              onClick={interpretar} disabled={interpretando || !texto.trim()}>
              {interpretando ? "Interpretando…" : "Interpretar"}
            </Button>
            {interpretando && <LinearProgress sx={{ width: "100%" }} />}
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {ok && <Alert severity="success" onClose={() => setOk(null)}>{ok}</Alert>}

      {draft && (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="subtitle1" fontWeight={700}>Revisá y confirmá</Typography>
              {nota && <Alert severity="warning">{nota}</Alert>}

              {/* ---------- TAREA ---------- */}
              {tipoCarga === "tarea" && (
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField fullWidth label="Tarea" error={falta.has("titulo")}
                      value={draft.titulo} onChange={(e) => upd("titulo", e.target.value)} />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField fullWidth label="Responsable" value={draft.responsable}
                      onChange={(e) => upd("responsable", e.target.value)} />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField fullWidth type="date" label="Fecha límite" InputLabelProps={{ shrink: true }}
                      value={draft.fecha} onChange={(e) => upd("fecha", e.target.value)} />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField select fullWidth label="Etiqueta" value={draft.etiqueta}
                      onChange={(e) => upd("etiqueta", e.target.value)}>
                      {ETIQUETAS.map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth label="Observación" value={draft.observacion}
                      onChange={(e) => upd("observacion", e.target.value)} />
                  </Grid>
                </Grid>
              )}

              {/* ---------- RETIRO ---------- */}
              {tipoCarga === "retiro" && (
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField select fullWidth label="Cuenta (proveedor)" error={falta.has("proveedor")}
                      value={draft.proveedor} onChange={(e) => upd("proveedor", e.target.value)}
                      helperText={cuentas.length === 0 ? "No hay cuentas de materiales. Creá una en Materiales." : " "}>
                      <MenuItem value="">—</MenuItem>
                      {cuentas.map((c) => <MenuItem key={c.id} value={c.proveedor}>{c.proveedor} ({c.moneda})</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid item xs={6}>
                    <TextField fullWidth type="number" label="Monto" error={falta.has("monto")}
                      value={draft.monto} onChange={(e) => upd("monto", e.target.value)} />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField fullWidth type="date" label="Fecha" InputLabelProps={{ shrink: true }}
                      value={draft.fecha} onChange={(e) => upd("fecha", e.target.value)} />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField select fullWidth label="Etapa" value={draft.etapa}
                      onChange={(e) => upd("etapa", e.target.value)}>
                      <MenuItem value="">—</MenuItem>
                      {etapas.map((et) => <MenuItem key={et} value={et}>{et}</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid item xs={6}>
                    <TextField fullWidth label="N° de remito" value={draft.remito_nro}
                      onChange={(e) => upd("remito_nro", e.target.value)} />
                  </Grid>
                  {cuentaDe(draft.proveedor)?.moneda === "ARS" && (
                    <Grid item xs={6}>
                      <TextField fullWidth type="number" label="TC para valuar en USD (opcional)"
                        value={draft.tipo_cambio} onChange={(e) => upd("tipo_cambio", e.target.value)} />
                    </Grid>
                  )}
                  <Grid item xs={12}>
                    <TextField fullWidth label="Detalle del material" value={draft.descripcion}
                      onChange={(e) => upd("descripcion", e.target.value)} />
                  </Grid>
                </Grid>
              )}

              {/* ---------- CAJA ---------- */}
              {tipoCarga === "caja" && (
                <>
                  <TextField select label="Tipo" value={draft.tipo} onChange={(e) => upd("tipo", e.target.value)}>
                    {TIPOS_CAJA.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                  </TextField>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <TextField fullWidth type="date" label="Fecha" InputLabelProps={{ shrink: true }}
                        value={draft.fecha} onChange={(e) => upd("fecha", e.target.value)} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth type="number" label="Monto" error={falta.has("monto")}
                        value={draft.monto} onChange={(e) => upd("monto", e.target.value)} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField select fullWidth
                        label={draft.tipo === "cambio" || draft.tipo === "traspaso" ? "Caja origen" : "Caja"}
                        error={falta.has("titular")} value={draft.titular} onChange={(e) => upd("titular", e.target.value)}>
                        <MenuItem value="">—</MenuItem>
                        {TITULARES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                      </TextField>
                    </Grid>
                    <Grid item xs={6}>
                      <TextField select fullWidth label={draft.tipo === "cambio" ? "Moneda que sale" : "Moneda"}
                        error={falta.has("moneda")} value={draft.moneda} onChange={(e) => upd("moneda", e.target.value)}>
                        {MONEDAS.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                      </TextField>
                    </Grid>
                    {(draft.tipo === "traspaso" || draft.tipo === "cambio") && (
                      <Grid item xs={6}>
                        <TextField select fullWidth label="Caja destino" error={falta.has("titular_destino")}
                          value={draft.titular_destino} onChange={(e) => upd("titular_destino", e.target.value)}>
                          <MenuItem value="">—</MenuItem>
                          {TITULARES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                        </TextField>
                      </Grid>
                    )}
                    {draft.tipo === "cambio" && (
                      <>
                        <Grid item xs={6}>
                          <TextField select fullWidth label="Moneda que entra" error={falta.has("moneda_destino")}
                            value={draft.moneda_destino} onChange={(e) => upd("moneda_destino", e.target.value)}>
                            {MONEDAS.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                          </TextField>
                        </Grid>
                        <Grid item xs={6}>
                          <TextField fullWidth type="number" label="Tipo de cambio" error={falta.has("tipo_cambio")}
                            value={draft.tipo_cambio} onChange={(e) => upd("tipo_cambio", e.target.value)} />
                        </Grid>
                      </>
                    )}
                    {draft.tipo === "egreso" && (
                      <>
                        <Grid item xs={6}>
                          <TextField fullWidth label="Categoría" value={draft.categoria}
                            onChange={(e) => upd("categoria", e.target.value)} />
                        </Grid>
                        <Grid item xs={6}>
                          <TextField select fullWidth label="Etapa" value={draft.etapa}
                            onChange={(e) => upd("etapa", e.target.value)}>
                            <MenuItem value="">—</MenuItem>
                            {etapas.map((et) => <MenuItem key={et} value={et}>{et}</MenuItem>)}
                          </TextField>
                        </Grid>
                        {draft.moneda === "ARS" && (
                          <Grid item xs={6}>
                            <TextField fullWidth type="number" label="TC para valuar en USD (opcional)"
                              value={draft.tipo_cambio} onChange={(e) => upd("tipo_cambio", e.target.value)} />
                          </Grid>
                        )}
                      </>
                    )}
                    <Grid item xs={12}>
                      <TextField fullWidth label="Detalle / observación" value={draft.descripcion}
                        onChange={(e) => upd("descripcion", e.target.value)} />
                    </Grid>
                  </Grid>
                </>
              )}

              {/* Adjuntar archivo (caja / retiro) */}
              {conArchivo && (
                <Box>
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden
                    onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  {file ? (
                    <Chip label={file.name} onDelete={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                      deleteIcon={<CloseIcon />} variant="outlined" />
                  ) : (
                    <Button variant="outlined" startIcon={<AttachFileIcon />} onClick={() => fileRef.current?.click()}>
                      {labelArchivo}
                    </Button>
                  )}
                </Box>
              )}

              <Stack direction="row" spacing={1}>
                <Button variant="outlined" color="inherit" startIcon={<RestartAltIcon />} onClick={cancelar} sx={{ flexShrink: 0 }}>
                  Descartar
                </Button>
                <Button fullWidth variant="contained" color="success" startIcon={<CheckCircleIcon />}
                  onClick={confirmar} disabled={guardando || falta.size > 0}>
                  {guardando ? "Guardando…" : "Confirmar y guardar"}
                </Button>
              </Stack>
              {falta.size > 0 && (
                <Typography variant="caption" color="error">Completá los campos en rojo para poder guardar.</Typography>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
        Podés activar o desactivar esta pantalla desde <b>Ajustes</b>.
      </Typography>
    </Stack>
  );
}
