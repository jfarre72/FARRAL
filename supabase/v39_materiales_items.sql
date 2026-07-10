-- =====================================================================
-- FARRALAPP - Migración V39 (Ítems de material de cada retiro / remito)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Cada retiro adjunta la foto del remito. A partir de esa foto (leída por el
-- asistente de IA, o cargada a mano) se guarda el detalle de materiales que
-- salieron, para poder analizar el consumo por material y por etapa:
--   [{ "material": "Ladrillo hueco 12x18x33", "cantidad": 1000,
--      "unidad": "unidad", "categoria": "Ladrillos/Bloques" }, ...]
alter table public.retiros_materiales
  add column if not exists materiales_items jsonb;
