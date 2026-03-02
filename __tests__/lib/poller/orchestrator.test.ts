import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runPollCycle, PollCycleInProgressError } from "@/lib/poller";
import type { Service } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: "svc-1",
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
describe("runPollCycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls checkFn once per active service", async () => {
    const checkFn = vi.fn().mockResolvedValue({
      ok: true, statusCode: 200, latencyMs: 50,
      responseText: '{"version":"2.1.0"}', responseHeaders: null, error: null,
    });
    const persistFn = vi.fn().mockResolvedValue(undefined);

    const services = [makeService({ id: "s1" }), makeService({ id: "s2", name: "other" })];
    await runPollCycle({ services, checkFn, persistFn, concurrencyLimit: 10 });

    expect(checkFn).toHaveBeenCalledTimes(2);
    expect(persistFn).toHaveBeenCalledTimes(2);
  });

  it("skips inactive services", async () => {
    const checkFn = vi.fn().mockResolvedValue({
      ok: true, statusCode: 200, latencyMs: 50,
      responseText: null, responseHeaders: null, error: null,
    });
    const persistFn = vi.fn().mockResolvedValue(undefined);

    const services = [
      makeService({ id: "s1", isActive: true }),
      makeService({ id: "s2", name: "inactive", isActive: false }),
    ];
    await runPollCycle({ services, checkFn, persistFn, concurrencyLimit: 10 });

    expect(checkFn).toHaveBeenCalledTimes(1);
  });

  it("persists ok=false when check throws (error isolation)", async () => {
    const checkFn = vi.fn().mockRejectedValueOnce(new Error("unexpected crash"));
    const persistFn = vi.fn().mockResolvedValue(undefined);

    await runPollCycle({
      services: [makeService()],
      checkFn,
      persistFn,
      concurrencyLimit: 10,
    });

    expect(persistFn).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: expect.stringContaining("unexpected crash") })
    );
  });

  it("respects concurrency limit (all tasks complete)", async () => {
    // 5 services all resolve fine — assert all persisted
    const checkFn = vi.fn().mockResolvedValue({
      ok: true, statusCode: 200, latencyMs: 10,
      responseText: null, responseHeaders: null, error: null,
    });
    const persistFn = vi.fn().mockResolvedValue(undefined);

    const services = Array.from({ length: 5 }, (_, i) =>
      makeService({ id: `s${i}`, name: `svc-${i}` })
    );
    await runPollCycle({ services, checkFn, persistFn, concurrencyLimit: 2 });

    expect(persistFn).toHaveBeenCalledTimes(5);
  });

  it("detects version drift and includes it in persisted result", async () => {
    const checkFn = vi.fn().mockResolvedValue({
      ok: true, statusCode: 200, latencyMs: 10,
      responseText: '{"version":"1.9.0"}',
      responseHeaders: null, error: null,
    });
    const persistFn = vi.fn().mockResolvedValue(undefined);

    await runPollCycle({
      services: [makeService({ expectedVersion: "2.1.0", versionPath: "$.version" })],
      checkFn,
      persistFn,
      concurrencyLimit: 10,
    });

    expect(persistFn).toHaveBeenCalledWith(
      expect.objectContaining({ observedVersion: "1.9.0" })
    );
  });

  it("groups all checks in one cycle under the same runId", async () => {
    const checkFn = vi.fn().mockResolvedValue({
      ok: true, statusCode: 200, latencyMs: 10,
      responseText: null, responseHeaders: null, error: null,
    });
    const capturedRunIds: string[] = [];
    const persistFn = vi.fn().mockImplementation(async (row) => {
      capturedRunIds.push(row.runId);
    });

    const services = [makeService({ id: "s1" }), makeService({ id: "s2", name: "other" })];
    await runPollCycle({ services, checkFn, persistFn, concurrencyLimit: 10 });

    expect(capturedRunIds[0]).toBe(capturedRunIds[1]);
    expect(capturedRunIds[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("defaults to CHECK_TIMEOUT_MS=3000 when not specified", async () => {
    // Ensure env var is not set so we exercise the fallback
    const prev = process.env.CHECK_TIMEOUT_MS;
    delete process.env.CHECK_TIMEOUT_MS;

    const checkFn = vi.fn().mockResolvedValue({
      ok: true, statusCode: 200, latencyMs: 10,
      responseText: null, responseHeaders: null, error: null,
    });

    await runPollCycle({
      services: [makeService()],
      checkFn,
      persistFn: vi.fn().mockResolvedValue(undefined),
    });

    expect(checkFn).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 3000 })
    );

    // Restore
    if (prev !== undefined) process.env.CHECK_TIMEOUT_MS = prev;
  });

  it("returns a summary with per-service outcomes", async () => {
    const checkFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, statusCode: 200, latencyMs: 10, responseText: null, responseHeaders: null, error: null })
      .mockResolvedValueOnce({ ok: false, statusCode: 503, latencyMs: 50, responseText: null, responseHeaders: null, error: "503" });
    const persistFn = vi.fn().mockResolvedValue(undefined);

    const services = [makeService({ id: "s1" }), makeService({ id: "s2", name: "failing" })];
    const summary = await runPollCycle({ services, checkFn, persistFn, concurrencyLimit: 10 });

    expect(summary.total).toBe(2);
    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Run lock
// ---------------------------------------------------------------------------
describe("runPollCycle run lock", () => {
  it("throws PollCycleInProgressError when called while already running", async () => {
    // Use a checkFn that hangs until we resolve it manually
    let resolveCheck!: () => void;
    const slowCheckFn = vi.fn().mockImplementation(
      () => new Promise<ReturnType<typeof slowCheckFn>>((resolve) => {
        resolveCheck = () => resolve({
          ok: true, statusCode: 200, latencyMs: 10,
          responseText: null, responseHeaders: null, error: null,
        });
      })
    );

    const services = [makeService()];
    const first = runPollCycle({ services, checkFn: slowCheckFn });

    // Second call should throw while first is still in progress
    await expect(
      runPollCycle({ services, checkFn: slowCheckFn })
    ).rejects.toThrow(PollCycleInProgressError);

    // Clean up: resolve the hanging check so first call completes
    resolveCheck();
    await first;
  });

  it("releases lock after successful completion (sequential calls succeed)", async () => {
    const checkFn = vi.fn().mockResolvedValue({
      ok: true, statusCode: 200, latencyMs: 10,
      responseText: null, responseHeaders: null, error: null,
    });
    const services = [makeService()];

    await runPollCycle({ services, checkFn });
    // Second call should succeed — lock was released
    await expect(runPollCycle({ services, checkFn })).resolves.toBeDefined();
  });

  it("releases lock after error (persistFn throws, next call succeeds)", async () => {
    const checkFn = vi.fn().mockResolvedValue({
      ok: true, statusCode: 200, latencyMs: 10,
      responseText: null, responseHeaders: null, error: null,
    });
    const failingPersist = vi.fn().mockRejectedValue(new Error("db write failed"));
    const services = [makeService()];

    // First call should throw because persistFn fails
    await expect(
      runPollCycle({ services, checkFn, persistFn: failingPersist })
    ).rejects.toThrow("db write failed");

    // Lock should be released — next call with working persist succeeds
    const okPersist = vi.fn().mockResolvedValue(undefined);
    await expect(
      runPollCycle({ services, checkFn, persistFn: okPersist })
    ).resolves.toBeDefined();
  });
});
