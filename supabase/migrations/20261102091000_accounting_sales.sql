-- Forward-only accounting sales history. Legacy unknown timestamps/actors are not fabricated.
ALTER TABLE public.payments ADD COLUMN collected_by_user_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.payments ADD CONSTRAINT uq_payment_id_order UNIQUE (id, order_id);
ALTER TABLE public.orders ADD COLUMN table_number_snapshot VARCHAR(30), ADD COLUMN queue_code_snapshot VARCHAR(20);

CREATE TABLE public.sales_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
    order_id UUID NOT NULL,
    payment_id UUID NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    method VARCHAR(30) NOT NULL CHECK (method IN ('CASH_AT_COUNTER', 'CASH_ON_DELIVERY', 'ONLINE')),
    refunded_at TIMESTAMPTZ NOT NULL,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
    UNIQUE (id, restaurant_id),
    FOREIGN KEY (order_id, restaurant_id) REFERENCES public.orders(id, restaurant_id) ON DELETE RESTRICT,
    FOREIGN KEY (payment_id, order_id) REFERENCES public.payments(id, order_id) ON DELETE RESTRICT
);
CREATE INDEX idx_sales_refunds_restaurant_time ON public.sales_refunds(restaurant_id, refunded_at, id);
CREATE INDEX idx_sales_refunds_payment ON public.sales_refunds(payment_id);
CREATE INDEX idx_accounting_orders_created ON public.orders(restaurant_id, created_at, id);
CREATE INDEX idx_accounting_payments_paid ON public.payments(paid_at, order_id) WHERE paid_at IS NOT NULL;
ALTER TABLE public.sales_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sales_refunds FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_sales_refunds_immutable BEFORE UPDATE OR DELETE ON public.sales_refunds
FOR EACH ROW EXECUTE FUNCTION public.accounting_immutable();

CREATE FUNCTION public.validate_sales_refund() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original public.payments%ROWTYPE; total_refunded NUMERIC;
BEGIN
    SELECT * INTO original FROM public.payments WHERE id = NEW.payment_id AND order_id = NEW.order_id FOR UPDATE;
    IF NOT FOUND OR original.status <> 'PAID' OR original.paid_at IS NULL
       OR NEW.method <> original.method OR NEW.refunded_at < original.paid_at OR NEW.refunded_at > clock_timestamp() THEN
        RAISE EXCEPTION 'Refund requires a collected payment, matching method and valid event time' USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(SUM(amount), 0) INTO total_refunded FROM public.sales_refunds WHERE payment_id = NEW.payment_id;
    IF total_refunded + NEW.amount > original.amount THEN
        RAISE EXCEPTION 'Refund exceeds collected amount' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_sales_refund() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_validate_sales_refund BEFORE INSERT ON public.sales_refunds
FOR EACH ROW EXECUTE FUNCTION public.validate_sales_refund();

-- These are already checkout snapshots; protect their historical values at the database boundary.
CREATE TRIGGER trg_order_items_accounting_immutable BEFORE UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.accounting_immutable();
CREATE TRIGGER trg_order_modifiers_accounting_immutable BEFORE UPDATE OR DELETE ON public.order_item_modifiers
FOR EACH ROW EXECUTE FUNCTION public.accounting_immutable();

CREATE FUNCTION public.protect_order_financial_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.table_number_snapshot := (SELECT table_number FROM public.dining_tables WHERE id=NEW.table_id AND restaurant_id=NEW.restaurant_id);
        NEW.queue_code_snapshot := (SELECT display_code FROM public.queue_tickets WHERE id=NEW.queue_ticket_id AND restaurant_id=NEW.restaurant_id);
        RETURN NEW;
    END IF;
    IF (NEW.restaurant_id, NEW.order_number, NEW.created_at, NEW.created_by_user_id, NEW.subtotal,
        NEW.delivery_fee, NEW.discount_amount, NEW.total_amount, NEW.order_type, NEW.order_channel,
        NEW.table_number_snapshot, NEW.queue_code_snapshot) IS DISTINCT FROM
       (OLD.restaurant_id, OLD.order_number, OLD.created_at, OLD.created_by_user_id, OLD.subtotal,
        OLD.delivery_fee, OLD.discount_amount, OLD.total_amount, OLD.order_type, OLD.order_channel,
        OLD.table_number_snapshot, OLD.queue_code_snapshot)
        OR (OLD.table_id IS NOT NULL AND NEW.table_id IS DISTINCT FROM OLD.table_id)
        OR (OLD.queue_ticket_id IS NOT NULL AND NEW.queue_ticket_id IS DISTINCT FROM OLD.queue_ticket_id) THEN
        RAISE EXCEPTION 'Historical order financial snapshots cannot be overwritten' USING ERRCODE = '23514';
    END IF;
    IF OLD.table_id IS NULL AND NEW.table_id IS NOT NULL THEN
        NEW.table_number_snapshot := (SELECT table_number FROM public.dining_tables WHERE id=NEW.table_id AND restaurant_id=NEW.restaurant_id);
    END IF;
    IF OLD.queue_ticket_id IS NULL AND NEW.queue_ticket_id IS NOT NULL THEN
        NEW.queue_code_snapshot := (SELECT display_code FROM public.queue_tickets WHERE id=NEW.queue_ticket_id AND restaurant_id=NEW.restaurant_id);
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_order_financial_snapshot() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_order_financial_snapshot BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.protect_order_financial_snapshot();

CREATE FUNCTION public.protect_collected_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status IN ('PAID', 'REFUNDED') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Collected payments require append-only refund adjustments' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_collected_payment() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_protect_collected_payment BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.protect_collected_payment();
CREATE TRIGGER trg_orders_accounting_no_delete BEFORE DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.accounting_immutable();
CREATE TRIGGER trg_payments_accounting_no_delete BEFORE DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.accounting_immutable();
CREATE TRIGGER trg_order_status_accounting_immutable BEFORE UPDATE OR DELETE ON public.order_status_history
FOR EACH ROW EXECUTE FUNCTION public.accounting_immutable();
