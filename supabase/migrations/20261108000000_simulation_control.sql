-- Controls the database-native business-day simulation without changing
-- fixed master data or requiring a migration edit.

DO $$
BEGIN
    IF to_regnamespace('operations') IS NULL
       OR to_regprocedure('operations.run_daily_business_day(integer)') IS NULL THEN
        RAISE EXCEPTION
            'Prerequisite daily simulation objects are missing; apply the schema and daily simulation migrations before simulation control';
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS operations.simulation_settings (
    setting_key TEXT PRIMARY KEY,
    business_day_simulation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    order_count INTEGER NOT NULL DEFAULT 30 CHECK (order_count BETWEEN 1 AND 500),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT
);

INSERT INTO operations.simulation_settings (
    setting_key,
    business_day_simulation_enabled,
    order_count,
    updated_by
)
VALUES ('default', TRUE, 30, 'migration')
ON CONFLICT (setting_key) DO NOTHING;

ALTER FUNCTION operations.run_daily_business_day(integer)
    RENAME TO run_daily_business_day_unchecked;

CREATE OR REPLACE FUNCTION operations.is_business_day_simulation_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, operations
AS $$
    SELECT business_day_simulation_enabled
    FROM operations.simulation_settings
    WHERE setting_key = 'default';
$$;

CREATE OR REPLACE FUNCTION operations.set_business_day_simulation(
    p_enabled boolean,
    p_order_count integer DEFAULT NULL,
    p_updated_by text DEFAULT 'manual'
)
RETURNS operations.simulation_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, operations
AS $$
DECLARE
    updated_setting operations.simulation_settings;
BEGIN
    IF p_order_count IS NOT NULL AND (p_order_count < 1 OR p_order_count > 500) THEN
        RAISE EXCEPTION 'p_order_count must be between 1 and 500';
    END IF;

    UPDATE operations.simulation_settings
    SET business_day_simulation_enabled = p_enabled,
        order_count = COALESCE(p_order_count, order_count),
        updated_at = NOW(),
        updated_by = p_updated_by
    WHERE setting_key = 'default'
    RETURNING * INTO updated_setting;

    RETURN updated_setting;
END;
$$;

CREATE OR REPLACE FUNCTION operations.run_daily_business_day(
    p_order_count integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, core, commercial, operations
AS $$
DECLARE
    setting operations.simulation_settings;
    requested_order_count integer;
BEGIN
    SELECT * INTO setting
    FROM operations.simulation_settings
    WHERE setting_key = 'default';

    IF NOT COALESCE(setting.business_day_simulation_enabled, TRUE) THEN
        RETURN 0;
    END IF;

    requested_order_count := COALESCE(p_order_count, setting.order_count);
    RETURN operations.run_daily_business_day_unchecked(requested_order_count);
END;
$$;
