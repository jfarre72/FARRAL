-- =============================================================
-- FARRALAPP · Setup COMPLETO de base de datos (Supabase)
-- Correr UNA vez en: SQL Editor -> New query -> pegar -> RUN
-- Incluye esquema base + todas las migraciones (v2..v18).
-- Todo es idempotente (se puede recorrer de nuevo sin romper nada).
-- =============================================================


-- =============================================================
-- >>> schema.sql
-- =============================================================
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
  precio_venta_estimado numeric(16,2) default 0,
  costo_total_estimado  numeric(16,2) default 0,
  fecha_inversor_faltante date,
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
  fecha_inicio_calculo date,
  cantidad_m2         numeric(12,2) not null default 0,
  tipo_venta          text not null check (tipo_venta in ('pozo','avanzado')),
  costo_m2            numeric(14,2) not null default 0,
  monto               numeric(16,2) not null default 0,
  moneda              text not null default 'USD' check (moneda in ('USD','ARS')),
  entra_a_caja        boolean not null default true,
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

-- Subtareas de cada hito (lo más importante de cada etapa)
create table if not exists public.hito_tareas (
  id          uuid primary key default gen_random_uuid(),
  hito_id     uuid not null references public.hitos(id) on delete cascade,
  nombre      text not null,
  completado  boolean not null default false,
  orden       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_hitotareas_hito on public.hito_tareas(hito_id);

create or replace function public.fn_tareas_default(p_nombre text)
returns text[]
language sql immutable
as $$
  select case p_nombre
    when 'Inicio' then array[
      'Movimiento de suelo','Rampa de acceso','Cerco de obra','Baño químico','Obrador']
    when 'Cimentación' then array[
      'Excavación','Armado de hierros','Vigas de fundación','Hormigón de fundación']
    when 'Estructura' then array[
      'Columnas','Vigas','Losas','Escalera']
    when 'Obra cerrada' then array[
      'Mampostería exterior','Mampostería interior','Cubierta / techo','Premarcos / carpinterías']
    when 'Instalaciones + revoques' then array[
      'Instalación eléctrica','Instalación sanitaria','Instalación de gas',
      'Revoques gruesos','Revoques finos','Pisos','Pintura']
    else array[]::text[]
  end;
$$;

create or replace function public.fn_seed_tareas_hito(p_hito_id uuid, p_nombre text)
returns void language plpgsql as $$
declare v_tareas text[]; v_t text; v_i int := 0;
begin
  v_tareas := public.fn_tareas_default(p_nombre);
  foreach v_t in array v_tareas loop
    v_i := v_i + 1;
    insert into public.hito_tareas (hito_id, nombre, orden) values (p_hito_id, v_t, v_i);
  end loop;
end;
$$;

-- =====================================================================
-- TRIGGER: al crear un proyecto, generar los 6 hitos y sus subtareas
-- =====================================================================
create or replace function public.fn_seed_hitos_proyecto()
returns trigger
language plpgsql
as $$
declare r record;
begin
  insert into public.hitos (proyecto_id, nombre, porcentaje, orden) values
    (new.id, 'Inicio',                    0,   1),
    (new.id, 'Cimentación',               15,  2),
    (new.id, 'Estructura',                40,  3),
    (new.id, 'Obra cerrada',              65,  4),
    (new.id, 'Instalaciones + revoques',  85,  5),
    (new.id, 'Terminada',                 100, 6);
  for r in select id, nombre from public.hitos where proyecto_id = new.id loop
    perform public.fn_seed_tareas_hito(r.id, r.nombre);
  end loop;
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

drop trigger if exists trg_hitotareas_upd on public.hito_tareas;
create trigger trg_hitotareas_upd before update on public.hito_tareas
for each row execute function public.fn_set_updated_at();

-- =====================================================================
-- RLS - V1: lectura/escritura abierta con anon key.
-- IMPORTANTE: en V2 se reemplaza por políticas con auth.uid().
-- =====================================================================
alter table public.proyectos  enable row level security;
alter table public.inversores enable row level security;
alter table public.aportes    enable row level security;
alter table public.hitos      enable row level security;
alter table public.hito_tareas enable row level security;

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
  if not exists (select 1 from pg_policies where tablename='hito_tareas' and policyname='hitotareas_all') then
    create policy hitotareas_all on public.hito_tareas for all using (true) with check (true);
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
  tipo            text not null check (tipo in ('ingreso','egreso','cambio','traspaso')),
  moneda          text not null check (moneda in ('USD','ARS')),
  monto           numeric(16,2) not null default 0,
  categoria       text,
  etapa           text,
  descripcion     text,
  comprobante_url text,
  moneda_destino  text check (moneda_destino in ('USD','ARS')),
  tipo_cambio     numeric(14,4),
  monto_destino   numeric(16,2),
  -- Egreso con cambio integrado (un único registro, 3 impactos en caja)
  con_cambio            boolean default false,
  cambio_moneda_origen  text check (cambio_moneda_origen in ('USD','ARS')),
  cambio_monto_origen   numeric(16,2),
  cambio_tipo_cambio    numeric(14,4),
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


-- =============================================================
-- >>> v2_caja.sql
-- =============================================================
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
  tipo            text not null check (tipo in ('ingreso','egreso','cambio','traspaso')),
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


-- =============================================================
-- >>> v3_egreso_cambio.sql
-- =============================================================
-- =====================================================================
-- FARRALAPP - Migración V3 (Egreso con cambio integrado)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente. Se puede correr sobre la base de V1+V2.
-- =====================================================================

-- Nuevos campos para egreso con cambio previo en un mismo registro:
--   con_cambio              -> indica si el egreso requirió convertir antes
--   cambio_moneda_origen    -> caja origen del cambio (la que se "vende")
--   cambio_monto_origen     -> cuánto sale de esa caja
--   cambio_tipo_cambio      -> ARS por 1 USD
--
-- Convenciones:
--   moneda / monto    -> moneda y monto DEL GASTO (caja destino del cambio)
--   La caja origen sufre -cambio_monto_origen
--   La caja del gasto recibe la conversión y luego paga el gasto:
--     entrada = monto_origen * tipo_cambio    (si origen = USD)
--             = monto_origen / tipo_cambio    (si origen = ARS)
--     neto en caja destino = entrada - monto_gasto

alter table public.movimientos_caja
  add column if not exists con_cambio              boolean default false,
  add column if not exists cambio_moneda_origen    text check (cambio_moneda_origen in ('USD','ARS')),
  add column if not exists cambio_monto_origen     numeric(16,2),
  add column if not exists cambio_tipo_cambio      numeric(14,4);


-- =============================================================
-- >>> v4_tareas.sql
-- =============================================================
-- =====================================================================
-- FARRALAPP - Migración V4 (Subtareas por etapa en Línea de tiempo)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente. Se puede correr sobre V1+V2+V3.
-- =====================================================================

-- 1) Tabla de subtareas de cada hito ----------------------------------
create table if not exists public.hito_tareas (
  id          uuid primary key default gen_random_uuid(),
  hito_id     uuid not null references public.hitos(id) on delete cascade,
  nombre      text not null,
  completado  boolean not null default false,
  orden       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_hitotareas_hito on public.hito_tareas(hito_id);

drop trigger if exists trg_hitotareas_upd on public.hito_tareas;
create trigger trg_hitotareas_upd before update on public.hito_tareas
for each row execute function public.fn_set_updated_at();

alter table public.hito_tareas enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='hito_tareas' and policyname='hitotareas_all') then
    create policy hitotareas_all on public.hito_tareas for all using (true) with check (true);
  end if;
end $$;

-- 2) Catálogo de tareas sugeridas por nombre de etapa -----------------
--    (lo más importante de cada etapa, sin mega-listas)
create or replace function public.fn_tareas_default(p_nombre text)
returns text[]
language sql immutable
as $$
  select case p_nombre
    when 'Inicio' then array[
      'Movimiento de suelo','Rampa de acceso','Cerco de obra',
      'Baño químico','Obrador']
    when 'Cimentación' then array[
      'Excavación','Armado de hierros','Vigas de fundación','Hormigón de fundación']
    when 'Estructura' then array[
      'Columnas','Vigas','Losas','Escalera']
    when 'Obra cerrada' then array[
      'Mampostería exterior','Mampostería interior','Cubierta / techo','Premarcos / carpinterías']
    when 'Instalaciones + revoques' then array[
      'Instalación eléctrica','Instalación sanitaria','Instalación de gas',
      'Revoques gruesos','Revoques finos','Pisos','Pintura']
    else array[]::text[]
  end;
$$;

-- 3) Sembrar subtareas para un hito -----------------------------------
create or replace function public.fn_seed_tareas_hito(p_hito_id uuid, p_nombre text)
returns void
language plpgsql
as $$
declare
  v_tareas text[];
  v_t      text;
  v_i      int := 0;
begin
  v_tareas := public.fn_tareas_default(p_nombre);
  foreach v_t in array v_tareas loop
    v_i := v_i + 1;
    insert into public.hito_tareas (hito_id, nombre, orden) values (p_hito_id, v_t, v_i);
  end loop;
end;
$$;

-- 4) Extender el trigger de creación de proyecto para sembrar tareas ---
create or replace function public.fn_seed_hitos_proyecto()
returns trigger
language plpgsql
as $$
declare
  r record;
begin
  insert into public.hitos (proyecto_id, nombre, porcentaje, orden) values
    (new.id, 'Inicio',                    0,   1),
    (new.id, 'Cimentación',               15,  2),
    (new.id, 'Estructura',                40,  3),
    (new.id, 'Obra cerrada',              65,  4),
    (new.id, 'Instalaciones + revoques',  85,  5),
    (new.id, 'Terminada',                 100, 6);

  for r in select id, nombre from public.hitos where proyecto_id = new.id loop
    perform public.fn_seed_tareas_hito(r.id, r.nombre);
  end loop;
  return new;
end;
$$;

-- 5) Sembrar tareas para los hitos YA existentes (proyectos creados
--    antes de esta migración) que aún no tengan subtareas --------------
do $$
declare
  r record;
begin
  for r in
    select h.id, h.nombre
    from public.hitos h
    where not exists (select 1 from public.hito_tareas t where t.hito_id = h.id)
  loop
    perform public.fn_seed_tareas_hito(r.id, r.nombre);
  end loop;
end $$;


-- =============================================================
-- >>> v5_ponderacion.sql
-- =============================================================
-- =====================================================================
-- FARRALAPP - Migración V5 (Estimación financiera + ponderación por días)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente. Se puede correr sobre V1+V2+V3+V4.
-- =====================================================================

-- 1) Estimación financiera del proyecto -------------------------------
--    precio_venta_estimado : ingreso esperado total (USD)
--    costo_total_estimado  : costo total esperado    (USD)
--    El costo por m² se calcula en el front: costo_total_estimado / m2_totales
--    La ganancia estimada: precio_venta_estimado - costo_total_estimado
alter table public.proyectos
  add column if not exists precio_venta_estimado numeric(16,2) default 0,
  add column if not exists costo_total_estimado  numeric(16,2) default 0;

-- 2) Aportes: fecha de inicio de cómputo ------------------------------
--    Cuando se registra un aporte, "fecha" es la fecha de ingreso a caja.
--    "fecha_inicio_calculo" es desde cuándo cuenta para la ponderación
--    (días en el proyecto). Por defecto es igual a "fecha".
alter table public.aportes
  add column if not exists fecha_inicio_calculo date;

-- Backfill para aportes existentes
update public.aportes
   set fecha_inicio_calculo = fecha
 where fecha_inicio_calculo is null;


-- =============================================================
-- >>> v6_faltante.sql
-- =============================================================
-- =====================================================================
-- FARRALAPP - Migración V6 (Fecha del inversor "Faltante")
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- "Inversor Faltante" es un inversor virtual cuyo aporte es
--   max(0, costo_total_estimado - sum(aportes_USD))
-- Su fecha_inicio_calculo es esta nueva fecha (cuándo se asume que
-- entraría ese capital). Si no se setea, se usa fecha_fin del proyecto.
alter table public.proyectos
  add column if not exists fecha_inversor_faltante date;


-- =============================================================
-- >>> v7_entra_caja.sql
-- =============================================================
-- =====================================================================
-- FARRALAPP - Migración V7 (Aportes que no entran a caja)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Algunos aportes representan honorarios o servicios que se pagan al
-- final con su % de ganancia, sin ingresar efectivo a caja.
-- Estos aportes:
--   - SI cuentan para el % recaudado y la ponderación
--   - NO impactan en los saldos ni movimientos de caja
alter table public.aportes
  add column if not exists entra_a_caja boolean not null default true;

-- Backfill: aportes existentes mantienen el default (true).


-- =============================================================
-- >>> v8_presupuestos.sql
-- =============================================================
-- =====================================================================
-- FARRALAPP - Migración V8 (Contratistas, Presupuestos, Imputaciones)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- 1) Contratistas (por proyecto) ---------------------------------------
create table if not exists public.contratistas (
  id            uuid primary key default gen_random_uuid(),
  proyecto_id   uuid not null references public.proyectos(id) on delete cascade,
  nombre        text not null,
  telefono      text,
  rubro         text,
  observaciones text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_contratistas_proyecto on public.contratistas(proyecto_id);

drop trigger if exists trg_contratistas_upd on public.contratistas;
create trigger trg_contratistas_upd before update on public.contratistas
for each row execute function public.fn_set_updated_at();

-- 2) Presupuestos ------------------------------------------------------
create table if not exists public.presupuestos (
  id             uuid primary key default gen_random_uuid(),
  proyecto_id    uuid not null references public.proyectos(id) on delete cascade,
  contratista_id uuid not null references public.contratistas(id) on delete cascade,
  nombre         text not null,
  fecha          date not null default current_date,
  moneda         text not null default 'ARS' check (moneda in ('USD','ARS')),
  estado         text not null default 'activo' check (estado in ('activo','cerrado','cancelado')),
  observaciones  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_presupuestos_proyecto    on public.presupuestos(proyecto_id);
create index if not exists idx_presupuestos_contratista on public.presupuestos(contratista_id);

drop trigger if exists trg_presupuestos_upd on public.presupuestos;
create trigger trg_presupuestos_upd before update on public.presupuestos
for each row execute function public.fn_set_updated_at();

-- 3) Ítems del presupuesto --------------------------------------------
create table if not exists public.presupuesto_items (
  id                   uuid primary key default gen_random_uuid(),
  presupuesto_id       uuid not null references public.presupuestos(id) on delete cascade,
  nombre               text not null,
  etapa                text,
  monto_presupuestado  numeric(16,2) not null default 0 check (monto_presupuestado >= 0),
  avance_pct           numeric(5,2)  not null default 0 check (avance_pct between 0 and 100),
  estado               text not null default 'pendiente' check (estado in ('pendiente','en_curso','terminado')),
  observaciones        text,
  orden                integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_items_presupuesto on public.presupuesto_items(presupuesto_id);

drop trigger if exists trg_items_upd on public.presupuesto_items;
create trigger trg_items_upd before update on public.presupuesto_items
for each row execute function public.fn_set_updated_at();

-- 4) Imputaciones de pago: vincula un egreso de caja a uno o varios ítems
create table if not exists public.imputaciones_pago (
  id            uuid primary key default gen_random_uuid(),
  movimiento_id uuid not null references public.movimientos_caja(id) on delete cascade,
  item_id       uuid not null references public.presupuesto_items(id) on delete cascade,
  monto         numeric(16,2) not null default 0 check (monto >= 0),
  created_at    timestamptz not null default now()
);
create index if not exists idx_imput_mov  on public.imputaciones_pago(movimiento_id);
create index if not exists idx_imput_item on public.imputaciones_pago(item_id);

-- 5) RLS (abierto en V1)
alter table public.contratistas       enable row level security;
alter table public.presupuestos       enable row level security;
alter table public.presupuesto_items  enable row level security;
alter table public.imputaciones_pago  enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='contratistas' and policyname='contratistas_all') then
    create policy contratistas_all on public.contratistas for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='presupuestos' and policyname='presupuestos_all') then
    create policy presupuestos_all on public.presupuestos for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='presupuesto_items' and policyname='presupuesto_items_all') then
    create policy presupuesto_items_all on public.presupuesto_items for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='imputaciones_pago' and policyname='imputaciones_pago_all') then
    create policy imputaciones_pago_all on public.imputaciones_pago for all using (true) with check (true);
  end if;
end $$;


-- =============================================================
-- >>> v9_etapas_caja.sql
-- =============================================================
-- =====================================================================
-- FARRALAPP - Migración V9 (Etapa en movimientos de caja)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Permite asociar un egreso/ingreso a una etapa de obra (texto libre,
-- típicamente uno de los nombres de hitos del proyecto: Inicio,
-- Cimentación, Estructura, Obra cerrada, Instalaciones + revoques,
-- Terminada). Se guarda como texto para que no se rompa si el hito
-- se renombra/borra.
alter table public.movimientos_caja
  add column if not exists etapa text;


-- =============================================================
-- >>> v10_temas.sql
-- =============================================================
-- =====================================================================
-- FARRALAPP - Migración V10 (Seguimiento de tareas / TEMAS FARRAL)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Tabla de temas operativos para seguimiento en reuniones estilo PM.
-- Cada tema tiene un título (la tarea), un responsable (texto libre, p.ej.
-- "JUAN", "RODRI" o "RODRI|JUAN"), una fecha, un flag de completado y una
-- observación opcional.
create table if not exists public.temas (
  id            uuid primary key default gen_random_uuid(),
  proyecto_id   uuid not null references public.proyectos(id) on delete cascade,
  titulo        text not null,
  responsable   text,
  fecha         date,
  completado    boolean not null default false,
  observacion   text,
  orden         integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_temas_proyecto on public.temas(proyecto_id);

-- Trigger para mantener updated_at (usa la función existente fn_set_updated_at)
drop trigger if exists trg_temas_upd on public.temas;
create trigger trg_temas_upd before update on public.temas
for each row execute function public.fn_set_updated_at();

-- RLS abierta (igual que el resto de las tablas del proyecto)
alter table public.temas enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='temas' and policyname='temas_all') then
    create policy temas_all on public.temas for all using (true) with check (true);
  end if;
end $$;


-- =============================================================
-- >>> v11_temas_etiqueta.sql
-- =============================================================
-- =====================================================================
-- FARRALAPP - Migración V11 (Etiqueta de prioridad en temas)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Etiqueta de prioridad para cada tema de seguimiento.
-- Valores típicos: NORMAL, URGENTE.
alter table public.temas
  add column if not exists etiqueta text not null default 'NORMAL';


-- =============================================================
-- >>> v12_tareas_avance.sql
-- =============================================================
-- =====================================================================
-- FARRALAPP - Migración V12 (Avance % por tarea de hito)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- % de avance por tarea (0-100) y marca temporal de completado, para poder
-- informar en el reporte mensual qué tareas se terminaron en el mes.
alter table public.hito_tareas
  add column if not exists avance integer not null default 0 check (avance between 0 and 100),
  add column if not exists completado_at timestamptz;

-- Backfill: las tareas ya completadas pasan a 100% y toman fecha de completado.
update public.hito_tareas set avance = 100 where completado and avance = 0;
update public.hito_tareas set completado_at = coalesce(completado_at, updated_at) where completado;


-- =============================================================
-- >>> v13_galeria.sql
-- =============================================================
-- =====================================================================
-- FARRALAPP - Migración V13 (Galería de fotos)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Tabla de fotos del proyecto (la imagen se guarda en Storage; acá va la URL).
create table if not exists public.fotos (
  id           uuid primary key default gen_random_uuid(),
  proyecto_id  uuid not null references public.proyectos(id) on delete cascade,
  url          text not null,
  path         text,
  fecha        date not null default current_date,
  descripcion  text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_fotos_proyecto on public.fotos(proyecto_id);

alter table public.fotos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='fotos' and policyname='fotos_all') then
    create policy fotos_all on public.fotos for all using (true) with check (true);
  end if;
end $$;

-- Bucket de Storage público para las imágenes.
insert into storage.buckets (id, name, public)
values ('galeria', 'galeria', true)
on conflict (id) do nothing;

-- Políticas abiertas sobre los objetos del bucket 'galeria'.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='galeria_select') then
    create policy galeria_select on storage.objects for select using (bucket_id = 'galeria');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='galeria_insert') then
    create policy galeria_insert on storage.objects for insert with check (bucket_id = 'galeria');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='galeria_delete') then
    create policy galeria_delete on storage.objects for delete using (bucket_id = 'galeria');
  end if;
end $$;


-- =============================================================
-- >>> v14_presupuesto_fotos.sql
-- =============================================================
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


-- =============================================================
-- >>> v15_conceptos.sql
-- =============================================================
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


-- =============================================================
-- >>> v16_tc_gasto.sql
-- =============================================================
-- =====================================================================
-- FARRALAPP - Migración V16 (Tipo de cambio del gasto para imputación en USD)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Tipo de cambio (ARS por 1 USD) usado para valuar en USD un egreso pagado
-- en pesos sin cambio integrado, al imputarlo a un concepto / etapa.
-- Para egresos "con cambio" se usa cambio_tipo_cambio; este campo cubre el
-- caso de pagar desde la caja de pesos ya existente.
alter table public.movimientos_caja
  add column if not exists tipo_cambio_gasto numeric(16,4);


-- =============================================================
-- >>> v17_tipo_costo_rubro.sql
-- =============================================================
-- =====================================================================
-- FARRALAPP - Migración V17 (Tipo de costo y Rubro en los egresos)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Dos etiquetas más para los egresos:
--  - tipo_costo: Mano de Obra / Materiales / Equipamiento / Servicios
--  - rubro: Movimiento de suelo / Estructura / ... / Pintura
alter table public.movimientos_caja
  add column if not exists tipo_costo text;

alter table public.movimientos_caja
  add column if not exists rubro text;


-- =============================================================
-- >>> v18_equipamientos.sql
-- =============================================================
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


-- =============================================================
-- >>> v19_materiales.sql
-- =============================================================
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

