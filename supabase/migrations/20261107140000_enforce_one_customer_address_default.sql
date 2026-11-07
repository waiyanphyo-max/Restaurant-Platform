DO $$
BEGIN
    -- Keep the repair and constraint atomic even when executed outside a migration transaction.
    LOCK TABLE public.customer_addresses IN SHARE ROW EXCLUSIVE MODE;

    WITH ranked_defaults AS (
        SELECT id, row_number() OVER (
            PARTITION BY user_id ORDER BY updated_at DESC, created_at DESC, id
        ) AS preference
        FROM public.customer_addresses
        WHERE is_default
    )
    UPDATE public.customer_addresses AS address
    SET is_default = false
    FROM ranked_defaults AS ranked
    WHERE address.id = ranked.id AND ranked.preference > 1;

    CREATE UNIQUE INDEX customer_addresses_one_default_per_user_idx
        ON public.customer_addresses (user_id) WHERE is_default;
END;
$$;
