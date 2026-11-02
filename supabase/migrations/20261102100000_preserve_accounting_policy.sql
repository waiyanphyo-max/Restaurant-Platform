-- Currency and calendar boundaries cannot be reinterpreted after financial history exists.
CREATE FUNCTION public.guard_accounting_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW.currency,NEW.timezone) IS NOT DISTINCT FROM (OLD.currency,OLD.timezone) THEN RETURN NEW; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('accounting:' || OLD.restaurant_id::text,0));
    IF (NEW.currency,NEW.timezone) IS DISTINCT FROM (OLD.currency,OLD.timezone)
       AND (EXISTS(SELECT 1 FROM public.orders WHERE restaurant_id=OLD.restaurant_id)
            OR EXISTS(SELECT 1 FROM public.accounting_audit WHERE restaurant_id=OLD.restaurant_id)) THEN
        RAISE EXCEPTION 'Currency/timezone are fixed after financial history; an explicit policy migration is required' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_accounting_policy() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_accounting_policy BEFORE UPDATE ON public.restaurant_settings
FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_policy();

CREATE FUNCTION public.lock_order_accounting_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('accounting:' || NEW.restaurant_id::text,0));
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.lock_order_accounting_policy() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_accounting_order_policy BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.lock_order_accounting_policy();
