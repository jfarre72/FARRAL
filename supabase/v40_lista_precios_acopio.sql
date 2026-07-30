-- =====================================================================
-- FARRALAPP - Migración V40 (Lista de precios congelada por acopio)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Cada acopio (anticipo) puede guardar SU lista de precios, leída de la foto o
-- PDF que entrega el proveedor. La lista queda congelada dentro del anticipo:
-- si dos meses después se hace otro acopio en el mismo lugar, ese anticipo
-- guarda su propia lista sin pisar la anterior.
--
-- lista_precios: [{ "codigo":"242", "material":"HIERRO ALETADO 8MM",
--   "unidad":"unidad", "categoria":"Hierro/Acero", "precio_bruto":9935.56,
--   "descuento":10, "precio":8942.00 }]
--   - precio_bruto: precio de lista tal cual figura.
--   - descuento: % de descuento del acopio (puede variar por ítem: 0, 10, 12, 14…).
--   - precio: neto ya calculado = precio_bruto * (1 - descuento/100). Es el que
--     se usa para valorizar los retiros.
alter table public.anticipos_materiales
  add column if not exists lista_precios      jsonb,
  add column if not exists lista_precios_url  text,   -- archivo adjunto (imagen/pdf) de la lista
  add column if not exists lista_precios_path text,
  add column if not exists acopio_nro         text;   -- N° de acopio del proveedor (ej. "72")

-- Retiro: guardo qué lista (de qué acopio) se usó para valorizarlo, para poder
-- rehacer el cálculo y auditar. Los precios por ítem viven en materiales_items:
--   [{ "codigo":"242", "material":"...", "cantidad":10, "unidad":"unidad",
--      "categoria":"Hierro/Acero", "precio":8942.00, "total":89420.00 }]
alter table public.retiros_materiales
  add column if not exists lista_anticipo_id uuid;
