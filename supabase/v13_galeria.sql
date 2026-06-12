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
