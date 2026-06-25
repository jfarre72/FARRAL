-- =====================================================================
-- FARRALAPP - Migración V32 (Materiales: TC congelado por anticipo,
-- etapa y TC en los retiros para el gasto real por etapa en USD)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- CONCEPTO
-- --------
-- El acopio se compra a una lista de precios y a un tipo de cambio FIJO. Cuando
-- se agota ese monto y la lista cambia, se vuelve a acopiar a un nuevo TC. Por
-- eso CADA anticipo congela su propio tipo de cambio (ARS por 1 USD).
--
-- El consumo del material se imputa a una ETAPA en cada RETIRO (no en la Caja),
-- y se valúa en USD al TC congelado del retiro (tomado del acopio del que sale).
-- El "gasto real por etapa" en dólares se computa NETO del recupero del retiro
-- (monto - recupero), dejando aparte lo que queda "a recuperar".

-- TC congelado del anticipo (ARS por 1 USD). En cuentas en USD queda en null.
alter table public.anticipos_materiales
  add column if not exists tipo_cambio numeric(14,4);

-- Etapa de consumo del retiro y TC congelado para valuarlo en USD.
-- (En cuentas en USD, tipo_cambio queda en null y el USD es el monto directo.)
alter table public.retiros_materiales
  add column if not exists etapa       text,
  add column if not exists tipo_cambio numeric(14,4);
