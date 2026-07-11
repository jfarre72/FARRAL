-- =====================================================================
-- FARRALAPP - Migración V42 (Plan financiero: notas de MOD/MAQ + incluir/quitar)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Notas para la mano de obra y la máquina (además de la de materiales que ya
-- existe en est_notas), y bandera para quitar del plan tareas/etapas que ya no
-- interesan (ej: etapas terminadas y pagas). Quitar NO borra la tarea real: sólo
-- deja de sumar en el cash flow.
alter table public.hito_tareas
  add column if not exists est_notas_mod text,
  add column if not exists est_notas_maq text,
  add column if not exists plan_incluir  boolean not null default true;

alter table public.hitos
  add column if not exists plan_incluir  boolean not null default true;
