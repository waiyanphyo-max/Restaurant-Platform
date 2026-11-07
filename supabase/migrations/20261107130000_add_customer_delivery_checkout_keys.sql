-- Each customer can have one issued, uncommitted delivery checkout per restaurant.
-- A retired key cannot be used again. Committed keys remain on orders for receipt replay.
CREATE TABLE public.customer_delivery_checkout_keys (
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    checkout_key UUID NOT NULL,
    PRIMARY KEY (restaurant_id, customer_id)
);

CREATE INDEX customer_delivery_checkout_keys_customer_idx
    ON public.customer_delivery_checkout_keys (customer_id);

ALTER TABLE public.customer_delivery_checkout_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_delivery_checkout_keys FROM PUBLIC, anon, authenticated;
