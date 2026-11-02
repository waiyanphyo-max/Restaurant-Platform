-- Last migration intentionally follows cashbook creation. Existing collection flows
-- participate in the same lock as accounting services without changing their API.
CREATE FUNCTION public.guard_collected_cash_period() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tenant UUID; restaurant_timezone TEXT; cash_date DATE; order_total BIGINT; order_status TEXT; already_collected NUMERIC;
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.id,NEW.order_id,NEW.method,NEW.amount,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.order_id,OLD.method,OLD.amount,OLD.created_at) THEN
        RAISE EXCEPTION 'Payment checkout amounts and references are immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.status <> 'PAID' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'PAID' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Only pending payments can become collected' USING ERRCODE = '23514';
    END IF;
    SELECT restaurant_id,total_amount,status INTO tenant,order_total,order_status FROM public.orders WHERE id=NEW.order_id;
    PERFORM pg_advisory_xact_lock(hashtextextended('accounting:' || tenant::text,0));
    SELECT COALESCE(SUM(amount),0) INTO already_collected FROM public.payments
        WHERE order_id=NEW.order_id AND status IN ('PAID','REFUNDED') AND id<>NEW.id;
    IF order_status='CANCELLED' OR already_collected+NEW.amount>order_total THEN
        RAISE EXCEPTION 'Collection exceeds the uncancelled order obligation' USING ERRCODE = '23514';
    END IF;
    IF NEW.paid_at IS NULL OR NEW.paid_at > clock_timestamp() THEN
        RAISE EXCEPTION 'Collection needs its actual payment timestamp' USING ERRCODE = '23514';
    END IF;
    IF NEW.method = 'ONLINE' THEN RETURN NEW; END IF;
    SELECT COALESCE(NULLIF(timezone,''),'Asia/Yangon') INTO restaurant_timezone FROM public.restaurant_settings WHERE restaurant_id=tenant;
    IF restaurant_timezone IS NULL THEN
        RAISE EXCEPTION 'Restaurant timezone settings required' USING ERRCODE = '23514';
    END IF;
    cash_date := (NEW.paid_at AT TIME ZONE restaurant_timezone)::date;
    IF EXISTS (SELECT 1 FROM public.accounting_cash_closings c WHERE c.restaurant_id=tenant AND c.closing_date>=cash_date
        AND NOT EXISTS(SELECT 1 FROM public.accounting_cash_closing_reversals r WHERE r.restaurant_id=tenant AND r.closing_id=c.id)) THEN
        RAISE EXCEPTION 'Cash period is finalized; reverse affected closings first' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_collected_cash_period() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_guard_collected_cash_period BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.guard_collected_cash_period();
