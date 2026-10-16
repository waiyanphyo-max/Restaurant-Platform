-- Restaurant Platform schema for Supabase / PostgreSQL
-- Reviewed version based on the submitted SQL.
-- IMPORTANT:
-- 1) Run this on a NEW/empty schema. It creates tables and will not update existing tables.
-- 2) RLS is enabled at the end with no client policies. This is a secure default for a
--    Spring Boot backend using trusted server-side credentials. Add deliberate RLS policies
--    before accessing these tables directly from the Supabase client/Data API.
-- 3) Monetary values are whole currency units (e.g. whole MMK or THB), stored as BIGINT.
-- 4) The denormalized restaurant_id columns in queue_tickets, modifier_options,
--    product_modifier_groups, order_items, and order_item_modifiers must be populated
--    consistently by Spring Boot; composite foreign keys validate the relationship.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Restaurants, settings, and users
-- -----------------------------------------------------------------------------

CREATE TABLE public.restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    phone VARCHAR(30),
    address TEXT,
    house_no VARCHAR(50),
    street VARCHAR(100),
    ward VARCHAR(100),
    township VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    latitude DECIMAL(10,7) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    longitude DECIMAL(10,7) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    logo_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.restaurant_settings (
    restaurant_id UUID PRIMARY KEY
        REFERENCES public.restaurants(id) ON DELETE CASCADE,
    currency VARCHAR(10) NOT NULL DEFAULT 'MMK',
    timezone VARCHAR(60) NOT NULL DEFAULT 'Asia/Yangon',
    minimum_order BIGINT NOT NULL DEFAULT 0 CHECK (minimum_order >= 0),
    default_delivery_fee BIGINT NOT NULL DEFAULT 0 CHECK (default_delivery_fee >= 0),
    accepts_orders BOOLEAN NOT NULL DEFAULT TRUE,
    allow_qr_order BOOLEAN NOT NULL DEFAULT TRUE,
    allow_delivery BOOLEAN NOT NULL DEFAULT TRUE,
    allow_takeaway BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(150),
    phone VARCHAR(30),
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.restaurant_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role VARCHAR(30) NOT NULL
        CHECK (role IN ('OWNER', 'MANAGER', 'STAFF', 'DELIVERY_DRIVER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_restaurant_member UNIQUE (restaurant_id, user_id)
);

CREATE TABLE public.user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    push_token TEXT NOT NULL UNIQUE,
    platform VARCHAR(10) NOT NULL CHECK (platform IN ('ANDROID', 'IOS', 'WEB')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. Categories, products, variants, and optional modifiers
-- -----------------------------------------------------------------------------

CREATE TABLE public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_category_name_per_restaurant UNIQUE (restaurant_id, name),
    -- Supports composite FK checks that prevent cross-restaurant category assignment.
    CONSTRAINT uq_category_id_restaurant UNIQUE (id, restaurant_id)
);

CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    category_id UUID NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    -- Base/display price for products without variants; if variants exist, the selected
    -- product_variants.price is the actual price used for the order.
    price BIGINT NOT NULL CHECK (price >= 0),
    image_url TEXT,
    track_stock BOOLEAN NOT NULL DEFAULT FALSE,
    stock_quantity INT CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_product_stock_when_tracked
        CHECK (NOT track_stock OR stock_quantity IS NOT NULL),
    CONSTRAINT fk_product_category_same_restaurant
        FOREIGN KEY (category_id, restaurant_id)
        REFERENCES public.categories(id, restaurant_id)
        ON DELETE NO ACTION,
    CONSTRAINT uq_product_id_restaurant UNIQUE (id, restaurant_id)
);

CREATE TABLE public.product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    -- Full selling price of this variant, not an extra charge.
    price BIGINT NOT NULL CHECK (price >= 0),
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_product_variant_name UNIQUE (product_id, name),
    CONSTRAINT uq_variant_id_product UNIQUE (id, product_id)
);

CREATE TABLE public.modifier_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    min_selections INT NOT NULL DEFAULT 0 CHECK (min_selections >= 0),
    max_selections INT NOT NULL DEFAULT 1 CHECK (max_selections >= min_selections),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT ck_required_modifier_has_minimum
        CHECK (NOT is_required OR min_selections >= 1),
    CONSTRAINT uq_modifier_group_name_per_restaurant UNIQUE (restaurant_id, name),
    CONSTRAINT uq_modifier_group_id_restaurant UNIQUE (id, restaurant_id)
);

CREATE TABLE public.modifier_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    modifier_group_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    additional_price BIGINT NOT NULL DEFAULT 0 CHECK (additional_price >= 0),
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_modifier_option_group_same_restaurant
        FOREIGN KEY (modifier_group_id, restaurant_id)
        REFERENCES public.modifier_groups(id, restaurant_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_modifier_option_id_restaurant UNIQUE (id, restaurant_id),
    CONSTRAINT uq_modifier_option_name UNIQUE (modifier_group_id, name)
);

-- restaurant_id is intentionally included so the database can enforce that a product
-- and its modifier group belong to the same restaurant.
CREATE TABLE public.product_modifier_groups (
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    modifier_group_id UUID NOT NULL,
    CONSTRAINT pk_product_modifier_groups PRIMARY KEY (product_id, modifier_group_id),
    CONSTRAINT fk_pmg_product_same_restaurant
        FOREIGN KEY (product_id, restaurant_id)
        REFERENCES public.products(id, restaurant_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_pmg_group_same_restaurant
        FOREIGN KEY (modifier_group_id, restaurant_id)
        REFERENCES public.modifier_groups(id, restaurant_id)
        ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 3. Dine-in tables and common-QR queue
-- -----------------------------------------------------------------------------

CREATE TABLE public.dining_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    table_number VARCHAR(30) NOT NULL,
    qr_token VARCHAR(100) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_table_number_per_restaurant UNIQUE (restaurant_id, table_number),
    CONSTRAINT uq_dining_table_id_restaurant UNIQUE (id, restaurant_id)
);

CREATE TABLE public.daily_queue_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    queue_date DATE NOT NULL,
    last_number INT NOT NULL DEFAULT 0 CHECK (last_number >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_daily_counter UNIQUE (restaurant_id, queue_date),
    CONSTRAINT uq_daily_counter_id_restaurant UNIQUE (id, restaurant_id)
);

-- restaurant_id is stored here as well to enforce that a ticket's counter and any order
-- using that ticket belong to the same restaurant.
CREATE TABLE public.queue_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    daily_counter_id UUID NOT NULL,
    customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    queue_number INT NOT NULL CHECK (queue_number > 0),
    display_code VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'WAITING'
        CHECK (status IN ('WAITING', 'READY', 'CALLED', 'COMPLETED', 'CANCELLED')),
    public_token_hash VARCHAR(128) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ready_at TIMESTAMPTZ,
    called_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    CONSTRAINT fk_queue_ticket_counter_same_restaurant
        FOREIGN KEY (daily_counter_id, restaurant_id)
        REFERENCES public.daily_queue_counters(id, restaurant_id)
        ON DELETE NO ACTION,
    CONSTRAINT uq_queue_ticket_id_restaurant UNIQUE (id, restaurant_id),
    CONSTRAINT uq_queue_number_per_day UNIQUE (daily_counter_id, queue_number),
    CONSTRAINT uq_queue_code_per_day UNIQUE (daily_counter_id, display_code)
);

-- -----------------------------------------------------------------------------
-- 4. Customer addresses and delivery zones
-- -----------------------------------------------------------------------------

CREATE TABLE public.customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    label VARCHAR(50) NOT NULL DEFAULT 'Home',
    recipient_name VARCHAR(150),
    house_no VARCHAR(50),
    street VARCHAR(100),
    ward VARCHAR(100),
    township VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    latitude DECIMAL(10,7) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    longitude DECIMAL(10,7) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    delivery_note TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.delivery_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    delivery_fee BIGINT NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    minimum_order BIGINT NOT NULL DEFAULT 0 CHECK (minimum_order >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_delivery_zone_name UNIQUE (restaurant_id, name),
    CONSTRAINT uq_delivery_zone_id_restaurant UNIQUE (id, restaurant_id)
);

-- -----------------------------------------------------------------------------
-- 5. Orders and line items
-- -----------------------------------------------------------------------------

CREATE TABLE public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
    order_number VARCHAR(30) NOT NULL,
    customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    table_id UUID,
    queue_ticket_id UUID UNIQUE,
    delivery_zone_id UUID,
    order_type VARCHAR(20) NOT NULL
        CHECK (order_type IN ('DINE_IN', 'TAKEAWAY', 'DELIVERY')),
    order_channel VARCHAR(20) NOT NULL
        CHECK (order_channel IN ('TABLE_QR', 'COMMON_QR', 'CUSTOMER_APP', 'STAFF')),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN (
            'PENDING', 'ACCEPTED', 'PREPARING', 'READY',
            'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'
        )),
    subtotal BIGINT NOT NULL CHECK (subtotal >= 0),
    delivery_fee BIGINT NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    discount_amount BIGINT NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    total_amount BIGINT NOT NULL CHECK (total_amount >= 0),
    delivery_name VARCHAR(150),
    delivery_phone VARCHAR(30),
    delivery_address TEXT,
    delivery_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_order_number_per_restaurant UNIQUE (restaurant_id, order_number),
    CONSTRAINT uq_order_id_restaurant UNIQUE (id, restaurant_id),
    CONSTRAINT fk_order_table_same_restaurant
        FOREIGN KEY (table_id, restaurant_id)
        REFERENCES public.dining_tables(id, restaurant_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_order_queue_ticket_same_restaurant
        FOREIGN KEY (queue_ticket_id, restaurant_id)
        REFERENCES public.queue_tickets(id, restaurant_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_order_delivery_zone_same_restaurant
        FOREIGN KEY (delivery_zone_id, restaurant_id)
        REFERENCES public.delivery_zones(id, restaurant_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_order_total_math
        CHECK (total_amount = subtotal + delivery_fee - discount_amount),
    CONSTRAINT ck_order_discount_limit
        CHECK (discount_amount <= subtotal + delivery_fee)
);

CREATE TABLE public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Repeated intentionally to enforce that this item, its order, and product are from
    -- the same restaurant. Spring Boot should set this to the order's restaurant_id.
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
    order_id UUID NOT NULL,
    product_id UUID NOT NULL,
    -- Nullable only for products that do not have variants; Spring Boot must validate this.
    variant_id UUID,
    -- Snapshot names/prices preserve what the customer actually ordered.
    product_name VARCHAR(150) NOT NULL,
    variant_name VARCHAR(100),
    -- Price for one selected product/variant, excluding add-ons.
    unit_price BIGINT NOT NULL CHECK (unit_price >= 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    -- Spring Boot calculates this from unit_price, modifier prices, and quantity.
    subtotal BIGINT NOT NULL CHECK (subtotal >= 0),
    special_instruction TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_order_item_order_same_restaurant
        FOREIGN KEY (order_id, restaurant_id)
        REFERENCES public.orders(id, restaurant_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_order_item_product_same_restaurant
        FOREIGN KEY (product_id, restaurant_id)
        REFERENCES public.products(id, restaurant_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_order_item_variant_matches_product
        FOREIGN KEY (variant_id, product_id)
        REFERENCES public.product_variants(id, product_id)
        ON DELETE RESTRICT,
    CONSTRAINT uq_order_item_id_restaurant UNIQUE (id, restaurant_id)
);

CREATE TABLE public.order_item_modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
    order_item_id UUID NOT NULL,
    modifier_option_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    additional_price BIGINT NOT NULL CHECK (additional_price >= 0),
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    CONSTRAINT fk_order_item_modifier_item_same_restaurant
        FOREIGN KEY (order_item_id, restaurant_id)
        REFERENCES public.order_items(id, restaurant_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_order_item_modifier_option_same_restaurant
        FOREIGN KEY (modifier_option_id, restaurant_id)
        REFERENCES public.modifier_options(id, restaurant_id)
        ON DELETE RESTRICT
);

-- -----------------------------------------------------------------------------
-- 6. Order status, delivery, payment, and notifications
-- -----------------------------------------------------------------------------

CREATE TABLE public.order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    changed_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL
        CHECK (status IN (
            'PENDING', 'ACCEPTED', 'PREPARING', 'READY',
            'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'
        )),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    driver_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'WAITING_ASSIGNMENT'
        CHECK (status IN (
            'WAITING_ASSIGNMENT', 'ASSIGNED', 'PICKED_UP',
            'DELIVERED', 'FAILED', 'CANCELLED'
        )),
    assigned_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failure_reason TEXT,
    delivery_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.delivery_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
    changed_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL
        CHECK (status IN (
            'WAITING_ASSIGNMENT', 'ASSIGNED', 'PICKED_UP',
            'DELIVERED', 'FAILED', 'CANCELLED'
        )),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    method VARCHAR(30) NOT NULL
        CHECK (method IN ('CASH_AT_COUNTER', 'CASH_ON_DELIVERY', 'ONLINE')),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
    amount BIGINT NOT NULL CHECK (amount >= 0),
    transaction_ref VARCHAR(150),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    queue_ticket_id UUID REFERENCES public.queue_tickets(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(150) NOT NULL,
    body TEXT NOT NULL,
    channel VARCHAR(10) NOT NULL CHECK (channel IN ('IN_APP', 'PUSH')),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'READ')),
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_notification_recipient
        CHECK (user_id IS NOT NULL OR queue_ticket_id IS NOT NULL)
);

-- -----------------------------------------------------------------------------
-- 7. updated_at triggers
-- A DEFAULT only sets updated_at on INSERT. These triggers also update it on UPDATE.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_restaurants_updated_at
    BEFORE UPDATE ON public.restaurants
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_restaurant_settings_updated_at
    BEFORE UPDATE ON public.restaurant_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_categories_updated_at
    BEFORE UPDATE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_product_variants_updated_at
    BEFORE UPDATE ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_daily_queue_counters_updated_at
    BEFORE UPDATE ON public.daily_queue_counters
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_customer_addresses_updated_at
    BEFORE UPDATE ON public.customer_addresses
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_deliveries_updated_at
    BEFORE UPDATE ON public.deliveries
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 8. Indexes
-- Avoided a duplicate index on daily_queue_counters(restaurant_id, queue_date), because
-- uq_daily_counter already creates a unique index with those columns in that order.
-- -----------------------------------------------------------------------------

CREATE INDEX idx_members_user ON public.restaurant_members(user_id);
CREATE INDEX idx_user_devices_user ON public.user_devices(user_id);
CREATE INDEX idx_categories_restaurant_active ON public.categories(restaurant_id, is_active);
CREATE INDEX idx_products_restaurant_category ON public.products(restaurant_id, category_id);
CREATE INDEX idx_products_category_restaurant ON public.products(category_id, restaurant_id);
CREATE INDEX idx_modifier_groups_restaurant_active ON public.modifier_groups(restaurant_id, is_active);
CREATE INDEX idx_product_modifier_groups_group ON public.product_modifier_groups(modifier_group_id);
CREATE INDEX idx_tables_restaurant_active ON public.dining_tables(restaurant_id, is_active);
CREATE INDEX idx_queue_tickets_status ON public.queue_tickets(daily_counter_id, status, queue_number);
CREATE INDEX idx_addresses_user ON public.customer_addresses(user_id);
CREATE INDEX idx_delivery_zones_restaurant_active ON public.delivery_zones(restaurant_id, is_active);
CREATE INDEX idx_orders_restaurant_created ON public.orders(restaurant_id, created_at DESC);
CREATE INDEX idx_orders_restaurant_status ON public.orders(restaurant_id, status, created_at DESC);
CREATE INDEX idx_orders_customer_created ON public.orders(customer_id, created_at DESC);
CREATE INDEX idx_order_items_order ON public.order_items(order_id, restaurant_id);
CREATE INDEX idx_order_items_product ON public.order_items(product_id, restaurant_id);
CREATE INDEX idx_order_item_modifiers_item ON public.order_item_modifiers(order_item_id, restaurant_id);
CREATE INDEX idx_order_item_modifiers_option ON public.order_item_modifiers(modifier_option_id, restaurant_id);
CREATE INDEX idx_order_status_history_order ON public.order_status_history(order_id, created_at);
CREATE INDEX idx_deliveries_driver_status ON public.deliveries(driver_user_id, status, created_at DESC);
CREATE INDEX idx_delivery_status_history_delivery ON public.delivery_status_history(delivery_id, created_at);
CREATE INDEX idx_payments_order ON public.payments(order_id, created_at DESC);
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_order ON public.notifications(order_id, created_at DESC);
CREATE INDEX idx_notifications_queue_ticket ON public.notifications(queue_ticket_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 9. Row Level Security (RLS)
-- Enabled on all public tables. No end-user policies are created in this schema file.
-- With no policies, anon/authenticated Data API access is denied by default. Access tables
-- through the trusted Spring Boot backend, or add tested RLS policies before direct client
-- access. NEVER place the Supabase service-role key in a web/mobile client.
-- -----------------------------------------------------------------------------

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dining_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_queue_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- END OF SCHEMA