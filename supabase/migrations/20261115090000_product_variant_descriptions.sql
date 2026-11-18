-- Optional variant-specific copy; existing variants retain NULL and no product
-- description is duplicated. Apply before deploying the API that maps this field.
ALTER TABLE public.product_variants
    ADD COLUMN description text;

ALTER TABLE public.product_variants
    ADD CONSTRAINT product_variants_description_length
    CHECK (description IS NULL OR char_length(description) <= 5000);

COMMENT ON COLUMN public.product_variants.description IS
    'Optional variant-specific description. Plain text, maximum 5000 characters.';
