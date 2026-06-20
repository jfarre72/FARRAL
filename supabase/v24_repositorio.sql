-- =====================================================================
-- FARRALAPP - Migración V24 (Repositorio de archivos: PDFs / imágenes)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Archivos del proyecto (presupuestos, planos, fichas). El archivo se guarda
-- en Storage; acá va la URL, el nombre, la fecha y una etiqueta (ej:
-- "aberturas", "radiadores").
create table if not exists public.repositorio (
  id           uuid primary key default gen_random_uuid(),
  proyecto_id  uuid not null references public.proyectos(id) on delete cascade,
  url          text not null,
  path         text,
  nombre       text not null,
  mime         text,
  fecha        date not null default current_date,
  etiqueta     text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_repositorio_proyecto on public.repositorio(proyecto_id);

alter table public.repositorio enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='repositorio' and policyname='repositorio_all') then
    create policy repositorio_all on public.repositorio for all using (true) with check (true);
  end if;
end $$;

-- Bucket de Storage público para los archivos del repositorio.
insert into storage.buckets (id, name, public)
values ('repositorio', 'repositorio', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='repositorio_select') then
    create policy repositorio_select on storage.objects for select using (bucket_id = 'repositorio');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='repositorio_insert') then
    create policy repositorio_insert on storage.objects for insert with check (bucket_id = 'repositorio');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='repositorio_delete') then
    create policy repositorio_delete on storage.objects for delete using (bucket_id = 'repositorio');
  end if;
end $$;
