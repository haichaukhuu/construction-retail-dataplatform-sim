# Construction retail data platform simulator

This project models a Swedish construction-retail flow:

`customer/order -> inventory reservation -> picking -> staging -> dispatch -> delivery`

## What the mock data represents

- Three distribution centers: Stockholm, Gothenburg, and Malmo.
- B2B strategic/key accounts and B2C customers, each with a delivery site.
- Timber, plasterboard, cement, insulation, and tools with realistic weights and units.
- Inventory with intentionally constrained timber in Malmo and plasterboard in Gothenburg.
- Orders containing one to three products, including bulky deliveries requiring crane trucks.
- Fulfillments and deliveries linked to every generated order.

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
ERROR: relation "distribution_centers" already exists
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

This clears all rows in dependency order, creates the master data and inventory, creates the day’s orders, then advances eight operational checkpoints. Query `operations.v_delivery_overview` in Supabase to observe the current stage.

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

```sql
SELECT operations.run_daily_business_day(30);
```

4. Create the daily schedule in the SQL Editor:

```sql
SELECT cron.schedule(
  'construction-retail-daily-simulation',
  '0 1 * * *',
  $$SELECT operations.run_daily_business_day(30);$$
);
```

The function deletes only daily business data:

- `commercial.sales_orders`
- `commercial.sales_order_lines`
- `operations.inventory_balances`
- `operations.fulfillments`
- `operations.fulfillment_lines`
- `operations.deliveries`

It does not delete `core.customers`, `core.delivery_sites`, `core.products`, `core.carriers`, or `core.distribution_centers`.

The scenario SQL is in [supabase/scenarios/daily_business_day.sql](supabase/scenarios/daily_business_day.sql), and the migration contains an inline copy in [20261106000002_daily_business_day.sql](supabase/migrations/20261106000002_daily_business_day.sql). The migration is intentionally duplicated because Supabase migration runners execute SQL and do not support `psql` meta-commands such as `\ir`.

Use a trigger for event reactions such as creating a fulfillment after an order insert. Do not use a trigger as the daily clock: triggers run only when a row changes. `pg_cron` is the correct Supabase-native scheduler.

## Recommended event extensions

For a richer demo, add a separate append-only `operations.event_log` table or Supabase Realtime listeners for:

- `ORDER_CONFIRMED`, `STOCK_RESERVED`, `PICK_SHORT`, `FULFILLMENT_STAGED`
- `DELIVERY_DISPATCHED`, `ETA_CHANGED`, `DELIVERY_FAILED`, `DELIVERY_DELIVERED`

Keep the current tables as the operational state and use the event log for audit/history. This avoids overloading status columns when demonstrating analytics or alerts.
