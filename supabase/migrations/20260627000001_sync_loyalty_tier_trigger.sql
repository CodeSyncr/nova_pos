-- Create trigger function to sync loyalty profile tier on points_balance change
CREATE OR REPLACE FUNCTION public.fn_sync_loyalty_profile_tier()
RETURNS TRIGGER AS $$
DECLARE
  v_tier_id uuid;
BEGIN
  -- Find the highest tier for this tenant where min_points <= points_balance
  SELECT id INTO v_tier_id
  FROM public.loyalty_tiers
  WHERE tenant_id = NEW.tenant_id AND min_points <= NEW.points_balance
  ORDER BY min_points DESC
  LIMIT 1;

  NEW.tier_id := v_tier_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS tr_sync_loyalty_profile_tier ON public.loyalty_profiles;
CREATE TRIGGER tr_sync_loyalty_profile_tier
BEFORE INSERT OR UPDATE OF points_balance ON public.loyalty_profiles
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_loyalty_profile_tier();
