// Endpoint de lectura de remitos de materiales. Recibe la FOTO de un remito
// (imagen en base64) y devuelve el detalle de materiales que salieron, para que
// el usuario lo confirme antes de guardar el retiro.
//
// La API key vive SOLO acá (server-side). Configurar en Vercel: ANTHROPIC_API_KEY.
// Opcional: IA_MODELO_VISION (por defecto claude-haiku-4-5, que admite visión).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRECIOS = {
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-4-6": [3, 15],
  "claude-opus-4-8": [5, 25],
};

// Categorías normalizadas para poder agrupar el consumo después.
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

// Interpreta una cantidad que puede venir con separadores de miles en cualquier
// convención: "1,000.00" (US) y "1.000,00" (AR) => 1000; "3.00" => 3; "1,000" => 1000.
function parseCantidad(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const hasComma = s.includes(","), hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // El último separador que aparece es el decimal; el otro es de miles.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    const parts = s.split(",");
    // Coma con exactamente 3 dígitos al final => separador de miles.
    s = parts[parts.length - 1].length === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot) {
    const parts = s.split(".");
    // Punto con exactamente 3 dígitos al final => separador de miles (ej "1.000").
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
  return `Sos un asistente de una obra de construcción en Argentina que lee REMITOS y FACTURAS de proveedores de materiales a partir de una foto o un PDF.

Tu tarea: extraer TODOS los renglones de material del comprobante. Por cada renglón devolvés cantidad, unidad, la descripción del material, una categoría normalizada y el código si figura.

Reglas:
- "cantidad": es la PRIMERA columna del remito (la de más a la izquierda, encabezada "Cantidad" o "Cant."). NO confundir con precio, importe, código ni total.
  Los números pueden venir con separador de miles: "1,000.00" y "1.000,00" significan MIL (1000), "3.00" significa 3, "1,000" significa 1000. Devolvé el número entero/decimal REAL, sin separadores de miles (ej: 1000, no 1). Si no se lee, null.
- "unidad": la unidad del renglón tal como corresponde (ej: "unidad", "bolsa", "m3", "m2", "ml", "kg", "tonelada", "pallet", "bolson", "litro", "barra", "rollo"). Si no está clara, "unidad".
- "material": descripción del producto EXACTAMENTE como figura en el remito, completa (ej: "Ladrillo hueco 12x18x33", "Cemento Loma Negra 50kg", "Hierro del 8", "Malla Q188", "Arena fina"). No la abrevies ni la interpretes.
- "codigo": el código de producto tal como figura en el remito (si hay una columna de código), o null. NO lo inventes.
- "categoria": UNA de esta lista (la más parecida): ${CATEGORIAS.join(", ")}.
- NO inventes renglones ni cantidades. Si el comprobante no es legible o no tiene materiales, devolvé "items": [].
- Ignorá totales, IVA, transporte y renglones que no sean material físico.
- "remito_nro": número de remito/comprobante si se lee, o null.

NO calcules ni asignes precios: eso lo resuelve el sistema. Devolvé SOLO este JSON (sin markdown):
{"remito_nro":null,"items":[{"codigo":null,"material":null,"cantidad":null,"unidad":"unidad","categoria":"Otros"}],"nota":null}`;
}

// ---- Cruce determinístico contra la lista de precios (en el server, sin IA) ----
const normKey = (s) => String(s || "")
  .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

// Clave compacta: normalizada y sin espacios, para que "8 MM" y "8MM" coincidan.
const compactKey = (s) => normKey(s).replace(/ /g, "");

function construirIndice(lista) {
  const byName = new Map(), byCompact = new Map(), byCode = new Map(), filas = [];
  for (const it of lista) {
    if (!it) continue;
    const precio = Number(it.precio);
    const row = {
      codigo: it.codigo != null ? String(it.codigo).trim() : "",
      material: it.material || "",
      precio: Number.isFinite(precio) ? precio : null,
    };
    const nk = normKey(row.material);
    const ck = nk.replace(/ /g, "");
    if (nk && !byName.has(nk)) byName.set(nk, row);
    if (ck && !byCompact.has(ck)) byCompact.set(ck, row);
    if (row.codigo) byCode.set(row.codigo, row);
    filas.push({ row, tokens: new Set(nk.split(" ").filter(Boolean)) });
  }
  return { byName, byCompact, byCode, filas };
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

// Resuelve la fila de la lista para un ítem del remito. Prioriza el nombre exacto
// (evita que un código mal leído traiga otro producto), luego el código impreso,
// luego el nombre más parecido por tokens con un umbral. Devuelve la fila o null.
function resolverFila(item, idx) {
  const nk = normKey(item.material);
  const exact = nk && idx.byName.get(nk);
  if (exact) return exact;
  const ck = nk.replace(/ /g, "");
  const compact = ck && idx.byCompact.get(ck);
  if (compact) return compact;
  const code = (item.codigo || "").trim();
  if (code && idx.byCode.has(code)) return idx.byCode.get(code);
  const tk = new Set(nk.split(" ").filter(Boolean));
  if (tk.size >= 2) {
    let best = null, bestScore = 0;
    for (const f of idx.filas) {
      const sc = jaccard(tk, f.tokens);
      if (sc > bestScore) { bestScore = sc; best = f.row; }
    }
    if (best && bestScore >= 0.6) return best;
  }
  return null;
}

export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ ok: false, error: "FALTA_API_KEY" }, { status: 200 });

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const imagenBase64 = body?.imagenBase64 || "";
  const pdfBase64 = body?.pdfBase64 || "";
  const mediaType = body?.mediaType || "image/jpeg";
  const lista = Array.isArray(body?.lista) ? body.lista : [];
  if (!imagenBase64 && !pdfBase64) return Response.json({ ok: false, error: "SIN_IMAGEN" }, { status: 200 });

  const modelo = process.env.IA_MODELO_VISION || "claude-haiku-4-5";

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
        max_tokens: 2500,
        system: systemPrompt(),
        messages: [{
          role: "user",
          content: [
            fuente,
            { type: "text", text: "Leé este remito y devolvé el detalle de materiales en el JSON pedido." },
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

    // Normalizo los ítems (defensivo).
    const base = (Array.isArray(draft.items) ? draft.items : [])
      .map((it) => ({
        codigo: (it?.codigo != null ? String(it.codigo) : "").trim(),
        material: (it?.material ? String(it.material) : "").trim(),
        cantidad: parseCantidad(it?.cantidad),
        unidad: (it?.unidad ? String(it.unidad) : "unidad").trim().toLowerCase(),
        categoria: CATEGORIAS.includes(it?.categoria) ? it.categoria : "Otros",
      }))
      .filter((it) => it.material || it.cantidad != null);

    // Cruce determinístico contra la lista de precios (server-side, sin IA):
    // el nombre exacto manda, así un producto no toma el precio de otro parecido.
    const idx = lista.length ? construirIndice(lista) : null;
    const items = base.map((it) => {
      const fila = idx ? resolverFila(it, idx) : null;
      return {
        ...it,
        // Si emparejó, uso el código y el precio de la lista (más confiable que
        // el código leído del remito); si no, dejo el código leído y sin precio.
        codigo: fila ? (fila.codigo || it.codigo) : it.codigo,
        precio_unitario: fila ? fila.precio : null,
      };
    });

    const usage = {
      input_tokens: data?.usage?.input_tokens || 0,
      output_tokens: data?.usage?.output_tokens || 0,
      cache_read_input_tokens: data?.usage?.cache_read_input_tokens || 0,
      costo_usd: costoUSD(modelo, data?.usage),
      modelo,
    };
    return Response.json({ ok: true, remito_nro: draft.remito_nro ?? null, items, nota: draft.nota ?? null, usage }, { status: 200 });
  } catch (e) {
    return Response.json({ ok: false, error: "RED", detalle: String(e?.message || e) }, { status: 200 });
  }
}
