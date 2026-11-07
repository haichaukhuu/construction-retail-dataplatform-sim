# Construction retail data platform simulator

Simulates a Swedish construction-retail flow in Supabase:

`customer/order -> inventory reservation -> picking -> staging -> dispatch -> delivery`

## What the mock data represents

- Three distribution centers: Stockholm, Gothenburg, and Malmo.
- B2B strategic/key accounts and B2C customers, each with a delivery site.
- Timber, plasterboard, cement, insulation, and tools with realistic weights and units.
- Inventory with intentionally constrained timber in Malmo and plasterboard in Gothenburg.
- Orders containing one to three products, including bulky deliveries requiring crane trucks.
- Fulfilments and deliveries linked to every generated order.

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
```

If Supabase still reports the migration as pending, first inspect the migration list:

```powershell
supabase migration list
```

Run `supabase db push` from the repository root. If the hosted project already has the same schema and the migration is marked pending, you can mark only this migration as applied:

```powershell
supabase migration repair --status applied 20261106000000
```

`migration repair` changes migration history only; it does not delete or recreate tables.

`supabase db push` applies migrations only; it does not run seed files. The
seed files are configured for `supabase db reset` and run in this order:

1. `supabase/seed/00_simulation_config.sql`
2. `supabase/seed/01_master_data.sql`
3. `supabase/seed/02_events.sql`

### Recreating dropped schemas

Dropping `core`, `commercial`, and `operations` does not remove the migration
history stored by Supabase. If `supabase migration list` shows
`20261106000000` as applied while the tables are gone, mark that migration as
reverted and push it again:

```powershell
supabase migration repair --status reverted 20261106000000
supabase db push
```

After the schema is recreated, load the committed demo data:

```powershell
supabase db reset --linked
```

This is destructive by design and runs the migrations followed by both
configured seed files. Use it only for this disposable simulator project. If
you already ran `supabase db push` and only need the data, run the reset after
confirming the linked project is the intended one.

If `20261106000002` is also marked applied and its function is gone, revert the
later migration first, then the initial migration:

```powershell
supabase migration repair --status reverted 20261106000002
supabase migration repair --status reverted 20261106000000
supabase db reset --linked
```

Do not use `migration repair --status applied` for this situation: that records
a migration as complete without executing its SQL. The Supabase CLI must be
linked to the intended project before running these commands.

If the existing schema differs, do not baseline it. Create a new migration containing the required `ALTER TABLE` statements. If the project contains no data worth keeping, the simpler alternative is to reset/drop the mock schemas and then run:

```powershell
supabase db push
```

The migration `20261107000000_simulation_control.sql` depends on both earlier
migrations. If deployment reports that schema `operations` is missing, inspect
the hosted migration history before retrying:

```powershell
supabase migration list --remote
```

For a disposable project whose migration history says the earlier migrations
are applied but the schemas are missing, repair the history and reapply them:

```powershell
supabase migration repair --status reverted 20261107000000
supabase migration repair --status reverted 20261106000002
supabase migration repair --status reverted 20261106000000
supabase db push --remote <project-ref> --yes
```

Only use this repair sequence for the disposable simulator project, after
confirming that no data must be preserved. Do not mark a migration as applied
when its schema objects are absent.

## Setup

1. Connect the repository using the Supabase GitHub Integration.
2. Copy `.env.example` to `.env` and set `SUPABASE_URL` plus the server-side key
   required by the command you run. The Python runner uses
   `SUPABASE_SERVICE_ROLE_KEY`; the Node GitHub Actions runner uses
   `SUPABASE_SECRET_KEY`.
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
4. **GitHub Actions** deploy migrations and can invoke the guarded simulation
   RPC without running the local Python tools.

### Configure GitHub Actions secrets

Create a GitHub environment named `production`:

1. Open the repository on GitHub.
2. Go to **Settings > Environments > New environment**.
3. Name it `production`.
4. Optionally add required reviewers before production workflows can run.
5. Add these environment secrets under **Environment secrets**:

| Secret | Used by | Value |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Migration deployment | Personal access token from Supabase account settings |
| `SUPABASE_PROJECT_ID` | Migration deployment | Hosted Supabase project reference |
| `SUPABASE_DB_PASSWORD` | Migration deployment | Database password for the hosted project |
| `SUPABASE_URL` | Simulation runner | Project URL from Supabase Connect/API settings |
| `SUPABASE_SECRET_KEY` | Simulation runner | Server-side secret/service-role key |

The workflow files reference the `production` environment, so these secrets are
not available to unrelated jobs or pull requests. Never put any of these values
in `config.toml`, migrations, seed files, committed `.env` files, or frontend
code. The secret key bypasses RLS and is used only by the trusted scheduled
workflow to call the guarded `operations.run_daily_business_day` function.

After adding the secrets, use **Actions > Deploy Supabase migrations > Run
workflow** on `main`. Once the migration succeeds, use **Actions > Run
business-day simulation > Run workflow** to test a manual run with an order
count between 1 and 500.

### Switch the business-day simulation

The database-native simulation is controlled by one metadata row in
`operations.simulation_settings`. The seeded default is enabled. Turning it
off makes `operations.run_daily_business_day()` return `0` without deleting or
creating business-day data:

```sql
SELECT operations.set_business_day_simulation(FALSE, NULL, 'operator');
SELECT operations.is_business_day_simulation_enabled();
SELECT operations.set_business_day_simulation(TRUE, 30, 'operator');
```

The optional order-count argument updates the configured order volume only when
supplied. Values from 1 to 500 are accepted. Schedules must call
`operations.run_daily_business_day()` rather than the internal
`operations.run_daily_business_day_unchecked()` function, so the switch is
always respected.

### Metadata-driven structure

`mock_data/` is the canonical fixed catalog and event metadata. The generated
files in `supabase/seed/` and `supabase/scenarios/` are deployment artifacts and
must be regenerated with `python -m scripts.build_sql`, not edited by hand.
Migrations contain schema, views, and database functions. Runtime switches
belong in `operations.simulation_settings`; secrets belong in environment
variables referenced through Supabase `config.toml`, never in migrations or
seed data.

## Database-native daily scenario

The scenario can run entirely inside Supabase or through the trusted GitHub
Actions runner:

1. Enable the `pg_cron` extension in **Database > Extensions**.
2. Apply the migration that installs the scenario function.
3. Test it manually:

```sql
SELECT operations.refresh_demo_environment();
```

4. Create the daily schedule in the SQL Editor:

```sql
SELECT cron.schedule(
  'construction-retail-daily-simulation',
  '0 1 * * *',
  $$SELECT operations.run_daily_business_day();$$
);
```

The function deletes only daily business data:

- `commercial.erp_sales_orders`
- `commercial.erp_sales_order_lines`
- `operations.wms_inventory_balances`
- `operations.wms_fulfillments`
- `operations.wms_fulfillment_lines`
- `operations.tms_deliveries`

It does not delete `core.erp_customers`, `core.erp_delivery_sites`, `core.erp_products`, `core.tms_carriers`, or `core.wms_distribution_centers`.

The scenario SQL is in [supabase/scenarios/daily_business_day.sql](supabase/scenarios/daily_business_day.sql), and the migration contains an inline copy in [20261106000002_daily_business_day.sql](supabase/migrations/20261106000002_daily_business_day.sql). The migration is intentionally duplicated because Supabase migration runners execute SQL and do not support `psql` meta-commands such as `\ir`.

Use a trigger for event reactions such as creating a fulfillment after an order insert. Do not use a trigger as the daily clock: triggers run only when a row changes. `pg_cron` is the correct Supabase-native scheduler.

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

For a richer demo, add a separate append-only `operations.event_log` table or Supabase Realtime listeners for:

- `ORDER_CONFIRMED`, `STOCK_RESERVED`, `PICK_SHORT`, `FULFILLMENT_STAGED`
- `DELIVERY_DISPATCHED`, `ETA_CHANGED`, `DELIVERY_FAILED`, `DELIVERY_DELIVERED`

Keep the current tables as the operational state and use the event log for audit/history. This avoids overloading status columns when demonstrating analytics or alerts.
