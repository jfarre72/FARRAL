-- =====================================================================
-- FARRALAPP - Migración V31 (Número de remito en retiros y devoluciones)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Número de remito (texto libre) tanto para los retiros de material como para
-- las devoluciones a saldo (recuperos), para poder identificarlos en la cuenta
-- corriente de la cuenta de materiales.
alter table public.retiros_materiales
  add column if not exists remito_nro text;

alter table public.anticipos_materiales
  add column if not exists remito_nro text;
