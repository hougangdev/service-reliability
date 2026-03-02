# Service Reliability Monitor

Polls HTTP endpoints on a configurable interval, tracks status/latency/version drift, persists results to PostgreSQL, fires alerts on consecutive failures, and serves a Next.js dashboard with AI-powered incident summaries.

**Stack:** Next.js 15 + React 19 + TypeScript, PostgreSQL + Drizzle ORM, Vitest, Docker, AWS (App Runner + RDS + ECS), Tailwind CSS, Pino logging, Anthropic SDK (Claude Haiku for incident summaries).

## Quick Commands

```bash
docker-compose up --build     # Full local env (Postgres + mock services + app)
npm run dev                   # Next.js dev server (poller auto-starts via instrumentation.ts)
npm run worker                # Standalone poller (tsx src/worker.ts)
npm run test                  # Vitest watch mode
npm run test:run              # Vitest single run
npm run build                 # Next.js production build
npx tsc --noEmit              # Type-check without emitting

# Database (Drizzle Kit)
npm run db:generate            # Generate migrations from schema
npm run db:migrate             # Run pending migrations
npm run db:push                # Push schema directly (dev shortcut)
npm run db:studio              # Open Drizzle Studio GUI
```

## Codemap

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (QueryProvider, header)
│   ├── page.tsx                  # Dashboard — services table + incident summary
│   ├── services/[id]/page.tsx    # Service detail page (history, sparkline)
│   └── api/
│       ├── services/             # GET all services, GET/by-id, GET history
│       ├── incidents/summary/    # GET AI incident summary (Claude Haiku)
│       ├── monitor/health/       # GET poller health check
│       └── run-once/             # POST trigger single poll cycle
├── components/
│   ├── services-table.tsx        # Main dashboard table
│   ├── service-detail.tsx        # Single-service detail view
│   ├── incident-summary.tsx      # AI summary card
│   ├── status-badge.tsx          # Up/down/unknown badge
│   ├── status-timeline.tsx       # Recent checks timeline dots
│   ├── latency-sparkline.tsx     # Inline latency chart
│   ├── drift-indicator.tsx       # Version drift warning
│   ├── header.tsx                # App header
│   ├── providers/query-provider.tsx
│   └── ui/                       # Shadcn primitives (badge, button, card, table)
├── lib/
│   ├── monitoring/
│   │   ├── index.ts              # Orchestrator — runPollCycle + startPoller
│   │   ├── checker.ts            # HTTP health check with 1 retry for transient errors
│   │   ├── alerting.ts           # Consecutive-failure alerting + webhook
│   │   ├── incidents.ts          # Incident detection (down/drift/flapping/degraded)
│   │   ├── retention.ts          # Time + count-based data retention
│   │   └── version.ts            # Version extraction (JSONPath or header)
│   ├── services/
│   │   ├── queries.ts            # DB queries (all services, by-id, history, recent checks)
│   │   └── types.ts              # Shared domain types (ServiceSummary, ServiceDetail, etc.)
│   ├── config/
│   │   ├── loader.ts             # YAML config file loader
│   │   ├── schema.ts             # Zod schema for services.yaml
│   │   └── sync.ts               # Upsert + soft-delete sync from config → DB
│   ├── db/
│   │   ├── index.ts              # Lazy DB connection via Proxy
│   │   └── schema.ts             # Drizzle schema (services + service_checks tables)
│   ├── logger.ts                 # Pino logger (structured JSON prod, pretty dev)
│   └── utils.ts                  # Tailwind cn() helper
├── instrumentation.ts            # Next.js hook — starts poller in dev/single-container
├── worker.ts                     # Standalone poller entry point (prod ECS task)
└── test-setup.ts                 # Vitest global setup

__tests__/                        # Mirrors src/ structure
├── api/                          # API route tests (health, services, incidents)
└── lib/
    ├── config/                   # Config loader + sync tests
    └── monitoring/               # Checker, alerting, incidents, orchestrator, retention, version

terraform/                        # AWS infrastructure (Terraform)
├── modules/
│   ├── networking/               # VPC, subnets, security groups
│   ├── database/                 # RDS PostgreSQL
│   └── apprunner/                # App Runner service
├── bootstrap/                    # S3 backend + DynamoDB lock table
└── *.tf                          # Root module (main, variables, outputs, providers, backend)

.github/workflows/
├── ci-deploy.yml                 # CI/CD — test, build, deploy
├── terraform.yml                 # Terraform plan/apply
└── destroy.yml                   # Teardown workflow

mock-services/                    # Express mock server (healthy, degraded, failing, timeout endpoints)
services.yaml                     # Service definitions (source of truth)
docker-compose.yml                # Local dev: Postgres + mock-services + app
```

## Architecture Notes

- **Domain separation:** `monitoring/` (polling/alerting), `services/` (queries/types), `config/` (YAML loading/validation), `db/` (schema/connection).
- **Two deployment modes:** Single-container in dev (poller starts via `instrumentation.ts` inside Next.js) vs multi-container in prod (separate `worker.ts` ECS task + Next.js App Runner).
- **Dependency injection for testability:** `runPollCycle` accepts `checkFn`, `persistFn`, and config overrides — tests inject stubs instead of hitting HTTP/DB.
- **Lazy DB via Proxy:** `db` export is a Proxy that defers `Pool` creation until first query. This allows `next build` to succeed without `DATABASE_URL`.
- **In-memory state:** Consecutive failure counts and alert rate-limiting timestamps live in memory. Safe because they reset on redeploy — worst case is a duplicate alert.
- **Concurrency-controlled polling:** `p-limit` caps parallel HTTP checks (default 10). A run lock (`running` flag) prevents overlapping poll cycles.
- **Config sync flow:** On poller startup, `services.yaml` is loaded → Zod-validated → upserted to DB (new services inserted, existing updated, removed ones soft-deleted via `isActive = false`).
- **Transient retry policy:** Checker retries once for 5xx/timeout/connection errors. DNS (ENOTFOUND) and TLS errors are not retried — they indicate config issues.
- **AI incident summary:** The `/api/incidents/summary` route detects incidents (down/drift/flapping/degraded), then calls Claude Haiku for a natural-language summary. Skips the LLM call entirely when all services are healthy.

## Development Conventions

- **Tests:** Vitest with globals enabled. Test files in `__tests__/` mirror `src/` structure.
- **Mocking:** `vi.stubGlobal('fetch', ...)` for HTTP. Injectable deps (`checkFn`, `persistFn`) for orchestrator tests.
- **Path alias:** `@/*` maps to `./src/*`.
- **Logging:** Pino — structured JSON in production, pretty-printed in development.
- **Commits:** Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`).
- **Env vars:** Sensible defaults in code. `DATABASE_URL` is the only required var at runtime.
- **UI:** Tailwind CSS + Shadcn/ui primitives. TanStack Query for server state.

## Key Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | *(required)* | PostgreSQL connection string |
| `NODE_ENV` | `development` | `production` enables JSON logging, disables pretty-print |
| `POLL_INTERVAL_MS` | `30000` | Milliseconds between poll cycles |
| `CHECK_TIMEOUT_MS` | `3000` | Per-service HTTP check timeout |
| `RETRY_DELAY_MS` | `500` | Backoff before transient-error retry |
| `CONCURRENCY_LIMIT` | `10` | Max parallel HTTP checks per cycle |
| `ALERT_THRESHOLD` | `3` | Consecutive failures before alerting |
| `ALERT_WEBHOOK_URL` | *(none)* | Webhook URL for alert POST (optional) |
| `RETENTION_DAYS` | `7` | Delete checks older than N days |
| `MAX_CHECKS_PER_SERVICE` | `500` | Keep at most N checks per service |
| `ANTHROPIC_API_KEY` | *(none)* | Enables AI incident summaries (optional) |
| `LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `error`) |

## Lessons Learned

- **Lazy DB init with Proxy** solves the Next.js build-time problem where `DATABASE_URL` isn't available. The Proxy defers `Pool` creation until the first actual query, so static analysis and build steps never trigger a connection.
- **Only retry transient errors** — 5xx and timeouts may self-heal, but DNS (`ENOTFOUND`) and TLS/certificate failures are config issues that won't resolve on retry. Retrying them wastes time and muddies latency metrics.
- **Run lock prevents HTTP storms** — without the `running` flag guard, a slow poll cycle could overlap with the next interval tick, doubling outbound traffic. The lock ensures at-most-one cycle runs at a time.
- **`selectDistinctOn` replaces window functions** — Drizzle's `selectDistinctOn` maps to Postgres `DISTINCT ON`, which efficiently fetches the latest check per service without `ROW_NUMBER() OVER(...)` subqueries.
- **In-memory alert state is acceptable** because a restart only loses failure counters and rate-limit timestamps. Worst case: one duplicate alert after redeploy, which is far simpler than persisting alert state to DB.
- **`services.yaml` is source of truth** — the DB is synced on every poller startup via upsert + soft-delete (`isActive = false`). This means adding/removing a service is a config file change, not a DB migration.
- **Skip the LLM call when healthy** — the incident summary endpoint detects incidents first and returns a static "all clear" response when there are none, avoiding unnecessary Anthropic API calls and latency.
