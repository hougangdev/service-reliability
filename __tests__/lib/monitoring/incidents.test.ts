import { describe, it, expect } from "vitest";
import { detectIncidents, type ServiceWithChecks } from "@/lib/monitoring/incidents";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeService(overrides: Partial<ServiceWithChecks> = {}): ServiceWithChecks {
  return {
    id: "uuid-1",
    name: "test-api",
    url: "http://test/api",
    env: "demo",
    expectedVersion: "1.0.0",
    isActive: true,
    drift: false,
    latest: {
      ok: true,
      statusCode: 200,
      latencyMs: 100,
      observedVersion: "1.0.0",
      error: null,
      checkedAt: new Date().toISOString(),
    },
    recentChecks: [
      { ok: true, latencyMs: 100, checkedAt: new Date().toISOString() },
      { ok: true, latencyMs: 120, checkedAt: new Date().toISOString() },
      { ok: true, latencyMs: 90, checkedAt: new Date().toISOString() },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectIncidents", () => {
  it("returns empty array when all services are healthy", () => {
    const result = detectIncidents([makeService()]);
    expect(result).toEqual([]);
  });

  it("detects DOWN service (critical)", () => {
    const svc = makeService({
      name: "failing-api",
      latest: {
        ok: false,
        statusCode: 503,
        latencyMs: null,
        observedVersion: null,
        error: "Connection refused",
        checkedAt: new Date().toISOString(),
      },
    });
    const result = detectIncidents([svc]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("down");
    expect(result[0].severity).toBe("critical");
    expect(result[0].serviceName).toBe("failing-api");
    expect(result[0].details).toContain("503");
    expect(result[0].details).toContain("Connection refused");
  });

  it("detects flapping service (warning)", () => {
    const svc = makeService({
      name: "flaky-api",
      recentChecks: [
        { ok: true, latencyMs: 100, checkedAt: "2024-01-01T00:05:00Z" },
        { ok: false, latencyMs: null, checkedAt: "2024-01-01T00:04:00Z" },
        { ok: false, latencyMs: null, checkedAt: "2024-01-01T00:03:00Z" },
        { ok: true, latencyMs: 90, checkedAt: "2024-01-01T00:02:00Z" },
        { ok: false, latencyMs: null, checkedAt: "2024-01-01T00:01:00Z" },
      ],
    });
    const result = detectIncidents([svc]);
    expect(result.some((i) => i.type === "flapping")).toBe(true);
    const flapping = result.find((i) => i.type === "flapping")!;
    expect(flapping.severity).toBe("warning");
    expect(flapping.details).toContain("60%");
  });

  it("detects version drift (warning)", () => {
    const svc = makeService({
      name: "drifted-api",
      drift: true,
      expectedVersion: "2.0.0",
      latest: {
        ok: true,
        statusCode: 200,
        latencyMs: 50,
        observedVersion: "1.9.0",
        error: null,
        checkedAt: new Date().toISOString(),
      },
    });
    const result = detectIncidents([svc]);
    expect(result.some((i) => i.type === "drift")).toBe(true);
    const drift = result.find((i) => i.type === "drift")!;
    expect(drift.severity).toBe("warning");
    expect(drift.details).toContain("2.0.0");
    expect(drift.details).toContain("1.9.0");
  });

  it("detects degraded service (info)", () => {
    const svc = makeService({
      name: "slow-api",
      recentChecks: [
        { ok: true, latencyMs: 1500, checkedAt: "2024-01-01T00:03:00Z" },
        { ok: true, latencyMs: 1200, checkedAt: "2024-01-01T00:02:00Z" },
        { ok: true, latencyMs: 1800, checkedAt: "2024-01-01T00:01:00Z" },
      ],
    });
    const result = detectIncidents([svc]);
    expect(result.some((i) => i.type === "degraded")).toBe(true);
    const degraded = result.find((i) => i.type === "degraded")!;
    expect(degraded.severity).toBe("info");
    expect(degraded.details).toContain("1500ms");
  });

  it("skips inactive services", () => {
    const svc = makeService({ isActive: false, latest: { ok: false, statusCode: 503, latencyMs: null, observedVersion: null, error: null, checkedAt: new Date().toISOString() } });
    const result = detectIncidents([svc]);
    expect(result).toEqual([]);
  });

  it("handles multiple incident types on same service", () => {
    const svc = makeService({
      name: "troubled-api",
      drift: true,
      expectedVersion: "2.0.0",
      latest: {
        ok: true,
        statusCode: 200,
        latencyMs: 2000,
        observedVersion: "1.0.0",
        error: null,
        checkedAt: new Date().toISOString(),
      },
      recentChecks: [
        { ok: true, latencyMs: 2000, checkedAt: "2024-01-01T00:02:00Z" },
        { ok: true, latencyMs: 1500, checkedAt: "2024-01-01T00:01:00Z" },
        { ok: true, latencyMs: 1800, checkedAt: "2024-01-01T00:00:00Z" },
      ],
    });
    const result = detectIncidents([svc]);
    const types = result.map((i) => i.type);
    expect(types).toContain("drift");
    expect(types).toContain("degraded");
  });

  it("handles service with no recent checks", () => {
    const svc = makeService({ recentChecks: [] });
    const result = detectIncidents([svc]);
    expect(result).toEqual([]);
  });

  it("does not double-report DOWN service as flapping", () => {
    const svc = makeService({
      latest: {
        ok: false,
        statusCode: 500,
        latencyMs: null,
        observedVersion: null,
        error: null,
        checkedAt: new Date().toISOString(),
      },
      recentChecks: [
        { ok: false, latencyMs: null, checkedAt: "2024-01-01T00:03:00Z" },
        { ok: false, latencyMs: null, checkedAt: "2024-01-01T00:02:00Z" },
        { ok: true, latencyMs: 100, checkedAt: "2024-01-01T00:01:00Z" },
      ],
    });
    const result = detectIncidents([svc]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("down");
  });
});
