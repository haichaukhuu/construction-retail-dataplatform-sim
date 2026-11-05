-- Installs the daily scenario functions. Master data is never deleted here.
-- This migration intentionally contains SQL directly; Supabase migration runners
-- do not interpret psql meta-commands such as \ir.

-- Daily scenario entry point.
-- Apply the matching migration first, then run:
--   SELECT operations.run_daily_business_day(30);
--
-- Master data in core.* is deliberately preserved. Only business-day data in
-- commercial.* and operations.* is replaced.

CREATE OR REPLACE FUNCTION operations.reset_business_day()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, core, commercial, operations
AS $$
BEGIN
    DELETE FROM operations.deliveries;
    DELETE FROM operations.fulfillment_lines;
    DELETE FROM operations.fulfillments;
    DELETE FROM commercial.sales_order_lines;
    DELETE FROM commercial.sales_orders;
    DELETE FROM operations.inventory_balances;
END;
$$;

CREATE OR REPLACE FUNCTION operations.run_daily_business_day(order_count integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, core, commercial, operations
AS $$
DECLARE
    customer_row RECORD;
    site_row RECORD;
    center_row RECORD;
    carrier_row RECORD;
    product_row RECORD;
    order_id bigint;
    fulfillment_id bigint;
    order_number text;
    product_count integer;
    line_no integer;
    quantity numeric;
    order_timestamp timestamptz;
    window_start timestamptz;
    inserted_orders integer := 0;
BEGIN
    IF order_count < 1 OR order_count > 500 THEN
        RAISE EXCEPTION 'order_count must be between 1 and 500';
    END IF;

    PERFORM operations.reset_business_day();

    -- Rebuild starting inventory without changing the persistent master data.
    INSERT INTO operations.inventory_balances (
        distribution_center_id, product_id, on_hand_quantity, reserved_quantity
    )
    SELECT
        dc.id,
        p.id,
        CASE
            WHEN dc.code = 'DC-MAL' AND p.category = 'TIMBER' THEN 18
            WHEN dc.code = 'DC-GOT' AND p.category = 'PLASTERBOARD' THEN 12
            WHEN p.category = 'TIMBER' THEN 120
            WHEN p.category = 'PLASTERBOARD' THEN 80
            WHEN p.category = 'CEMENT' THEN 300
            WHEN p.category = 'INSULATION' THEN 100
            ELSE 25
        END,
        0
    FROM core.distribution_centers dc
    CROSS JOIN core.products p
    WHERE p.is_active;

    IF NOT EXISTS (SELECT 1 FROM core.customers)
       OR NOT EXISTS (SELECT 1 FROM core.delivery_sites)
       OR NOT EXISTS (SELECT 1 FROM core.distribution_centers)
       OR NOT EXISTS (SELECT 1 FROM core.products)
       OR NOT EXISTS (SELECT 1 FROM core.carriers) THEN
        RAISE EXCEPTION 'Master data is incomplete; seed core tables before running the scenario';
    END IF;

    FOR customer_row IN
        SELECT c.*, series.sequence_no
        FROM generate_series(1, order_count) AS series(sequence_no)
        JOIN core.customers c
          ON c.id = (
              SELECT c2.id
              FROM core.customers c2
              ORDER BY c2.id
              OFFSET ((series.sequence_no - 1) % (SELECT count(*) FROM core.customers))
              LIMIT 1
          )
        ORDER BY series.sequence_no
    LOOP
        SELECT ds.* INTO site_row
        FROM core.delivery_sites ds
        WHERE ds.customer_id = customer_row.id
        ORDER BY ds.id
        LIMIT 1;

        SELECT dc.* INTO center_row
        FROM core.distribution_centers dc
        ORDER BY dc.id
        OFFSET ((customer_row.sequence_no - 1) % (SELECT count(*) FROM core.distribution_centers))
        LIMIT 1;

        order_timestamp := date_trunc('day', now()) + make_interval(hours => 6 + (customer_row.sequence_no % 8));
        window_start := order_timestamp + interval '24 hours';
        order_number := format('SIM-%s-%s', to_char(current_date, 'YYYYMMDD'), lpad(customer_row.sequence_no::text, 4, '0'));

        INSERT INTO commercial.sales_orders (
            order_number, customer_id, delivery_site_id, distribution_center_id,
            ordered_at, promised_window_start, promised_window_end, status, currency
        )
        VALUES (
            order_number, customer_row.id, site_row.id, center_row.id,
            order_timestamp, window_start, window_start + interval '4 hours',
            'CONFIRMED', 'SEK'
        )
        RETURNING id INTO order_id;

        product_count := 1 + (customer_row.sequence_no % 3);
        line_no := 0;
        FOR product_row IN
            SELECT p.*
            FROM core.products p
            WHERE p.is_active
            ORDER BY md5(p.sku || customer_row.sequence_no::text)
            LIMIT product_count
        LOOP
            line_no := line_no + 1;
            quantity := 2 + ((customer_row.sequence_no + line_no) % 11);
            INSERT INTO commercial.sales_order_lines (
                sales_order_id, product_id, line_number, quantity_ordered, unit_price
            )
            VALUES (
                order_id, product_row.id, line_no, quantity,
                CASE product_row.category
                    WHEN 'TIMBER' THEN 89
                    WHEN 'PLASTERBOARD' THEN 149
                    WHEN 'CEMENT' THEN 79
                    WHEN 'INSULATION' THEN 119
                    ELSE 899
                END
            );
        END LOOP;

        INSERT INTO operations.fulfillments (sales_order_id, status)
        VALUES (order_id, 'PENDING')
        RETURNING id INTO fulfillment_id;

        INSERT INTO operations.fulfillment_lines (fulfillment_id, sales_order_line_id)
        SELECT fulfillment_id, sol.id
        FROM commercial.sales_order_lines sol
        WHERE sol.sales_order_id = order_id;

        SELECT car.* INTO carrier_row
        FROM core.carriers car
        ORDER BY car.id
        OFFSET ((customer_row.sequence_no - 1) % (SELECT count(*) FROM core.carriers))
        LIMIT 1;

        INSERT INTO operations.deliveries (
            fulfillment_id, delivery_number, carrier_id, tracking_reference,
            vehicle_type, status, planned_dispatch_at, planned_eta
        )
        VALUES (
            fulfillment_id,
            format('DEL-SIM-%s-%s', to_char(current_date, 'YYYYMMDD'), lpad(customer_row.sequence_no::text, 4, '0')),
            carrier_row.id,
            format('SE%s%s', to_char(current_date, 'YYYYMMDD'), lpad(customer_row.sequence_no::text, 4, '0')),
            CASE WHEN line_no > 1 THEN 'CRANE_TRUCK' ELSE 'VAN' END,
            'PLANNED',
            window_start - interval '8 hours',
            window_start + interval '2 hours'
        );

        inserted_orders := inserted_orders + 1;
    END LOOP;

    RETURN inserted_orders;
END;
$$;

-- Optional daily scheduler. Enable pg_cron in Dashboard > Database > Extensions
-- before applying this block. It is intentionally commented out so deploying
-- the migration never creates an unexpected recurring job.
--
-- SELECT cron.schedule(
--     'construction-retail-daily-simulation',
--     '0 1 * * *',
--     $$SELECT operations.run_daily_business_day(30);$$
-- );
