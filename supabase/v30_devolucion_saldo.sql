-- =====================================================================
-- FARRALAPP - Migración V30 (Recupero de materiales que suma al saldo)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- El recupero de pallets / bolsones puede cobrarse de dos maneras:
--   1) En EFECTIVO -> ingresa a CAJA (movimientos_caja.recupero_materiales).
--   2) A SALDO     -> el proveedor lo acredita en la cuenta de materiales,
--                      sumándose al anticipo disponible (esta migración).
--
-- Una "devolución a saldo" se guarda como un anticipo más de la cuenta
-- (suma al saldo disponible) pero marcado con es_devolucion = true y con el
-- detalle del recupero (ítems, pallets y bolsones devueltos), para que también
-- descuente del "pendiente a recuperar" y cuente las cantidades devueltas.
alter table public.anticipos_materiales
  add column if not exists es_devolucion boolean not null default false,
  -- [{ "unidad": "pallet", "cantidad": 1, "precio": 25000, "total": 25000 }, ...]
  add column if not exists rec_items     jsonb,
  add column if not exists rec_pallets   numeric(16,2),
  add column if not exists rec_bolsones  numeric(16,2);
