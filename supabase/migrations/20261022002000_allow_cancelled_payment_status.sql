-- Preserve cancelled unpaid orders without leaving their payment rows as PENDING.
-- The original table-level payment status CHECK allowed only PENDING/PAID/FAILED/REFUNDED.
ALTER TABLE public.payments
    DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE public.payments
    ADD CONSTRAINT payments_status_check
    CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED'));
