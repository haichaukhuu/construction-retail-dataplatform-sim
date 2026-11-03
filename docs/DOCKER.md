# Packaging DelIQ with Docker

## Images
| Service | Dockerfile | Purpose |
|---|---|---|
| `seed` | `Dockerfile.sim` | One-shot: builds `erp.db`, `wms.db`, `tms.db`, `sim.db` into the `simdata` volume |
| `sim` | `Dockerfile.sim` | Replay clock; POSTs carrier events to the web webhook |
| `web` | `web/Dockerfile` | Next.js (standalone build): `/api/mock/*`, `/api/webhooks/carrier`, dashboard |

`web/` is the app shell; the Dockerfile overlays `nextjs/` (mock APIs, `lib/sources.ts`) on it at build time, so there is a single source of truth.

## Run
```bash
docker compose up --build            # seed -> web -> sim
curl http://localhost:3000/api/mock/clock
curl "http://localhost:3000/api/mock/tms/shipments?limit=3"
```

## Operate the simulation
```bash
docker compose run --rm sim tick --minutes 30
docker compose run --rm sim inject delay ORD-10004 150
docker compose run --rm sim status
docker compose run --rm --entrypoint npx sim tsx src/export.ts   # CSV fallback (exports inside container)
```
Reset to a clean day: `docker compose down -v && docker compose up --build`.

Config via `.env` next to the compose file: `SIM_SEED`, `SIM_DAY`, `SIM_SPEED`, `MOCK_API_KEY`.

## Design notes
- Sources are read-only by construction: the `web` service opens SQLite with `query_only = ON` and exposes only GET routes. The volume must be writable because WAL readers need the `-shm` file.
- Only the `sim` service writes to the source DBs (it is the "outside world"). When the DelIQ ingestion service is added, give it its own `deliqdata` volume for `deliq.db` and never mount `simdata` as writable-by-intent.
- DelIQ should read the clock and tables via HTTP (`http://web:3000/api/mock/...`), matching spec ING-1.
- `better-sqlite3` is a native module: images build on `bookworm-slim` (glibc) with build tools as a fallback. Avoid Alpine unless you verify prebuilds.
- Secrets: pass via environment or `.env` (git-ignored through `.dockerignore`); never bake them into images. Provide `.env.example` (spec rule 7).
- LLM: default `MockLlm` needs no network; for `RemoteLlm` pass the provider key as an env var only.

## Adding the DelIQ worker later
Add a service sharing the code base, with its own volume:
```yaml
  worker:
    build: { context: ., dockerfile: Dockerfile.worker }
    environment:
      SOURCE_BASE_URL: http://web:3000
      DELIQ_DB: /deliq/deliq.db
      LLM_MODE: mock
    volumes: [deliqdata:/deliq]
    depends_on: [web]
```
