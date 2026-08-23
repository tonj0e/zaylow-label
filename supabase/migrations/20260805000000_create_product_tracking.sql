-- Create cartons table
CREATE TABLE IF NOT EXISTS public.cartons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add new columns to inventory_items if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_items' AND column_name='sku') THEN
    ALTER TABLE public.inventory_items ADD COLUMN sku TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_items' AND column_name='qr_code') THEN
    ALTER TABLE public.inventory_items ADD COLUMN qr_code TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_items' AND column_name='barcode') THEN
    ALTER TABLE public.inventory_items ADD COLUMN barcode TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_items' AND column_name='reserved_at') THEN
    ALTER TABLE public.inventory_items ADD COLUMN reserved_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Add CHECK constraint for status column
ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_status_check
  CHECK (status IN ('In Stock', 'Reserved', 'Packed', 'Shipped', 'Delivered', 'Returned', 'Warranty', 'Damaged', 'Lost'));

-- Add foreign key constraint from inventory_items.carton_id to cartons.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'inventory_items_carton_id_fkey'
      AND table_name = 'inventory_items'
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_carton_id_fkey
      FOREIGN KEY (carton_id)
      REFERENCES public.cartons(id);
  END IF;
END $$;