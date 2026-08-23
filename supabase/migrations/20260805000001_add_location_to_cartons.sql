-- Add location column to cartons table
ALTER TABLE public.cartons
ADD COLUMN IF NOT EXISTS location TEXT;