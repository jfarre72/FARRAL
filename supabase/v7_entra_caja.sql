-- =====================================================================
-- FARRALAPP - Migración V7 (Aportes que no entran a caja)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Algunos aportes representan honorarios o servicios que se pagan al
-- final con su % de ganancia, sin ingresar efectivo a caja.
-- Estos aportes:
--   - SI cuentan para el % recaudado y la ponderación
--   - NO impactan en los saldos ni movimientos de caja
alter table public.aportes
  add column if not exists entra_a_caja boolean not null default true;

-- Backfill: aportes existentes mantienen el default (true).
