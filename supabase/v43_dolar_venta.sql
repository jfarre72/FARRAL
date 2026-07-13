-- =====================================================================
-- FARRALAPP - Migración V43 (Dólar de venta guardado por proyecto)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- El dólar de venta que se usa en el Plan financiero queda guardado por
-- proyecto, para no tener que cargarlo cada vez que se entra a la página.
alter table public.proyectos
  add column if not exists dolar_venta numeric(14,4);
