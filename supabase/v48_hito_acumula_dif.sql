-- =====================================================================
-- FARRALAPP - Migración V48 (Check de "Dif. acumulada" por etapa)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- En Seguimiento económico > Por etapa (Obra), la columna "Dif. acumulada"
-- deja de calcularse automáticamente (etapas al 100% en Planificación) y pasa
-- a sumar solo las etapas tildadas a mano con el check de la izquierda.
alter table public.hitos
  add column if not exists acumula_dif boolean not null default false;
