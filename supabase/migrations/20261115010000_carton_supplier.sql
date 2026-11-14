-- CARTON SUPPLIER: run once in Supabase > SQL Editor, after the suppliers SQL.
-- Lets each carton remember which supplier it came from. Nothing else changes.
alter table public.cartons add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
create index if not exists cartons_supplier_idx on public.cartons (supplier_id);
