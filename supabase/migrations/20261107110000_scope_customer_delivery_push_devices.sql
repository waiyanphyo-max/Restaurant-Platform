-- Preserve unscoped devices for existing callers. Customer Android registrations
-- pin the token to one restaurant. A removed restaurant must never make a device global.
ALTER TABLE public.user_devices
    ADD COLUMN customer_restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    ADD CONSTRAINT user_devices_customer_android_only
        CHECK (customer_restaurant_id IS NULL OR platform = 'ANDROID');

CREATE INDEX user_devices_customer_restaurant_idx
    ON public.user_devices (customer_restaurant_id)
    WHERE customer_restaurant_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enqueue_user_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.user_id IS NOT NULL AND NEW.channel = 'IN_APP' THEN
        INSERT INTO public.push_notification_outbox
            (notification_id, user_id, device_id)
        SELECT NEW.id, NEW.user_id, device.id
        FROM public.user_devices AS device
        LEFT JOIN public.orders AS customer_order
            ON customer_order.id = NEW.order_id
            AND customer_order.customer_id = NEW.user_id
            AND customer_order.order_type = 'DELIVERY'
            AND NEW.queue_ticket_id IS NULL
            -- Keep aligned with CustomerOrderNotifications.TYPES in Spring.
            AND NEW.notification_type IN (
                'ORDER_CREATED', 'ORDER_ACCEPTED', 'ORDER_PREPARING', 'ORDER_READY', 'ORDER_CANCELLED',
                'DELIVERY_ON_THE_WAY', 'DELIVERY_COMPLETED', 'DELIVERY_FAILED', 'DELIVERY_CANCELLED')
        WHERE device.user_id = NEW.user_id
          AND device.is_active = TRUE
          AND ((device.customer_restaurant_id IS NULL AND customer_order.delivery_location_source IS NULL)
              OR device.customer_restaurant_id = customer_order.restaurant_id)
        ON CONFLICT (notification_id, device_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;
