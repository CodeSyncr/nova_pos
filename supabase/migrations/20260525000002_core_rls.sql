alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.roles enable row level security;
alter table public.profile_tenants enable row level security;

create policy "profiles readable by owner"
  on public.profiles for select using (auth.uid() = id);

create policy "profiles insertable by owner"
  on public.profiles for insert with check (auth.uid() = id);

create policy "profiles updatable by owner"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "tenants readable by members"
  on public.tenants for select using (
    exists (
      select 1 from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = tenants.id and p.id = auth.uid()
    )
  );

create policy "tenants insertable by authenticated"
  on public.tenants for insert with check (auth.role() = 'authenticated');

create policy "tenants updatable by members"
  on public.tenants for update using (
    exists (
      select 1 from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = tenants.id and p.id = auth.uid()
    )
  );

create policy "profile tenants readable"
  on public.profile_tenants for select using (
    exists (
      select 1 from public.profiles p
      where p.id = profile_tenants.profile_id and p.id = auth.uid()
    )
  );

create policy "tenant roles readable by members"
  on public.roles for select using (
    tenant_id is null
    or exists (
      select 1 from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = roles.tenant_id and p.id = auth.uid()
    )
  );

create policy "tenant roles insertable after onboarding"
  on public.roles for insert with check (
    tenant_id is not null
    and exists (
      select 1 from public.tenants t
      join public.profile_tenants pt on pt.tenant_id = t.id
      join public.profiles p on p.id = pt.profile_id
      where t.id = roles.tenant_id and p.id = auth.uid() and t.onboarding_complete = true
    )
  );

create policy "tenant roles updatable by members"
  on public.roles for update using (
    tenant_id is not null
    and exists (
      select 1 from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = roles.tenant_id and p.id = auth.uid()
    )
  );

create policy "tenant roles deletable by members"
  on public.roles for delete using (
    tenant_id is not null
    and exists (
      select 1 from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = roles.tenant_id and p.id = auth.uid()
    )
  );

create policy "profile tenants insertable after onboarding"
  on public.profile_tenants for insert with check (
    exists (
      select 1 from public.tenants t
      where t.id = profile_tenants.tenant_id
        and t.onboarding_complete = true
        and exists (
          select 1 from public.profile_tenants existing
          join public.profiles p on p.id = existing.profile_id
          where existing.tenant_id = t.id and p.id = auth.uid()
        )
    )
  );

create policy "profile tenants updatable by members"
  on public.profile_tenants for update using (
    exists (
      select 1 from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = profile_tenants.tenant_id and p.id = auth.uid()
    )
  );

create policy "profile tenants deletable by members"
  on public.profile_tenants for delete using (
    exists (
      select 1 from public.profile_tenants pt
      join public.profiles p on p.id = pt.profile_id
      where pt.tenant_id = profile_tenants.tenant_id and p.id = auth.uid()
    )
  );
