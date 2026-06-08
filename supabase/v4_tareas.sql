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
