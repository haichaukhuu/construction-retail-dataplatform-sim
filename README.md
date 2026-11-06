# Construction retail data platform simulator

Simulates a Swedish construction-retail flow in Supabase:

`customer/order -> inventory reservation -> picking -> staging -> dispatch -> delivery`

Data covers three distribution centers (Stockholm, Gothenburg, Malmo), B2B/B2C customers, five product categories, and 30 orders with stockouts, short picks, ETA changes, and failed deliveries.

<<<<<<< HEAD
- Three distribution centers: Stockholm, Gothenburg, and Malmo.
- B2B strategic/key accounts and B2C erp_customers, each with a delivery site.
- Timber, plasterboard, cement, insulation, and tools with realistic weights and units.
- Inventory with intentionally constrained timber in Malmo and plasterboard in Gothenburg.
- Orders containing one to three erp_products, including bulky tms_deliveries requiring crane trucks.
- Fulfillments and tms_deliveries linked to every generated order.

The constraints intentionally create useful events: stockouts, partial picks, changing delivery stages, and inventory depletion.

## Supabase deployment

The repository is initialized for Supabase CLI and the database schema is managed by [supabase/migrations/20261106000000_initial_schema.sql](supabase/migrations/20261106000000_initial_schema.sql).

### One-time dashboard setup

1. Push this repository to GitHub, including `supabase/config.toml` and the migration file.
2. In Supabase, open **Project Settings > Integrations**.
3. Under **GitHub Integration**, choose **Authorize GitHub**, authorize Supabase, and select this repository.
4. Set **Working directory** to `.` because `supabase/` is at the repository root.
5. Enable the integration.
6. In **API settings**, expose `core`, `commercial`, and `operations` under **Exposed schemas**.

Supabase watches branches and pull requests. Treat `main` as the production schema branch and use pull requests for migration changes. The integration deploys migration files; it does not run Python data simulation.

For local CLI work, install the Supabase CLI and link explicitly to the intended project:

```powershell
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

`supabase/config.toml` deliberately does not contain a guessed project reference.

### Existing database warning

If the schema was already created manually in the hosted project, do not apply the initial migration as a normal new migration without first baselining or recreating the mock project. Choose one clean path:

- **New mock project:** apply the migration normally.
- **Existing disposable mock project:** remove the existing mock tables, then apply the migration.
- **Existing project with data to preserve:** use the Supabase CLI migration history/baseline process before enabling the integration.

Do not delete a production database merely to resolve migration history.

### Existing tables are preserved

The initial migration uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. If a table already exists, Supabase leaves that table, its rows, and its existing definition unchanged. The migration only creates missing objects and refreshes the two views.

Therefore this error is avoided:

```text
ERROR: relation "wms_distribution_centers" already exists
=======
## How it works

```text
mock_data/                          you edit these
  master/*.csv                      centers, carriers, products, customers, sites, inventory
  events/*.csv                      orders, order lines, deliveries, delivery events
  config/refresh_policy.json        refresh schedule and reset mode
        |  python -m scripts.build_sql   (GitHub Actions runs this on push to main)
        v
supabase/
  seed/01_master_data.sql           generated
  seed/02_events.sql                generated
  scenarios/refresh_demo_environment.sql   generated: refresh function + pg_cron schedule
  migrations/                       table schema (hand-written)
>>>>>>> d065816f70efae27c821ced11ed405fd1e6a1532
```

Never edit generated SQL; change `mock_data/` and rebuild.

## Quick start

<<<<<<< HEAD
Run `supabase db push` from the repository root. If the hosted project already has the same schema and the migration is marked pending, you can mark only this migration as applied:

```powershell
supabase migration repair --status applied 20261106000000
```

`migration repair` changes migration history only; it does not delete or recreate tables.

If the existing schema differs, do not baseline it. Create a new migration containing the required `ALTER TABLE` statements. If the project contains no data worth keeping, the simpler alternative is to reset/drop the mock schemas and then run:

```powershell
supabase db push
```

## Setup

1. Connect the repository using the Supabase GitHub Integration.
2. Copy `.env.example` to `.env` and set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Install dependencies:

```powershell
python -m pip install -r requirements.txt
```

The service-role key is required because the scripts write to custom schemas. Never expose it in browser code or commit it.

## Scenario layout

```text
scenarios/
  setup/                  reusable master data and initial inventory
  daily_business_day/     daily orders, fulfillment, delivery, and exceptions
scripts/
  reset_db.py             dependency-safe data reset
  run_daily.py            reset + run one complete business day
```

The detailed daily seed data is in [scenarios/daily_business_day/seed.py](scenarios/daily_business_day/seed.py). Add another scenario as a new folder under `scenarios/` and reuse `scenarios/setup` for its master data.

## Run the simulation locally

```powershell
python -m scripts.run_daily
```

This clears all rows in dependency order, creates the master data and inventory, creates the dayÃ¢â‚¬â„¢s orders, then advances eight operational checkpoints. Query `operations.v_delivery_overview` in Supabase to observe the current stage.

For focused development, the compatibility commands remain available:

```powershell
python -m scripts.seed_data
python -m scripts.simulate --steps 1
```

## Responsibilities

1. **Supabase GitHub Integration** deploys schema and scenario functions from `supabase/migrations`.
2. **Supabase `pg_cron`** runs the daily business scenario inside the database.
3. **Python scripts** remain optional local development tools and are not required in production.

No GitHub Actions pipeline is required for daily simulation.

## Database-native daily scenario

The scenario can run entirely inside Supabase without GitHub Actions:

1. Enable the `pg_cron` extension in **Database > Extensions**.
2. Apply the migration that installs the scenario function.
3. Test it manually:
=======
1. **Create the schema.** Connect the repo with the Supabase GitHub Integration (Project Settings > Integrations), working directory `.`. Or run `supabase link --project-ref <ref>` then `supabase db push`. Expose `core`, `commercial`, and `operations` under API settings > Exposed schemas.
2. **Enable `pg_cron`** in Database > Extensions.
3. **Load data and schedule the refresh.** Run `supabase/scenarios/refresh_demo_environment.sql` in the SQL Editor, then:
>>>>>>> d065816f70efae27c821ced11ed405fd1e6a1532

```sql
SELECT operations.refresh_demo_environment();
```

4. **Observe** the results in `operations.v_delivery_overview`.

## Configuration

Edit [mock_data/config/refresh_policy.json](mock_data/config/refresh_policy.json):

<<<<<<< HEAD
- `commercial.erp_sales_orders`
- `commercial.erp_sales_order_lines`
- `operations.wms_inventory_balances`
- `operations.wms_fulfillments`
- `operations.wms_fulfillment_lines`
- `operations.tms_deliveries`

It does not delete `core.erp_customers`, `core.erp_delivery_sites`, `core.erp_products`, `core.tms_carriers`, or `core.wms_distribution_centers`.
=======
| Key | Meaning |
| --- | --- |
| `schedule_cron` | 5-field cron expression, e.g. `0 1 * * *` for daily at 01:00 UTC |
| `reset_mode` | `EVENTS_ONLY` clears orders, fulfillments, deliveries, inventory and keeps master data. `FULL` also clears and reloads master data. |
| `enabled` | `false` unschedules the job |
| `job_name` | `pg_cron` job name |

Override the mode for one run: `SELECT operations.refresh_demo_environment('FULL');`
>>>>>>> d065816f70efae27c821ced11ed405fd1e6a1532

## Change the data

1. Edit the CSVs. Event times are hour offsets from today 00:00 UTC.
2. Run `python -m scripts.build_sql` (`--check` verifies the SQL is current), or push to `main` and let the workflow commit the result.
3. Re-run `refresh_demo_environment.sql` in Supabase.

<<<<<<< HEAD
## DelIQ fit review

The current model is intentionally small but has the right subdomain boundaries:

- `core`: master data owned by ERP/TMS, including `erp_customers`, `erp_delivery_sites`, `erp_products`, `wms_distribution_centers`, and `tms_carriers`.
- `commercial`: ERP customer orders in `erp_sales_orders` and `erp_sales_order_lines`.
- `operations`: WMS state in `wms_inventory_balances`, `wms_fulfillments`, and `wms_fulfillment_lines`, plus TMS state in `tms_deliveries`.

This is enough for DelIQ to detect the hero short-pick and late-delivery journeys without turning the simulator into a full ERP, WMS, or TMS. The one-order/one-fulfilment/one-delivery assumption is also appropriate for the MVP.

Recommended improvements, in priority order:

1. Add an append-only `operations.event_log` with `event_type`, `source_system`, `entity_type`, `entity_id`, `occurred_at`, and `payload jsonb`. Keep the existing status tables as current state; DelIQ needs history to detect stalled handoffs and calculate detection rate.
2. Add explicit `short_quantity` (or a derived shortage) to `operations.wms_fulfillment_lines`. `quantity_picked` plus `quantity_ordered` is enough mathematically, but a named shortage makes WMS exceptions and the demo query clearer.
3. Add a small delivery milestone/event history for dispatch, ETA changes, failed attempts, and delivered. The current delivery columns remain the operational snapshot; history belongs in the event log rather than many nullable columns.
4. Expand order and delivery status values only when a scenario needs them. Avoid modelling invoices, purchase orders, routes, driver rosters, or carrier integrations in this challenge.

The DelIQ application database deliberately does not duplicate these source tables. It keeps source order/delivery identifiers and a small snapshot on each case so the control tower remains usable when the source platform is read-only or hosted separately.

Table prefixes are explanatory rather than claims about a vendor product:
`erp_*` represents order and customer master data, `wms_*` represents
warehouse fulfilment and stock, and `tms_*` represents carrier and delivery
execution.

## Recommended event extensions
=======
Delivery event types: `PICK_STARTED`, `PICK_SHORT`, `PICKED`, `STAGED`, `DISPATCHED`, `ETA_CHANGED`, `DELIVERED`, `FAILED`.
>>>>>>> d065816f70efae27c821ced11ed405fd1e6a1532

## Notes

- The schema migration uses `CREATE ... IF NOT EXISTS`, so existing tables and rows are preserved. If the hosted schema already matches and the migration shows as pending, run `supabase migration repair --status applied 20261106000000`. If the schema differs, add a new `ALTER TABLE` migration.
- The earlier `run_daily_business_day` function ([supabase/scenarios/daily_business_day.sql](supabase/scenarios/daily_business_day.sql)) and the Python scripts in `scripts/` and `scenarios/` are legacy. Unschedule the old `construction-retail-daily-simulation` job if you use the new refresh job.
- Python scripts need `.env` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (never commit it) and `pip install -r requirements.txt`.
