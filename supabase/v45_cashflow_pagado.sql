-- =====================================================================
-- FARRALAPP - Migración V45 (Cashflow: marcar ítems como pagados)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Un ítem de cashflow se puede marcar como pagado para que deje de aparecer en
-- el cashflow por pagar (así siempre se ven las próximas semanas). Se conserva
-- para poder revisarlo o desmarcarlo.
alter table public.cashflow_items
  add column if not exists pagado boolean not null default false;
