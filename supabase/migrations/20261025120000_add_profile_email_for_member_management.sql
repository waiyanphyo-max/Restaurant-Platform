-- Store Auth email on the application-owned profile so restaurant owners can identify team members.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS email VARCHAR(320);

UPDATE public.profiles AS p
SET email = u.email
FROM auth.users AS u
WHERE u.id = p.id
  AND p.email IS DISTINCT FROM u.email;

CREATE INDEX IF NOT EXISTS idx_profiles_email_lower
    ON public.profiles (lower(email))
    WHERE email IS NOT NULL;

-- Mirror Auth email when invitations create users and when users later change email.
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
    INSERT INTO public.profiles (id, email, full_name, phone, preferred_language)
    VALUES (
        NEW.id, NEW.email,
        NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data ->> 'full_name',
                               NEW.raw_user_meta_data ->> 'name')), ''),
        NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'phone'), ''),
        preferred_language_value
    )
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_auth_user_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_auth_user_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
    AFTER UPDATE OF email ON auth.users
    FOR EACH ROW WHEN (OLD.email IS DISTINCT FROM NEW.email)
    EXECUTE FUNCTION public.sync_auth_user_email();
