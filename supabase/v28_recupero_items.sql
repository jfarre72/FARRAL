-- =====================================================================
-- FARRALAPP - Migración V28 (Recupero con múltiples ítems por retiro)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Un mismo remito puede tener varios ítems a recuperar (ej. pallets y
-- bolsones a distinto precio). Se guardan como un arreglo JSON:
--   [{ "unidad": "pallet", "cantidad": 1, "precio": 25000, "total": 25000 }, ...]
-- Las columnas recupero_unidad / recupero_cantidad / recupero_precio de la
-- V27 quedan como legado (retiros viejos de un solo ítem); recupero_total
-- sigue siendo el total del retiro (suma de todos los ítems).
alter table public.retiros_materiales
  add column if not exists recupero_items jsonb;
