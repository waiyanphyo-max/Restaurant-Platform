-- Shopping plans are deliberately separate from immutable purchase obligations.
CREATE TABLE public.accounting_suppliers (
    id UUID PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
    name VARCHAR(150) NOT NULL CHECK (btrim(name) <> ''),
    contact VARCHAR(500),
    active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID NOT NULL REFERENCES public.profiles(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (restaurant_id, id)
);
CREATE TABLE public.accounting_shopping_items (
    id UUID PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
    name VARCHAR(150) NOT NULL CHECK (btrim(name) <> ''),
    default_unit VARCHAR(30) NOT NULL CHECK (btrim(default_unit) <> ''),
    default_quantity NUMERIC(18,6) CHECK (default_quantity > 0),
    supplier_id UUID,
    suggestion_enabled BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID NOT NULL REFERENCES public.profiles(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (restaurant_id, id),
    FOREIGN KEY (restaurant_id, supplier_id) REFERENCES public.accounting_suppliers(restaurant_id, id)
);
CREATE TABLE public.accounting_shopping_sheets (
    id UUID PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
    shopping_date DATE NOT NULL,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID NOT NULL REFERENCES public.profiles(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (restaurant_id, id)
);
CREATE TABLE public.accounting_shopping_lines (
    id UUID PRIMARY KEY,
    restaurant_id UUID NOT NULL,
    sheet_id UUID NOT NULL,
    item_id UUID NOT NULL,
    item_name VARCHAR(150) NOT NULL,
    quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(30) NOT NULL CHECK (btrim(unit) <> ''),
    unit_cost BIGINT NOT NULL CHECK (unit_cost >= 0),
    line_total BIGINT NOT NULL CHECK (line_total >= 0 AND line_total::numeric = quantity * unit_cost),
    supplier_id UUID,
    FOREIGN KEY (restaurant_id, sheet_id) REFERENCES public.accounting_shopping_sheets(restaurant_id, id),
    FOREIGN KEY (restaurant_id, item_id) REFERENCES public.accounting_shopping_items(restaurant_id, id),
    FOREIGN KEY (restaurant_id, supplier_id) REFERENCES public.accounting_suppliers(restaurant_id, id)
);
CREATE TABLE public.accounting_purchases (
    id UUID PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
    purchase_date DATE NOT NULL,
    purchased_at TIMESTAMPTZ NOT NULL,
    supplier_id UUID,
    supplier_name VARCHAR(150),
    total_amount BIGINT NOT NULL CHECK (total_amount >= 0),
    sheet_id UUID,
    due_date DATE CHECK (due_date IS NULL OR due_date >= purchase_date),
    receipt_id UUID,
    invoice_reference VARCHAR(150),
    correction_of_id UUID,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (restaurant_id, id),
    FOREIGN KEY (restaurant_id, supplier_id) REFERENCES public.accounting_suppliers(restaurant_id, id),
    FOREIGN KEY (restaurant_id, sheet_id) REFERENCES public.accounting_shopping_sheets(restaurant_id, id),
    FOREIGN KEY (receipt_id, restaurant_id) REFERENCES public.accounting_receipts(id, restaurant_id),
    FOREIGN KEY (restaurant_id, correction_of_id) REFERENCES public.accounting_purchases(restaurant_id, id)
);
CREATE TABLE public.accounting_purchase_lines (
    id UUID PRIMARY KEY,
    restaurant_id UUID NOT NULL,
    purchase_id UUID NOT NULL,
    item_id UUID NOT NULL,
    item_name VARCHAR(150) NOT NULL,
    quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(30) NOT NULL CHECK (btrim(unit) <> ''),
    unit_cost BIGINT NOT NULL CHECK (unit_cost >= 0),
    line_total BIGINT NOT NULL CHECK (line_total >= 0 AND line_total::numeric = quantity * unit_cost),
    FOREIGN KEY (restaurant_id, purchase_id) REFERENCES public.accounting_purchases(restaurant_id, id),
    FOREIGN KEY (restaurant_id, item_id) REFERENCES public.accounting_shopping_items(restaurant_id, id)
);
CREATE TABLE public.accounting_purchase_cancellations (
    id UUID PRIMARY KEY,
    restaurant_id UUID NOT NULL,
    purchase_id UUID NOT NULL,
    reason VARCHAR(1000) NOT NULL CHECK (btrim(reason) <> ''),
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (restaurant_id, purchase_id),
    FOREIGN KEY (restaurant_id, purchase_id) REFERENCES public.accounting_purchases(restaurant_id, id)
);
CREATE TABLE public.accounting_purchase_payments (
    id UUID PRIMARY KEY,
    restaurant_id UUID NOT NULL,
    purchase_id UUID NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    method VARCHAR(30) NOT NULL CHECK (method IN ('CASH', 'BANK_TRANSFER', 'CARD', 'OTHER')),
    paid_at TIMESTAMPTZ NOT NULL,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (restaurant_id, id),
    FOREIGN KEY (restaurant_id, purchase_id) REFERENCES public.accounting_purchases(restaurant_id, id)
);
CREATE TABLE public.accounting_purchase_payment_reversals (
    id UUID PRIMARY KEY,
    restaurant_id UUID NOT NULL,
    payment_id UUID NOT NULL,
    reason VARCHAR(1000) NOT NULL CHECK (btrim(reason) <> ''),
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (restaurant_id, payment_id),
    FOREIGN KEY (restaurant_id, payment_id) REFERENCES public.accounting_purchase_payments(restaurant_id, id)
);
CREATE INDEX accounting_purchase_period_idx ON public.accounting_purchases(restaurant_id, purchase_date, purchased_at, id);
CREATE INDEX accounting_purchase_supplier_idx ON public.accounting_purchases(restaurant_id, supplier_id, purchase_date);
CREATE INDEX accounting_purchase_item_idx ON public.accounting_purchase_lines(restaurant_id, item_id, purchase_id);
CREATE INDEX accounting_purchase_payment_date_idx ON public.accounting_purchase_payments(restaurant_id, paid_at);
CREATE INDEX accounting_sheet_date_idx ON public.accounting_shopping_sheets(restaurant_id, shopping_date);
CREATE UNIQUE INDEX accounting_one_purchase_per_sheet_idx ON public.accounting_purchases(restaurant_id, sheet_id) WHERE sheet_id IS NOT NULL;
CREATE UNIQUE INDEX accounting_one_purchase_replacement_idx ON public.accounting_purchases(restaurant_id, correction_of_id) WHERE correction_of_id IS NOT NULL;

DO $$
DECLARE table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['accounting_suppliers', 'accounting_shopping_items', 'accounting_shopping_sheets',
        'accounting_shopping_lines', 'accounting_purchases', 'accounting_purchase_lines',
        'accounting_purchase_cancellations', 'accounting_purchase_payments', 'accounting_purchase_payment_reversals']
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    END LOOP;
    FOREACH table_name IN ARRAY ARRAY['accounting_purchases', 'accounting_purchase_lines',
        'accounting_purchase_cancellations', 'accounting_purchase_payments', 'accounting_purchase_payment_reversals']
    LOOP
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.accounting_immutable()', table_name || '_immutable', table_name);
    END LOOP;
END $$;
