-- Idempotency for public QR checkout. The response is encrypted by the API because
-- Common QR responses contain a bearer-like queue tracking token that must not be
-- persisted as plaintext. Records expire after 24 hours and can then be reused.

CREATE TABLE public.qr_order_idempotency (
    restaurant_id UUID NOT NULL
        REFERENCES public.restaurants(id) ON DELETE CASCADE,
    operation VARCHAR(20) NOT NULL
        CHECK (operation IN ('COMMON_QR', 'TABLE_QR')),
    idempotency_key_hash CHAR(64) NOT NULL
        CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
    request_hash CHAR(64) NOT NULL
        CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    status VARCHAR(20) NOT NULL
        CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
    response_ciphertext BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (restaurant_id, operation, idempotency_key_hash),
    CONSTRAINT qr_order_idempotency_response_state_check
        CHECK (
            (status = 'IN_PROGRESS' AND response_ciphertext IS NULL)
            OR (status = 'COMPLETED' AND response_ciphertext IS NOT NULL)
        ),
    CONSTRAINT qr_order_idempotency_expiry_check
        CHECK (expires_at > created_at)
);

CREATE INDEX qr_order_idempotency_expires_at_idx
    ON public.qr_order_idempotency (expires_at);

ALTER TABLE public.qr_order_idempotency ENABLE ROW LEVEL SECURITY;

-- This table is only accessed by the trusted Spring Boot server connection.
REVOKE ALL ON TABLE public.qr_order_idempotency FROM anon, authenticated;
