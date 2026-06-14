-- =====================================================================
-- FARRALAPP - Migración V17 (Tipo de costo y Rubro en los egresos)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Dos etiquetas más para los egresos:
--  - tipo_costo: Mano de Obra / Materiales / Equipamiento / Servicios
--  - rubro: Movimiento de suelo / Estructura / ... / Pintura
alter table public.movimientos_caja
  add column if not exists tipo_costo text;

alter table public.movimientos_caja
  add column if not exists rubro text;
