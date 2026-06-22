-- Add image_url column to toppings table
ALTER TABLE public.toppings ADD COLUMN IF NOT EXISTS image_url text DEFAULT null;

-- Ensure the toppings bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('toppings', 'toppings', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to toppings bucket
CREATE POLICY "Allow public read access to toppings"
ON storage.objects FOR SELECT
USING ( bucket_id = 'toppings' );

-- Allow authenticated upload to toppings bucket scoped by tenant folder
CREATE POLICY "Allow authenticated upload to toppings"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'toppings'
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.profile_tenants pt
    WHERE pt.profile_id = auth.uid()
    AND pt.tenant_id::text = split_part(name, '/', 1)
  )
);

-- Allow authenticated update on toppings bucket scoped by tenant folder
CREATE POLICY "Allow authenticated update of toppings"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'toppings'
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.profile_tenants pt
    WHERE pt.profile_id = auth.uid()
    AND pt.tenant_id::text = split_part(name, '/', 1)
  )
)
WITH CHECK (
  bucket_id = 'toppings'
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.profile_tenants pt
    WHERE pt.profile_id = auth.uid()
    AND pt.tenant_id::text = split_part(name, '/', 1)
  )
);

-- Allow authenticated delete on toppings bucket scoped by tenant folder
CREATE POLICY "Allow authenticated delete of toppings"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'toppings'
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.profile_tenants pt
    WHERE pt.profile_id = auth.uid()
    AND pt.tenant_id::text = split_part(name, '/', 1)
  )
);
