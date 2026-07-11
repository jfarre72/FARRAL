-- =====================================================================
-- FARRALAPP - Migración V41 (Estimación de costo por tarea para el Plan financiero)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Para cada tarea planificada se estima cuánto va a costar, en pesos (ARS),
-- separado en Mano de Obra (MOD), Máquina/alquiler (MAQ) y Materiales (MAT),
-- más una nota con el detalle de los materiales a pedirle al proveedor.
-- La suma por etapa se compara contra el valor planificado de la etapa
-- (hitos.valor_plan, configurado en Ajustes).
alter table public.hito_tareas
  add column if not exists est_mod   numeric(16,2) not null default 0,
  add column if not exists est_maq   numeric(16,2) not null default 0,
  add column if not exists est_mat   numeric(16,2) not null default 0,
  add column if not exists est_notas text;

-- Nota: la migración V40 (plan_pagos) quedó sin uso: el plan se arma sobre las
-- tareas de Planificación/Diario, no sobre pagos sueltos. Podés ignorar esa
-- tabla o borrarla con:  drop table if exists public.plan_pagos;
