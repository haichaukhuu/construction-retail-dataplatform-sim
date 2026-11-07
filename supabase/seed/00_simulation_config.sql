-- Stable local/demo defaults. Change the switch with:
-- SELECT operations.set_business_day_simulation(FALSE, NULL, 'operator');
-- SELECT operations.set_business_day_simulation(TRUE, 30, 'operator');

INSERT INTO operations.simulation_settings (
    setting_key,
    business_day_simulation_enabled,
    order_count,
    updated_by
)
VALUES ('default', TRUE, 30, 'seed')
ON CONFLICT (setting_key) DO UPDATE SET
    business_day_simulation_enabled = EXCLUDED.business_day_simulation_enabled,
    order_count = EXCLUDED.order_count,
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by;
