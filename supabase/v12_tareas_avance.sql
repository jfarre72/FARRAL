-- =====================================================================
-- FARRALAPP - Migración V12 (Avance % por tarea de hito)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- % de avance por tarea (0-100) y marca temporal de completado, para poder
-- informar en el reporte mensual qué tareas se terminaron en el mes.
alter table public.hito_tareas
  add column if not exists avance integer not null default 0 check (avance between 0 and 100),
  add column if not exists completado_at timestamptz;

-- Backfill: las tareas ya completadas pasan a 100% y toman fecha de completado.
update public.hito_tareas set avance = 100 where completado and avance = 0;
update public.hito_tareas set completado_at = coalesce(completado_at, updated_at) where completado;
