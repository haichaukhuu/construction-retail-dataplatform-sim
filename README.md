# deliq-sim: simulated ERP / WMS / TMS / carrier systems for DelIQ

Zero-cost, local-only. Three SQLite databases act as the "existing systems"; a replay clock feeds them
events so DelIQ can detect exceptions live. Requires Node 20+.

```bash
npm install
npm run seed          # builds data/erp.db, wms.db, tms.db, sim.db (deterministic: SIM_SEED=2026)
npm run check         # data sanity checks
npm run sim -- status
npm run sim -- run --speed 120          # 1 real second = 2 simulated minutes (~6 min for the whole day)
npm run export        # CSV fallback -> exports/{erp,wms,tms}/*.csv
```

## What the data looks like
- Business day `SIM_DAY` (default 2026-11-05, UTC; Stockholm = UTC+1). Clock starts at 04:00Z: picking/staging done, loading about to start.
- ~180 orders today + 3 days of history (fully applied) for KPI baselines. ~65% B2B.
- ~8% planted exceptions: short-pick/stockout, late dispatch, transit delay (some "silent", ETA unknown), delivery-day failure,
  plus one route breakdown (6 stuck orders, Path C). Ground truth: `sim.db > planted_exceptions` (use for precision/recall, Gate 3).
- IDs differ on purpose: ERP `ORD-10432`, WMS `ext_ref 10432`, TMS `order_ref ORD10432`; carrier feed joins on `tracking_id`.
- Hero orders for the video: `ORD-10001` STRATEGIC B2B 49k short-pick (Path C), `ORD-10002` KEY B2B transit delay (Path B),
  `ORD-10003` B2C site closed (Path A), `ORD-10004` clean order to break live.

## Demo controls
```bash
npm run sim -- tick --minutes 30                  # step the clock
npm run sim -- inject delay ORD-10004 150         # live delay: carrier EXC event, ETA becomes unknown, delivery shifted
npm run sim -- inject fail  ORD-10004 NO_ACCESS   # live failed delivery
```
Set `DELIQ_WEBHOOK_URL=http://localhost:3000/api/webhooks/carrier` to also POST every carrier event (webhook path);
leave it unset and DelIQ polls (API path); `npm run export` is the CSV fallback path. All three appear in your system context diagram.

## Connect to Next.js
Copy `nextjs/lib/sources.ts` and `nextjs/app/api/...` into your app (alias `@/lib`), `npm i better-sqlite3`, and set
`SIM_DATA_DIR=<abs path>/deliq-sim/data` in `.env.local`.

- `GET /api/mock/{erp|wms|tms}/{table}?updated_since=ISO&limit=1000&<column>=<value>` (read-only, no write routes)
- `GET /api/mock/clock` returns the simulated now. **DelIQ's detection rules must use this clock, not `Date.now()`.**
- Typical polling: shipments `updated_since`, then milestones by `shipment_id`; orders and `order_lines` from ERP; `pick_tasks` by `wms_order_no`.
- Do not expose `sim.db` to DelIQ except through the clock (and `planted_exceptions` in an evaluation script).

## Detection rules these tables support
| Exception | Rule |
|---|---|
| Short-pick | `pick_tasks.status='SHORT'` or `wms_orders.status='SHORT'` |
| Late dispatch | `now > wms_orders.cutoff_at` and no `LOADED` dispatch event |
| Transit delay / stalled | milestone `actual_at IS NULL` past `planned_at` + threshold; `current_eta > window_end`; `current_eta IS NULL` = Status Unknown |
| Delivery failure | `delivery_attempts.outcome='FAILED'` or carrier `EXC` with "Attempt failed" |
| Breakdown | `routes.status='BREAKDOWN'` |

## Layout
`schema/*.sql` table definitions · `src/seed.ts` data + event script · `src/engine.ts` replay · `src/sim.ts` CLI ·
`src/check.ts` tests · `docs/deliq_sources.dbml` ER diagram · `nextjs/` integration files.
