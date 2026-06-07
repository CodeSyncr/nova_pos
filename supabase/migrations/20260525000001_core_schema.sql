-- Core multi-tenant schema for pizzeria POS
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  logo_url text,
  branding jsonb,
  contact jsonb,
  social jsonb,
  settings jsonb,
  subscription jsonb,
  timezone text default 'UTC',
  is_active boolean default true,
  onboarding_complete boolean default false,
  created_by uuid references auth.users not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  trial_ends_at timestamptz
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  code text not null,
  name text not null,
  description text,
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  unique (tenant_id, code)
);

insert into public.roles (tenant_id, code, name, description, permissions)
values
  (null, 'DEFAULT_OWNER', 'Default Owner', 'Applied to new signups', '["*"]'),
  (null, 'DEFAULT_MANAGER', 'Default Manager', 'Manager template', '{"pos":["*"],"menu":["read","write"]}'),
  (null, 'DEFAULT_WAITER', 'Waiter', 'Waiter template', '{"pos":["take_orders"],"menu":["read"]}')
on conflict (tenant_id, code) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  avatar_url text,
  role_id uuid references public.roles,
  created_at timestamptz default now()
);

create table if not exists public.profile_tenants (
  tenant_id uuid references public.tenants on delete cascade,
  profile_id uuid references public.profiles on delete cascade,
  role_id uuid references public.roles,
  joined_at timestamptz default now(),
  primary key (tenant_id, profile_id)
);
