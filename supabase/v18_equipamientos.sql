-- =====================================================================
-- FARRALAPP - Migración V18 (Equipamientos por etapa - checklist de compras)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Listado de equipamientos/compras a realizar, agrupados por etapa de obra.
-- Se pueden tachar (comprado), reordenar, con cantidad y observación.
create table if not exists public.equipamientos (
  id           uuid primary key default gen_random_uuid(),
  proyecto_id  uuid not null references public.proyectos(id) on delete cascade,
  etapa        text,
  nombre       text not null,
  cantidad     text,
  observacion  text,
  comprado     boolean not null default false,
  orden        integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_equipamientos_proyecto on public.equipamientos(proyecto_id);

drop trigger if exists trg_equipamientos_upd on public.equipamientos;
create trigger trg_equipamientos_upd before update on public.equipamientos
for each row execute function public.fn_set_updated_at();

alter table public.equipamientos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='equipamientos' and policyname='equipamientos_all') then
    create policy equipamientos_all on public.equipamientos for all using (true) with check (true);
  end if;
end $$;
