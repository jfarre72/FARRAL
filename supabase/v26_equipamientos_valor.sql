-- =====================================================================
-- FARRALAPP - Migración V26 (Valor de referencia en equipamientos)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Valor de referencia (precio estimado) por equipamiento, con su moneda.
alter table public.equipamientos
  add column if not exists valor  numeric,
  add column if not exists moneda text not null default 'USD'
    check (moneda in ('USD', 'ARS'));
