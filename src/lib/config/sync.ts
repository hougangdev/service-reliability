import { eq } from "drizzle-orm";
import type { ServiceConfig } from "./schema";
import type { Service } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncDeps = {
  existingRows: Service[];
  insert: (rows: Omit<Service, "id" | "createdAt" | "updatedAt">[]) => Promise<unknown>;
  update: (id: string, fields: Partial<Service>) => Promise<void>;
};

export type SyncResult = {
  insertedNames: string[];
  updatedNames: string[];
  deactivatedNames: string[];
};

// ---------------------------------------------------------------------------
// Pure sync logic (injectable deps — easy to unit test without a DB)
// ---------------------------------------------------------------------------

export async function syncServices(
  configs: ServiceConfig[],
  deps: SyncDeps
): Promise<SyncResult> {
  const { existingRows, insert, update } = deps;

  const insertedNames: string[] = [];
  const updatedNames: string[] = [];
  const deactivatedNames: string[] = [];

  const configByName = new Map(configs.map((c) => [c.name, c]));
  const existingByName = new Map(existingRows.map((r) => [r.name, r]));

  // 1. Insert or update services present in config
  const toInsert: Omit<Service, "id" | "createdAt" | "updatedAt">[] = [];

  for (const config of configs) {
    const existing = existingByName.get(config.name);

    if (!existing) {
      toInsert.push({
        name: config.name,
        url: config.url,
        env: config.env,
        expectedVersion: config.expectedVersion ?? null,
        versionPath: config.versionPath ?? null,
        versionHeader: config.versionHeader ?? null,
        isActive: true,
      });
      insertedNames.push(config.name);
    } else {
      const changed =
        existing.url !== config.url ||
        existing.env !== config.env ||
        (existing.expectedVersion ?? undefined) !== config.expectedVersion ||
        (existing.versionPath ?? undefined) !== config.versionPath ||
        (existing.versionHeader ?? undefined) !== config.versionHeader ||
        !existing.isActive;

      if (changed) {
        await update(existing.id, {
          url: config.url,
          env: config.env,
          expectedVersion: config.expectedVersion ?? null,
          versionPath: config.versionPath ?? null,
          versionHeader: config.versionHeader ?? null,
          isActive: true,
        });
        updatedNames.push(config.name);
      }
    }
  }

  if (toInsert.length > 0) {
    await insert(toInsert);
  }

  // 2. Soft-delete active services no longer present in config
  for (const row of existingRows) {
    if (row.isActive && !configByName.has(row.name)) {
      await update(row.id, { isActive: false });
      deactivatedNames.push(row.name);
    }
  }

  return { insertedNames, updatedNames, deactivatedNames };
}

// ---------------------------------------------------------------------------
// DB-wired version (used by instrumentation + worker)
// ---------------------------------------------------------------------------

export async function syncServicesFromConfig(
  configs: ServiceConfig[]
): Promise<SyncResult> {
  const { db, services } = await import("@/lib/db");

  const existingRows = await db.select().from(services);

  return syncServices(configs, {
    existingRows,
    insert: async (rows) => {
      if (rows.length === 0) return;
      await db.insert(services).values(
        rows.map((r) => ({
          name: r.name,
          url: r.url,
          env: r.env,
          expectedVersion: r.expectedVersion,
          versionPath: r.versionPath,
          versionHeader: r.versionHeader,
          isActive: r.isActive,
        }))
      );
    },
    update: async (id, fields) => {
      await db
        .update(services)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(services.id, id));
    },
  });
}
