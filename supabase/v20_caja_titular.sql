-- =====================================================================
-- FARRALAPP - Migración V20 (Titular de caja: Rodrigo / Juan)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Diferencia a qué caja personal pertenece cada movimiento de caja
-- (tanto en ARS como en USD): 'Rodrigo' o 'Juan'. Permite mostrar el
-- saldo total y el desglose por titular.
alter table public.movimientos_caja
  add column if not exists titular text;
