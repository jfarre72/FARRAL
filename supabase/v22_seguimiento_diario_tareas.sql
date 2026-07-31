-- =====================================================================
-- FARRALAPP - Migración V22 (Tareas asociadas al Diario de obra)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Permite asociar a un día del Diario una o varias tareas de la(s)
-- etapa(s) seleccionada(s). Es solo informativo: NO marca nada como
-- realizado en Planificación. Se guarda como JSON (arreglo de nombres); los
-- registros viejos separados por comas se siguen leyendo por compatibilidad.
alter table public.seguimiento_diario
  add column if not exists tareas text;
