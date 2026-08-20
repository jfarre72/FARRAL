-- =====================================================================
-- FARRALAPP - Migración V33 (Devolución a saldo asignada a un acopio/lista)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Cada devolución a saldo (recupero) representa la devolución de material de
-- un acopio concreto. Para poder imputarla a la lista/acopio correcto (y sumarla
-- a su saldo: anticipo − retirado + recupero), guardamos a qué anticipo real
-- (acopio) pertenece la devolución. NULL = devoluciones viejas (se adjuntan al
-- primer acopio de la cuenta como legado).
alter table public.anticipos_materiales
  add column if not exists lista_anticipo_id uuid
    references public.anticipos_materiales(id) on delete set null;
