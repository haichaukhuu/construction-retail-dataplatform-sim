"""Seed the reusable master data for all business-day scenarios.

The existing seed implementation remains the source of the detailed Swedish
master-data records. This module gives the scenario tree a stable entry point.
"""

from __future__ import annotations

from typing import Any

from scenarios.daily_business_day.seed import seed_inventory, seed_master_data


def seed_setup(client: Any) -> dict[str, list[dict[str, Any]]]:
    """Create master data and initial inventory, returning generated IDs."""
    master = seed_master_data(client)
    seed_inventory(client, master)
    return master
