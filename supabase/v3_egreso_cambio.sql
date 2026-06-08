-- =====================================================================
-- FARRALAPP - Migración V3 (Egreso con cambio integrado)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente. Se puede correr sobre la base de V1+V2.
-- =====================================================================

-- Nuevos campos para egreso con cambio previo en un mismo registro:
--   con_cambio              -> indica si el egreso requirió convertir antes
--   cambio_moneda_origen    -> caja origen del cambio (la que se "vende")
--   cambio_monto_origen     -> cuánto sale de esa caja
--   cambio_tipo_cambio      -> ARS por 1 USD
--
-- Convenciones:
--   moneda / monto    -> moneda y monto DEL GASTO (caja destino del cambio)
--   La caja origen sufre -cambio_monto_origen
--   La caja del gasto recibe la conversión y luego paga el gasto:
--     entrada = monto_origen * tipo_cambio    (si origen = USD)
--             = monto_origen / tipo_cambio    (si origen = ARS)
--     neto en caja destino = entrada - monto_gasto

alter table public.movimientos_caja
  add column if not exists con_cambio              boolean default false,
  add column if not exists cambio_moneda_origen    text check (cambio_moneda_origen in ('USD','ARS')),
  add column if not exists cambio_monto_origen     numeric(16,2),
  add column if not exists cambio_tipo_cambio      numeric(14,4);
