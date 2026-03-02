import { randomUUID } from "crypto";
import pLimit from "p-limit";
import { checkService, type CheckResult } from "./checker";
import { extractVersion } from "./version";
import { evaluateAlert, makeDefaultFire } from "./alerting";
import { logger } from "@/lib/logger";
import type { Service, NewServiceCheck } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PollCycleDeps = {
  services: Service[];
  checkFn?: (input: { serviceId: string; url: string; timeoutMs: number }) => Promise<CheckResult>;
  persistFn?: (row: Omit<NewServiceCheck, "id">) => Promise<void>;
  concurrencyLimit?: number;
  timeoutMs?: number;
};

export type PollCycleSummary = {
  runId: string;
  total: number;
  succeeded: number;
  failed: number;
  durationMs: number;
};

// ---------------------------------------------------------------------------
// Per-service consecutive-failure state (in-memory; resets on restart)
// ---------------------------------------------------------------------------
const consecutiveFailures = new Map<string, number>();
const lastAlertAt = new Map<string, number>();

// ---------------------------------------------------------------------------
// Run lock — prevents overlapping poll cycles
// ---------------------------------------------------------------------------
let running = false;

export class PollCycleInProgressError extends Error {
  constructor() {
    super("Poll cycle already in progress");
    this.name = "PollCycleInProgressError";
  }
}

// ---------------------------------------------------------------------------
// Core cycle (injectable deps for unit tests)
// ---------------------------------------------------------------------------

export async function runPollCycle(deps: PollCycleDeps): Promise<PollCycleSummary> {
  if (running) throw new PollCycleInProgressError();
  running = true;

  try {
    const {
      services,
      checkFn = checkService,
      persistFn,
      concurrencyLimit = 10,
      timeoutMs = Number(process.env.CHECK_TIMEOUT_MS) || 3000,
    } = deps;

    const runId = randomUUID();
    const limit = pLimit(concurrencyLimit);
    const activeServices = services.filter((s) => s.isActive);
    const start = Date.now();

    let succeeded = 0;
    let failed = 0;

    const tasks = activeServices.map((svc) =>
      limit(async () => {
        let result: CheckResult;

        try {
          result = await checkFn({ serviceId: svc.id, url: svc.url, timeoutMs });
        } catch (err) {
          result = {
            ok: false,
            statusCode: null,
            latencyMs: 0,
            error: err instanceof Error ? err.message : String(err),
            responseText: null,
            responseHeaders: null,
          };
        }

        const observedVersion = result.ok
          ? extractVersion({
              responseText: result.responseText,
              versionPath: svc.versionPath,
              versionHeader: svc.versionHeader,
              headers: result.responseHeaders,
            })
          : null;

        const row: Omit<NewServiceCheck, "id"> = {
          serviceId: svc.id,
          ok: result.ok,
          statusCode: result.statusCode,
          latencyMs: result.latencyMs,
          observedVersion,
          error: result.error,
          runId,
          checkedAt: new Date(),
        };

        if (result.ok) {
          succeeded++;
          consecutiveFailures.set(svc.id, 0);
        } else {
          failed++;
          const prev = consecutiveFailures.get(svc.id) ?? 0;
          consecutiveFailures.set(svc.id, prev + 1);
        }

        const threshold = Number(process.env.ALERT_THRESHOLD) || 3;
        evaluateAlert({
          serviceName: svc.name,
          consecutiveFailures: consecutiveFailures.get(svc.id) ?? 0,
          threshold,
          lastError: result.error,
          lastAlertAt: lastAlertAt.get(svc.id) ?? null,
          rateLimitMs: 600_000,
          fire: (payload) => {
            lastAlertAt.set(svc.id, Date.now());
            makeDefaultFire(process.env.ALERT_WEBHOOK_URL)(payload);
          },
        });

        logger.info(
          {
            run_id: runId,
            service: svc.name,
            env: svc.env,
            ok: result.ok,
            status_code: result.statusCode,
            latency_ms: result.latencyMs,
            observed_version: observedVersion,
            error: result.error,
          },
          `check ${result.ok ? "ok" : "failed"}: ${svc.name}`
        );

        if (persistFn) {
          await persistFn(row);
        }
      })
    );

    await Promise.all(tasks);

    return {
      runId,
      total: activeServices.length,
      succeeded,
      failed,
      durationMs: Date.now() - start,
    };
  } finally {
    running = false;
  }
}

// ---------------------------------------------------------------------------
// DB-wired persist helper
// ---------------------------------------------------------------------------

async function persistCheck(row: Omit<NewServiceCheck, "id">): Promise<void> {
  const { db, serviceChecks } = await import("@/lib/db");
  await db.insert(serviceChecks).values(row);
}

// ---------------------------------------------------------------------------
// startPoller — long-running loop, called from instrumentation + worker
// ---------------------------------------------------------------------------

export async function startPoller(): Promise<void> {
  const { db, services } = await import("@/lib/db");
  const { loadConfigFile } = await import("@/lib/config/loader");
  const { syncServicesFromConfig } = await import("@/lib/config/sync");

  const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS) || 30_000;

  logger.info({ pollIntervalMs }, "Poller starting");

  // Load config and sync services to DB on startup
  const config = await loadConfigFile();
  const syncResult = await syncServicesFromConfig(config.services);
  logger.info(syncResult, "Service sync complete");

  const poll = async () => {
    try {
      const allServices = await db.select().from(services);
      const summary = await runPollCycle({
        services: allServices,
        persistFn: persistCheck,
      });
      logger.info(summary, "Poll cycle complete");

      // Run retention after each successful cycle (best-effort, outside lock)
      const { runRetentionFromDb } = await import("@/lib/retention");
      await runRetentionFromDb({
        retentionDays: Number(process.env.RETENTION_DAYS) || 7,
        maxPerService: Number(process.env.MAX_CHECKS_PER_SERVICE) || 500,
      });
    } catch (err) {
      if (err instanceof PollCycleInProgressError) {
        logger.warn("Poll cycle still running — skipping this tick");
      } else {
        logger.error({ err }, "Poll cycle error");
      }
    }
  };

  // Run immediately, then on interval
  await poll();
  setInterval(poll, pollIntervalMs);
}
