-- =====================================================================
-- FARRALAPP - Migración V25 (No negociables: notas del proyecto)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Notas tipo "no negociables" del proyecto: detalles que sí o sí deben
-- cumplirse (ej: aberturas al ras del piso entre galería y living).
create table if not exists public.no_negociables (
  id           uuid primary key default gen_random_uuid(),
  proyecto_id  uuid not null references public.proyectos(id) on delete cascade,
  texto        text not null,
  orden        integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_nonegociables_proyecto on public.no_negociables(proyecto_id);

drop trigger if exists trg_nonegociables_upd on public.no_negociables;
create trigger trg_nonegociables_upd before update on public.no_negociables
for each row execute function public.fn_set_updated_at();

alter table public.no_negociables enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='no_negociables' and policyname='nonegociables_all') then
    create policy nonegociables_all on public.no_negociables for all using (true) with check (true);
  end if;
end $$;
