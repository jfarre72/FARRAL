-- =====================================================================
-- FARRALAPP - Migración V44 (Cashflow manual: ítems y tipo de cambio semanal)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Ítems de cashflow cargados a mano (el "financiero manual"): cada uno tiene
-- una fecha, un concepto (p.ej. "Pago a Emiliano", "Adelanto 50% Losa radiante")
-- y un monto en ARS. Se agrupan por semana (lunes a domingo) según su fecha.
create table if not exists public.cashflow_items (
  id           uuid primary key default gen_random_uuid(),
  proyecto_id  uuid not null references public.proyectos(id) on delete cascade,
  fecha        date not null,
  concepto     text not null default '',
  monto        numeric(16,2) not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_cashflow_items_proyecto on public.cashflow_items(proyecto_id);

drop trigger if exists trg_cashflow_items_upd on public.cashflow_items;
create trigger trg_cashflow_items_upd before update on public.cashflow_items
for each row execute function public.fn_set_updated_at();

alter table public.cashflow_items enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='cashflow_items' and policyname='cashflow_items_all') then
    create policy cashflow_items_all on public.cashflow_items for all using (true) with check (true);
  end if;
end $$;

-- Tipo de cambio (dólar de venta ARS/USD) por semana. La semana se identifica
-- por su lunes (fecha). Es único por proyecto + semana.
create table if not exists public.cashflow_tc (
  id           uuid primary key default gen_random_uuid(),
  proyecto_id  uuid not null references public.proyectos(id) on delete cascade,
  semana       date not null,               -- lunes de la semana (ISO)
  tc           numeric(14,4),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (proyecto_id, semana)
);
create index if not exists idx_cashflow_tc_proyecto on public.cashflow_tc(proyecto_id);

drop trigger if exists trg_cashflow_tc_upd on public.cashflow_tc;
create trigger trg_cashflow_tc_upd before update on public.cashflow_tc
for each row execute function public.fn_set_updated_at();

alter table public.cashflow_tc enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='cashflow_tc' and policyname='cashflow_tc_all') then
    create policy cashflow_tc_all on public.cashflow_tc for all using (true) with check (true);
  end if;
end $$;
