import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api/queries", () => ({
  queryLastRunAt: vi.fn(),
}));

vi.mock("@/lib/poller", () => {
  class PollCycleInProgressError extends Error {
    constructor() { super("Poll cycle already in progress"); this.name = "PollCycleInProgressError"; }
  }
  return {
    runPollCycle: vi.fn(),
    PollCycleInProgressError,
  };
});

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(() => ({ from: vi.fn(() => []) })) },
  services: {},
}));

import * as queries from "@/lib/api/queries";
import { GET as getHealth } from "@/app/api/monitor/health/route";
import { POST as postRunOnce } from "@/app/api/run-once/route";
import * as poller from "@/lib/poller";
import { PollCycleInProgressError } from "@/lib/poller";

// ---------------------------------------------------------------------------
// GET /api/monitor/health
// ---------------------------------------------------------------------------
describe("GET /api/monitor/health", () => {
  const origPollInterval = process.env.POLL_INTERVAL_MS;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.POLL_INTERVAL_MS;
  });

  afterEach(() => {
    if (origPollInterval !== undefined) {
      process.env.POLL_INTERVAL_MS = origPollInterval;
    } else {
      delete process.env.POLL_INTERVAL_MS;
    }
  });

  it("returns ok=true with lastRunAt when checks exist (recent)", async () => {
    // Use a recent timestamp so it's within the stale threshold
    const ts = new Date(Date.now() - 5_000);
    vi.mocked(queries.queryLastRunAt).mockResolvedValueOnce(ts);
    const res = await getHealth();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.lastRunAt).toBe(ts.toISOString());
  });

  it("returns ok=true with null lastRunAt when no checks yet (fresh deployment)", async () => {
    vi.mocked(queries.queryLastRunAt).mockResolvedValueOnce(null);
    const res = await getHealth();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.lastRunAt).toBeNull();
  });

  it("returns ok=false + 503 when lastRunAt is older than 3 × POLL_INTERVAL_MS", async () => {
    // Default poll interval is 30s, so threshold is 90s. Use 120s ago.
    const ts = new Date(Date.now() - 120_000);
    vi.mocked(queries.queryLastRunAt).mockResolvedValueOnce(ts);
    const res = await getHealth();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.message).toMatch(/stale/i);
  });

  it("returns ok=true + 200 when lastRunAt is within 3 × POLL_INTERVAL_MS", async () => {
    process.env.POLL_INTERVAL_MS = "10000"; // 10s → threshold = 30s
    const ts = new Date(Date.now() - 20_000); // 20s ago, within 30s threshold
    vi.mocked(queries.queryLastRunAt).mockResolvedValueOnce(ts);
    const res = await getHealth();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("uses default 30s poll interval when env var not set", async () => {
    // With default 30s, threshold = 90s. 60s ago should be fine.
    const ts = new Date(Date.now() - 60_000);
    vi.mocked(queries.queryLastRunAt).mockResolvedValueOnce(ts);
    const res = await getHealth();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 500 when query throws", async () => {
    vi.mocked(queries.queryLastRunAt).mockRejectedValueOnce(new Error("db down"));
    const res = await getHealth();
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/run-once
// ---------------------------------------------------------------------------
describe("POST /api/run-once", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with poll cycle summary", async () => {
    vi.mocked(poller.runPollCycle).mockResolvedValueOnce({
      runId: "run-uuid-1",
      total: 3,
      succeeded: 2,
      failed: 1,
      durationMs: 120,
    });

    const req = new NextRequest("http://localhost/api/run-once", { method: "POST" });
    const res = await postRunOnce(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runId).toBe("run-uuid-1");
    expect(body.total).toBe(3);
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(1);
  });

  it("returns 500 when poll cycle throws", async () => {
    vi.mocked(poller.runPollCycle).mockRejectedValueOnce(new Error("poll failed"));
    const req = new NextRequest("http://localhost/api/run-once", { method: "POST" });
    const res = await postRunOnce(req);
    expect(res.status).toBe(500);
  });

  it("returns 409 when poll cycle is already in progress", async () => {
    vi.mocked(poller.runPollCycle).mockRejectedValueOnce(new PollCycleInProgressError());
    const req = new NextRequest("http://localhost/api/run-once", { method: "POST" });
    const res = await postRunOnce(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/in progress/i);
  });
});
