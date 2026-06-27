-- =====================================================================
-- FARRALAPP - Migración V35 (Documentación: checklist de planos/documentos)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Checklist simple de documentación del proyecto (planos, memorias, etc.).
-- Cada ítem tiene un nombre (p. ej. "Plano estructura"), un flag de completado
-- y una observación opcional. Mismo enfoque que el seguimiento de tareas.
create table if not exists public.documentacion (
  id            uuid primary key default gen_random_uuid(),
  proyecto_id   uuid not null references public.proyectos(id) on delete cascade,
  nombre        text not null,
  completado    boolean not null default false,
  observacion   text,
  orden         integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_documentacion_proyecto on public.documentacion(proyecto_id);

-- Trigger para mantener updated_at (usa la función existente fn_set_updated_at)
drop trigger if exists trg_documentacion_upd on public.documentacion;
create trigger trg_documentacion_upd before update on public.documentacion
for each row execute function public.fn_set_updated_at();

-- RLS abierta (igual que el resto de las tablas del proyecto)
alter table public.documentacion enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='documentacion' and policyname='documentacion_all') then
    create policy documentacion_all on public.documentacion for all using (true) with check (true);
  end if;
end $$;
