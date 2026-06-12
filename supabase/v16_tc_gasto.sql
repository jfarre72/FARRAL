-- =====================================================================
-- FARRALAPP - Migración V16 (Tipo de cambio del gasto para imputación en USD)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Tipo de cambio (ARS por 1 USD) usado para valuar en USD un egreso pagado
-- en pesos sin cambio integrado, al imputarlo a un concepto / etapa.
-- Para egresos "con cambio" se usa cambio_tipo_cambio; este campo cubre el
-- caso de pagar desde la caja de pesos ya existente.
alter table public.movimientos_caja
  add column if not exists tipo_cambio_gasto numeric(16,4);
