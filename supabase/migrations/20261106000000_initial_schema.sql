CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS commercial;
CREATE SCHEMA IF NOT EXISTS operations;

CREATE TABLE IF NOT EXISTS core.wms_distribution_centers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    country_code CHAR(2) NOT NULL DEFAULT 'SE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.erp_customers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_number TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    customer_type TEXT NOT NULL CHECK (customer_type IN ('B2B', 'B2C')),
    tier TEXT NOT NULL DEFAULT 'STANDARD' CHECK (tier IN ('STRATEGIC', 'KEY', 'STANDARD')),
    sla_hours INTEGER,
    email TEXT,
    phone TEXT,
    preferred_language TEXT NOT NULL DEFAULT 'sv' CHECK (preferred_language IN ('sv', 'en')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.erp_delivery_sites (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES core.erp_customers(id) ON DELETE CASCADE,
    site_name TEXT,
    address_line TEXT NOT NULL,
    postcode TEXT NOT NULL,
    city TEXT NOT NULL,
    access_notes TEXT,
    contact_name TEXT,
    contact_phone TEXT,
    UNIQUE (id, customer_id)
);
CREATE INDEX IF NOT EXISTS idx_erp_delivery_sites_customer_id ON core.erp_delivery_sites(customer_id);

CREATE TABLE IF NOT EXISTS core.erp_products (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('TIMBER', 'PLASTERBOARD', 'CEMENT', 'INSULATION', 'TOOLS')),
    unit_of_measure TEXT NOT NULL CHECK (unit_of_measure IN ('BAG', 'SHEET', 'METRE', 'EACH', 'PALLET')),
    unit_weight_kg NUMERIC(10,3),
    is_bulky BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS core.tms_carriers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commercial.erp_sales_orders (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE,
    customer_id BIGINT NOT NULL REFERENCES core.erp_customers(id),
    delivery_site_id BIGINT NOT NULL,
    distribution_center_id BIGINT NOT NULL REFERENCES core.wms_distribution_centers(id),
    ordered_at TIMESTAMPTZ NOT NULL,
    promised_window_start TIMESTAMPTZ NOT NULL,
    promised_window_end TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CANCELLED')),
    currency CHAR(3) NOT NULL DEFAULT 'SEK',
    CONSTRAINT fk_sales_orders_delivery_site
        FOREIGN KEY (delivery_site_id, customer_id)
        REFERENCES core.erp_delivery_sites(id, customer_id),
    CONSTRAINT check_promised_window CHECK (promised_window_end > promised_window_start)
);
CREATE INDEX IF NOT EXISTS idx_erp_sales_orders_customer_id ON commercial.erp_sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_erp_sales_orders_dc_window ON commercial.erp_sales_orders(distribution_center_id, promised_window_end);

CREATE TABLE IF NOT EXISTS commercial.erp_sales_order_lines (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sales_order_id BIGINT NOT NULL REFERENCES commercial.erp_sales_orders(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES core.erp_products(id),
    line_number INTEGER NOT NULL,
    quantity_ordered NUMERIC(12,3) NOT NULL CHECK (quantity_ordered > 0),
    unit_price NUMERIC(12,2) NOT NULL,
    UNIQUE (sales_order_id, line_number),
    UNIQUE (sales_order_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_erp_sales_order_lines_product_id ON commercial.erp_sales_order_lines(product_id);

CREATE TABLE IF NOT EXISTS operations.wms_inventory_balances (
    distribution_center_id BIGINT NOT NULL REFERENCES core.wms_distribution_centers(id),
    product_id BIGINT NOT NULL REFERENCES core.erp_products(id),
    on_hand_quantity NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (on_hand_quantity >= 0),
    reserved_quantity NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
    available_quantity NUMERIC(12,3) GENERATED ALWAYS AS (on_hand_quantity - reserved_quantity) STORED,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (distribution_center_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_wms_inventory_balances_product_id ON operations.wms_inventory_balances(product_id);

CREATE TABLE IF NOT EXISTS operations.wms_fulfillments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sales_order_id BIGINT NOT NULL UNIQUE REFERENCES commercial.erp_sales_orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PICKING', 'PICKED', 'STAGED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operations.wms_fulfillment_lines (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fulfillment_id BIGINT NOT NULL REFERENCES operations.wms_fulfillments(id) ON DELETE CASCADE,
    sales_order_line_id BIGINT NOT NULL REFERENCES commercial.erp_sales_order_lines(id),
    quantity_picked NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (quantity_picked >= 0),
    short_reason TEXT CHECK (short_reason IN ('STOCKOUT', 'DAMAGED', 'MISLOCATED', 'COUNT_ERROR')),
    UNIQUE (fulfillment_id, sales_order_line_id)
);
CREATE INDEX IF NOT EXISTS idx_wms_fulfillment_lines_sol_id ON operations.wms_fulfillment_lines(sales_order_line_id);

CREATE TABLE IF NOT EXISTS operations.tms_deliveries (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fulfillment_id BIGINT NOT NULL UNIQUE REFERENCES operations.wms_fulfillments(id) ON DELETE CASCADE,
    delivery_number TEXT NOT NULL UNIQUE,
    carrier_id BIGINT REFERENCES core.tms_carriers(id),
    tracking_reference TEXT UNIQUE,
    vehicle_type TEXT CHECK (vehicle_type IN ('CRANE_TRUCK', 'FLATBED', 'VAN')),
    status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'DELIVERED', 'FAILED', 'CANCELLED')),
    attempt_count SMALLINT NOT NULL DEFAULT 1,
    planned_dispatch_at TIMESTAMPTZ,
    planned_eta TIMESTAMPTZ NOT NULL,
    current_eta TIMESTAMPTZ,
    dispatched_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_delivered_at CHECK (
        (status = 'DELIVERED' AND delivered_at IS NOT NULL)
        OR (status != 'DELIVERED' AND delivered_at IS NULL)
    )
);
CREATE INDEX IF NOT EXISTS idx_tms_deliveries_carrier_id ON operations.tms_deliveries(carrier_id);

CREATE OR REPLACE VIEW commercial.v_order_totals AS
SELECT sales_order_id, SUM(quantity_ordered * unit_price) AS total_amount
FROM commercial.erp_sales_order_lines
GROUP BY sales_order_id;

CREATE OR REPLACE VIEW operations.v_delivery_overview AS
SELECT
    d.id AS delivery_id,
    d.delivery_number,
    d.status AS delivery_status,
    f.status AS fulfillment_status,
    so.order_number,
    c.name AS customer_name,
    ds.city AS destination_city,
    car.name AS carrier_name,
    d.current_eta,
    CASE
        WHEN d.delivered_at IS NOT NULL THEN 'DELIVERED'
        WHEN d.dispatched_at IS NOT NULL THEN 'IN_TRANSIT'
        WHEN f.status = 'STAGED' THEN 'STAGED'
        WHEN f.status = 'PICKED' THEN 'PICKED'
        WHEN f.status = 'PICKING' THEN 'PICKING'
        ELSE 'PLANNED'
    END AS stage
FROM operations.tms_deliveries d
JOIN operations.wms_fulfillments f ON d.fulfillment_id = f.id
JOIN commercial.erp_sales_orders so ON f.sales_order_id = so.id
JOIN core.erp_customers c ON so.customer_id = c.id
JOIN core.erp_delivery_sites ds ON so.delivery_site_id = ds.id
LEFT JOIN core.tms_carriers car ON d.carrier_id = car.id;
