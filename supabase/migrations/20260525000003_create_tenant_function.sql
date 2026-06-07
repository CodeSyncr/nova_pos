create or replace function public.create_tenant_with_default_owner(
  tenant_name text,
  tenant_timezone text default 'UTC'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  default_role_id uuid;
  new_tenant_id uuid;
  tenant_owner_role_id uuid;
begin
  select id into default_role_id
  from public.roles
  where tenant_id is null and code = 'DEFAULT_OWNER';

  insert into public.tenants (name, timezone, created_by)
  values (tenant_name, tenant_timezone, auth.uid())
  returning id into new_tenant_id;

  insert into public.profiles (id, role_id)
  values (auth.uid(), default_role_id)
  on conflict (id) do update set role_id = excluded.role_id;

  insert into public.roles (tenant_id, code, name, permissions)
  values (new_tenant_id, 'OWNER', 'Owner', '["*"]')
  returning id into tenant_owner_role_id;

  insert into public.profile_tenants (tenant_id, profile_id, role_id)
  values (new_tenant_id, auth.uid(), tenant_owner_role_id);

  update public.tenants
  set onboarding_complete = true
  where id = new_tenant_id;

  return new_tenant_id;
end;
$$;

grant execute on function public.create_tenant_with_default_owner(text, text) to authenticated;
