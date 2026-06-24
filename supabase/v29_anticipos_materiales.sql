-- =====================================================================
-- FARRALAPP - Migración V29 (Varios anticipos por cuenta de materiales)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Una misma cuenta de materiales (ej. "Materiales Moreno") puede recibir
-- varios anticipos a lo largo de la obra (acopios sucesivos), cada uno con
-- su fecha. El anticipo total de la cuenta es la suma de estos registros.
-- La columna cuentas_materiales.monto_inicial queda como legado: el alta de
-- cuenta crea el primer anticipo en esta tabla.
create table if not exists public.anticipos_materiales (
  id          uuid primary key default gen_random_uuid(),
  cuenta_id   uuid not null references public.cuentas_materiales(id) on delete cascade,
  monto       numeric(16,2) not null default 0,
  fecha       date,
  descripcion text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_anticipos_materiales_cuenta on public.anticipos_materiales(cuenta_id);

alter table public.anticipos_materiales enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='anticipos_materiales' and policyname='anticipos_materiales_all') then
    create policy anticipos_materiales_all on public.anticipos_materiales for all using (true) with check (true);
  end if;
end $$;

-- Semilla one-time: migra el anticipo inicial existente de cada cuenta a la
-- tabla de anticipos (sólo si la cuenta todavía no tiene anticipos cargados).
insert into public.anticipos_materiales (cuenta_id, monto, fecha)
select c.id, c.monto_inicial, c.fecha
from public.cuentas_materiales c
where coalesce(c.monto_inicial, 0) > 0
  and not exists (
    select 1 from public.anticipos_materiales a where a.cuenta_id = c.id
  );
