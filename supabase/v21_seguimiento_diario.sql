-- =====================================================================
-- FARRALAPP - Migración V21 (Seguimiento Diario de obra)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Registro día por día del avance de obra: si se trabajó o no, y en caso
-- negativo la causa (lluvia, falta de personal, falta de materiales, etc.).
-- La etapa es opcional (texto libre, típicamente uno de los nombres de
-- hitos del proyecto). Hay como máximo un registro por (proyecto, fecha).
create table if not exists public.seguimiento_diario (
  id            uuid primary key default gen_random_uuid(),
  proyecto_id   uuid not null references public.proyectos(id) on delete cascade,
  fecha         date not null,
  trabajado     boolean not null default true,
  causa         text,
  etapa         text,
  observacion   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (proyecto_id, fecha)
);
create index if not exists idx_segdiario_proyecto on public.seguimiento_diario(proyecto_id);

-- Trigger para mantener updated_at (usa la función existente fn_set_updated_at)
drop trigger if exists trg_segdiario_upd on public.seguimiento_diario;
create trigger trg_segdiario_upd before update on public.seguimiento_diario
for each row execute function public.fn_set_updated_at();

-- RLS abierta (igual que el resto de las tablas del proyecto)
alter table public.seguimiento_diario enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='seguimiento_diario' and policyname='segdiario_all') then
    create policy segdiario_all on public.seguimiento_diario for all using (true) with check (true);
  end if;
end $$;
