-- Additive public deployment metadata. Spring enforces the platform-admin UUID allowlist.
-- No client role has direct access. This does not change existing tenant settings or QR URLs.
CREATE TABLE public.restaurant_platform_configuration (
    restaurant_id UUID PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
    configuration JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(configuration) = 'object'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurant_platform_configuration ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.restaurant_platform_configuration FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.restaurant_platform_configuration IS
    'Platform-managed public branding/domain/Android metadata. Saving does not deploy DNS, a website, or Android builds. Never store credentials or QR tokens here.';
