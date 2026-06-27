-- =====================================================================
-- FARRALAPP - Migración V36 (Registro de uso/costo del asistente de IA)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Cada llamada al asistente (carga por voz, lectura de remitos, etc.) registra
-- acá los tokens consumidos y el costo estimado en USD, para poder mostrar
-- "cuánto se va gastando" dentro de la app.
create table if not exists public.ia_uso (
  id            uuid primary key default gen_random_uuid(),
  proyecto_id   uuid references public.proyectos(id) on delete set null,
  fecha         date not null default current_date,
  tipo          text,                       -- 'caja' | 'remito' | ...
  modelo        text,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  costo_usd     numeric(12,6) not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_ia_uso_proyecto on public.ia_uso(proyecto_id);
create index if not exists idx_ia_uso_fecha on public.ia_uso(fecha);

-- RLS abierta (igual que el resto de las tablas del proyecto)
alter table public.ia_uso enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='ia_uso' and policyname='ia_uso_all') then
    create policy ia_uso_all on public.ia_uso for all using (true) with check (true);
  end if;
end $$;
