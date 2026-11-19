-- Canonical mutable in-app palette only. Restaurant name/logo remain in restaurants;
-- restaurant_platform_configuration remains reviewed deployment metadata.
-- Missing rows deliberately mean unconfigured branding: no default palette or backfill.
CREATE TABLE public.restaurant_runtime_branding (
    restaurant_id UUID PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
    primary_color VARCHAR(7) NOT NULL CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
    secondary_color VARCHAR(7) NOT NULL CHECK (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
    background_color VARCHAR(7) NOT NULL CHECK (background_color ~ '^#[0-9A-Fa-f]{6}$'),
    revision BIGINT NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991)
);

-- Spring authenticates the actor and authorizes the exact tenant before using its
-- server-side database connection. Neither Auth clients nor Storage service keys
-- may read or mutate this table directly. No client RLS policy is introduced.
ALTER TABLE public.restaurant_runtime_branding ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.restaurant_runtime_branding FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.restaurant_runtime_branding IS
    'Canonical runtime palette, separate from deployment metadata. Spring-only access; absence means safe same-tenant fallback. No tenant palette is seeded by this migration.';
COMMENT ON COLUMN public.restaurant_runtime_branding.revision IS
    'Palette concurrency revision only; initial persisted revision is 1. Public missing-row revision is 0. Name/logo changes do not change this revision.';
