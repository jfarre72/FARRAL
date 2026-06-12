-- =====================================================================
-- FARRALAPP - Migración V14 (Fotos por presupuesto)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente. Reutiliza el bucket 'galeria' (ver v13).
-- =====================================================================

create table if not exists public.presupuesto_fotos (
  id              uuid primary key default gen_random_uuid(),
  presupuesto_id  uuid not null references public.presupuestos(id) on delete cascade,
  url             text not null,
  path            text,
  descripcion     text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_presupuesto_fotos_pres on public.presupuesto_fotos(presupuesto_id);

alter table public.presupuesto_fotos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='presupuesto_fotos' and policyname='presupuesto_fotos_all') then
    create policy presupuesto_fotos_all on public.presupuesto_fotos for all using (true) with check (true);
  end if;
end $$;
