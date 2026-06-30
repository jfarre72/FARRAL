-- =====================================================================
-- FARRALAPP - Migración V37 (Notas con archivos / fotos adjuntas)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Notas libres del proyecto. Ej: "Calculé que 1000 ladrillos cubren X m2".
-- Cada nota puede tener varios archivos o fotos adjuntas (tabla aparte).
create table if not exists public.notas (
  id           uuid primary key default gen_random_uuid(),
  proyecto_id  uuid not null references public.proyectos(id) on delete cascade,
  titulo       text,
  texto        text,
  fecha        date not null default current_date,
  created_at   timestamptz not null default now()
);
create index if not exists idx_notas_proyecto on public.notas(proyecto_id);

create table if not exists public.nota_archivos (
  id           uuid primary key default gen_random_uuid(),
  nota_id      uuid not null references public.notas(id) on delete cascade,
  url          text not null,
  path         text,
  nombre       text not null,
  mime         text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_nota_archivos_nota on public.nota_archivos(nota_id);

alter table public.notas enable row level security;
alter table public.nota_archivos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='notas' and policyname='notas_all') then
    create policy notas_all on public.notas for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='nota_archivos' and policyname='nota_archivos_all') then
    create policy nota_archivos_all on public.nota_archivos for all using (true) with check (true);
  end if;
end $$;

-- Bucket de Storage público para los adjuntos de las notas.
insert into storage.buckets (id, name, public)
values ('notas', 'notas', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='notas_select') then
    create policy notas_select on storage.objects for select using (bucket_id = 'notas');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='notas_insert') then
    create policy notas_insert on storage.objects for insert with check (bucket_id = 'notas');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='notas_delete') then
    create policy notas_delete on storage.objects for delete using (bucket_id = 'notas');
  end if;
end $$;
