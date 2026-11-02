-- Forward-only. Apply through the normal reviewed database migration process.
-- Financial data is available only through the authenticated Spring API.
CREATE TABLE public.accounting_requests (
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
    operation VARCHAR(100) NOT NULL,
    request_key VARCHAR(120) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    result_id UUID NOT NULL,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (restaurant_id, operation, request_key)
);

CREATE TABLE public.accounting_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
    actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(100) NOT NULL,
    reason TEXT,
    detail JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_accounting_audit_history ON public.accounting_audit(restaurant_id, created_at, id);

-- Private attachments are served after an Owner/Manager permission check. This
-- small-file implementation does not require a publicly readable storage bucket.
CREATE TABLE public.accounting_receipts (
    id UUID PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
    content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp','application/pdf')),
    content BYTEA NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 5242880),
    sha256 CHAR(64) NOT NULL,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(id, restaurant_id)
);

CREATE FUNCTION public.accounting_immutable() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
BEGIN
    RAISE EXCEPTION 'Posted accounting history is immutable; append a reversal or correction' USING ERRCODE = '23514';
END;
$$;
REVOKE ALL ON FUNCTION public.accounting_immutable() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER accounting_requests_immutable BEFORE UPDATE OR DELETE ON public.accounting_requests
FOR EACH ROW EXECUTE FUNCTION public.accounting_immutable();
CREATE TRIGGER accounting_audit_immutable BEFORE UPDATE OR DELETE ON public.accounting_audit
FOR EACH ROW EXECUTE FUNCTION public.accounting_immutable();
CREATE TRIGGER accounting_receipts_immutable BEFORE UPDATE OR DELETE ON public.accounting_receipts
FOR EACH ROW EXECUTE FUNCTION public.accounting_immutable();

ALTER TABLE public.accounting_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accounting_requests, public.accounting_audit, public.accounting_receipts FROM PUBLIC, anon, authenticated;
