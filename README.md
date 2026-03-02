# Service Reliability Monitor

A lightweight, self-hosted service reliability monitor. Periodically polls HTTP endpoints, detects availability and version drift, persists results, and surfaces a live dashboard with a REST API.

**Stack:** TypeScript · Next.js 15 (App Router) · Tailwind CSS · shadcn/ui · Drizzle ORM · PostgreSQL · Docker · AWS (ECS Fargate + RDS)

---

## Architecture

```
┌───────────────────────────────────────────────────────┐
│  Next.js Container                                    │
│                                                       │
│  ┌─────────────────┐  ┌──────────────────────────┐   │
│  │  Dashboard UI   │  │  API Route Handlers      │   │
│  │  (React / SSR)  │  │  GET /api/services       │   │
│  │  TanStack Query │  │  GET /api/services/:id   │   │
│  │  auto-refresh   │  │  GET /api/services/:id/  │   │
│  └─────────────────┘  │       history            │   │
│                        │  GET /api/monitor/health │   │
│                        │  POST /api/run-once      │   │
│                        └──────────────────────────┘   │
│                                                       │
│  ┌────────────────────────────────────────────────┐   │
│  │  Poller (instrumentation.ts)                   │   │
│  │  · setInterval loop (configurable)             │   │
│  │  · Concurrent HTTP checks (p-limit, max 10)    │   │
│  │  · Version extraction: JSON path + header      │   │
│  │  · Consecutive failure alerting + webhook      │   │
│  │  · Run lock (no overlapping cycles)            │   │
│  │  · Retention: 7-day age + 500/service cap      │   │
│  └────────────────────────────────────────────────┘   │
└───────────────────────┬───────────────────────────────┘
                        │
                 ┌──────▼──────┐
                 │  PostgreSQL  │
                 └─────────────┘

┌────────────────────────────────────────────────────────┐
│  Mock Services (Express)                               │
│  GET /api/healthy       → 200, version "2.1.0"         │
│  GET /api/degraded      → 200, 1.5 s delay             │
│  GET /api/wrong-version → 200, version "1.9.0"         │
│  GET /api/failing       → 503 every other request      │
│  GET /api/timeout       → hangs 10 s                   │
└────────────────────────────────────────────────────────┘
```

---

## Quickstart

```bash
# 1. Clone and copy environment config
cp .env.example .env.local

# 2. Start the full stack (Postgres + mock services + app)
docker compose up --build

# Dashboard → http://localhost:3000
# Mock services → http://localhost:3001
```

The `app` container automatically applies database migrations on startup before booting the Next.js server.

### Run without Docker (local dev)

```bash
# Prerequisites: Node 22+, a running Postgres instance

# Install dependencies
npm install

# Start Postgres (Docker only, no app)
docker compose up db -d

# Copy and configure environment
cp .env.example .env.local
# Edit .env.local — set DATABASE_URL if different

# Apply migrations
npm run db:migrate

# Start development server (poller runs via instrumentation.ts)
npm run dev

# Dashboard → http://localhost:3000
```

---

## Configuration

### Service Config (`services.yaml`)

Defines which endpoints to monitor. The poller reads this file on startup and upserts to the database. Removing a service soft-deletes it (sets `is_active = false`), preserving history.

```yaml
services:
  - name: Healthy API
    url: http://mock-services:3001/api/healthy
    env: demo
    expected_version: "2.1.0"
    version_path: "$.version"          # JSON path extraction

  - name: Auth Service
    url: https://api.example.com/health
    env: production
    expected_version: "3.0.0"
    version_header: X-App-Version      # HTTP header extraction
```

| Field              | Required | Description                                       |
|--------------------|----------|---------------------------------------------------|
| `name`             | ✓        | Unique display name                               |
| `url`              | ✓        | Full HTTP/HTTPS endpoint URL                      |
| `env`              |          | Environment tag (default: `default`)              |
| `expected_version` |          | Expected version string — enables drift detection |
| `version_path`     |          | JSONPath expression to extract version from body  |
| `version_header`   |          | Response header containing the version string     |

### Environment Variables

| Variable                  | Default                    | Description                           |
|---------------------------|----------------------------|---------------------------------------|
| `DATABASE_URL`            | *(required)*               | PostgreSQL connection string          |
| `POLL_INTERVAL_MS`        | `30000`                    | Milliseconds between poll cycles      |
| `CHECK_TIMEOUT_MS`        | `3000`                     | Per-request HTTP timeout              |
| `CONCURRENCY_LIMIT`       | `10`                       | Max concurrent checks per cycle       |
| `ALERT_THRESHOLD`         | `3`                        | Consecutive failures before alerting  |
| `RETRY_DELAY_MS`          | `500`                      | Delay before single transient retry   |
| `ALERT_WEBHOOK_URL`       | *(empty)*                  | Webhook for Slack/Discord/PagerDuty   |
| `RETENTION_DAYS`          | `7`                        | Delete checks older than N days       |
| `MAX_CHECKS_PER_SERVICE`  | `500`                      | Cap stored checks per service         |
| `NODE_ENV`                | `development`              | `development` or `production`         |

---

## API Reference

### `GET /api/services`
Returns all services with their latest check snapshot.

```json
[
  {
    "id": "uuid",
    "name": "Healthy API",
    "url": "http://...",
    "env": "demo",
    "isActive": true,
    "expectedVersion": "2.1.0",
    "latestCheck": {
      "ok": true,
      "statusCode": 200,
      "latencyMs": 42,
      "observedVersion": "2.1.0",
      "hasDrift": false,
      "checkedAt": "2026-01-01T00:00:00.000Z"
    }
  }
]
```

### `GET /api/services/:id`
Single service with metadata and latest check.

### `GET /api/services/:id/history?limit=50`
Recent checks for a service (default limit: 50, max: 200).

### `GET /api/monitor/health`
Monitor heartbeat — returns `ok` and timestamp of last completed poll.

```json
{ "ok": true, "lastRunAt": "2026-01-01T00:00:00.000Z" }
```

### `POST /api/run-once`
Triggers an immediate out-of-band poll cycle. Returns poll summary.

---

## Project Structure

```
service-reliability/
├── src/
│   ├── app/                    # Next.js App Router (pages + API routes)
│   ├── components/             # React components (UI + domain)
│   ├── lib/
│   │   ├── db/                 # Drizzle schema, migrations, client
│   │   ├── poller/             # HTTP checker, version extractor, alerting, orchestrator
│   │   ├── config/             # YAML loader + DB sync
│   │   ├── retention.ts        # Age + count-based data cleanup
│   │   ├── logger.ts           # pino (JSON in prod, pretty in dev)
│   │   └── worker.ts           # Standalone poller entry (ECS worker task)
│   └── instrumentation.ts      # Next.js hook → starts poller in dev
├── __tests__/                  # Vitest tests mirroring src structure
├── mock-services/              # Express mock server (demo endpoints)
├── scripts/
│   ├── migrate.mjs             # Runtime migration runner (used by Docker startup)
│   └── start.sh                # Docker entrypoint: migrate → start Next.js
├── terraform/                  # AWS infrastructure (Phase 8)
├── services.yaml               # Service monitor config (source of truth)
├── docker-compose.yml          # Local: Postgres + mock-services + app
├── Dockerfile                  # Multi-stage: runner + worker targets
└── drizzle.config.ts
```

---

## Scripts

| Command             | Description                                  |
|---------------------|----------------------------------------------|
| `npm run dev`       | Start Next.js dev server (poller auto-starts)|
| `npm run build`     | Production build                             |
| `npm run start`     | Start production server                      |
| `npm run test`      | Run tests in watch mode                      |
| `npm run test:run`  | Run tests once (CI)                          |
| `npm run lint`      | ESLint                                       |
| `npm run db:generate` | Generate Drizzle migrations from schema    |
| `npm run db:migrate`  | Apply pending migrations                   |

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Poller entry points** | Dual: `instrumentation.ts` (local) + `worker.ts` (prod) | Same poller code, different entry points. Local = single container. Production = separate ECS task. |
| **ORM** | Drizzle | Lightweight, SQL-like, TypeScript-native. Smaller bundle than Prisma. |
| **Config format** | YAML → DB upsert (soft delete) | YAML is version-controlled source of truth. DB enables relational queries. Removed services are marked inactive, history is preserved. |
| **Version extraction** | JSON path + response header | Per-service config. Covers REST APIs (body) and legacy services (headers). |
| **Parse error handling** | `ok = true`, `observedVersion = null` | Availability ≠ version. A service can be up but return malformed JSON. Logged as a warning. |
| **Alerting** | Consecutive failures + rate limit | Avoids alert storms. One alert per incident per 10 minutes. Webhook works with Slack/Discord/PagerDuty. |
| **Retention** | 7-day age window + 500/service cap | At 30s intervals: ~20k checks/service/week. Dual strategy handles both time and count runaway. |
| **Dashboard data** | SSR initial data + TanStack Query refresh | Fast first paint via server render. Client auto-refreshes every 15s without a full page reload. |
| **Sparklines** | Pure SVG | No heavy charting library. Keeps bundle small. |
| **Testing** | Full TDD (Vitest) | Tests written before implementation for all core logic, API routes, and components. |

---

## Infrastructure (AWS Deployment)

The production deployment uses three separate ECS Fargate tasks behind a single ALB:

- **web task** — Next.js (dashboard + API routes). Behind the ALB on port 80. Scales horizontally.
- **worker task** — Standalone poller (`worker.ts`). Single instance. No ALB. Can restart independently of web.
- **mock-services task** — Express demo server. Used by the configured service endpoints.

RDS PostgreSQL (`db.t3.micro`, single-AZ) serves as the shared data store. Credentials are stored in AWS Secrets Manager and injected into task definitions at runtime — never baked into images. Structured pino JSON logs flow to CloudWatch Log Groups (`/ecs/service-monitor/{web,worker,mock}`) where CloudWatch Logs Insights can query structured fields directly.

Separating web and worker provides blast-radius isolation: a poller crash doesn't affect the dashboard, and the web task can scale out during traffic spikes without spawning extra pollers.

```bash
# Deploy (Phase 8)
cd terraform && terraform init && terraform apply
```

---

## AI Usage

This project was developed with AI assistance (Claude) for:

- Generating boilerplate structure and configuration files
- Writing initial test scaffolding and implementation stubs
- Debugging TypeScript/Drizzle type errors
- Drafting documentation

All architectural decisions, code review, and final implementation choices were made by the developer. AI-generated code was reviewed and modified as needed before committing.

During one session, Claude Code experienced a service shortage. Cursor was used as a temporary fallback for a portion of the development work.
