import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncServices } from "@/lib/config/sync";
import type { ServiceConfig } from "@/lib/config/schema";

// syncServices accepts injected deps — no DB connection needed in unit tests.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeConfig(overrides: Partial<ServiceConfig> = {}): ServiceConfig {
  return {
    name: "my-api",
    url: "http://localhost:3001/api/healthy",
    env: "default",
    expectedVersion: "2.1.0",
    versionPath: "$.version",
    ...overrides,
  };
}

function makeDbRow(overrides: object = {}) {
  return {
    id: "uuid-1",
    name: "my-api",
    url: "http://localhost:3001/api/healthy",
    env: "default",
    expectedVersion: "2.1.0",
    versionPath: "$.version",
    versionHeader: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("syncServices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a new service that does not exist in DB", async () => {
    const { insertedNames, updatedNames, deactivatedNames } =
      await syncServices([makeConfig()], {
        existingRows: [],
        insert: async (rows) => rows,
        update: async () => {},
      });

    expect(insertedNames).toContain("my-api");
    expect(updatedNames).toHaveLength(0);
    expect(deactivatedNames).toHaveLength(0);
  });

  it("updates an existing service when fields have changed", async () => {
    const existing = makeDbRow({ url: "http://old-url/api" });
    const config = makeConfig({ url: "http://localhost:3001/api/healthy" });

    const { insertedNames, updatedNames } = await syncServices([config], {
      existingRows: [existing],
      insert: async (rows) => rows,
      update: async () => {},
    });

    expect(updatedNames).toContain("my-api");
    expect(insertedNames).toHaveLength(0);
  });

  it("does not update a service when nothing has changed", async () => {
    const existing = makeDbRow();
    const config = makeConfig();

    const { insertedNames, updatedNames } = await syncServices([config], {
      existingRows: [existing],
      insert: async (rows) => rows,
      update: async () => {},
    });

    expect(updatedNames).toHaveLength(0);
    expect(insertedNames).toHaveLength(0);
  });

  it("soft-deletes (sets is_active=false) a service removed from config", async () => {
    const existing = makeDbRow({ name: "removed-api", isActive: true });

    const { deactivatedNames } = await syncServices(
      [makeConfig({ name: "kept-api", url: "http://localhost:3001/api/healthy" })],
      {
        existingRows: [existing, makeDbRow({ name: "kept-api" })],
        insert: async (rows) => rows,
        update: async () => {},
      }
    );

    expect(deactivatedNames).toContain("removed-api");
  });

  it("reactivates a service that reappears in config after being deactivated", async () => {
    const existing = makeDbRow({ isActive: false });
    const config = makeConfig();

    const { updatedNames } = await syncServices([config], {
      existingRows: [existing],
      insert: async (rows) => rows,
      update: async () => {},
    });

    expect(updatedNames).toContain("my-api");
  });

  it("handles an empty config list gracefully (deactivates all active)", async () => {
    const existing = makeDbRow({ isActive: true });

    const { deactivatedNames, insertedNames } = await syncServices([], {
      existingRows: [existing],
      insert: async (rows) => rows,
      update: async () => {},
    });

    expect(deactivatedNames).toContain("my-api");
    expect(insertedNames).toHaveLength(0);
  });

  it("returns summary counts that match operations performed", async () => {
    const result = await syncServices(
      [makeConfig({ name: "new-api", url: "http://localhost:3001/api/new" })],
      {
        existingRows: [makeDbRow({ name: "old-api", isActive: true })],
        insert: async (rows) => rows,
        update: async () => {},
      }
    );

    expect(result.insertedNames).toContain("new-api");
    expect(result.deactivatedNames).toContain("old-api");
  });
});
