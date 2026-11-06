"""Advance fulfillment and delivery state by one simulated operational tick."""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
from typing import Any

from scripts.db import get_client, table


def now() -> datetime:
    return datetime.now(timezone.utc)


def update_fulfillment(client: Any, fulfillment: dict[str, Any], status: str) -> None:
    table(client, "operations", "wms_fulfillments").update(
        {"status": status, "updated_at": now().isoformat()}
    ).eq("id", fulfillment["id"]).execute()


def reserve_and_pick(client: Any, fulfillment: dict[str, Any], order: dict[str, Any]) -> None:
    lines = table(client, "operations", "wms_fulfillment_lines").select(
        "id,sales_order_line_id,quantity_picked,short_reason"
    ).eq("fulfillment_id", fulfillment["id"]).execute().data
    order_lines = table(client, "commercial", "erp_sales_order_lines").select(
        "id,product_id,quantity_ordered"
    ).eq("sales_order_id", order["id"]).execute().data
    line_by_id = {line["id"]: line for line in order_lines}
    for fulfillment_line in lines:
        order_line = line_by_id[fulfillment_line["sales_order_line_id"]]
        inventory = table(client, "operations", "wms_inventory_balances").select(
            "distribution_center_id,product_id,on_hand_quantity,reserved_quantity"
        ).eq("distribution_center_id", order["distribution_center_id"]).eq("product_id", order_line["product_id"]).limit(1).execute().data
        if not inventory:
            raise RuntimeError(f"No inventory row for product {order_line['product_id']}.")
        stock = inventory[0]
        available = float(stock["on_hand_quantity"]) - float(stock["reserved_quantity"])
        picked = min(float(order_line["quantity_ordered"]), max(0, available))
        shortage = picked < float(order_line["quantity_ordered"])
        table(client, "operations", "wms_inventory_balances").update({
            "reserved_quantity": float(stock["reserved_quantity"]) + picked,
            "updated_at": now().isoformat(),
        }).eq("distribution_center_id", order["distribution_center_id"]).eq("product_id", order_line["product_id"]).execute()
        table(client, "operations", "wms_fulfillment_lines").update({
            "quantity_picked": picked,
            "short_reason": "STOCKOUT" if shortage else None,
        }).eq("id", fulfillment_line["id"]).execute()


def complete_pick(client: Any, fulfillment: dict[str, Any], order: dict[str, Any]) -> None:
    lines = table(client, "operations", "wms_fulfillment_lines").select(
        "sales_order_line_id,quantity_picked"
    ).eq("fulfillment_id", fulfillment["id"]).execute().data
    order_lines = table(client, "commercial", "erp_sales_order_lines").select(
        "id,product_id"
    ).eq("sales_order_id", order["id"]).execute().data
    erp_products = {line["id"]: line["product_id"] for line in order_lines}
    for line in lines:
        quantity = float(line["quantity_picked"])
        product_id = erp_products[line["sales_order_line_id"]]
        inventory = table(client, "operations", "wms_inventory_balances").select(
            "on_hand_quantity,reserved_quantity"
        ).eq("distribution_center_id", order["distribution_center_id"]).eq("product_id", product_id).limit(1).execute().data[0]
        table(client, "operations", "wms_inventory_balances").update({
            "on_hand_quantity": float(inventory["on_hand_quantity"]) - quantity,
            "reserved_quantity": float(inventory["reserved_quantity"]) - quantity,
            "updated_at": now().isoformat(),
        }).eq("distribution_center_id", order["distribution_center_id"]).eq("product_id", product_id).execute()


def tick(client: Any) -> int:
    changed = 0
    wms_fulfillments = table(client, "operations", "wms_fulfillments").select("*").in_(
        "status", ["PENDING", "PICKING", "PICKED", "STAGED"]
    ).limit(100).execute().data
    for fulfillment in wms_fulfillments:
        order = table(client, "commercial", "erp_sales_orders").select(
            "id,distribution_center_id"
        ).eq("id", fulfillment["sales_order_id"]).limit(1).execute().data[0]
        if fulfillment["status"] == "PENDING":
            update_fulfillment(client, fulfillment, "PICKING")
        elif fulfillment["status"] == "PICKING":
            reserve_and_pick(client, fulfillment, order)
            update_fulfillment(client, fulfillment, "PICKED")
        elif fulfillment["status"] == "PICKED":
            complete_pick(client, fulfillment, order)
            update_fulfillment(client, fulfillment, "STAGED")
        changed += 1

    tms_deliveries = table(client, "operations", "tms_deliveries").select("*").in_(
        "status", ["PLANNED", "IN_PROGRESS", "FAILED"]
    ).limit(100).execute().data
    for delivery in tms_deliveries:
        if delivery["status"] == "PLANNED":
            fulfillment = table(client, "operations", "wms_fulfillments").select(
                "status"
            ).eq("id", delivery["fulfillment_id"]).limit(1).execute().data
            if not fulfillment or fulfillment[0]["status"] != "STAGED":
                continue
            table(client, "operations", "tms_deliveries").update({
                "status": "IN_PROGRESS", "dispatched_at": now().isoformat(),
                "current_eta": (now() + timedelta(hours=1)).isoformat(),
                "updated_at": now().isoformat(),
            }).eq("id", delivery["id"]).execute()
        elif delivery["status"] == "IN_PROGRESS":
            if delivery["id"] % 7 == 0 and delivery["attempt_count"] == 1:
                table(client, "operations", "tms_deliveries").update({
                    "status": "FAILED", "current_eta": None, "updated_at": now().isoformat(),
                }).eq("id", delivery["id"]).execute()
                changed += 1
                continue
            table(client, "operations", "tms_deliveries").update({
                "status": "DELIVERED", "delivered_at": now().isoformat(),
                "current_eta": now().isoformat(), "updated_at": now().isoformat(),
            }).eq("id", delivery["id"]).execute()
        elif delivery["status"] == "FAILED" and delivery["attempt_count"] < 3:
            table(client, "operations", "tms_deliveries").update({
                "status": "IN_PROGRESS", "attempt_count": delivery["attempt_count"] + 1,
                "current_eta": (now() + timedelta(hours=2)).isoformat(), "updated_at": now().isoformat(),
            }).eq("id", delivery["id"]).execute()
        changed += 1
    return changed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=1, help="Number of state transitions to execute.")
    args = parser.parse_args()
    client = get_client()
    for _ in range(args.steps):
        print(f"Advanced {tick(client)} operational records.")


if __name__ == "__main__":
    main()
