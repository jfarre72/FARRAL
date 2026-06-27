"use client";
import {
  Card, CardContent, Stack, Typography, Box, Button, TextField, MenuItem,
  Alert, IconButton, Chip, Switch, FormControlLabel, LinearProgress, Divider,
  Tooltip, Grid,
} from "@mui/material";
import KeyboardVoiceIcon from "@mui/icons-material/KeyboardVoice";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useProjects } from "@/components/ProjectContext";
import { fmtMoney } from "@/components/Money";
import { vozEnabled, setVozEnabled } from "@/lib/vozConfig";

const TITULARES = ["Rodrigo", "Juan"];
const MONEDAS = ["ARS", "USD"];
const TIPOS = [
  { value: "egreso", label: "Egreso (gasto)" },
  { value: "ingreso", label: "Ingreso" },
  { value: "cambio", label: "Cambio de moneda" },
  { value: "traspaso", label: "Traspaso entre cajas" },
];
const hoyISO = () => new Date().toISOString().slice(0, 10);

// Campos obligatorios faltantes según el tipo de movimiento.
function faltantes(d) {
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
    // egreso / ingreso
    if (!d.titular) f.push("titular");
    if (!d.moneda) f.push("moneda");
    if (!(monto > 0)) f.push("monto");
  }
  return f;
}

// Construye el registro para insertar en movimientos_caja (espeja la lógica de Caja).
function buildPayload(d, proyectoId, categoriaFinal) {
  const monto = Number(d.monto || 0);
  const base = {
    proyecto_id: proyectoId,
    fecha: d.fecha || hoyISO(),
    descripcion: (d.descripcion || "").trim() || null,
    comprobante_url: null,
  };
  if (d.tipo === "traspaso") {
    return {
      ...base, tipo: "traspaso",
      titular: d.titular, titular_destino: d.titular_destino,
      moneda: d.moneda, monto,
      categoria: null, concepto: null, etapa: null,
      moneda_destino: null, tipo_cambio: null, monto_destino: null,
      con_cambio: false, cambio_moneda_origen: null, cambio_monto_origen: null, cambio_tipo_cambio: null,
    };
  }
  if (d.tipo === "cambio") {
    const tc = Number(d.tipo_cambio || 0);
    const monto_destino = d.moneda === "USD" ? monto * tc : (tc > 0 ? monto / tc : 0);
    return {
      ...base, tipo: "cambio",
      titular: d.titular || null, titular_destino: d.titular_destino || null,
      moneda: d.moneda, monto,
      categoria: null, etapa: null,
      moneda_destino: d.moneda_destino, tipo_cambio: tc, monto_destino,
      con_cambio: false, cambio_moneda_origen: null, cambio_monto_origen: null, cambio_tipo_cambio: null,
    };
  }
  // egreso / ingreso
  const esEgreso = d.tipo === "egreso";
  return {
    ...base, tipo: d.tipo,
    titular: d.titular || null,
    moneda: d.moneda, monto,
    categoria: esEgreso ? (categoriaFinal || null) : null,
    concepto: null,
    etapa: esEgreso ? (d.etapa || null) : null,
    moneda_destino: null, tipo_cambio: null, monto_destino: null,
    con_cambio: false, cambio_moneda_origen: null, cambio_monto_origen: null, cambio_tipo_cambio: null,
    tipo_cambio_gasto: esEgreso && d.moneda === "ARS" && Number(d.tipo_cambio) > 0 ? Number(d.tipo_cambio) : null,
    recupero_materiales: false, cuenta_materiales_id: null, anticipo_materiales: false,
  };
}

export default function CargaPage() {
  const { proyecto } = useProjects();
  const router = useRouter();

  const [activado, setActivado] = useState(true);
  const [soportaVoz, setSoportaVoz] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [texto, setTexto] = useState("");
  const [interpretando, setInterpretando] = useState(false);
  const [draft, setDraft] = useState(null);
  const [nota, setNota] = useState(null);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(null);

  const [etapas, setEtapas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [gastoMesUSD, setGastoMesUSD] = useState(0);

  const recRef = useRef(null);

  useEffect(() => { setActivado(vozEnabled()); }, []);

  // ¿El navegador soporta dictado por voz?
  useEffect(() => {
    if (typeof window === "undefined") return;
    setSoportaVoz(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  // Contexto del proyecto (etapas, categorías) + costo del mes.
  const cargarContexto = async () => {
    if (!proyecto) return;
    const [hs, cats] = await Promise.all([
      supabase.from("hitos").select("nombre,orden").eq("proyecto_id", proyecto.id).order("orden"),
      supabase.from("categorias_egreso").select("nombre").order("nombre"),
    ]);
    setEtapas((hs.data ?? []).map((h) => h.nombre));
    setCategorias((cats.data ?? []).map((c) => c.nombre));
    await cargarGasto();
  };
  const cargarGasto = async () => {
    const desde = hoyISO().slice(0, 8) + "01";
    const { data } = await supabase.from("ia_uso").select("costo_usd").gte("fecha", desde);
    setGastoMesUSD((data ?? []).reduce((s, r) => s + Number(r.costo_usd || 0), 0));
  };
  useEffect(() => { cargarContexto(); /* eslint-disable-next-line */ }, [proyecto?.id]);

  const escuchar = () => {
    setError(null); setOk(null);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "es-AR";
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setTexto(t);
    };
    rec.onerror = () => setEscuchando(false);
    rec.onend = () => setEscuchando(false);
    recRef.current = rec;
    setEscuchando(true);
    rec.start();
  };
  const parar = () => { try { recRef.current?.stop(); } catch {} setEscuchando(false); };
  useEffect(() => () => { try { recRef.current?.stop(); } catch {} }, []);

  const interpretar = async () => {
    const t = texto.trim();
    if (!t) { setError("Primero dictá o escribí el movimiento."); return; }
    setError(null); setOk(null); setInterpretando(true); setDraft(null); setNota(null);
    try {
      const res = await fetch("/api/ia/caja", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texto: t, titulares: TITULARES, etapas, categorias, hoy: hoyISO() }),
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
      // Registro el gasto de la llamada (los tokens ya se consumieron).
      if (data.usage) {
        await supabase.from("ia_uso").insert({
          proyecto_id: proyecto?.id ?? null,
          tipo: "caja",
          modelo: data.usage.modelo,
          input_tokens: data.usage.input_tokens,
          output_tokens: data.usage.output_tokens,
          costo_usd: data.usage.costo_usd,
        });
        cargarGasto();
      }
      const d = data.draft || {};
      setDraft({
        tipo: d.tipo || "egreso",
        fecha: d.fecha || hoyISO(),
        titular: TITULARES.includes(d.titular) ? d.titular : "",
        titular_destino: TITULARES.includes(d.titular_destino) ? d.titular_destino : "",
        moneda: MONEDAS.includes(d.moneda) ? d.moneda : "ARS",
        monto: d.monto ?? "",
        moneda_destino: MONEDAS.includes(d.moneda_destino) ? d.moneda_destino : "ARS",
        tipo_cambio: d.tipo_cambio ?? "",
        categoria: d.categoria || "",
        etapa: etapas.includes(d.etapa) ? d.etapa : "",
        descripcion: d.descripcion || "",
      });
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

  const confirmar = async () => {
    if (!proyecto) { setError("Seleccioná un proyecto."); return; }
    const falta = faltantes(draft);
    if (falta.length) { setError("Completá los campos marcados antes de confirmar."); return; }
    setGuardando(true); setError(null);
    try {
      let categoriaFinal = null;
      if (draft.tipo === "egreso" && draft.categoria) categoriaFinal = await ensureCategoria(draft.categoria);
      const payload = buildPayload(draft, proyecto.id, categoriaFinal);
      const { error } = await supabase.from("movimientos_caja").insert(payload);
      if (error) { setError(error.message); return; }
      setOk("Movimiento guardado en Caja ✔");
      setDraft(null); setTexto(""); setNota(null);
    } catch (e) {
      setError("Error guardando: " + String(e?.message || e));
    } finally {
      setGuardando(false);
    }
  };

  const cancelar = () => { setDraft(null); setNota(null); setError(null); };

  const apagar = () => {
    setVozEnabled(false);
    router.push("/"); // la página "desaparece" del menú y deja de abrirse al entrar
  };

  const falta = useMemo(() => new Set(faltantes(draft)), [draft]);
  const upd = (campo, val) => setDraft((d) => ({ ...d, [campo]: val }));

  if (!proyecto) return <Alert severity="info">Seleccioná un proyecto para cargar movimientos.</Alert>;

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 640, mx: "auto" }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5">Carga rápida por voz</Typography>
          <Typography variant="body2" color="text.secondary">
            Tocá el micrófono, contá el movimiento, revisá y confirmá.
          </Typography>
        </Box>
        <Tooltip title="Gasto del asistente este mes (USD)">
          <Chip size="small" variant="outlined" label={`IA: ${fmtMoney(gastoMesUSD, "USD")}/mes`} />
        </Tooltip>
      </Stack>

      {/* Captura */}
      <Card>
        <CardContent>
          <Stack spacing={2} alignItems="center">
            {soportaVoz ? (
              <IconButton
                onClick={escuchando ? parar : escuchar}
                sx={{
                  width: 96, height: 96, color: "#fff",
                  bgcolor: escuchando ? "error.main" : "secondary.main",
                  "&:hover": { bgcolor: escuchando ? "error.dark" : "secondary.dark" },
                  boxShadow: 3,
                }}
              >
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

            <TextField
              fullWidth multiline minRows={2}
              label="Lo que dijiste (podés editarlo)"
              placeholder='Ej: "Pagué 200 mil a Juan por el contrapiso, de la caja de Rodrigo"'
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />

            <Button
              fullWidth variant="contained" startIcon={<AutoAwesomeIcon />}
              onClick={interpretar} disabled={interpretando || !texto.trim()}
            >
              {interpretando ? "Interpretando…" : "Interpretar"}
            </Button>
            {interpretando && <LinearProgress sx={{ width: "100%" }} />}
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {ok && <Alert severity="success" onClose={() => setOk(null)}>{ok}</Alert>}

      {/* Borrador para confirmar */}
      {draft && (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="subtitle1" fontWeight={700}>Revisá y confirmá</Typography>
              {nota && <Alert severity="warning">{nota}</Alert>}

              <TextField select label="Tipo" value={draft.tipo} onChange={(e) => upd("tipo", e.target.value)}>
                {TIPOS.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
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

                {/* Caja origen / moneda */}
                <Grid item xs={6}>
                  <TextField select fullWidth
                    label={draft.tipo === "cambio" || draft.tipo === "traspaso" ? "Caja origen" : "Caja"}
                    error={falta.has("titular")}
                    value={draft.titular} onChange={(e) => upd("titular", e.target.value)}>
                    <MenuItem value="">—</MenuItem>
                    {TITULARES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={6}>
                  <TextField select fullWidth label={draft.tipo === "cambio" ? "Moneda que sale" : "Moneda"}
                    error={falta.has("moneda")}
                    value={draft.moneda} onChange={(e) => upd("moneda", e.target.value)}>
                    {MONEDAS.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                  </TextField>
                </Grid>

                {/* Destino (traspaso / cambio) */}
                {(draft.tipo === "traspaso" || draft.tipo === "cambio") && (
                  <Grid item xs={6}>
                    <TextField select fullWidth label="Caja destino"
                      error={falta.has("titular_destino")}
                      value={draft.titular_destino} onChange={(e) => upd("titular_destino", e.target.value)}>
                      <MenuItem value="">—</MenuItem>
                      {TITULARES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                    </TextField>
                  </Grid>
                )}
                {draft.tipo === "cambio" && (
                  <>
                    <Grid item xs={6}>
                      <TextField select fullWidth label="Moneda que entra"
                        error={falta.has("moneda_destino")}
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

                {/* Egreso: categoría / etapa / TC para valuar en USD */}
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
                <Typography variant="caption" color="error">
                  Completá los campos en rojo para poder guardar.
                </Typography>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      <Divider />
      <FormControlLabel
        control={<Switch checked={activado} onChange={(e) => {
          if (!e.target.checked) { apagar(); } else { setVozEnabled(true); setActivado(true); }
        }} />}
        label="Carga por voz activada (al apagarla, desaparece del menú y la app deja de abrirse acá)"
      />
    </Stack>
  );
}
