-- Staff Management: Salaries, Advances, and Attendance
-- Migration: 20260608000010_staff_management.sql

-- ═══════════════════════════════════════════════════════════════════════════════
-- Add is_staff flag to profile_tenants
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profile_tenants ADD COLUMN IF NOT EXISTS is_staff BOOLEAN NOT NULL DEFAULT false;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Staff Salary Configuration
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.staff_salaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  monthly_salary NUMERIC(10, 2) NOT NULL DEFAULT 0,
  salary_day INTEGER NOT NULL DEFAULT 1,
  bank_account TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE(tenant_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_salaries_tenant ON public.staff_salaries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_salaries_profile ON public.staff_salaries(profile_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Staff Advances
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.staff_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  reason TEXT,
  advance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'approved',
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_advances_tenant ON public.staff_advances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_advances_profile ON public.staff_advances(profile_id);
CREATE INDEX IF NOT EXISTS idx_staff_advances_date ON public.staff_advances(advance_date);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Staff Attendance
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in TIMESTAMP WITH TIME ZONE,
  check_out TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'present',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE(tenant_id, profile_id, date)
);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_tenant ON public.staff_attendance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_profile ON public.staff_attendance(profile_id);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_date ON public.staff_attendance(date);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.staff_salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by admin client in server actions)
CREATE POLICY "Service role full access on staff_salaries"
  ON public.staff_salaries FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on staff_advances"
  ON public.staff_advances FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on staff_attendance"
  ON public.staff_attendance FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read their own records
CREATE POLICY "Users can view own salary"
  ON public.staff_salaries FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Users can view own advances"
  ON public.staff_advances FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Users can view own attendance"
  ON public.staff_attendance FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());
