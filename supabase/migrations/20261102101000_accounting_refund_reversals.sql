-- A correction is a new dated event. Never erase or redraft the original refund.
ALTER TABLE public.sales_refunds ADD CONSTRAINT uq_sales_refund_order_restaurant UNIQUE(id,order_id,restaurant_id);
CREATE TABLE public.sales_refund_reversals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
    order_id UUID NOT NULL,
    refund_id UUID NOT NULL UNIQUE,
    reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 1000),
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(id,restaurant_id),
    FOREIGN KEY(order_id,restaurant_id) REFERENCES public.orders(id,restaurant_id) ON DELETE RESTRICT,
    FOREIGN KEY(refund_id,order_id,restaurant_id) REFERENCES public.sales_refunds(id,order_id,restaurant_id) ON DELETE RESTRICT
);
CREATE INDEX idx_sales_refund_reversals_restaurant_time ON public.sales_refund_reversals(restaurant_id,created_at,id);
ALTER TABLE public.sales_refund_reversals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sales_refund_reversals FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_sales_refund_reversals_immutable BEFORE UPDATE OR DELETE ON public.sales_refund_reversals
FOR EACH ROW EXECUTE FUNCTION public.accounting_immutable();

CREATE OR REPLACE FUNCTION public.validate_sales_refund() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original public.payments%ROWTYPE; total_refunded NUMERIC;
BEGIN
    SELECT * INTO original FROM public.payments WHERE id=NEW.payment_id AND order_id=NEW.order_id FOR UPDATE;
    IF NOT FOUND OR original.status<>'PAID' OR original.paid_at IS NULL
       OR NEW.method<>original.method OR NEW.refunded_at<original.paid_at OR NEW.refunded_at>clock_timestamp() THEN
        RAISE EXCEPTION 'Refund requires a collected payment, matching method and valid event time' USING ERRCODE='23514';
    END IF;
    IF EXISTS(SELECT 1 FROM public.sales_refund_reversals v JOIN public.sales_refunds f ON f.id=v.refund_id AND f.restaurant_id=v.restaurant_id
        WHERE f.payment_id=NEW.payment_id AND v.created_at>NEW.refunded_at) THEN
        RAISE EXCEPTION 'New refund cannot precede a correction that restored its refund capacity' USING ERRCODE='23514';
    END IF;
    SELECT COALESCE(SUM(f.amount),0) INTO total_refunded FROM public.sales_refunds f
      WHERE f.payment_id=NEW.payment_id AND NOT EXISTS(SELECT 1 FROM public.sales_refund_reversals v WHERE v.refund_id=f.id AND v.restaurant_id=f.restaurant_id);
    IF total_refunded+NEW.amount>original.amount THEN
        RAISE EXCEPTION 'Refund exceeds collected amount' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION public.validate_sales_refund_reversal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original public.sales_refunds%ROWTYPE; restaurant_timezone TEXT; posting_date DATE;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('accounting:' || NEW.restaurant_id::text,0));
    SELECT * INTO original FROM public.sales_refunds WHERE id=NEW.refund_id AND restaurant_id=NEW.restaurant_id AND order_id=NEW.order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Original refund not found in this restaurant/order' USING ERRCODE='23514'; END IF;
    PERFORM 1 FROM public.payments WHERE id=original.payment_id FOR UPDATE;
    NEW.created_at := clock_timestamp();
    IF original.method IN ('CASH_AT_COUNTER','CASH_ON_DELIVERY') THEN
        SELECT COALESCE(NULLIF(timezone,''),'Asia/Yangon') INTO restaurant_timezone FROM public.restaurant_settings WHERE restaurant_id=NEW.restaurant_id;
        posting_date := (NEW.created_at AT TIME ZONE restaurant_timezone)::date;
        IF restaurant_timezone IS NULL OR EXISTS(SELECT 1 FROM public.accounting_cash_closings c
            WHERE c.restaurant_id=NEW.restaurant_id AND c.closing_date>=posting_date
              AND NOT EXISTS(SELECT 1 FROM public.accounting_cash_closing_reversals r WHERE r.restaurant_id=c.restaurant_id AND r.closing_id=c.id)) THEN
            RAISE EXCEPTION 'Refund reversal cash posting period is finalized' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_sales_refund_reversal() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_validate_sales_refund_reversal BEFORE INSERT ON public.sales_refund_reversals
FOR EACH ROW EXECUTE FUNCTION public.validate_sales_refund_reversal();
