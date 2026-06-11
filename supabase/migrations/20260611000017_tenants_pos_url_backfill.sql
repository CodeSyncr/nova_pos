-- Optional: surface `posUrl` on every tenant.
--
-- The "POS URL" field on the web settings page (Organization → POS URL) is
-- stored at `tenants.settings.posUrl`. Since `settings` is `jsonb`, no
-- column needs to exist for the form to write into it — the key just
-- appears the first time a tenant saves.
--
-- This migration is purely cosmetic: it ensures the key is present (as an
-- empty string) on every existing tenant so dashboard queries / data
-- exports see a consistent shape. Idempotent — running it again is a no-op
-- on tenants that already have the key set.

UPDATE public.tenants
SET settings = jsonb_set(
        COALESCE(settings, '{}'::jsonb),
        '{posUrl}',
        '""'::jsonb,
        true
    )
WHERE settings IS NULL
   OR NOT (settings ? 'posUrl');
