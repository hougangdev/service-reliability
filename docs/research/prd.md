Product Requirements Document (PRD)
Product: ATS Service Reliability Monitor (Lightweight)

1. Overview

ATS teams operate multiple internal web services across heterogeneous environments (ECS, EC2, manual). After deployments, engineers lack a consistent way to confirm:

a service is up,

it’s running the expected version,

it isn’t degraded (e.g., high latency),

and failures are visible quickly and clearly.

This product provides a lightweight, self-hosted reliability monitor that periodically checks service endpoints, persists results, and surfaces latest health status via a minimal dashboard and API.

2. Goals and Non-Goals
   Goals

Provide a single pane of glass to view service health, version, and latency.

Detect availability issues and version drift from expected versions.

Persist check history for investigation and trend spotting.

Offer basic alerting on repeated failures.

Be easy to run locally and deploy (Docker-first).

Demonstrate operational maturity: timeouts, concurrency limits, logging, retention.

Non-Goals (for this take-home scope)

Full APM/tracing replacement (Datadog/New Relic).

Distributed synthetic monitoring with global PoPs.

Complex alert routing/escalation policies.

Full RBAC/SSO production auth (can be described as future work).

3. Target Users & Use Cases
   Primary Users

Platform/SRE/DevOps engineers supporting gov applications

Backend engineers performing deployments

Ops teams monitoring environments

Core Use Cases

Post-deploy verification: confirm expected version is running.

Incident triage: identify which services are down/degraded and since when.

Environment health: compare staging vs production status quickly.

Repeat failure detection: alert when a service is flapping or consistently failing.

4. User Experience Requirements
   Dashboard (Minimal UI)

Default view: All services with latest status.

Columns:

Service Name

Environment (staging/prod/etc.)

Status (UP/DOWN)

Latency (ms) (latest + optional p95 over last N)

Expected Version

Observed Version

Drift (Yes/No)

Last Checked (time)

Detail view: service-specific history (last 50 checks) with timestamps and error messages.

API (for integrations / debugging)

GET /api/services → list services with latest health snapshot

GET /api/services/:id → service metadata + latest snapshot

GET /api/services/:id/history?limit=50 → recent checks

(Optional) POST /api/run-once → trigger one polling cycle

(Optional) GET /api/incidents/summary?since=1h → AI summary / incident digest

5. Functional Requirements
   FR1: Service Configuration

Accept a configuration file (YAML/JSON) defining services:

name (string, required)

url (string, required)

expected_version (string, optional)

env (string, optional; default “default”)

version_path (optional; JSON path) or version_header (optional)

System loads config at startup; changes require restart (for take-home).

FR2: Periodic Health Checks

Polling interval configurable (default: 30s or 60s).

For each service:

perform HTTP request (GET by default; allow HEAD optional)

record:

availability (success boolean)

status code

latency in ms

observed version if available

error string on failure (timeout, DNS, TLS, non-2xx, parse error)

Concurrency limited (default 10).

Timeouts enforced (default 2–3s).

Avoid overlapping runs (a run lock).

FR3: Persistence

Store:

service definitions (from config) OR store only checks and derive metadata from config (either acceptable; pick one).

check history (append-only).

Use Postgres (your chosen stack) with a small schema.

Data retention:

Keep last N checks per service (default 500) OR last X days (default 7).

Retention runs periodically (e.g., daily) or after each poll.

FR4: Version Drift Detection

If expected_version exists and observed_version exists:

drift = observed != expected

Drift displayed on dashboard and returned in API.

FR5: Alerting on Repeated Failures (Stretch but recommended)

Define “incident” as ≥K consecutive failed checks (default K=3).

Alert channels:

Console log (required if implemented)

Webhook (optional): POST JSON payload {service, env, status, last_error, since, consecutive_failures}

Rate limit alerts (e.g., once per incident per 10 minutes).

FR6: AI Incident Summary (Optional)

Generate a short summary of incidents in a time window:

top failing services, duration, most common errors, version drift highlights

Must be best-effort (failure does not impact monitoring).

Should include citations to internal check records (IDs/timestamps).

6. Non-Functional Requirements
   NFR1: Reliability & Safety

No unbounded retries; max 1 retry with small jitter/backoff.

Graceful handling of invalid URLs, timeouts, and malformed JSON.

Polling should continue even if some services fail.

NFR2: Observability

Structured logs (at least consistent key-value):

run_id, service, env, latency_ms, status_code, ok, error

Basic internal health endpoint for the monitor itself:

GET /api/monitor/health returns “ok” and last run timestamp.

NFR3: Security

Secrets managed via environment variables (DB URL, webhook URL, LLM key).

Do not log sensitive tokens/headers.

Outbound-only HTTP calls; no inbound to targets beyond requests made by monitor.

(Production note) Dashboard should be protected behind VPN/SSO.

NFR4: Performance

Must handle at least 50 services polling every 60s on a small container.

Concurrency and timeouts prevent tail latency from blocking the whole run.

NFR5: Deployability

Dockerfile provided; docker-compose.yml recommended (app + Postgres).

Single command quickstart works.

7. Data Model (Proposed)
   Table: services

id UUID PK

name text unique

url text

env text

expected_version text null

created_at, updated_at

Table: service_checks

id bigserial PK

service_id UUID FK

checked_at timestamptz

ok boolean

status_code int null

latency_ms int null

observed_version text null

error text null

run_id UUID

Indexes:

service_checks(service_id, checked_at desc)

service_checks(checked_at desc)

8. Acceptance Criteria
   Must-have (Core)

Can load services from config.

Periodically checks endpoints and records ok/status/latency/version (when available).

Persists results in Postgres.

Exposes API endpoints for latest + history.

Provides a minimal dashboard OR API-only with clear documentation (dashboard recommended).

Runs via Docker (compose recommended).

Strongly recommended (High score)

Version drift detection visible.

Consecutive failure detection + webhook or console alerting.

Clear README with tradeoffs and deployment notes.

Basic retention policy.

Optional

AI incident summary endpoint.

Terraform blueprint (ECS + RDS) and monitoring plan.

9. Out of Scope / Future Enhancements

RBAC/SSO, multi-tenant separation by agency

SLA/SLO reporting and burn rate alerts

Canary checks, dependency graphs

Dashboard charts and long-term analytics

Distributed checks from multiple regions
