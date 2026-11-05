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

## GitHub Actions daily simulation

Add these repository secrets under **Settings > Secrets and variables > Actions**:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The workflow in `.github/workflows/daily-simulation.yml` runs at 01:00 UTC every day and can also be started manually with **Run workflow**. It resets the mock database before each run, so the Supabase database contains one fresh simulated business day rather than accumulated history.

The workflow has a concurrency lock so two resets cannot run at the same time. It uses the service-role key only in GitHub Actions and never places that key in migration files or browser code.

This two-part setup is intentional:

1. **Supabase GitHub Integration** deploys schema and view changes from `supabase/migrations`.
2. **GitHub Actions** runs Python business activity and exceptions because migrations are not a scheduler or data generator.

For production-like event history, use a separate append-only event table or Supabase Edge Function with `pg_cron`. For this mock platform, the GitHub Action is simpler and easier to inspect.

## Recommended event extensions

For a richer demo, add a separate append-only `operations.event_log` table or Supabase Realtime listeners for:

- `ORDER_CONFIRMED`, `STOCK_RESERVED`, `PICK_SHORT`, `FULFILLMENT_STAGED`
- `DELIVERY_DISPATCHED`, `ETA_CHANGED`, `DELIVERY_FAILED`, `DELIVERY_DELIVERED`

Keep the current tables as the operational state and use the event log for audit/history. This avoids overloading status columns when demonstrating analytics or alerts.
