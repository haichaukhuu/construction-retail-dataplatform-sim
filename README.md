# Construction retail data platform simulator

Simulates a Swedish construction-retail flow in Supabase:

`customer/order -> inventory reservation -> picking -> staging -> dispatch -> delivery`

Data covers three distribution centers (Stockholm, Gothenburg, Malmo), B2B/B2C customers, five product categories, and 30 orders with stockouts, short picks, ETA changes, and failed deliveries.

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
```

Never edit generated SQL; change `mock_data/` and rebuild.

## Quick start

1. **Create the schema.** Connect the repo with the Supabase GitHub Integration (Project Settings > Integrations), working directory `.`. Or run `supabase link --project-ref <ref>` then `supabase db push`. Expose `core`, `commercial`, and `operations` under API settings > Exposed schemas.
2. **Enable `pg_cron`** in Database > Extensions.
3. **Load data and schedule the refresh.** Run `supabase/scenarios/refresh_demo_environment.sql` in the SQL Editor, then:

```sql
SELECT operations.refresh_demo_environment();
```

4. **Observe** the results in `operations.v_delivery_overview`.

## Configuration

Edit [mock_data/config/refresh_policy.json](mock_data/config/refresh_policy.json):

| Key | Meaning |
| --- | --- |
| `schedule_cron` | 5-field cron expression, e.g. `0 1 * * *` for daily at 01:00 UTC |
| `reset_mode` | `EVENTS_ONLY` clears orders, fulfillments, deliveries, inventory and keeps master data. `FULL` also clears and reloads master data. |
| `enabled` | `false` unschedules the job |
| `job_name` | `pg_cron` job name |

Override the mode for one run: `SELECT operations.refresh_demo_environment('FULL');`

## Change the data

1. Edit the CSVs. Event times are hour offsets from today 00:00 UTC.
2. Run `python -m scripts.build_sql` (`--check` verifies the SQL is current), or push to `main` and let the workflow commit the result.
3. Re-run `refresh_demo_environment.sql` in Supabase.

Delivery event types: `PICK_STARTED`, `PICK_SHORT`, `PICKED`, `STAGED`, `DISPATCHED`, `ETA_CHANGED`, `DELIVERED`, `FAILED`.

## Notes

- The schema migration uses `CREATE ... IF NOT EXISTS`, so existing tables and rows are preserved. If the hosted schema already matches and the migration shows as pending, run `supabase migration repair --status applied 20261106000000`. If the schema differs, add a new `ALTER TABLE` migration.
- The earlier `run_daily_business_day` function ([supabase/scenarios/daily_business_day.sql](supabase/scenarios/daily_business_day.sql)) and the Python scripts in `scripts/` and `scenarios/` are legacy. Unschedule the old `construction-retail-daily-simulation` job if you use the new refresh job.
- Python scripts need `.env` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (never commit it) and `pip install -r requirements.txt`.
