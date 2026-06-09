-- =====================================================================
-- FARRALAPP - Migración V5 (Estimación financiera + ponderación por días)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente. Se puede correr sobre V1+V2+V3+V4.
-- =====================================================================

-- 1) Estimación financiera del proyecto -------------------------------
--    precio_venta_estimado : ingreso esperado total (USD)
--    costo_total_estimado  : costo total esperado    (USD)
--    El costo por m² se calcula en el front: costo_total_estimado / m2_totales
--    La ganancia estimada: precio_venta_estimado - costo_total_estimado
alter table public.proyectos
  add column if not exists precio_venta_estimado numeric(16,2) default 0,
  add column if not exists costo_total_estimado  numeric(16,2) default 0;

-- 2) Aportes: fecha de inicio de cómputo ------------------------------
--    Cuando se registra un aporte, "fecha" es la fecha de ingreso a caja.
--    "fecha_inicio_calculo" es desde cuándo cuenta para la ponderación
--    (días en el proyecto). Por defecto es igual a "fecha".
alter table public.aportes
  add column if not exists fecha_inicio_calculo date;

-- Backfill para aportes existentes
update public.aportes
   set fecha_inicio_calculo = fecha
 where fecha_inicio_calculo is null;
