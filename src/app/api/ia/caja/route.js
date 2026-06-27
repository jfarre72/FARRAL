// Endpoint del asistente de Caja: recibe una frase (texto dictado) y devuelve
// un movimiento de caja estructurado para que el usuario confirme antes de guardar.
//
// La API key vive SOLO acá (server-side), nunca en el navegador.
// Configurar en Vercel: variable de entorno ANTHROPIC_API_KEY.
// Opcional: IA_MODELO (por defecto claude-haiku-4-5, el más barato).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Precio por millón de tokens (USD): [entrada, salida].
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
  // Lectura de caché ~0.1x del precio de entrada.
  return (inTok * p[0] + cacheRead * p[0] * 0.1 + outTok * p[1]) / 1_000_000;
}

function systemPrompt({ titulares, etapas, categorias, hoy }) {
  return `Sos un asistente administrativo de una obra de construcción en Argentina.
A partir de una frase dictada por el usuario, extraés UN movimiento de caja y lo devolvés como JSON.

Contexto del proyecto:
- Cajas (titulares) disponibles: ${titulares.join(", ") || "—"}.
- Etapas de obra: ${etapas.join(", ") || "—"}.
- Categorías de gasto frecuentes: ${categorias.join(", ") || "—"}.
- Fecha de hoy: ${hoy} (usala si dicen "hoy"; si no mencionan fecha, usá hoy).

Tipos de movimiento:
- "egreso": un pago o gasto que sale de una caja.
- "ingreso": plata que entra a una caja.
- "cambio": se cambia una moneda por otra a un tipo de cambio (ej. "cambié 500 USD a 1510").
- "traspaso": se pasa plata entre dos cajas SIN cambiar de moneda (mismo USD o mismo ARS).

Reglas:
- Montos como números, sin separadores de miles ni símbolos. "lucas"/"mil" = ×1000; "palo"/"millón" = ×1000000.
- Mapeá los nombres de caja a uno de los titulares disponibles (ej. "juan" -> "Juan").
- Mapeá la etapa a la más parecida de la lista; si no hay, dejala null.
- Para "egreso" en ARS, si mencionan un tipo de cambio para valuarlo, ponelo en tipo_cambio.
- Para "cambio": moneda = moneda que SALE, moneda_destino = la que ENTRA, tipo_cambio = ARS por 1 USD.
- Si algo NO queda claro o falta un dato obligatorio, agregalo al array "faltantes" y explicá la duda en "nota". NUNCA inventes montos ni tipos de cambio.

Devolvé EXCLUSIVAMENTE un objeto JSON válido (sin texto adicional, sin markdown) con esta forma:
{
  "tipo": "egreso|ingreso|cambio|traspaso",
  "fecha": "YYYY-MM-DD",
  "titular": "caja origen o null",
  "titular_destino": "caja destino o null",
  "moneda": "ARS|USD|null",
  "monto": número o null,
  "moneda_destino": "ARS|USD|null",
  "tipo_cambio": número o null,
  "categoria": "texto o null",
  "etapa": "texto o null",
  "descripcion": "texto breve o null",
  "faltantes": ["campo1", "campo2"],
  "nota": "aclaración/ambigüedad o null"
}`;
}

function parseJsonLoose(text) {
  if (!text) return null;
  let t = String(text).trim();
  // Quitar fences de markdown si los hubiera.
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch { return null; }
}

export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, error: "FALTA_API_KEY" }, { status: 200 });
  }

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const texto = (body?.texto || "").trim();
  if (!texto) {
    return Response.json({ ok: false, error: "SIN_TEXTO" }, { status: 200 });
  }

  const titulares = Array.isArray(body?.titulares) ? body.titulares : [];
  const etapas = Array.isArray(body?.etapas) ? body.etapas : [];
  const categorias = Array.isArray(body?.categorias) ? body.categorias : [];
  const hoy = (body?.hoy || new Date().toISOString().slice(0, 10));
  const modelo = process.env.IA_MODELO || "claude-haiku-4-5";

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
        system: systemPrompt({ titulares, etapas, categorias, hoy }),
        messages: [{ role: "user", content: texto }],
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return Response.json(
        { ok: false, error: "API_ERROR", detalle: data?.error?.message || resp.statusText },
        { status: 200 }
      );
    }

    const textOut = (data?.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const draft = parseJsonLoose(textOut);
    if (!draft) {
      return Response.json({ ok: false, error: "PARSEO", crudo: textOut }, { status: 200 });
    }

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
