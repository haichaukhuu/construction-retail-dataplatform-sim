"""Seed a deterministic Swedish construction-retail scenario into Supabase."""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from typing import Any

from scripts.db import get_client, table

RNG = random.Random(20261105)
NOW = datetime.now(timezone.utc)


def one(client: Any, schema: str, name: str, column: str, value: Any) -> dict[str, Any] | None:
    rows = table(client, schema, name).select("*").eq(column, value).limit(1).execute().data
    return rows[0] if rows else None


def upsert_one(client: Any, schema: str, name: str, row: dict[str, Any], conflict: str) -> dict[str, Any]:
    result = table(client, schema, name).upsert(
        row, on_conflict=conflict, returning="representation"
    ).execute().data
    if not result:
        raise RuntimeError(f"Supabase did not return {schema}.{name} after upsert.")
    return result[0]


def seed_master_data(client: Any) -> dict[str, list[dict[str, Any]]]:
    centers = [
        {"code": "DC-STO", "name": "Stockholm North DC", "city": "Stockholm", "country_code": "SE"},
        {"code": "DC-GOT", "name": "Gothenburg DC", "city": "Gothenburg", "country_code": "SE"},
        {"code": "DC-MAL", "name": "Malmo DC", "city": "Malmo", "country_code": "SE"},
    ]
    tms_carriers = [
        {"code": "NORDIC-LOG", "name": "Nordic Logistics AB"},
        {"code": "BYGG-EXPRESS", "name": "Bygg Express AB"},
        {"code": "SKANDI-FREIGHT", "name": "Skandi Freight AB"},
    ]
    erp_products = [
        {"sku": "TRB-45X95-3600", "name": "Construction timber 45x95 mm, 3.6 m", "category": "TIMBER", "unit_of_measure": "EACH", "unit_weight_kg": 8.2, "is_bulky": True},
        {"sku": "TRB-45X145-4800", "name": "Construction timber 45x145 mm, 4.8 m", "category": "TIMBER", "unit_of_measure": "EACH", "unit_weight_kg": 16.4, "is_bulky": True},
        {"sku": "GYP-13-1200X2400", "name": "Gypsum board 13 mm, 1200x2400", "category": "PLASTERBOARD", "unit_of_measure": "SHEET", "unit_weight_kg": 28.0, "is_bulky": True},
        {"sku": "CEM-25", "name": "General purpose cement 25 kg", "category": "CEMENT", "unit_of_measure": "BAG", "unit_weight_kg": 25.0, "is_bulky": False},
        {"sku": "ISO-100-1200", "name": "Mineral wool insulation 100 mm", "category": "INSULATION", "unit_of_measure": "SHEET", "unit_weight_kg": 6.5, "is_bulky": True},
        {"sku": "TOOL-LASER", "name": "Cross-line laser level", "category": "TOOLS", "unit_of_measure": "EACH", "unit_weight_kg": 1.8, "is_bulky": False},
    ]
    erp_customers = [
        {"customer_number": "C-10001", "name": "Nordbygg Entreprenad AB", "customer_type": "B2B", "tier": "STRATEGIC", "sla_hours": 24, "email": "inkop@nordbygg.example", "phone": "+46 8 555 10001", "preferred_language": "sv"},
        {"customer_number": "C-10002", "name": "Vastkust Byggpartner AB", "customer_type": "B2B", "tier": "KEY", "sla_hours": 48, "email": "order@vastkust.example", "phone": "+46 31 555 10002", "preferred_language": "sv"},
        {"customer_number": "C-10003", "name": "Malmohus Projekt AB", "customer_type": "B2B", "tier": "KEY", "sla_hours": 48, "email": "projekt@malmohus.example", "phone": "+46 40 555 10003", "preferred_language": "sv"},
        {"customer_number": "C-20001", "name": "Anna Lindstrom", "customer_type": "B2C", "tier": "STANDARD", "sla_hours": 72, "email": "anna.lindstrom@example", "phone": "+46 70 555 20001", "preferred_language": "sv"},
        {"customer_number": "C-20002", "name": "Erik Johansson", "customer_type": "B2C", "tier": "STANDARD", "sla_hours": 72, "email": "erik.johansson@example", "phone": "+46 70 555 20002", "preferred_language": "en"},
    ]

    seeded = {
        "centers": [upsert_one(client, "core", "wms_distribution_centers", row, "code") for row in centers],
        "tms_carriers": [upsert_one(client, "core", "tms_carriers", row, "code") for row in tms_carriers],
        "erp_products": [upsert_one(client, "core", "erp_products", row, "sku") for row in erp_products],
        "erp_customers": [upsert_one(client, "core", "erp_customers", row, "customer_number") for row in erp_customers],
    }

    sites = [
        ("C-10001", {"site_name": "North Harbor project", "address_line": "Hammarby Kaj 12", "postcode": "120 30", "city": "Stockholm", "access_notes": "Crane truck must call 30 minutes ahead.", "contact_name": "Lars Berg", "contact_phone": "+46 70 600 1001"}),
        ("C-10002", {"site_name": "Lindholmen site", "address_line": "Lindholmspiren 5", "postcode": "417 56", "city": "Gothenburg", "access_notes": "Delivery before 15:00 only.", "contact_name": "Sara Nilsson", "contact_phone": "+46 70 600 1002"}),
        ("C-10003", {"site_name": "Soder project", "address_line": "Sodra Forstadsgatan 44", "postcode": "211 43", "city": "Malmo", "access_notes": "Use entrance B.", "contact_name": "Oskar Ek", "contact_phone": "+46 70 600 1003"}),
        ("C-20001", {"site_name": "Private renovation", "address_line": "Birkagatan 8", "postcode": "113 39", "city": "Stockholm", "access_notes": "Small van preferred.", "contact_name": "Anna Lindstrom", "contact_phone": "+46 70 555 20001"}),
        ("C-20002", {"site_name": "Villa renovation", "address_line": "Sankt Sigfrids Plan 2", "postcode": "412 65", "city": "Gothenburg", "access_notes": "Call on arrival.", "contact_name": "Erik Johansson", "contact_phone": "+46 70 555 20002"}),
    ]
    for customer_number, site in sites:
        customer = next(c for c in seeded["erp_customers"] if c["customer_number"] == customer_number)
        existing = table(client, "core", "erp_delivery_sites").select("*").eq("customer_id", customer["id"]).eq("address_line", site["address_line"]).limit(1).execute().data
        if existing:
            site_row = existing[0]
        else:
            site_row = table(client, "core", "erp_delivery_sites").insert({"customer_id": customer["id"], **site}).execute().data[0]
        seeded.setdefault("sites", []).append(site_row)
    return seeded


def seed_inventory(client: Any, master: dict[str, list[dict[str, Any]]]) -> None:
    base_stock = {"TIMBER": 120, "PLASTERBOARD": 80, "CEMENT": 300, "INSULATION": 100, "TOOLS": 25}
    for center in master["centers"]:
        for product in master["erp_products"]:
            existing = table(client, "operations", "wms_inventory_balances").select(
                "distribution_center_id"
            ).eq("distribution_center_id", center["id"]).eq("product_id", product["id"]).limit(1).execute().data
            if existing:
                continue
            quantity = base_stock[product["category"]]
            if center["code"] == "DC-MAL" and product["category"] == "TIMBER":
                quantity = 18
            if center["code"] == "DC-GOT" and product["category"] == "PLASTERBOARD":
                quantity = 12
            upsert_one(
                client,
                "operations",
                "wms_inventory_balances",
                {"distribution_center_id": center["id"], "product_id": product["id"], "on_hand_quantity": quantity, "reserved_quantity": 0},
                "distribution_center_id,product_id",
            )


def seed_orders(client: Any, master: dict[str, list[dict[str, Any]]], count: int = 30) -> None:
    existing = table(client, "commercial", "erp_sales_orders").select("order_number").like("order_number", "SIM-%").execute().data
    start_number = len(existing) + 1
    centers = master["centers"]
    erp_products = master["erp_products"]
    for number in range(start_number, start_number + count):
        customer = RNG.choice(master["erp_customers"])
        site = next(s for s in master["sites"] if s["customer_id"] == customer["id"])
        center = min(centers, key=lambda item: abs(["Stockholm", "Gothenburg", "Malmo"].index(item["city"]) - ["Stockholm", "Gothenburg", "Malmo"].index(site["city"])))
        ordered_at = NOW - timedelta(hours=RNG.randint(1, 120))
        window_start = ordered_at + timedelta(hours=RNG.randint(24, 48))
        order = upsert_one(client, "commercial", "erp_sales_orders", {
            "order_number": f"SIM-{number:05d}", "customer_id": customer["id"], "delivery_site_id": site["id"],
            "distribution_center_id": center["id"], "ordered_at": ordered_at.isoformat(),
            "promised_window_start": window_start.isoformat(), "promised_window_end": (window_start + timedelta(hours=4)).isoformat(),
            "status": "CONFIRMED", "currency": "SEK",
        }, "order_number")
        line_count = RNG.randint(1, 3)
        chosen = RNG.sample(erp_products, line_count)
        for line_number, product in enumerate(chosen, start=1):
            quantity = RNG.randint(2, 12)
            unit_price = {"TIMBER": 89, "PLASTERBOARD": 149, "CEMENT": 79, "INSULATION": 119, "TOOLS": 899}[product["category"]]
            table(client, "commercial", "erp_sales_order_lines").upsert({
                "sales_order_id": order["id"], "product_id": product["id"], "line_number": line_number,
                "quantity_ordered": quantity, "unit_price": unit_price,
            }, on_conflict="sales_order_id,product_id").execute()
        lines = table(client, "commercial", "erp_sales_order_lines").select("id").eq("sales_order_id", order["id"]).execute().data
        fulfillment = upsert_one(client, "operations", "wms_fulfillments", {"sales_order_id": order["id"], "status": "PENDING"}, "sales_order_id")
        for line in lines:
            table(client, "operations", "wms_fulfillment_lines").upsert(
                {"fulfillment_id": fulfillment["id"], "sales_order_line_id": line["id"], "quantity_picked": 0},
                on_conflict="fulfillment_id,sales_order_line_id",
            ).execute()
        carrier = RNG.choice(master["tms_carriers"])
        table(client, "operations", "tms_deliveries").upsert({
            "fulfillment_id": fulfillment["id"], "delivery_number": f"DEL-SIM-{number:05d}",
            "carrier_id": carrier["id"], "tracking_reference": f"SE{number:010d}",
            "vehicle_type": "CRANE_TRUCK" if any(p["is_bulky"] for p in chosen) else "VAN",
            "status": "PLANNED", "planned_dispatch_at": (window_start - timedelta(hours=8)).isoformat(),
            "planned_eta": (window_start + timedelta(hours=2)).isoformat(),
        }, on_conflict="fulfillment_id").execute()


def main() -> None:
    client = get_client()
    master = seed_master_data(client)
    seed_inventory(client, master)
    seed_orders(client, master)
    print("Seeded master data, inventory, and 30 deterministic simulation orders.")


if __name__ == "__main__":
    main()
