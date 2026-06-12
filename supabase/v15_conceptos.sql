-- =====================================================================
-- FARRALAPP - Migración V15 (Conceptos + valor planificado por concepto/etapa)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Conceptos económicos del proyecto (Terreno, Obra, Honorarios, etc.) con su
-- valor planificado en USD. 'usa_etapas' indica el concepto (típicamente Obra)
-- que al registrar un egreso habilita además la selección de etapa.
create table if not exists public.conceptos (
  id           uuid primary key default gen_random_uuid(),
  proyecto_id  uuid not null references public.proyectos(id) on delete cascade,
  nombre       text not null,
  valor_plan   numeric(16,2) not null default 0,
  usa_etapas   boolean not null default false,
  orden        integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_conceptos_proyecto on public.conceptos(proyecto_id);

drop trigger if exists trg_conceptos_upd on public.conceptos;
create trigger trg_conceptos_upd before update on public.conceptos
for each row execute function public.fn_set_updated_at();

alter table public.conceptos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='conceptos' and policyname='conceptos_all') then
    create policy conceptos_all on public.conceptos for all using (true) with check (true);
  end if;
end $$;

-- Valor planificado (USD) por etapa.
alter table public.hitos
  add column if not exists valor_plan numeric(16,2) not null default 0;

-- Concepto asociado a un movimiento de caja (texto, igual que 'etapa').
alter table public.movimientos_caja
  add column if not exists concepto text;
