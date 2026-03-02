import { lt, sql, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RetentionDeps = {
  deleteChecksOlderThan: (cutoff: Date) => Promise<number>;
  getAllServiceIds: () => Promise<string[]>;
  countChecksForService: (serviceId: string) => Promise<number>;
  deleteExcessChecksForService: (serviceId: string, keepCount: number) => Promise<number>;
};

export type RetentionOptions = {
  retentionDays?: number;
  maxPerService?: number;
};

export type RetentionResult = {
  deletedByAge: number;
  deletedByCount: number;
  total: number;
};

// ---------------------------------------------------------------------------
// Pure retention logic (injectable deps — no DB in unit tests)
// ---------------------------------------------------------------------------

export async function runRetention(
  deps: RetentionDeps,
  options: RetentionOptions = {}
): Promise<RetentionResult> {
  const retentionDays = options.retentionDays ?? 7;
  const maxPerService = options.maxPerService ?? 500;

  // 1. Delete checks older than the retention window
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const deletedByAge = await deps.deleteChecksOlderThan(cutoff);

  // 2. Cap per-service check count
  const serviceIds = await deps.getAllServiceIds();
  let deletedByCount = 0;

  for (const id of serviceIds) {
    const count = await deps.countChecksForService(id);
    if (count > maxPerService) {
      deletedByCount += await deps.deleteExcessChecksForService(id, maxPerService);
    }
  }

  return { deletedByAge, deletedByCount, total: deletedByAge + deletedByCount };
}

// ---------------------------------------------------------------------------
// DB-wired implementation
// ---------------------------------------------------------------------------

export async function runRetentionFromDb(
  options: RetentionOptions = {}
): Promise<RetentionResult> {
  const { db, serviceChecks, services } = await import("@/lib/db");

  const deps: RetentionDeps = {
    deleteChecksOlderThan: async (cutoff) => {
      const result = await db
        .delete(serviceChecks)
        .where(lt(serviceChecks.checkedAt, cutoff));
      return result.rowCount ?? 0;
    },

    getAllServiceIds: async () => {
      const rows = await db.select({ id: services.id }).from(services);
      return rows.map((r) => r.id);
    },

    countChecksForService: async (serviceId) => {
      const [row] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(serviceChecks)
        .where(eq(serviceChecks.serviceId, serviceId));
      return row?.count ?? 0;
    },

    deleteExcessChecksForService: async (serviceId, keepCount) => {
      // Delete all rows for this service that are NOT in the most recent `keepCount`
      const result = await db.execute(sql`
        DELETE FROM service_checks
        WHERE service_id = ${serviceId}
          AND id NOT IN (
            SELECT id FROM service_checks
            WHERE service_id = ${serviceId}
            ORDER BY checked_at DESC
            LIMIT ${keepCount}
          )
      `);
      return (result as { rowCount?: number }).rowCount ?? 0;
    },
  };

  const result = await runRetention(deps, options);

  if (result.total > 0) {
    logger.info(result, "Retention run complete");
  }

  return result;
}
