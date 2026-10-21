-- Keep the application-owned profile row in sync with Supabase Auth users.
-- The trigger is SECURITY DEFINER and fully qualifies table names with an empty
-- search_path to avoid object-shadowing risks.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    preferred_language_value text;
BEGIN
    preferred_language_value := CASE
        WHEN NEW.raw_user_meta_data ->> 'preferred_language' = 'en' THEN 'en'
        ELSE 'my-MM'
    END;

    INSERT INTO public.profiles (id, full_name, phone, preferred_language)
    VALUES (
        NEW.id,
        NULLIF(BTRIM(COALESCE(
            NEW.raw_user_meta_data ->> 'full_name',
            NEW.raw_user_meta_data ->> 'name'
        )), ''),
        NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'phone'), ''),
        preferred_language_value
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user()
    FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill Auth users created before this migration. Existing profile values
-- are preserved if a profile row already exists.
INSERT INTO public.profiles (id, full_name, phone, preferred_language)
SELECT
    u.id,
    NULLIF(BTRIM(COALESCE(
        u.raw_user_meta_data ->> 'full_name',
        u.raw_user_meta_data ->> 'name'
    )), ''),
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'phone'), ''),
    CASE
        WHEN u.raw_user_meta_data ->> 'preferred_language' = 'en' THEN 'en'
        ELSE 'my-MM'
    END
FROM auth.users u
ON CONFLICT (id) DO NOTHING;
