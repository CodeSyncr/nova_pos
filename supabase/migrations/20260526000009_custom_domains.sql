-- Add custom domain and landing page support to tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS custom_domain text,
  ADD COLUMN IF NOT EXISTS landing_page jsonb;

-- Unique constraint on custom_domain (each domain can only belong to one tenant)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_custom_domain_key'
  ) THEN
    ALTER TABLE public.tenants ADD CONSTRAINT tenants_custom_domain_key UNIQUE (custom_domain);
  END IF;
END $$;

-- Index for fast custom domain lookups in middleware
CREATE INDEX IF NOT EXISTS idx_tenants_custom_domain
  ON public.tenants (custom_domain)
  WHERE custom_domain IS NOT NULL;

-- landing_page JSONB schema (stored as comment for documentation):
-- {
--   "template": "minimal" | "restaurant" | "pizza",
--   "headline": string,
--   "subheadline": string,
--   "cta_text": string,
--   "cta_url": string,
--   "bg_color": string,
--   "accent_color": string,
--   "logo_url": string | null,
--   "show_pos_link": boolean
-- }
