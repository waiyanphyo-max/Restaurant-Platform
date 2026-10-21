-- Configure one default delivery driver per restaurant.
-- The backend verifies that the configured user is a DELIVERY_DRIVER member
-- of the same restaurant before saving or using this value.
ALTER TABLE public.restaurant_settings
    ADD COLUMN IF NOT EXISTS default_delivery_driver_user_id UUID
        REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_restaurant_settings_default_delivery_driver
    ON public.restaurant_settings(default_delivery_driver_user_id)
    WHERE default_delivery_driver_user_id IS NOT NULL;
