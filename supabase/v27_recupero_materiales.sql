-- =====================================================================
-- FARRALAPP - Migración V27 (Recupero de materiales)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) RETIROS DE MATERIALES: recupero asociado
--    Un retiro puede "presentar recupero": material (pallets / bolsones)
--    que luego se devuelve y genera plata a recuperar. Se carga la
--    cantidad y el precio unitario; el total = cantidad * precio se va
--    acumulando como "saldo a recuperar".
-- ---------------------------------------------------------------------
alter table public.retiros_materiales
  add column if not exists recupero          boolean not null default false,
  add column if not exists recupero_unidad   text,            -- 'pallet' | 'bolson'
  add column if not exists recupero_cantidad numeric(16,2),
  add column if not exists recupero_precio   numeric(16,2),
  add column if not exists recupero_total    numeric(16,2);

-- ---------------------------------------------------------------------
-- 2) MOVIMIENTOS DE CAJA: ingreso por recupero de materiales
--    Un ingreso de caja puede marcarse como "recupero de materiales" y
--    vincularse a la cuenta correspondiente. La suma de estos ingresos
--    por cuenta es lo "recuperado"; la diferencia con el saldo a
--    recuperar es lo que queda pendiente.
-- ---------------------------------------------------------------------
alter table public.movimientos_caja
  add column if not exists recupero_materiales  boolean not null default false,
  add column if not exists cuenta_materiales_id uuid references public.cuentas_materiales(id) on delete set null;

create index if not exists idx_movcaja_cuenta_materiales
  on public.movimientos_caja(cuenta_materiales_id);
