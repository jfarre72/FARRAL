-- =====================================================================
-- FARRALAPP - Migración V19 (Cuentas de materiales: anticipo congelado + retiros)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Cuenta corriente con un proveedor: se carga un anticipo (precio congelado)
-- y se van descontando retiros de material hasta agotar el saldo.
create table if not exists public.cuentas_materiales (
  id            uuid primary key default gen_random_uuid(),
  proyecto_id   uuid not null references public.proyectos(id) on delete cascade,
  proveedor     text not null,
  descripcion   text,
  moneda        text not null default 'ARS',
  monto_inicial numeric(16,2) not null default 0,
  fecha         date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_cuentas_materiales_proyecto on public.cuentas_materiales(proyecto_id);

drop trigger if exists trg_cuentas_materiales_upd on public.cuentas_materiales;
create trigger trg_cuentas_materiales_upd before update on public.cuentas_materiales
for each row execute function public.fn_set_updated_at();

-- Retiros de material contra una cuenta. Cada uno descuenta del saldo y puede
-- adjuntar la foto del remito.
create table if not exists public.retiros_materiales (
  id          uuid primary key default gen_random_uuid(),
  cuenta_id   uuid not null references public.cuentas_materiales(id) on delete cascade,
  fecha       date,
  descripcion text,
  monto       numeric(16,2) not null default 0,
  remito_url  text,
  remito_path text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_retiros_materiales_cuenta on public.retiros_materiales(cuenta_id);

alter table public.cuentas_materiales enable row level security;
alter table public.retiros_materiales enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='cuentas_materiales' and policyname='cuentas_materiales_all') then
    create policy cuentas_materiales_all on public.cuentas_materiales for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='retiros_materiales' and policyname='retiros_materiales_all') then
    create policy retiros_materiales_all on public.retiros_materiales for all using (true) with check (true);
  end if;
end $$;
