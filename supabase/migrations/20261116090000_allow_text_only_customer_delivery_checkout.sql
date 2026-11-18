-- Text-only customer checkout keeps the complete immutable address snapshot.
-- chk_order_delivery_coordinates continues to enforce either two nulls or a
-- complete in-range pair. Existing map/GPS sources still require a map pin.
ALTER TABLE public.orders
    DROP CONSTRAINT chk_customer_delivery_checkout_snapshot,
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
            AND delivery_location_source IN ('SAVED_ADDRESS', 'MANUAL_TEXT', 'MANUAL_MAP', 'GPS_CONFIRMED')
            AND (delivery_address_id IS NOT NULL) = (delivery_location_source = 'SAVED_ADDRESS')
            AND order_type = 'DELIVERY'
            AND order_channel = 'CUSTOMER_APP'
            AND delivery_zone_id IS NOT NULL
            AND (
                delivery_location_source IN ('SAVED_ADDRESS', 'MANUAL_TEXT')
                OR (delivery_latitude IS NOT NULL AND delivery_longitude IS NOT NULL)
            )
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

COMMENT ON COLUMN public.orders.delivery_location_source IS
    'Immutable checkout source: SAVED_ADDRESS or MANUAL_TEXT may have no navigation coordinates; MANUAL_MAP and GPS_CONFIRMED require a complete point.';
