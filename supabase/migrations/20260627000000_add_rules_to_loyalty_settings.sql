-- Migration to add rules column to tenant_loyalty_settings table
ALTER TABLE public.tenant_loyalty_settings
ADD COLUMN IF NOT EXISTS rules text[] default '{}'::text[];
