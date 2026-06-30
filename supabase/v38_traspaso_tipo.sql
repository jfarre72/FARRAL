-- =====================================================================
-- FARRALAPP - Migración V38 (Permitir tipo 'traspaso' en movimientos_caja)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- La V20 agregó los traspasos entre cajas personales (columna
-- titular_destino) y la app inserta movimientos con tipo = 'traspaso',
-- pero el CHECK original solo permitía ('ingreso','egreso','cambio').
-- Esto hacía fallar el registro de traspasos con el error:
--   new row for relation "movimientos_caja" violates check constraint
--   "movimientos_caja_tipo_check"
-- Recreamos el constraint incluyendo 'traspaso'.

alter table public.movimientos_caja
  drop constraint if exists movimientos_caja_tipo_check;

alter table public.movimientos_caja
  add constraint movimientos_caja_tipo_check
  check (tipo in ('ingreso','egreso','cambio','traspaso'));
