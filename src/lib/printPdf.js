// Generación de PDF sin dependencias: abre una ventana con HTML formateado y
// dispara el diálogo de impresión del navegador (Guardar como PDF).
//
// title: título del documento
// subtitle: línea secundaria (p.ej. nombre del proyecto y fecha)
// bodyHtml: HTML del contenido (tablas, listas, etc.)
export function printDocument({ title, subtitle = "", bodyHtml, logoUrl }) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    alert("El navegador bloqueó la ventana de impresión. Habilitá los pop-ups.");
    return;
  }
  const styles = `
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #0F2A4A; margin: 32px; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .head img.logo { height: 96px; width: auto; max-width: 260px; object-fit: contain; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .sub { color: #5b6b80; font-size: 12px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; text-transform: uppercase; font-size: 10px; letter-spacing: .04em;
         color: #5b6b80; border-bottom: 2px solid #e3e8ef; padding: 6px 8px; }
    td { padding: 6px 8px; border-bottom: 1px solid #eef1f6; vertical-align: top; }
    .tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 10px; border: 1px solid #cdd5e0; }
    .tag-urgente { background: #C0392B; color: #fff; border-color: #C0392B; }
    .done { text-decoration: line-through; color: #8a97a8; }
    .vencido { color: #C0392B; font-weight: 600; }
    .muted { color: #8a97a8; }
    h2 { font-size: 14px; margin: 22px 0 8px; }
    @media print { body { margin: 12px; } }
  `;
  const logo = logoUrl ? `<img class="logo" src="${logoUrl}" alt="" onerror="this.style.display='none'"/>` : "";
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>${styles}</style></head><body>
    <div class="head">
      <div>
        <h1>${title}</h1>${subtitle ? `<div class="sub">${subtitle}</div>` : ""}
      </div>
      ${logo}
    </div>
    ${bodyHtml}
    </body></html>`);
  win.document.close();

  // Imprime recién cuando terminaron de cargar las imágenes (logo y fotos). Si
  // se imprime antes, Chrome puede fallar con "Error de impresión". Se usa un
  // timeout de resguardo para no quedar esperando una imagen que nunca carga.
  const imprimir = () => { try { win.focus(); win.print(); } catch (e) { /* ventana cerrada */ } };
  const esperarImagenes = () => {
    const imgs = Array.from(win.document.images || []);
    const pendientes = imgs.filter((im) => !im.complete);
    if (pendientes.length === 0) { imprimir(); return; }
    let restantes = pendientes.length;
    let listo = false;
    const finalizar = () => { if (listo) return; listo = true; imprimir(); };
    pendientes.forEach((im) => {
      const cont = () => { if (--restantes <= 0) finalizar(); };
      im.addEventListener("load", cont);
      im.addEventListener("error", cont);
    });
    setTimeout(finalizar, 4000);
  };
  if (win.document.readyState === "complete") esperarImagenes();
  else win.addEventListener("load", esperarImagenes);
}

// Escapa texto para insertarlo en HTML.
export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]
  ));
}
