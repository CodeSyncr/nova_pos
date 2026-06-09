-- Create tasks table for recurring staff task boards
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_recurring BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed'
  last_reset_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON public.tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Service role policies
CREATE POLICY "Service role full access on tasks"
  ON public.tasks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Select policy: users see tasks in their tenant
CREATE POLICY "Users can view tasks in their tenant"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM public.profile_tenants WHERE profile_id = auth.uid()
  ));

-- Update policy: staff can complete their own tasks, or owners/managers can edit them
CREATE POLICY "Staff can update task status if assigned or manager"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (
    assigned_to = auth.uid() OR
    tenant_id IN (
      SELECT pt.tenant_id 
      FROM public.profile_tenants pt
      LEFT JOIN public.roles r ON pt.role_id = r.id
      WHERE pt.profile_id = auth.uid() 
        AND (pt.role_id IS NULL OR r.code IN ('OWNER', 'MANAGER', 'DEFAULT_OWNER', 'DEFAULT_MANAGER'))
    )
  )
  WITH CHECK (
    assigned_to = auth.uid() OR
    tenant_id IN (
      SELECT pt.tenant_id 
      FROM public.profile_tenants pt
      LEFT JOIN public.roles r ON pt.role_id = r.id
      WHERE pt.profile_id = auth.uid() 
        AND (pt.role_id IS NULL OR r.code IN ('OWNER', 'MANAGER', 'DEFAULT_OWNER', 'DEFAULT_MANAGER'))
    )
  );

-- Owner/Manager policy: full access
CREATE POLICY "Owners and Managers can manage tasks"
  ON public.tasks FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT pt.tenant_id 
      FROM public.profile_tenants pt
      LEFT JOIN public.roles r ON pt.role_id = r.id
      WHERE pt.profile_id = auth.uid() 
        AND (pt.role_id IS NULL OR r.code IN ('OWNER', 'MANAGER', 'DEFAULT_OWNER', 'DEFAULT_MANAGER'))
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT pt.tenant_id 
      FROM public.profile_tenants pt
      LEFT JOIN public.roles r ON pt.role_id = r.id
      WHERE pt.profile_id = auth.uid() 
        AND (pt.role_id IS NULL OR r.code IN ('OWNER', 'MANAGER', 'DEFAULT_OWNER', 'DEFAULT_MANAGER'))
    )
  );
