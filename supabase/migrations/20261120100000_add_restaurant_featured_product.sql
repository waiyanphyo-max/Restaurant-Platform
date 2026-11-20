-- Editorial selection has a separate Spring-only authority from normal catalog writes.
-- No backfill, name matching or sales-derived ranking is performed.
CREATE TABLE public.restaurant_featured_product (
    restaurant_id UUID PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
    product_id UUID,
    revision BIGINT NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    CONSTRAINT restaurant_featured_product_tenant_fk FOREIGN KEY (product_id, restaurant_id)
        REFERENCES public.products(id, restaurant_id) ON DELETE RESTRICT
);

ALTER TABLE public.restaurant_featured_product ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.restaurant_featured_product FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.restaurant_featured_product IS
    'One Owner-curated Featured selection per restaurant. Spring-only access. Missing row or null product means none. Unavailable selections remain recorded, never replaced automatically.';
COMMENT ON COLUMN public.restaurant_featured_product.product_id IS
    'Actual same-tenant product UUID. Hard deletion is restricted while selected; clear selection first. Existing availability/category-inactivation keeps the UUID and yields UNAVAILABLE.';
COMMENT ON COLUMN public.restaurant_featured_product.revision IS
    'Editorial selection concurrency only. Missing-row revision 0; explicit clear retains its revision to prevent stale overwrite.';
