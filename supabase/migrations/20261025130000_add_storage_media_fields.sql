-- Public menu images use products.image_url and product_variants.image_url.
-- Customer avatars use a private Storage object path; signed URLs are generated at request time.
ALTER TABLE public.product_variants
    ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS avatar_path TEXT;
