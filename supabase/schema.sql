-- =====================================================================
-- FARRALAPP - Schema V1
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- =====================================================================

-- Extensiones
create extension if not exists "pgcrypto";

-- =====================================================================
-- PROYECTOS
-- =====================================================================
create table if not exists public.proyectos (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  descripcion     text,
  m2_cubiertos    numeric(12,2) default 0,
  m2_semicubiertos numeric(12,2) default 0,
  m2_totales      numeric(12,2) default 0,
  m2_terreno      numeric(12,2) default 0,
  costo_m2_pozo   numeric(14,2) default 0,
  precio_venta_m2 numeric(14,2) default 0,
  fecha_inicio    date,
  fecha_fin       date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =====================================================================
-- INVERSORES
-- =====================================================================
create table if not exists public.inversores (
  id              uuid primary key default gen_random_uuid(),
  proyecto_id     uuid not null references public.proyectos(id) on delete cascade,
  nombre          text not null,
  contacto        text,
  moneda_habitual text not null default 'USD' check (moneda_habitual in ('USD','ARS')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_inversores_proyecto on public.inversores(proyecto_id);

-- =====================================================================
-- APORTES DE CAPITAL
-- =====================================================================
create table if not exists public.aportes (
  id                  uuid primary key default gen_random_uuid(),
  proyecto_id         uuid not null references public.proyectos(id) on delete cascade,
  inversor_id         uuid not null references public.inversores(id) on delete cascade,
  fecha               date not null default current_date,
  cantidad_m2         numeric(12,2) not null default 0,
  tipo_venta          text not null check (tipo_venta in ('pozo','avanzado')),
  costo_m2            numeric(14,2) not null default 0,
  monto               numeric(16,2) not null default 0,
  moneda              text not null default 'USD' check (moneda in ('USD','ARS')),
  precio_venta_final  numeric(14,2),
  observacion         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_aportes_proyecto on public.aportes(proyecto_id);
create index if not exists idx_aportes_inversor on public.aportes(inversor_id);

-- =====================================================================
-- LINEA DE TIEMPO (HITOS)
-- Cada proyecto tiene 6 hitos por defecto (Inicio, Cimentación, ...)
-- =====================================================================
create table if not exists public.hitos (
  id              uuid primary key default gen_random_uuid(),
  proyecto_id     uuid not null references public.proyectos(id) on delete cascade,
  nombre          text not null,
  porcentaje      integer not null check (porcentaje between 0 and 100),
  orden           integer not null default 0,
  fecha_estimada  date,
  fecha_real      date,
  completado      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_hitos_proyecto on public.hitos(proyecto_id);

-- =====================================================================
-- TRIGGER: al crear un proyecto, generar los 6 hitos por defecto
-- =====================================================================
create or replace function public.fn_seed_hitos_proyecto()
returns trigger
language plpgsql
as $$
begin
  insert into public.hitos (proyecto_id, nombre, porcentaje, orden) values
    (new.id, 'Inicio',                    0,   1),
    (new.id, 'Cimentación',               15,  2),
    (new.id, 'Estructura',                40,  3),
    (new.id, 'Obra cerrada',              65,  4),
    (new.id, 'Instalaciones + revoques',  85,  5),
    (new.id, 'Terminada',                 100, 6);
  return new;
end;
$$;

drop trigger if exists trg_seed_hitos on public.proyectos;
create trigger trg_seed_hitos
after insert on public.proyectos
for each row execute function public.fn_seed_hitos_proyecto();

-- =====================================================================
-- TRIGGER: updated_at automático
-- =====================================================================
create or replace function public.fn_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_proy_upd on public.proyectos;
create trigger trg_proy_upd before update on public.proyectos
for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_inv_upd on public.inversores;
create trigger trg_inv_upd before update on public.inversores
for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_apo_upd on public.aportes;
create trigger trg_apo_upd before update on public.aportes
for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_hit_upd on public.hitos;
create trigger trg_hit_upd before update on public.hitos
for each row execute function public.fn_set_updated_at();

-- =====================================================================
-- RLS - V1: lectura/escritura abierta con anon key.
-- IMPORTANTE: en V2 se reemplaza por políticas con auth.uid().
-- =====================================================================
alter table public.proyectos  enable row level security;
alter table public.inversores enable row level security;
alter table public.aportes    enable row level security;
alter table public.hitos      enable row level security;

do $$
begin
  -- proyectos
  if not exists (select 1 from pg_policies where tablename='proyectos' and policyname='proyectos_all') then
    create policy proyectos_all on public.proyectos for all using (true) with check (true);
  end if;
  -- inversores
  if not exists (select 1 from pg_policies where tablename='inversores' and policyname='inversores_all') then
    create policy inversores_all on public.inversores for all using (true) with check (true);
  end if;
  -- aportes
  if not exists (select 1 from pg_policies where tablename='aportes' and policyname='aportes_all') then
    create policy aportes_all on public.aportes for all using (true) with check (true);
  end if;
  -- hitos
  if not exists (select 1 from pg_policies where tablename='hitos' and policyname='hitos_all') then
    create policy hitos_all on public.hitos for all using (true) with check (true);
  end if;
end $$;

-- =====================================================================
-- CAJA: movimientos manuales (ingresos, egresos y cambio de divisa)
-- Los aportes son ingresos y se computan aparte (no se duplican aquí).
-- =====================================================================
create table if not exists public.movimientos_caja (
  id              uuid primary key default gen_random_uuid(),
  proyecto_id     uuid not null references public.proyectos(id) on delete cascade,
  fecha           date not null default current_date,
  tipo            text not null check (tipo in ('ingreso','egreso','cambio')),
  moneda          text not null check (moneda in ('USD','ARS')),
  monto           numeric(16,2) not null default 0,
  categoria       text,
  descripcion     text,
  comprobante_url text,
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

create table if not exists public.categorias_egreso (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  created_at  timestamptz not null default now()
);

insert into public.categorias_egreso (nombre) values
  ('MOD'), ('Mantenimiento'), ('Materiales'), ('Expensas'),
  ('Servicios'), ('Honorarios'), ('Impuestos'), ('Otros')
on conflict (nombre) do nothing;

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

-- Storage: bucket de comprobantes
insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='comprobantes_read') then
    create policy comprobantes_read on storage.objects for select using (bucket_id = 'comprobantes');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='comprobantes_insert') then
    create policy comprobantes_insert on storage.objects for insert with check (bucket_id = 'comprobantes');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='comprobantes_delete') then
    create policy comprobantes_delete on storage.objects for delete using (bucket_id = 'comprobantes');
  end if;
end $$;

-- =====================================================================
-- (Opcional) Seed de ejemplo: Álvarez del Bosque
-- =====================================================================
-- insert into public.proyectos (nombre, descripcion, m2_cubiertos, m2_semicubiertos, m2_totales, fecha_inicio, fecha_fin)
-- values ('Álvarez del Bosque', 'Proyecto inicial', 800, 200, 1000, current_date, current_date + interval '18 months');
