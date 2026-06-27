// Endpoint del asistente de carga rápida. Recibe una frase dictada + el tipo de
// carga (caja | tarea | retiro) y devuelve un borrador estructurado para que el
// usuario confirme antes de guardar.
//
// La API key vive SOLO acá (server-side). Configurar en Vercel: ANTHROPIC_API_KEY.
// Opcional: IA_MODELO (por defecto claude-haiku-4-5).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRECIOS = {
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-4-6": [3, 15],
  "claude-opus-4-8": [5, 25],
};

function costoUSD(modelo, usage) {
  const p = PRECIOS[modelo] || PRECIOS["claude-haiku-4-5"];
  const inTok = usage?.input_tokens || 0;
  const outTok = usage?.output_tokens || 0;
  const cacheRead = usage?.cache_read_input_tokens || 0;
  return (inTok * p[0] + cacheRead * p[0] * 0.1 + outTok * p[1]) / 1_000_000;
}

function parseJsonLoose(text) {
  if (!text) return null;
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch { return null; }
}

function promptCaja({ titulares, etapas, categorias, hoy }) {
  return `Sos un asistente administrativo de una obra de construcción en Argentina.
A partir de una frase dictada, extraés UN movimiento de caja y lo devolvés como JSON.

Contexto:
- Cajas (titulares): ${titulares.join(", ") || "—"}.
- Etapas de obra: ${etapas.join(", ") || "—"}.
- Categorías de gasto: ${categorias.join(", ") || "—"}.
- Fecha de hoy: ${hoy}.

Tipos: "egreso" (pago/gasto), "ingreso" (entra plata), "cambio" (cambiar una moneda por otra a un TC), "traspaso" (pasar plata entre cajas SIN cambiar de moneda).
Reglas: montos como números ("lucas"/"mil"=×1000, "palo"/"millón"=×1000000). Mapeá caja a un titular y etapa a la más parecida. Para "cambio": moneda=la que sale, moneda_destino=la que entra, tipo_cambio=ARS por 1 USD. Para egreso en ARS con TC mencionado, ponelo en tipo_cambio. NUNCA inventes montos ni TC; lo que falte va en "faltantes" y la duda en "nota".

Devolvé SOLO este JSON (sin markdown):
{"tipo":"egreso|ingreso|cambio|traspaso","fecha":"YYYY-MM-DD","titular":null,"titular_destino":null,"moneda":"ARS|USD|null","monto":null,"moneda_destino":"ARS|USD|null","tipo_cambio":null,"categoria":null,"etapa":null,"descripcion":null,"faltantes":[],"nota":null}`;
}

function promptTarea({ hoy }) {
  return `Sos un asistente de una obra de construcción en Argentina.
A partir de una frase dictada, extraés UNA tarea/pendiente y la devolvés como JSON.

Fecha de hoy: ${hoy} (resolvé "mañana", "el viernes", etc. a una fecha concreta; si no hay fecha, dejala null).
- "titulo": qué hay que hacer (obligatorio).
- "responsable": a quién se le asigna (nombre tal cual lo digan), o null.
- "fecha": fecha límite YYYY-MM-DD o null.
- "etiqueta": "URGENTE" si lo marcan como urgente/prioritario, si no "NORMAL".
- "observacion": detalle extra o null.
Lo que falte va en "faltantes"; dudas en "nota".

Devolvé SOLO este JSON (sin markdown):
{"titulo":null,"responsable":null,"fecha":null,"etiqueta":"NORMAL","observacion":null,"faltantes":[],"nota":null}`;
}

function promptRetiro({ cuentas, etapas, hoy }) {
  const lista = cuentas.map((c) => `${c.proveedor} (${c.moneda})`).join(", ") || "—";
  return `Sos un asistente de una obra de construcción en Argentina.
A partir de una frase dictada, extraés UN retiro de materiales (consumo contra una cuenta de un proveedor) y lo devolvés como JSON.

Contexto:
- Cuentas de materiales (proveedores): ${lista}.
- Etapas de obra: ${etapas.join(", ") || "—"}.
- Fecha de hoy: ${hoy}.

- "proveedor": el proveedor de la cuenta, mapeado EXACTO a uno de los disponibles (si no coincide, null).
- "monto": monto retirado, número ("lucas"/"mil"=×1000, "palo"/"millón"=×1000000) (obligatorio).
- "etapa": etapa a la que se imputa, mapeada a la lista, o null.
- "fecha": YYYY-MM-DD (usá hoy si no dicen).
- "remito_nro": número de remito si lo mencionan, o null.
- "tipo_cambio": ARS por 1 USD si lo mencionan, o null.
- "descripcion": qué material/detalle, o null.
NUNCA inventes montos. Lo que falte va en "faltantes"; dudas en "nota".

Devolvé SOLO este JSON (sin markdown):
{"proveedor":null,"monto":null,"etapa":null,"fecha":"YYYY-MM-DD","remito_nro":null,"tipo_cambio":null,"descripcion":null,"faltantes":[],"nota":null}`;
}

export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ ok: false, error: "FALTA_API_KEY" }, { status: 200 });

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const texto = (body?.texto || "").trim();
  if (!texto) return Response.json({ ok: false, error: "SIN_TEXTO" }, { status: 200 });

  const tipo = body?.tipo || "caja";
  const hoy = body?.hoy || new Date().toISOString().slice(0, 10);
  const titulares = Array.isArray(body?.titulares) ? body.titulares : [];
  const etapas = Array.isArray(body?.etapas) ? body.etapas : [];
  const categorias = Array.isArray(body?.categorias) ? body.categorias : [];
  const cuentas = Array.isArray(body?.cuentas) ? body.cuentas : [];
  const modelo = process.env.IA_MODELO || "claude-haiku-4-5";

  const system =
    tipo === "tarea" ? promptTarea({ hoy })
    : tipo === "retiro" ? promptRetiro({ cuentas, etapas, hoy })
    : promptCaja({ titulares, etapas, categorias, hoy });

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: 600,
        system,
        messages: [{ role: "user", content: texto }],
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return Response.json({ ok: false, error: "API_ERROR", detalle: data?.error?.message || resp.statusText }, { status: 200 });
    }
    const textOut = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const draft = parseJsonLoose(textOut);
    if (!draft) return Response.json({ ok: false, error: "PARSEO", crudo: textOut }, { status: 200 });

    const usage = {
      input_tokens: data?.usage?.input_tokens || 0,
      output_tokens: data?.usage?.output_tokens || 0,
      cache_read_input_tokens: data?.usage?.cache_read_input_tokens || 0,
      costo_usd: costoUSD(modelo, data?.usage),
      modelo,
    };
    return Response.json({ ok: true, draft, usage }, { status: 200 });
  } catch (e) {
    return Response.json({ ok: false, error: "RED", detalle: String(e?.message || e) }, { status: 200 });
  }
}
