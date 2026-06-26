-- =====================================================================
-- FARRALAPP - Migración V34 (Estado "planificado" en tareas de etapa)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Nuevo estado intermedio "planificado": habilita cargar fecha de inicio y fin
-- (las fechas REALES estimadas a medida que se conocen) antes de arrancar la
-- tarea. Flujo: no_iniciado -> planificado -> en_curso -> finalizado.
alter table public.hito_tareas
  drop constraint if exists hito_tareas_estado_check;
alter table public.hito_tareas
  add constraint hito_tareas_estado_check
  check (estado in ('no_iniciado', 'planificado', 'en_curso', 'finalizado'));
