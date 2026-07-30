// Endpoint de lectura de LISTAS DE PRECIOS de acopio. Recibe la foto (imagen
// base64) o el PDF (base64) de la lista que entrega el proveedor al hacer el
// acopio y devuelve los renglones { codigo, material, precio_bruto, descuento,
// precio (neto), unidad, categoria } para que el usuario los confirme antes de
// congelar la lista dentro del anticipo.
//
// La API key vive SOLO acá (server-side). Configurar en Vercel: ANTHROPIC_API_KEY.
// Opcional: IA_MODELO_VISION (por defecto claude-haiku-4-5, que admite visión y PDF).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRECIOS = {
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-4-6": [3, 15],
  "claude-opus-4-8": [5, 25],
};

// Mismas categorías que /api/ia/remito, para poder cruzar por categoría después.
const CATEGORIAS = [
  "Cemento", "Cal", "Arena", "Piedra/Granza", "Ladrillos/Bloques",
  "Hierro/Acero", "Malla", "Hormigón", "Madera", "Aislaciones",
  "Hidráulica", "Electricidad", "Pintura", "Aberturas", "Otros",
];

function costoUSD(modelo, usage) {
  const p = PRECIOS[modelo] || PRECIOS["claude-haiku-4-5"];
  const inTok = usage?.input_tokens || 0;
  const outTok = usage?.output_tokens || 0;
  const cacheRead = usage?.cache_read_input_tokens || 0;
  return (inTok * p[0] + cacheRead * p[0] * 0.1 + outTok * p[1]) / 1_000_000;
}

// Interpreta un número que puede venir con separadores de miles en cualquier
// convención: "9.935,56" (AR) y "9,935.56" (US) => 9935.56; "10.00" => 10.
function parseNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const hasComma = s.includes(","), hasDot = s.includes(".");
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    const parts = s.split(",");
    s = parts[parts.length - 1].length === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot) {
    const parts = s.split(".");
    if (parts.length > 1 && parts[parts.length - 1].length === 3) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
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

function systemPrompt() {
  return `Sos un asistente de una obra de construcción en Argentina que lee LISTAS DE PRECIOS DE ACOPIO de corralones y proveedores de materiales a partir de una foto o un PDF.

Tu tarea: extraer TODOS los renglones de producto de la lista. Cada renglón suele tener: un CÓDIGO de producto, la DENOMINACIÓN (nombre), un PRECIO de lista y un porcentaje de DESCUENTO.

Reglas:
- "codigo": el código de producto del proveedor tal cual figura (ej: "242", "1061", "4727"). Suele estar pegado al precio o en su propia columna. Si no se lee, null.
- "material": la denominación/descripción del producto tal cual (ej: "HIERRO ALETADO 8MM", "LADRILLO HUECO 12X18X33 9TUBOS (144)", "CEMENTO HOLCIM X 25KG").
- "precio_bruto": el PRECIO de lista (columna "Precio"), como número real sin separadores de miles (ej: 9935.56). NO confundir con el descuento ni con el código.
- "descuento": el PORCENTAJE de descuento (columna "Descto."), como número (ej: 10 para 10%, 0 si no tiene, 14 para 14%). Si no hay columna de descuento, 0.
- "unidad": la unidad si se deduce del nombre (ej: "m3", "bolson", "unidad", "bolsa", "rollo", "kg", "lts", "mt"). Si no está clara, "unidad".
- "categoria": UNA de esta lista (la más parecida): ${CATEGORIAS.join(", ")}.
- NO inventes renglones ni precios. Extraé SOLO lo que figura. Ignorá encabezados, totales, subtotales y datos del cliente.
- "acopio_nro": el número de acopio si figura (ej: "ACOPIO NUMERO: 72" => "72"), o null.
- "fecha": la fecha de emisión de la lista si figura (formato AAAA-MM-DD), o null.

Devolvé SOLO este JSON (sin markdown), con TODOS los renglones:
{"acopio_nro":null,"fecha":null,"items":[{"codigo":null,"material":null,"precio_bruto":null,"descuento":0,"unidad":"unidad","categoria":"Otros"}],"nota":null}`;
}

export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ ok: false, error: "FALTA_API_KEY" }, { status: 200 });

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const imagenBase64 = body?.imagenBase64 || "";
  const pdfBase64 = body?.pdfBase64 || "";
  const mediaType = body?.mediaType || "image/jpeg";
  if (!imagenBase64 && !pdfBase64) return Response.json({ ok: false, error: "SIN_ARCHIVO" }, { status: 200 });

  const modelo = process.env.IA_MODELO_VISION || "claude-haiku-4-5";

  // El bloque de contenido cambia según sea imagen o PDF (Claude lee PDF nativo).
  const fuente = pdfBase64
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data: imagenBase64 } };

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
        max_tokens: 8000,
        system: systemPrompt(),
        messages: [{
          role: "user",
          content: [
            fuente,
            { type: "text", text: "Leé esta lista de precios de acopio y devolvé TODOS los renglones en el JSON pedido." },
          ],
        }],
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return Response.json({ ok: false, error: "API_ERROR", detalle: data?.error?.message || resp.statusText }, { status: 200 });
    }
    const textOut = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const draft = parseJsonLoose(textOut);
    if (!draft) return Response.json({ ok: false, error: "PARSEO", crudo: textOut }, { status: 200 });

    // Normalizo los ítems y calculo el neto (precio - descuento).
    const items = (Array.isArray(draft.items) ? draft.items : [])
      .map((it) => {
        const bruto = parseNum(it?.precio_bruto);
        let desc = parseNum(it?.descuento);
        if (desc == null || desc < 0) desc = 0;
        if (desc > 100) desc = 100;
        const neto = bruto != null ? Math.round(bruto * (1 - desc / 100) * 100) / 100 : null;
        return {
          codigo: (it?.codigo != null ? String(it.codigo) : "").trim(),
          material: (it?.material ? String(it.material) : "").trim(),
          precio_bruto: bruto,
          descuento: desc,
          precio: neto,
          unidad: (it?.unidad ? String(it.unidad) : "unidad").trim().toLowerCase() || "unidad",
          categoria: CATEGORIAS.includes(it?.categoria) ? it.categoria : "Otros",
        };
      })
      .filter((it) => it.material || it.precio_bruto != null);

    const usage = {
      input_tokens: data?.usage?.input_tokens || 0,
      output_tokens: data?.usage?.output_tokens || 0,
      cache_read_input_tokens: data?.usage?.cache_read_input_tokens || 0,
      costo_usd: costoUSD(modelo, data?.usage),
      modelo,
    };
    return Response.json({
      ok: true,
      acopio_nro: draft.acopio_nro ?? null,
      fecha: draft.fecha ?? null,
      items,
      nota: draft.nota ?? null,
      usage,
    }, { status: 200 });
  } catch (e) {
    return Response.json({ ok: false, error: "RED", detalle: String(e?.message || e) }, { status: 200 });
  }
}
