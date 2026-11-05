"""Run one full simulated business day.

The day is deliberately multi-step: each step represents an operational
checkpoint, allowing orders to move through fulfillment while delivery
exceptions and stockouts remain visible in the database.
"""

from __future__ import annotations

import argparse
from typing import Any

from scenarios.setup.seed_master_data import seed_setup
from scripts.db import get_client
from scenarios.daily_business_day.seed import seed_orders
from scripts.simulate import tick


def run_business_day(client: Any, order_count: int = 30, steps: int = 8) -> None:
    master = seed_setup(client)
    seed_orders(client, master, count=order_count)
    for checkpoint in range(1, steps + 1):
        changed = tick(client)
        print(f"Business-day checkpoint {checkpoint}/{steps}: advanced {changed} records.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the daily business simulation.")
    parser.add_argument("--orders", type=int, default=30)
    parser.add_argument("--steps", type=int, default=8)
    args = parser.parse_args()
    run_business_day(get_client(), order_count=args.orders, steps=args.steps)


if __name__ == "__main__":
    main()
