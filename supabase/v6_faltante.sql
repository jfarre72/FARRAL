-- =====================================================================
-- FARRALAPP - Migración V6 (Fecha del inversor "Faltante")
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- "Inversor Faltante" es un inversor virtual cuyo aporte es
--   max(0, costo_total_estimado - sum(aportes_USD))
-- Su fecha_inicio_calculo es esta nueva fecha (cuándo se asume que
-- entraría ese capital). Si no se setea, se usa fecha_fin del proyecto.
alter table public.proyectos
  add column if not exists fecha_inversor_faltante date;
