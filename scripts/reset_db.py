"""Clear all operational and master data from the mock Supabase database."""

from __future__ import annotations

from typing import Any

from scripts.db import get_client, table

TABLES_IN_DELETE_ORDER = (
    ("operations", "deliveries"),
    ("operations", "fulfillment_lines"),
    ("operations", "fulfillments"),
    ("commercial", "sales_order_lines"),
    ("commercial", "sales_orders"),
    ("operations", "inventory_balances"),
    ("core", "delivery_sites"),
    ("core", "customers"),
    ("core", "products"),
    ("core", "carriers"),
    ("core", "distribution_centers"),
)
DELETE_KEYS = {
    ("operations", "inventory_balances"): ("distribution_center_id", "product_id"),
}


def delete_all_rows(client: Any, schema: str, name: str) -> int:
    rows = table(client, schema, name).select("*").execute().data
    if not rows:
        return 0
    for row in rows:
        delete_query = table(client, schema, name).delete()
        keys = DELETE_KEYS.get((schema, name), ("id",))
        for key in keys:
            delete_query = delete_query.eq(key, row[key])
        delete_query.execute()
    return len(rows)


def reset_database(client: Any) -> None:
    """Delete every row in dependency order; intended only for mock data."""
    for schema, name in TABLES_IN_DELETE_ORDER:
        deleted = delete_all_rows(client, schema, name)
        print(f"Cleared {schema}.{name}: {deleted} rows")


def main() -> None:
    reset_database(get_client())


if __name__ == "__main__":
    main()
