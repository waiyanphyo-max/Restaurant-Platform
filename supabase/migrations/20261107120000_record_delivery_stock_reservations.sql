-- Preserve the existing immutable item history. A null reservation means the historical deduction is unknown.
ALTER TABLE public.order_items
    ADD COLUMN reserved_stock_quantity INT,
    ADD CONSTRAINT chk_order_item_reserved_stock_quantity
        CHECK (reserved_stock_quantity IS NULL OR reserved_stock_quantity IN (0, quantity));

COMMENT ON COLUMN public.order_items.reserved_stock_quantity IS
    'Stock units deducted at order creation. Zero records no deduction. Null means the historical quantity is unknown. The existing item immutability trigger protects this evidence.';
