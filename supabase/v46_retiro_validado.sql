-- =====================================================================
-- FARRALAPP - Migración V46 (Validación de retiros de material)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Marca de "validado" para cada retiro de material: permite tildar un retiro
-- como revisado/conciliado desde la solapa de Materiales.
alter table public.retiros_materiales
  add column if not exists validado boolean not null default false;
