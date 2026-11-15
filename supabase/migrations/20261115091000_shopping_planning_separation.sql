-- Quantity planning is independent from immutable purchases and payments.
-- Retain every legacy cost/supplier value, including plans subsequently edited.
CREATE TABLE public.accounting_shopping_plan_lines (
    id UUID PRIMARY KEY,
    restaurant_id UUID NOT NULL,
    sheet_id UUID NOT NULL,
    item_id UUID NOT NULL,
    item_name VARCHAR(150) NOT NULL,
    quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(30) NOT NULL CHECK (btrim(unit) <> ''),
    position INTEGER NOT NULL CHECK (position >= 0),
    FOREIGN KEY (restaurant_id, sheet_id) REFERENCES public.accounting_shopping_sheets(restaurant_id, id),
    FOREIGN KEY (restaurant_id, item_id) REFERENCES public.accounting_shopping_items(restaurant_id, id)
);
INSERT INTO public.accounting_shopping_plan_lines(id,restaurant_id,sheet_id,item_id,item_name,quantity,unit,position)
SELECT id,restaurant_id,sheet_id,item_id,item_name,quantity,unit,
       (row_number() OVER (PARTITION BY restaurant_id,sheet_id ORDER BY id)-1)::integer
FROM public.accounting_shopping_lines;
CREATE INDEX accounting_plan_lines_sheet_idx ON public.accounting_shopping_plan_lines(restaurant_id,sheet_id,position);
-- Historical duplicate item rows are preserved exactly; new writes reject duplicates
-- in the service under the existing per-restaurant transaction lock.
ALTER TABLE public.accounting_shopping_plan_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.accounting_shopping_plan_lines FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.accounting_shopping_lines IS
    'Read-only legacy shopping valuation archive. Original costs, totals and supplier references retained by 20261115091000.';
CREATE TRIGGER accounting_legacy_shopping_lines_immutable
BEFORE UPDATE OR DELETE ON public.accounting_shopping_lines
FOR EACH ROW EXECUTE FUNCTION public.accounting_immutable();
-- Catalog identity and historic default quantities remain. New planning ignores
-- catalog default_quantity: quantities belong only to each selected daily row.
ALTER TABLE public.accounting_shopping_items ALTER COLUMN default_unit DROP NOT NULL;
