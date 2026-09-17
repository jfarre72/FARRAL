-- =====================================================================
-- FARRALAPP - Migración V47 (Sumar plata a un acopio + traspaso de saldos)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Dos funciones nuevas sobre la cuenta de materiales (acopio):
--   1) SUMAR PLATA a mano: cargar un anticipo directamente desde Materiales
--      (sin pasar por Caja). Se guarda como un anticipo más de la cuenta.
--      No requiere columnas nuevas: reutiliza anticipos_materiales.
--
--   2) TRASPASO de saldo entre acopios: pasar plata del saldo disponible de
--      una cuenta a otra (o un importe manual). Se registra como un PAR de
--      anticipos vinculados:
--        - En la cuenta ORIGEN: un anticipo con monto NEGATIVO (baja el saldo).
--        - En la cuenta DESTINO: un anticipo con monto POSITIVO (sube el saldo).
--      Ambos quedan marcados es_traspaso = true, apuntan a la cuenta
--      contraparte (traspaso_cuenta_id) y comparten un mismo traspaso_grupo
--      para poder borrarlos juntos.
alter table public.anticipos_materiales
  add column if not exists es_traspaso        boolean not null default false,
  add column if not exists traspaso_cuenta_id uuid
    references public.cuentas_materiales(id) on delete set null,
  add column if not exists traspaso_grupo     uuid;

create index if not exists idx_anticipos_materiales_traspaso_grupo
  on public.anticipos_materiales(traspaso_grupo);
