-- =====================================================================
-- FARRALAPP - Migración V33 (Egreso de Caja como acopio de materiales)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Un egreso de Caja puede marcarse como "acopio de materiales": además de salir
-- la plata de la caja, genera automáticamente el anticipo en la cuenta de
-- materiales correspondiente (sin tener que cargarlo a mano por duplicado).
-- El anticipo queda vinculado al movimiento (movimiento_id); si se borra el
-- egreso, el anticipo se borra en cascada.
alter table public.movimientos_caja
  add column if not exists anticipo_materiales boolean not null default false;
-- (cuenta_materiales_id ya existe desde la V27 y se reutiliza para el acopio.)

alter table public.anticipos_materiales
  add column if not exists movimiento_id uuid
    references public.movimientos_caja(id) on delete cascade;

create index if not exists idx_anticipos_materiales_mov
  on public.anticipos_materiales(movimiento_id);
