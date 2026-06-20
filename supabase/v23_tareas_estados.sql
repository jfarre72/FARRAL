-- =====================================================================
-- FARRALAPP - Migración V23 (Estados de tarea: no iniciado / en curso / finalizado)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Reemplaza el simple "completado" por 3 estados, con fechas de inicio y fin.
-- 'completado' y 'avance' se mantienen para el cálculo de avance del proyecto
-- (finalizado => 100%).
alter table public.hito_tareas
  add column if not exists estado text not null default 'no_iniciado'
    check (estado in ('no_iniciado', 'en_curso', 'finalizado')),
  add column if not exists fecha_inicio date,
  add column if not exists fecha_fin date;

-- Backfill desde el modelo anterior:
--  - completadas  -> finalizado (fecha_fin = fecha de completado)
--  - con avance>0 -> en_curso
update public.hito_tareas
  set estado = 'finalizado',
      fecha_fin = coalesce(fecha_fin, (completado_at)::date)
  where completado and estado = 'no_iniciado';

update public.hito_tareas
  set estado = 'en_curso'
  where not completado and coalesce(avance, 0) > 0 and estado = 'no_iniciado';
