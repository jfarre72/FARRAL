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
