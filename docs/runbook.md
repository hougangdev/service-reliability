# Production Operations Runbook

Day-to-day operations guide for the Service Reliability Monitor in production.

---

## Health Checks

### Endpoint

```
GET /api/monitor/health
```

Returns `200` with `{ "ok": true }` when the poller is running normally. Returns `503` when stale.

### Stale Detection

The health endpoint compares the timestamp of the last completed poll cycle against a threshold of **3x the poll interval** (default: 90 seconds for a 30s interval). If the last poll is older than this threshold, the endpoint returns:

```json
{
  "ok": false,
  "lastRunAt": "2026-01-01T00:00:00.000Z",
  "message": "Poller is stale: last run 120s ago exceeds 90s threshold"
}
```

A `null` `lastRunAt` (fresh deployment, first poll hasn't run yet) is **not** considered stale.

### Recommendation

Point an external uptime monitor (UptimeRobot, Pingdom, or a simple cron curl) at the health endpoint. Alert if it returns non-200 for more than 2 consecutive checks. This gives you monitoring-of-the-monitor without relying on the system itself.

---

## Log Locations & Format

### Format

- **Development:** Pretty-printed via `pino-pretty`
- **Production:** Structured JSON (pino) — one JSON object per line

### Where Logs Go

App Runner streams stdout/stderr to **CloudWatch Logs**. Log groups are auto-created by App Runner:

```
/aws/apprunner/service-monitor-web/<instance-id>
/aws/apprunner/service-monitor-mock/<instance-id>
```

### Useful CloudWatch Insights Queries

**Failed health checks in the last hour:**
```
fields @timestamp, service, env, status_code, error
| filter ok = false
| sort @timestamp desc
| limit 50
```

**Poll cycle durations:**
```
fields @timestamp, run_id, durationMs, total, succeeded, failed
| filter @message like "Poll cycle complete"
| sort @timestamp desc
| limit 20
```

**Alert firings:**
```
fields @timestamp, service, consecutiveFailures, lastError
| filter alert = true
| sort @timestamp desc
```

**Retention cleanup activity:**
```
fields @timestamp, deletedByAge, deletedByCount, total
| filter @message like "Retention run complete"
| sort @timestamp desc
```

---

## Common Issues

| Symptom | Cause | Resolution |
|---|---|---|
| **No data on dashboard** | Database is empty — poller hasn't run a cycle yet, or DB was just migrated | Check `/api/monitor/health` — if `lastRunAt` is null, the poller is starting up. Wait for the first cycle (up to 30s). If health returns 503, check App Runner logs for startup errors. |
| **All services showing "down"** | Network issue between App Runner and monitored endpoints, or DNS resolution failure | Check if the monitored URLs are reachable from within AWS. App Runner runs in AWS-managed VPC — outbound HTTPS should work, but private endpoints behind VPNs won't be reachable. |
| **Poll cycle overlap warning** | A poll cycle is taking longer than the poll interval (30s default) | Increase `POLL_INTERVAL_MS`, reduce `CONCURRENCY_LIMIT`, or investigate slow-responding services. The run lock prevents data corruption but skipped ticks mean gaps in monitoring. |
| **Health endpoint returns 503 (stale)** | Poller crashed, process hung, or long GC pause | Check App Runner logs for errors. If the process is running but stale, restart the App Runner service. Stale threshold is 3x poll interval. |
| **AI summary returns 503** | `ANTHROPIC_API_KEY` not configured, or Claude API is down | Verify the env var is set. The AI summary endpoint degrades gracefully — the rest of the system works without it. |
| **Alerts not firing** | Failures haven't reached the threshold (default 3 consecutive), or rate limit active (10 min) | Check consecutive failure count in logs. A service must fail `ALERT_THRESHOLD` times in a row before an alert fires, and then won't fire again for the same service for 10 minutes. |
| **Duplicate alerts after restart** | In-memory alert state resets on process restart | Expected behavior. After restart, the failure counter starts from zero. If a service is still down, it will take `ALERT_THRESHOLD` cycles before alerting again. |

---

## Scaling

### Current Setup

- **Web service:** Single App Runner instance (1 vCPU, 2 GB RAM)
- **Mock service:** Single App Runner instance (1 vCPU, 2 GB RAM)
- **Database:** `db.t3.micro`, single-AZ, 20 GB gp3

### Horizontal Scaling Warning

App Runner can auto-scale the web service based on request concurrency. However, the poller runs embedded in the Next.js process — **multiple instances = multiple pollers hitting the same services simultaneously**. This causes:

- Duplicate check data in the database
- Duplicate alert webhooks
- Increased load on monitored services

If horizontal scaling is needed, separate the poller into the standalone worker (`src/worker.ts`) and deploy it as a single instance. The worker Dockerfile target exists but isn't wired into CI/CD yet. See [architecture notes](./architecture.md#key-design-choices).

### Database Connection Limits

`db.t3.micro` supports approximately 85 connections. Each App Runner instance opens a small connection pool. Monitor `pg_stat_activity` if you scale beyond a few instances.

---

## Database Maintenance

### Automated Retention

The poller runs retention cleanup after each successful poll cycle:

- **Age-based:** Deletes checks older than 7 days (configurable via `RETENTION_DAYS`)
- **Count-based:** Caps at 500 checks per service (configurable via `MAX_CHECKS_PER_SERVICE`)

At the default 30-second poll interval, a single service generates ~20,160 checks per week. The dual retention strategy keeps the table manageable.

### RDS Backups

- **Automated backups:** 7-day retention (configured in Terraform)
- **Point-in-time recovery:** Available within the backup retention window
- **`skip_final_snapshot = true`:** The RDS instance is configured to **not** create a final snapshot on deletion. If you run `terraform destroy`, the database and all data are permanently lost.

### Manual Backup

```bash
pg_dump -h <rds-endpoint> -U postgres -d service_monitor > backup_$(date +%Y%m%d).sql
```

### Migrations

Drizzle migrations run automatically on container startup (via `scripts/start.sh`). Migrations are forward-only — there is no built-in rollback mechanism. Test migrations locally before deploying.

---

## Alert Handling

### How Alerts Work

1. Each service tracks **consecutive failures** in memory (resets on success or process restart)
2. When failures reach the threshold (default: 3, configurable via `ALERT_THRESHOLD`), an alert fires
3. Alerts are **rate-limited** to 1 per service per 10 minutes — prevents alert storms during extended outages
4. The `since` field estimates when the incident started based on failure count and poll interval

### Webhook Payload

Alerts POST JSON to the URL in `ALERT_WEBHOOK_URL`:

```json
{
  "service": "Failing API",
  "consecutiveFailures": 3,
  "lastError": "Request failed with status code 503",
  "since": "2026-01-01T00:00:00.000Z"
}
```

This format is compatible with Slack incoming webhooks (as a raw payload), Discord webhooks, and PagerDuty Events API v2 (with a middleware transform).

### No Recovery Alerts

The system does **not** send a recovery/resolved alert when a service comes back up. The failure counter silently resets to zero on the next successful check. If you need recovery notifications, this would require adding an explicit state transition check in the alert evaluation logic.

### State Reset on Restart

Alert state (consecutive failures and last-alert timestamps) is stored in process memory. A restart — whether from a deploy, crash, or manual action — resets all alert state. This means:

- A previously-alerting service will need to fail `ALERT_THRESHOLD` more times before alerting again
- No false "resolved" notifications are sent on restart

---

## Monitoring the Monitor

The system can't alert you if it's the thing that's down. Set up external monitoring:

### Recommended Setup

1. **External uptime check** (UptimeRobot, Pingdom, BetterUptime) pointing at:
   ```
   https://<your-app-runner-url>/api/monitor/health
   ```
2. **Alert if:** Non-200 response for 2+ consecutive checks (covers both downtime and stale poller)
3. **Escalation:** Route external monitor alerts to PagerDuty/OpsGenie for on-call notification

### CloudWatch Alarms (Alternative)

App Runner publishes basic metrics to CloudWatch. You can create alarms for:

- `5xxCount` — App Runner service returning errors
- `RequestCount` dropping to zero — service may be unreachable
- RDS `FreeStorageSpace` — disk approaching capacity
