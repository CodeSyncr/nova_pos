-- Make RLS policies stop re-evaluating auth.uid() per row.
--
-- Every policy in this schema is written as:
--   exists (select 1 from profile_tenants pt join profiles p
--           where pt.tenant_id = <table>.tenant_id and p.id = auth.uid())
--
-- Called bare, `auth.uid()` is treated as volatile and re-executed for EVERY
-- row the planner examines. Wrapped as `(select auth.uid())` it becomes an
-- InitPlan: evaluated once per query and reused. This is the single largest
-- RLS win on Supabase and needs no application changes.
--
-- Rather than hand-rewriting ~90 policies (and risking a typo that quietly
-- widens access), this rewrites each policy from its own stored definition:
-- the USING and WITH CHECK expressions are read back from pg_policies, the
-- text `auth.uid()` is wrapped, and the policy is recreated with the same
-- name, command, roles and permissive/restrictive mode.
--
-- SAFETY: migrations run in a transaction, so this is atomic — either every
-- policy is rewritten or none is. A failure rolls back to the current, working
-- policies rather than leaving tables half-protected.

do $$
declare
  pol record;
  new_qual text;
  new_check text;
  role_list text;
  stmt text;
  rewritten int := 0;
begin
  for pol in
    select
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    from pg_policies
    where schemaname = 'public'
      -- Only touch policies that actually call auth.uid() bare. The negative
      -- lookbehind for "select auth.uid()" keeps this migration idempotent:
      -- re-running it must not double-wrap.
      and (
        (qual is not null and qual ~ 'auth\.uid\(\)' and qual !~ 'select auth\.uid\(\)')
        or (with_check is not null and with_check ~ 'auth\.uid\(\)' and with_check !~ 'select auth\.uid\(\)')
      )
  loop
    new_qual := regexp_replace(pol.qual, 'auth\.uid\(\)', '(select auth.uid())', 'g');
    new_check := regexp_replace(pol.with_check, 'auth\.uid\(\)', '(select auth.uid())', 'g');

    -- pg_policies stores roles as a name[]; {public} means "no TO clause".
    if pol.roles is null or pol.roles = '{public}'::name[] then
      role_list := 'public';
    else
      role_list := array_to_string(pol.roles, ', ');
    end if;

    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);

    stmt := format(
      'create policy %I on %I.%I as %s for %s to %s',
      pol.policyname,
      pol.schemaname,
      pol.tablename,
      case when pol.permissive = 'PERMISSIVE' then 'permissive' else 'restrictive' end,
      pol.cmd,
      role_list
    );

    -- INSERT policies have no USING clause; SELECT/DELETE have no WITH CHECK.
    if new_qual is not null then
      stmt := stmt || format(' using (%s)', new_qual);
    end if;
    if new_check is not null then
      stmt := stmt || format(' with check (%s)', new_check);
    end if;

    execute stmt;
    rewritten := rewritten + 1;
  end loop;

  raise notice 'Rewrote % RLS policies to use (select auth.uid())', rewritten;
end $$;
