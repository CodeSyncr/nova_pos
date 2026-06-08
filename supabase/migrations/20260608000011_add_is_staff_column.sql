-- Add is_staff column to profile_tenants
-- This allows marking users as staff for salary/attendance management

ALTER TABLE public.profile_tenants 
  ADD COLUMN IF NOT EXISTS is_staff BOOLEAN NOT NULL DEFAULT false;

-- Add metadata column to customers table (used for Firebase sync tracking)
ALTER TABLE public.customers 
  ADD COLUMN IF NOT EXISTS metadata JSONB;
