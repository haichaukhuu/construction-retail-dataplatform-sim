"""Reset and run the daily business-day scenario."""

from __future__ import annotations

import os

if __name__ == "__main__":
    import argparse

    from scripts.db import get_client
    from scripts.reset_db import reset_database
    from scenarios.daily_business_day.run import run_business_day

    parser = argparse.ArgumentParser(description="Reset and run one daily simulation.")
    parser.add_argument("--orders", type=int, default=30)
    parser.add_argument("--steps", type=int, default=8)
    args = parser.parse_args()
    if os.getenv("BUSINESS_DAY_SIMULATION_ENABLED", "true").lower() not in {"1", "true", "yes", "on"}:
        print("Business-day simulation is disabled by BUSINESS_DAY_SIMULATION_ENABLED.")
        raise SystemExit(0)
    configured_orders = os.getenv("BUSINESS_DAY_ORDER_COUNT")
    if configured_orders:
        args.orders = int(configured_orders)
    client = get_client()
    reset_database(client)
    run_business_day(client, order_count=args.orders, steps=args.steps)
