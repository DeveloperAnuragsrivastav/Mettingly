-- Migration to add Platform Admins and auto-linking auth trigger

-- 1. Create the platform_admins table
CREATE TABLE IF NOT EXISTS public.platform_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE REFERENCES auth.users(id),
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policy
CREATE POLICY "Platform Admins can access own row"
ON public.platform_admins
FOR ALL
TO authenticated
USING (auth_user_id = auth.uid())
WITH CHECK (auth_user_id = auth.uid());

-- 4. Create the unified auth user auto-linking trigger function
CREATE OR REPLACE FUNCTION public.on_auth_user_created()
RETURNS TRIGGER AS $$
DECLARE
    v_matched_member_id UUID;
    v_matched_platform_admin_id UUID;
BEGIN
    -- Step A: Try to match an invited member
    SELECT id INTO v_matched_member_id
    FROM public.members
    WHERE email = NEW.email AND auth_user_id IS NULL;

    IF v_matched_member_id IS NOT NULL THEN
        UPDATE public.members
        SET auth_user_id = NEW.id
        WHERE id = v_matched_member_id;
        
        RETURN NEW;
    END IF;

    -- Step B: Try to match an invited platform admin
    SELECT id INTO v_matched_platform_admin_id
    FROM public.platform_admins
    WHERE email = NEW.email AND auth_user_id IS NULL;

    IF v_matched_platform_admin_id IS NOT NULL THEN
        UPDATE public.platform_admins
        SET auth_user_id = NEW.id
        WHERE id = v_matched_platform_admin_id;
        
        RETURN NEW;
    END IF;

    -- If no match, still return NEW (allows auth.users insert to complete but without a linked profile)
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Attach trigger to auth.users (make sure it runs on INSERT)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.on_auth_user_created();

-- 6. Insert the very first Platform Admin manually (Bootstrap)
-- IMPORTANT: Update this email and name to match the account you will use to sign in!
INSERT INTO public.platform_admins (email, full_name)
VALUES ('admin@example.com', 'Platform Admin');
