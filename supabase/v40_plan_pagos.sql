-- =====================================================================
-- FARRALAPP - Migración V40 (Plan financiero: pagos previstos + objetivo por etapa)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Pagos PREVISTOS (a futuro): por cada tarea/día planificado se anticipa cuánto
-- se va a necesitar en Mano de Obra (MOD), Máquina/alquiler (MAQ) y Materiales
-- (MAT, con el detalle de lo que hay que pedirle al proveedor). Sirve para:
--   - anticipar la venta de USD (total en pesos por semana / TC),
--   - anticipar el pedido de presupuestos y de materiales,
--   - comparar lo planificado por etapa contra un presupuesto objetivo.
create table if not exists public.plan_pagos (
  id                uuid primary key default gen_random_uuid(),
  proyecto_id       uuid not null references public.proyectos(id) on delete cascade,
  fecha             date,
  etapa             text,
  concepto          text,
  mod               numeric(16,2) not null default 0,   -- mano de obra (ARS)
  maq               numeric(16,2) not null default 0,   -- máquina / alquiler (ARS)
  mat_detalle       text,                                -- qué materiales pedir
  mat_monto         numeric(16,2) not null default 0,   -- estimado de materiales (ARS)
  pedir_presupuesto boolean not null default false,
  pedir_materiales  boolean not null default false,
  estado            text not null default 'previsto',    -- 'previsto' | 'pagado'
  notas             text,
  orden             integer not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists idx_plan_pagos_proyecto on public.plan_pagos(proyecto_id);

alter table public.plan_pagos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='plan_pagos' and policyname='plan_pagos_all') then
    create policy plan_pagos_all on public.plan_pagos for all using (true) with check (true);
  end if;
end $$;

-- Presupuesto OBJETIVO de cada etapa (ARS): el número contra el cual se compara
-- la suma de los pagos previstos de esa etapa (para ver si vas por debajo o por
-- encima, y cuánto).
alter table public.hitos
  add column if not exists presupuesto numeric(16,2);
