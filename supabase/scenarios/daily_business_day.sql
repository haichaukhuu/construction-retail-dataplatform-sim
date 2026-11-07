-- Operator entry point for the database-native daily scenario.
-- Apply migrations first, then run:
--
--   SELECT operations.run_daily_business_day();
--
-- The function reads operations.simulation_settings. When the simulation is
-- disabled, it returns 0 and leaves all business-day data unchanged.

SELECT operations.run_daily_business_day();
