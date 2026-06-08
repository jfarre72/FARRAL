-- =====================================================================
-- FARRALAPP - Migración V2 (Caja + ajustes de proyectos)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Es incremental e idempotente: se puede correr sobre la base de la V1.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) PROYECTOS: nuevos campos
--    - m2_terreno: total del terreno
--    - costo_m2_pozo: costo de m2 de pozo (precarga en aportes)
--    - precio_venta_m2: precio de venta del m2 (precarga en aportes)
-- ---------------------------------------------------------------------
alter table public.proyectos add column if not exists m2_terreno      numeric(12,2) default 0;
alter table public.proyectos add column if not exists costo_m2_pozo   numeric(14,2) default 0;
alter table public.proyectos add column if not exists precio_venta_m2 numeric(14,2) default 0;

-- ---------------------------------------------------------------------
-- 2) CAJA: movimientos manuales (ingresos, egresos y cambio de divisa)
--    Los APORTES siguen siendo ingresos y se computan aparte (no se
--    duplican acá). Esta tabla cubre egresos, ingresos manuales y la
--    operación de cambio (venta de divisa).
--
--    tipo:
--      'ingreso' -> entra a la caja {moneda}
--      'egreso'  -> sale de la caja {moneda}
--      'cambio'  -> venta de divisa: sale {monto} de caja {moneda} y
--                   entra (monto * tipo_cambio) a la caja {moneda_destino}
-- ---------------------------------------------------------------------
create table if not exists public.movimientos_caja (
  id              uuid primary key default gen_random_uuid(),
  proyecto_id     uuid not null references public.proyectos(id) on delete cascade,
  fecha           date not null default current_date,
  tipo            text not null check (tipo in ('ingreso','egreso','cambio')),
  -- moneda de la caja afectada principal (en 'cambio' es la caja de ORIGEN)
  moneda          text not null check (moneda in ('USD','ARS')),
  monto           numeric(16,2) not null default 0,
  -- categoría sólo aplica a egresos (MOD, Materiales, etc.)
  categoria       text,
  descripcion     text,
  -- comprobante (path dentro del bucket 'comprobantes' de Storage)
  comprobante_url text,
  -- campos de cambio de divisa
  moneda_destino  text check (moneda_destino in ('USD','ARS')),
  tipo_cambio     numeric(14,4),
  monto_destino   numeric(16,2),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_movcaja_proyecto on public.movimientos_caja(proyecto_id);
create index if not exists idx_movcaja_fecha    on public.movimientos_caja(fecha);

drop trigger if exists trg_movcaja_upd on public.movimientos_caja;
create trigger trg_movcaja_upd before update on public.movimientos_caja
for each row execute function public.fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 3) Categorías de egreso (catálogo editable). Seed inicial.
-- ---------------------------------------------------------------------
create table if not exists public.categorias_egreso (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  created_at  timestamptz not null default now()
);

insert into public.categorias_egreso (nombre) values
  ('MOD'), ('Mantenimiento'), ('Materiales'), ('Expensas'),
  ('Servicios'), ('Honorarios'), ('Impuestos'), ('Otros')
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------
-- 4) RLS abierto (V1/V2). Reemplazar por auth.uid() en producción.
-- ---------------------------------------------------------------------
alter table public.movimientos_caja  enable row level security;
alter table public.categorias_egreso enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='movimientos_caja' and policyname='movcaja_all') then
    create policy movcaja_all on public.movimientos_caja for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='categorias_egreso' and policyname='catego_all') then
    create policy catego_all on public.categorias_egreso for all using (true) with check (true);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5) STORAGE: bucket para comprobantes
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', true)
on conflict (id) do nothing;

-- Políticas de Storage (lectura pública + escritura/borrado con anon).
-- Idempotentes.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='comprobantes_read') then
    create policy comprobantes_read on storage.objects for select
      using (bucket_id = 'comprobantes');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='comprobantes_insert') then
    create policy comprobantes_insert on storage.objects for insert
      with check (bucket_id = 'comprobantes');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='comprobantes_delete') then
    create policy comprobantes_delete on storage.objects for delete
      using (bucket_id = 'comprobantes');
  end if;
end $$;
