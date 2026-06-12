-- =====================================================================
-- FARRALAPP - Migración V10 (Seguimiento de tareas / TEMAS FARRAL)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Tabla de temas operativos para seguimiento en reuniones estilo PM.
-- Cada tema tiene un título (la tarea), un responsable (texto libre, p.ej.
-- "JUAN", "RODRI" o "RODRI|JUAN"), una fecha, un flag de completado y una
-- observación opcional.
create table if not exists public.temas (
  id            uuid primary key default gen_random_uuid(),
  proyecto_id   uuid not null references public.proyectos(id) on delete cascade,
  titulo        text not null,
  responsable   text,
  fecha         date,
  completado    boolean not null default false,
  observacion   text,
  orden         integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_temas_proyecto on public.temas(proyecto_id);

-- Trigger para mantener updated_at (usa la función existente fn_set_updated_at)
drop trigger if exists trg_temas_upd on public.temas;
create trigger trg_temas_upd before update on public.temas
for each row execute function public.fn_set_updated_at();

-- RLS abierta (igual que el resto de las tablas del proyecto)
alter table public.temas enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='temas' and policyname='temas_all') then
    create policy temas_all on public.temas for all using (true) with check (true);
  end if;
end $$;
