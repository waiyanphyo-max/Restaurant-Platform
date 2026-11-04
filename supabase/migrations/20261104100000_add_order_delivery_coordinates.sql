ALTER TABLE public.orders
    ADD COLUMN delivery_latitude NUMERIC(10,7),
    ADD COLUMN delivery_longitude NUMERIC(10,7),
    ADD CONSTRAINT chk_order_delivery_coordinates CHECK (
        (delivery_latitude IS NULL AND delivery_longitude IS NULL)
        OR (
            order_type = 'DELIVERY'
            AND delivery_latitude IS NOT NULL
            AND delivery_longitude IS NOT NULL
            AND delivery_latitude BETWEEN -90 AND 90
            AND delivery_longitude BETWEEN -180 AND 180
        )
    );

-- Older orders retain their textual snapshots. A customer's current address
-- cannot identify the coordinates confirmed at the time of an earlier order.
CREATE FUNCTION public.preserve_order_delivery_coordinates() RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
    IF NEW.delivery_latitude IS DISTINCT FROM OLD.delivery_latitude
       OR NEW.delivery_longitude IS DISTINCT FROM OLD.delivery_longitude THEN
        RAISE EXCEPTION 'Order delivery coordinates are immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.preserve_order_delivery_coordinates() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_preserve_order_delivery_coordinates
BEFORE UPDATE OF delivery_latitude, delivery_longitude ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.preserve_order_delivery_coordinates();
