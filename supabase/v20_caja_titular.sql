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

-- Mismo concepto para los aportes de inversores: a qué caja personal
-- (Rodrigo / Juan) ingresa el efectivo del aporte.
alter table public.aportes
  add column if not exists titular text;

-- Titular destino para los traspasos entre cajas personales de la misma
-- moneda (ej. 1000 USD que pasan de la caja de Juan a la de Rodrigo).
-- En un movimiento tipo 'traspaso': titular = origen, titular_destino = destino.
alter table public.movimientos_caja
  add column if not exists titular_destino text;
