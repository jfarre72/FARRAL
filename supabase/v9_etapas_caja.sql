-- =====================================================================
-- FARRALAPP - Migración V9 (Etapa en movimientos de caja)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Permite asociar un egreso/ingreso a una etapa de obra (texto libre,
-- típicamente uno de los nombres de hitos del proyecto: Inicio,
-- Cimentación, Estructura, Obra cerrada, Instalaciones + revoques,
-- Terminada). Se guarda como texto para que no se rompa si el hito
-- se renombra/borra.
alter table public.movimientos_caja
  add column if not exists etapa text;
