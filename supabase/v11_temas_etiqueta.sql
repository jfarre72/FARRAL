-- =====================================================================
-- FARRALAPP - Migración V11 (Etiqueta de prioridad en temas)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Etiqueta de prioridad para cada tema de seguimiento.
-- Valores típicos: NORMAL, URGENTE.
alter table public.temas
  add column if not exists etiqueta text not null default 'NORMAL';
