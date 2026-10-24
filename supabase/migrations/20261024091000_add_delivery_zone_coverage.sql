-- Add optional city/township matching rules to delivery zones.
-- Existing zones remain unrestricted until an owner/manager configures coverage.

ALTER TABLE public.delivery_zones
    ADD COLUMN coverage_city VARCHAR(100),
    ADD COLUMN coverage_township VARCHAR(100);

ALTER TABLE public.delivery_zones
    ADD CONSTRAINT delivery_zones_coverage_pair_check
    CHECK (
        (coverage_city IS NULL AND coverage_township IS NULL)
        OR (
            coverage_city IS NOT NULL
            AND btrim(coverage_city) <> ''
            AND coverage_township IS NOT NULL
            AND btrim(coverage_township) <> ''
        )
    );

COMMENT ON COLUMN public.delivery_zones.coverage_city IS
    'Optional exact city match for customer delivery checkout; case-insensitive and trimmed.';
COMMENT ON COLUMN public.delivery_zones.coverage_township IS
    'Optional exact township match for customer delivery checkout; case-insensitive and trimmed.';
