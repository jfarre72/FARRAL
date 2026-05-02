# FARRALAPP

Administración de obra · V1.

App web responsive para llevar el control administrativo, financiero y básico
de avance de una obra. Pensada para escalar (V2 sumará Caja, Presupuestos por
etapa y Dashboard avanzado).

## Stack

- **Frontend:** Next.js 14 (App Router) + React 18
- **UI:** Material UI v6
- **Backend / DB:** Supabase (Postgres)
- **Archivos (futuro):** Supabase Storage
- **Deploy:** Vercel

## Alcance V1

1. **Proyectos** — CRUD con m² cubiertos / semicubiertos / totales y fechas estimadas.
2. **Inversores** — alta de inversores, registro de aportes (m², tipo de venta,
   costo m², monto, moneda, precio venta final, % obtenido y ganancia estimada),
   resumen por inversor y composición.
3. **Línea de tiempo** — los 6 hitos principales con fecha estimada, fecha real
   y avance de obra (creados automáticamente al crear el proyecto).

## Setup

### 1) Supabase

1. Crear un proyecto en [supabase.com](https://supabase.com).
2. Ir a **SQL Editor → New query**, pegar el contenido de
   [`supabase/schema.sql`](supabase/schema.sql) y ejecutar (`Run`).
3. En **Project Settings → API** copiar:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2) Vercel

1. Importar este repositorio en Vercel.
2. En **Environment Variables** definir:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy. Eso es todo: no hace falta correr nada local.

## Notas

- Las políticas RLS de la V1 son **abiertas** (lectura/escritura con la `anon
  key`). En la V2 se reemplazan por políticas con `auth.uid()` cuando se
  habilite login.
- Al crear un proyecto, un trigger genera automáticamente los 6 hitos:
  `Inicio (0%)`, `Cimentación (15%)`, `Estructura (40%)`, `Obra cerrada (65%)`,
  `Instalaciones + revoques (85%)`, `Terminada (100%)`.

## Roadmap V2

- Caja: ingresos / egresos, saldos en ARS y USD.
- Presupuestos por etapa, con seguimiento por proveedor.
- Dashboard con principales indicadores.
- Auth + RLS por usuario.
- Adjuntos (Supabase Storage).
