import { desc, eq, sql } from "drizzle-orm";
import { db, services, serviceChecks } from "@/lib/db";
import type { Service, ServiceCheck } from "@/lib/db/schema";
import type {
  CheckSnapshot,
  ServiceSummary,
  ServiceDetail,
  HistoryCheck,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSnapshot(check: ServiceCheck): CheckSnapshot {
  return {
    ok: check.ok,
    statusCode: check.statusCode,
    latencyMs: check.latencyMs,
    observedVersion: check.observedVersion,
    error: check.error,
    checkedAt: check.checkedAt.toISOString(),
  };
}

function drift(
  expectedVersion: string | null | undefined,
  observedVersion: string | null | undefined
): boolean | null {
  if (!expectedVersion || !observedVersion) return null;
  return expectedVersion !== observedVersion;
}

function toSummary(svc: Service, latest: ServiceCheck | null): ServiceSummary {
  return {
    id: svc.id,
    name: svc.name,
    url: svc.url,
    env: svc.env,
    expectedVersion: svc.expectedVersion,
    isActive: svc.isActive,
    drift: drift(svc.expectedVersion, latest?.observedVersion),
    latest: latest ? toSnapshot(latest) : null,
  };
}

function toDetail(svc: Service, latest: ServiceCheck | null): ServiceDetail {
  return {
    ...toSummary(svc, latest),
    versionPath: svc.versionPath,
    versionHeader: svc.versionHeader,
    createdAt: svc.createdAt.toISOString(),
    updatedAt: svc.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Query: all services with their latest check
// ---------------------------------------------------------------------------

export async function queryAllServices(): Promise<ServiceSummary[]> {
  const allServices = await db.select().from(services).orderBy(services.name);

  if (allServices.length === 0) return [];

  // Fetch the single most recent check per service via a lateral-style subquery
  const latestChecks = await db
    .selectDistinctOn([serviceChecks.serviceId], {
      serviceId: serviceChecks.serviceId,
      id: serviceChecks.id,
      ok: serviceChecks.ok,
      statusCode: serviceChecks.statusCode,
      latencyMs: serviceChecks.latencyMs,
      observedVersion: serviceChecks.observedVersion,
      error: serviceChecks.error,
      checkedAt: serviceChecks.checkedAt,
      runId: serviceChecks.runId,
    })
    .from(serviceChecks)
    .orderBy(serviceChecks.serviceId, desc(serviceChecks.checkedAt));

  const latestByServiceId = new Map(latestChecks.map((c) => [c.serviceId, c]));

  return allServices.map((svc) => {
    const latest = latestByServiceId.get(svc.id) ?? null;
    return toSummary(svc, latest as ServiceCheck | null);
  });
}

// ---------------------------------------------------------------------------
// Query: single service by id
// ---------------------------------------------------------------------------

export async function queryServiceById(id: string): Promise<ServiceDetail | null> {
  const [svc] = await db
    .select()
    .from(services)
    .where(eq(services.id, id))
    .limit(1);

  if (!svc) return null;

  const [latest] = await db
    .select()
    .from(serviceChecks)
    .where(eq(serviceChecks.serviceId, id))
    .orderBy(desc(serviceChecks.checkedAt))
    .limit(1);

  return toDetail(svc, latest ?? null);
}

// ---------------------------------------------------------------------------
// Query: check history for a service
// ---------------------------------------------------------------------------

export async function queryServiceHistory(
  serviceId: string,
  limit: number
): Promise<{ checks: HistoryCheck[]; total: number }> {
  const [countRow] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(serviceChecks)
    .where(eq(serviceChecks.serviceId, serviceId));

  const rows = await db
    .select()
    .from(serviceChecks)
    .where(eq(serviceChecks.serviceId, serviceId))
    .orderBy(desc(serviceChecks.checkedAt))
    .limit(limit);

  const checks: HistoryCheck[] = rows.map((c) => ({
    id: c.id,
    ok: c.ok,
    statusCode: c.statusCode,
    latencyMs: c.latencyMs,
    observedVersion: c.observedVersion,
    error: c.error,
    checkedAt: c.checkedAt.toISOString(),
    runId: c.runId,
  }));

  return { checks, total: countRow?.count ?? 0 };
}

// ---------------------------------------------------------------------------
// Query: last run timestamp (for monitor/health)
// ---------------------------------------------------------------------------

export async function queryLastRunAt(): Promise<Date | null> {
  const [row] = await db
    .select({ checkedAt: serviceChecks.checkedAt })
    .from(serviceChecks)
    .orderBy(desc(serviceChecks.checkedAt))
    .limit(1);

  return row?.checkedAt ?? null;
}
