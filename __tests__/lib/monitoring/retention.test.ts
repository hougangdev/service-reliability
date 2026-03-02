import { describe, it, expect, vi, beforeEach } from "vitest";
import { runRetention } from "@/lib/monitoring/retention";
import type { RetentionDeps } from "@/lib/monitoring/retention";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides: Partial<RetentionDeps> = {}): RetentionDeps {
  return {
    deleteChecksOlderThan: vi.fn().mockResolvedValue(0),
    getAllServiceIds: vi.fn().mockResolvedValue([]),
    countChecksForService: vi.fn().mockResolvedValue(0),
    deleteExcessChecksForService: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Age-based retention
// ---------------------------------------------------------------------------
describe("runRetention — age-based deletion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls deleteChecksOlderThan with a cutoff ~7 days ago by default", async () => {
    const deps = makeDeps();
    const before = Date.now();
    await runRetention(deps);
    const after = Date.now();

    const [cutoff] = vi.mocked(deps.deleteChecksOlderThan).mock.calls[0];
    const cutoffMs = cutoff.getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    expect(cutoffMs).toBeGreaterThanOrEqual(before - sevenDays - 100);
    expect(cutoffMs).toBeLessThanOrEqual(after - sevenDays + 100);
  });

  it("respects custom retentionDays option", async () => {
    const deps = makeDeps();
    const before = Date.now();
    await runRetention(deps, { retentionDays: 14 });
    const after = Date.now();

    const [cutoff] = vi.mocked(deps.deleteChecksOlderThan).mock.calls[0];
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - fourteenDays - 100);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - fourteenDays + 100);
  });

  it("returns the number of rows deleted by age", async () => {
    const deps = makeDeps({ deleteChecksOlderThan: vi.fn().mockResolvedValue(42) });
    const result = await runRetention(deps);
    expect(result.deletedByAge).toBe(42);
  });

  it("handles zero rows deleted gracefully", async () => {
    const deps = makeDeps({ deleteChecksOlderThan: vi.fn().mockResolvedValue(0) });
    const result = await runRetention(deps);
    expect(result.deletedByAge).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Per-service count-based retention
// ---------------------------------------------------------------------------
describe("runRetention — per-service count cap", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not delete when service check count is within limit", async () => {
    const deps = makeDeps({
      getAllServiceIds: vi.fn().mockResolvedValue(["svc-1"]),
      countChecksForService: vi.fn().mockResolvedValue(100),
    });
    await runRetention(deps, { maxPerService: 500 });
    expect(deps.deleteExcessChecksForService).not.toHaveBeenCalled();
  });

  it("deletes excess when service has more than maxPerService checks", async () => {
    const deps = makeDeps({
      getAllServiceIds: vi.fn().mockResolvedValue(["svc-1"]),
      countChecksForService: vi.fn().mockResolvedValue(600),
      deleteExcessChecksForService: vi.fn().mockResolvedValue(100),
    });
    await runRetention(deps, { maxPerService: 500 });
    expect(deps.deleteExcessChecksForService).toHaveBeenCalledWith("svc-1", 500);
  });

  it("processes all services independently", async () => {
    const deps = makeDeps({
      getAllServiceIds: vi.fn().mockResolvedValue(["svc-1", "svc-2", "svc-3"]),
      countChecksForService: vi.fn().mockResolvedValue(600),
      deleteExcessChecksForService: vi.fn().mockResolvedValue(100),
    });
    await runRetention(deps, { maxPerService: 500 });
    expect(deps.deleteExcessChecksForService).toHaveBeenCalledTimes(3);
  });

  it("accumulates total excess deleted across services", async () => {
    const deps = makeDeps({
      getAllServiceIds: vi.fn().mockResolvedValue(["svc-1", "svc-2"]),
      countChecksForService: vi.fn().mockResolvedValue(600),
      deleteExcessChecksForService: vi.fn().mockResolvedValue(100),
    });
    const result = await runRetention(deps, { maxPerService: 500 });
    expect(result.deletedByCount).toBe(200);
  });

  it("handles services with zero checks without calling delete", async () => {
    const deps = makeDeps({
      getAllServiceIds: vi.fn().mockResolvedValue(["svc-1"]),
      countChecksForService: vi.fn().mockResolvedValue(0),
    });
    await runRetention(deps, { maxPerService: 500 });
    expect(deps.deleteExcessChecksForService).not.toHaveBeenCalled();
  });

  it("handles empty service list gracefully", async () => {
    const deps = makeDeps({ getAllServiceIds: vi.fn().mockResolvedValue([]) });
    const result = await runRetention(deps);
    expect(result.deletedByCount).toBe(0);
    expect(deps.countChecksForService).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Combined result
// ---------------------------------------------------------------------------
describe("runRetention — result totals", () => {
  it("returns correct total combining both deletion types", async () => {
    const deps = makeDeps({
      deleteChecksOlderThan: vi.fn().mockResolvedValue(15),
      getAllServiceIds: vi.fn().mockResolvedValue(["svc-1"]),
      countChecksForService: vi.fn().mockResolvedValue(600),
      deleteExcessChecksForService: vi.fn().mockResolvedValue(100),
    });
    const result = await runRetention(deps, { maxPerService: 500 });
    expect(result.deletedByAge).toBe(15);
    expect(result.deletedByCount).toBe(100);
    expect(result.total).toBe(115);
  });
});
