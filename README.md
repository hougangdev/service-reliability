# Service Reliability Monitor

Lightweight, self-hosted service reliability monitor: periodic health checks, version drift detection, persistence, and a minimal dashboard + API.

**Stack:** TypeScript, Next.js 15 (App Router), Tailwind CSS, Drizzle ORM, PostgreSQL, Docker.

---

## Quickstart (Phase 1)

### 1. Start Postgres and mock services

```bash
docker-compose up -d db mock-services
```

### 2. Run database migrations

```bash
cp .env.example .env.local
# Edit .env.local if needed (default: postgresql://postgres:postgres@localhost:5432/service_monitor)
npm run db:push
# Or: npm run db:migrate  (uses migrations in src/lib/db/migrations)
```

### 3. Verify mock endpoints

```bash
curl http://localhost:3001/api/healthy
# → {"status":"ok","version":"2.1.0"}

curl http://localhost:3001/api/wrong-version
# → {"status":"ok","version":"1.9.0"}
```

### 4. Run the app (optional; dashboard in later phases)

```bash
npm run dev
# Open http://localhost:3000
```

---

## Project structure

- `src/app/` — Next.js App Router (dashboard, API routes)
- `src/lib/db/` — Drizzle schema, client, migrations
- `src/lib/poller/` — Health check poller (Phase 3)
- `src/lib/worker.ts` — Standalone worker entry (production ECS)
- `mock-services/` — Express mock server for demo endpoints
- `services.yaml` — Service definitions (YAML → DB sync in Phase 2)
- `terraform/` — AWS ECS/RDS/ALB (Phase 8)

---

## Scripts

| Command        | Description                    |
|----------------|--------------------------------|
| `npm run dev`  | Next.js dev server             |
| `npm run build`| Production build               |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:push`     | Push schema to DB (dev)    |
| `npm run db:migrate`  | Run migrations                |
| `npm run worker`      | Standalone poller (Phase 3)    |
| `npm run test`        | Vitest                         |

---

## Implementation roadmap

See [docs/research/prd.md](docs/research/prd.md) for the full PRD. Phases:

1. **Scaffolding & DB** — Done: Next.js, Drizzle schema, mock server, docker-compose
2. Config loading & service sync (YAML → DB)
3. Health check poller (instrumentation + worker)
4. API routes
5. Dashboard UI
6. Alerting & retention
7. Docker & polish
8. Terraform & AWS deployment
9. AI incident summary (stretch)
