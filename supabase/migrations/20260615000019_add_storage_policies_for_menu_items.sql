-- Ensure the menu-items bucket exists
insert into storage.buckets (id, name, public)
values ('menu-items', 'menu-items', true)
on conflict (id) do nothing;

-- Allow public read access to menu-items bucket
create policy "Allow public read access to menu-items"
on storage.objects for select
using ( bucket_id = 'menu-items' );

-- Allow authenticated upload to menu-items bucket scoped by tenant folder
create policy "Allow authenticated upload to menu-items"
on storage.objects for insert
with check (
  bucket_id = 'menu-items'
  and auth.role() = 'authenticated'
  and exists (
    select 1 from public.profile_tenants pt
    where pt.profile_id = auth.uid()
    and pt.tenant_id::text = split_part(name, '/', 1)
  )
);

-- Allow authenticated update on menu-items bucket scoped by tenant folder
create policy "Allow authenticated update of menu-items"
on storage.objects for update
using (
  bucket_id = 'menu-items'
  and auth.role() = 'authenticated'
  and exists (
    select 1 from public.profile_tenants pt
    where pt.profile_id = auth.uid()
    and pt.tenant_id::text = split_part(name, '/', 1)
  )
)
with check (
  bucket_id = 'menu-items'
  and auth.role() = 'authenticated'
  and exists (
    select 1 from public.profile_tenants pt
    where pt.profile_id = auth.uid()
    and pt.tenant_id::text = split_part(name, '/', 1)
  )
);

-- Allow authenticated delete on menu-items bucket scoped by tenant folder
create policy "Allow authenticated delete of menu-items"
on storage.objects for delete
using (
  bucket_id = 'menu-items'
  and auth.role() = 'authenticated'
  and exists (
    select 1 from public.profile_tenants pt
    where pt.profile_id = auth.uid()
    and pt.tenant_id::text = split_part(name, '/', 1)
  )
);
