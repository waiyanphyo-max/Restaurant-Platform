ALTER TABLE public.orders
    ADD COLUMN delivery_address_id UUID,
    ADD COLUMN delivery_city VARCHAR(100),
    ADD COLUMN delivery_township VARCHAR(100),
    ADD COLUMN delivery_location_source VARCHAR(20),
    ADD COLUMN delivery_checkout_key UUID,
    ADD COLUMN delivery_checkout_request_hash VARCHAR(64),
    ADD COLUMN delivery_checkout_currency VARCHAR(10),
    ADD CONSTRAINT chk_customer_delivery_checkout_snapshot CHECK (
        (
            delivery_location_source IS NULL
            AND delivery_address_id IS NULL
            AND delivery_city IS NULL
            AND delivery_township IS NULL
            AND delivery_checkout_key IS NULL
            AND delivery_checkout_request_hash IS NULL
            AND delivery_checkout_currency IS NULL
        ) OR (
            delivery_location_source IS NOT NULL
            AND delivery_location_source IN ('SAVED_ADDRESS', 'MANUAL_MAP', 'GPS_CONFIRMED')
            AND (delivery_address_id IS NOT NULL) = (delivery_location_source = 'SAVED_ADDRESS')
            AND order_type = 'DELIVERY'
            AND order_channel = 'CUSTOMER_APP'
            AND delivery_zone_id IS NOT NULL
            AND delivery_latitude IS NOT NULL
            AND delivery_longitude IS NOT NULL
            AND nullif(btrim(delivery_city), '') IS NOT NULL
            AND nullif(btrim(delivery_township), '') IS NOT NULL
            AND nullif(btrim(delivery_address), '') IS NOT NULL
            AND nullif(btrim(delivery_name), '') IS NOT NULL
            AND nullif(btrim(delivery_phone), '') IS NOT NULL
            AND delivery_checkout_key IS NOT NULL
            AND delivery_checkout_request_hash IS NOT NULL
            AND delivery_checkout_request_hash ~ '^[0-9a-f]{64}$'
            AND nullif(btrim(delivery_checkout_currency), '') IS NOT NULL
        )
    );

COMMENT ON COLUMN public.orders.delivery_address_id IS
    'Historical identifier of the selected owned address, retained after the address is edited or deleted.';

CREATE UNIQUE INDEX orders_delivery_checkout_key_idx
    ON public.orders (restaurant_id, customer_id, delivery_checkout_key)
    WHERE delivery_checkout_key IS NOT NULL;

CREATE FUNCTION public.preserve_customer_delivery_checkout_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.delivery_location_source IS NOT NULL AND (
            NEW.customer_id IS NULL OR (
                NEW.delivery_location_source = 'SAVED_ADDRESS'
                AND NOT EXISTS (
                    SELECT 1 FROM public.customer_addresses AS address
                    WHERE address.id = NEW.delivery_address_id AND address.user_id = NEW.customer_id
                )
            )
        ) THEN
            RAISE EXCEPTION 'Customer delivery checkout requires an owned destination' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF (OLD.delivery_location_source IS NOT NULL OR NEW.delivery_location_source IS NOT NULL)
       AND ((NEW.customer_id IS NOT NULL AND NEW.customer_id IS DISTINCT FROM OLD.customer_id)
       OR ROW(NEW.restaurant_id, NEW.delivery_zone_id, NEW.created_at,
               NEW.delivery_address_id, NEW.delivery_city, NEW.delivery_township,
               NEW.delivery_location_source, NEW.delivery_address, NEW.delivery_name,
               NEW.delivery_phone, NEW.delivery_note, NEW.delivery_checkout_key,
               NEW.delivery_checkout_request_hash, NEW.delivery_checkout_currency,
               NEW.subtotal, NEW.delivery_fee, NEW.discount_amount, NEW.total_amount)
           IS DISTINCT FROM
           ROW(OLD.restaurant_id, OLD.delivery_zone_id, OLD.created_at,
               OLD.delivery_address_id, OLD.delivery_city, OLD.delivery_township,
               OLD.delivery_location_source, OLD.delivery_address, OLD.delivery_name,
               OLD.delivery_phone, OLD.delivery_note, OLD.delivery_checkout_key,
               OLD.delivery_checkout_request_hash, OLD.delivery_checkout_currency,
               OLD.subtotal, OLD.delivery_fee, OLD.discount_amount, OLD.total_amount)) THEN
        RAISE EXCEPTION 'Customer delivery checkout snapshot is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.preserve_customer_delivery_checkout_snapshot() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_preserve_customer_delivery_checkout_snapshot
BEFORE INSERT OR UPDATE OF restaurant_id, customer_id, delivery_zone_id, created_at,
                 delivery_address_id, delivery_city, delivery_township,
                 delivery_location_source, delivery_address, delivery_name,
                 delivery_phone, delivery_note, delivery_checkout_key,
                 delivery_checkout_request_hash, delivery_checkout_currency,
                 subtotal, delivery_fee, discount_amount, total_amount ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.preserve_customer_delivery_checkout_snapshot();
