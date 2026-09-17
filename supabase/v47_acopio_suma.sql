-- =====================================================================
-- FARRALAPP - Migración V47 (Sumar plata a un acopio existente desde Caja)
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar y RUN
-- Incremental e idempotente.
-- =====================================================================

-- Un egreso de Caja marcado como "acopio de materiales" puede ahora sumar la
-- plata a un ACOPIO EXISTENTE (el mismo anticipo, mismo N° de acopio y lista de
-- precios) en lugar de crear siempre un acopio nuevo. Ej.: el acopio #72 se
-- paga en dos veces; los dos egresos suman a la misma línea.
--
-- Para mantener la reversibilidad (si se edita o borra el egreso), cada egreso
-- sigue generando SU propia fila de anticipo (vinculada por movimiento_id).
-- Cuando el egreso "suma a un acopio existente", esa fila apunta al anticipo
-- padre con acopio_padre_id: en Materiales las filas hijas se consolidan dentro
-- del acopio padre (suman su monto, heredan TC / lista / N° de acopio) y no se
-- muestran como acopios separados.
--
-- on delete cascade: si se borra el acopio padre (p. ej. borrando su egreso de
-- Caja), se borran también sus sumas asociadas.
alter table public.anticipos_materiales
  add column if not exists acopio_padre_id uuid
    references public.anticipos_materiales(id) on delete cascade;

create index if not exists idx_anticipos_materiales_padre
  on public.anticipos_materiales(acopio_padre_id);
