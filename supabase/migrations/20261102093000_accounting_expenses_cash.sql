-- Forward-only financial ledgers. Financial rows and their reversals are append-only.
CREATE TABLE public.accounting_expense_templates (
    id UUID PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
    category VARCHAR(40) NOT NULL CHECK (category IN ('RENT','SALARIES_WAGES','ELECTRICITY','WATER','INTERNET','TRANSPORT','PACKAGING','EQUIPMENT_MAINTENANCE','MARKETING','MISCELLANEOUS')),
    amount BIGINT NOT NULL CHECK (amount > 0),
    description VARCHAR(2000) NOT NULL CHECK (length(trim(description)) > 0),
    payee VARCHAR(200),
    frequency VARCHAR(10) NOT NULL CHECK (frequency IN ('MONTHLY','YEARLY')),
    starts_on DATE NOT NULL,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (restaurant_id,id)
);
CREATE TABLE public.accounting_expense_template_stops (
    id UUID PRIMARY KEY, restaurant_id UUID NOT NULL,
    template_id UUID NOT NULL,
    reason VARCHAR(2000) NOT NULL CHECK (length(trim(reason)) > 0),
    created_by UUID NOT NULL REFERENCES public.profiles(id), created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (restaurant_id,template_id),
    FOREIGN KEY (restaurant_id,template_id) REFERENCES public.accounting_expense_templates(restaurant_id,id)
);
CREATE TABLE public.accounting_expenses (
    id UUID PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
    category VARCHAR(40) NOT NULL CHECK (category IN ('RENT','SALARIES_WAGES','ELECTRICITY','WATER','INTERNET','TRANSPORT','PACKAGING','EQUIPMENT_MAINTENANCE','MARKETING','MISCELLANEOUS')),
    amount BIGINT NOT NULL CHECK (amount > 0),
    expense_date DATE NOT NULL,
    description VARCHAR(2000) NOT NULL CHECK (length(trim(description)) > 0),
    payee VARCHAR(200), receipt_id UUID,
    template_id UUID,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (restaurant_id,id), UNIQUE (restaurant_id,template_id,expense_date),
    FOREIGN KEY (restaurant_id,template_id) REFERENCES public.accounting_expense_templates(restaurant_id,id),
    FOREIGN KEY (receipt_id,restaurant_id) REFERENCES public.accounting_receipts(id,restaurant_id)
);
CREATE INDEX accounting_expenses_history ON public.accounting_expenses(restaurant_id,expense_date,id);
CREATE TABLE public.accounting_expense_cancellations (
    id UUID PRIMARY KEY, restaurant_id UUID NOT NULL, expense_id UUID NOT NULL,
    reason VARCHAR(2000) NOT NULL CHECK (length(trim(reason)) > 0),
    created_by UUID NOT NULL REFERENCES public.profiles(id), created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (restaurant_id,expense_id),
    FOREIGN KEY (restaurant_id,expense_id) REFERENCES public.accounting_expenses(restaurant_id,id)
);
CREATE TABLE public.accounting_expense_payments (
    id UUID PRIMARY KEY, restaurant_id UUID NOT NULL, expense_id UUID NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    method VARCHAR(20) NOT NULL CHECK (method IN ('CASH','BANK_TRANSFER','CARD','OTHER')),
    paid_at TIMESTAMPTZ NOT NULL,
    created_by UUID NOT NULL REFERENCES public.profiles(id), created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (restaurant_id,id),
    FOREIGN KEY (restaurant_id,expense_id) REFERENCES public.accounting_expenses(restaurant_id,id)
);
CREATE INDEX accounting_expense_payment_dates ON public.accounting_expense_payments(restaurant_id,paid_at);
CREATE TABLE public.accounting_expense_payment_reversals (
    id UUID PRIMARY KEY, restaurant_id UUID NOT NULL, payment_id UUID NOT NULL,
    reason VARCHAR(2000) NOT NULL CHECK (length(trim(reason)) > 0),
    created_by UUID NOT NULL REFERENCES public.profiles(id), created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (restaurant_id,payment_id),
    FOREIGN KEY (restaurant_id,payment_id) REFERENCES public.accounting_expense_payments(restaurant_id,id)
);
-- One initial cash balance. Every following opening is the previous day's counted close.
CREATE TABLE public.accounting_cash_openings (
    id UUID PRIMARY KEY, restaurant_id UUID NOT NULL UNIQUE REFERENCES public.restaurants(id),
    opening_date DATE NOT NULL, amount BIGINT NOT NULL CHECK (amount >= 0),
    reason VARCHAR(2000) NOT NULL CHECK (length(trim(reason)) > 0),
    created_by UUID NOT NULL REFERENCES public.profiles(id), created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.accounting_cash_movements (
    id UUID PRIMARY KEY, restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
    kind VARCHAR(30) NOT NULL CHECK (kind IN ('OTHER_RECEIPT','OWNER_DEPOSIT','OWNER_WITHDRAWAL','BANK_DEPOSIT','BANK_WITHDRAWAL','ADJUSTMENT')),
    signed_amount BIGINT NOT NULL CHECK (signed_amount <> 0 AND signed_amount > '-9223372036854775808'::BIGINT),
    occurred_at TIMESTAMPTZ NOT NULL, reason VARCHAR(2000) NOT NULL CHECK (length(trim(reason)) > 0),
    created_by UUID NOT NULL REFERENCES public.profiles(id), created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (restaurant_id,id)
);
CREATE INDEX accounting_cash_movement_dates ON public.accounting_cash_movements(restaurant_id,occurred_at);
CREATE TABLE public.accounting_cash_movement_reversals (
    id UUID PRIMARY KEY, restaurant_id UUID NOT NULL, movement_id UUID NOT NULL,
    reason VARCHAR(2000) NOT NULL CHECK (length(trim(reason)) > 0),
    created_by UUID NOT NULL REFERENCES public.profiles(id), created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (restaurant_id,movement_id),
    FOREIGN KEY (restaurant_id,movement_id) REFERENCES public.accounting_cash_movements(restaurant_id,id)
);
CREATE TABLE public.accounting_cash_closings (
    id UUID PRIMARY KEY, restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
    closing_date DATE NOT NULL, revision INTEGER NOT NULL CHECK (revision > 0),
    opening_balance BIGINT NOT NULL CHECK (opening_balance >= 0),
    expected_cash BIGINT NOT NULL, actual_cash BIGINT NOT NULL CHECK (actual_cash >= 0), variance BIGINT NOT NULL,
    reconciliation_note VARCHAR(2000), missing_inputs JSONB NOT NULL DEFAULT '[]'::JSONB,
    created_by UUID NOT NULL REFERENCES public.profiles(id), created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (restaurant_id,id), UNIQUE (restaurant_id,closing_date,revision),
    CHECK (variance = actual_cash - expected_cash)
);
CREATE TABLE public.accounting_cash_closing_reversals (
    id UUID PRIMARY KEY, restaurant_id UUID NOT NULL, closing_id UUID NOT NULL,
    reason VARCHAR(2000) NOT NULL CHECK (length(trim(reason)) > 0),
    created_by UUID NOT NULL REFERENCES public.profiles(id), created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (restaurant_id,closing_id),
    FOREIGN KEY (restaurant_id,closing_id) REFERENCES public.accounting_cash_closings(restaurant_id,id)
);
DO $$
DECLARE financial_table text;
BEGIN
  FOREACH financial_table IN ARRAY ARRAY[
    'accounting_expense_templates','accounting_expense_template_stops','accounting_expenses',
    'accounting_expense_cancellations','accounting_expense_payments','accounting_expense_payment_reversals',
    'accounting_cash_openings','accounting_cash_movements','accounting_cash_movement_reversals',
    'accounting_cash_closings','accounting_cash_closing_reversals']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',financial_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated',financial_table);
    EXECUTE format('CREATE TRIGGER immutable_financial_record BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.accounting_immutable()',financial_table);
  END LOOP;
END $$;
