import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api/queries", () => ({
  queryLastRunAt: vi.fn(),
}));

vi.mock("@/lib/poller", () => ({
  runPollCycle: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(() => ({ from: vi.fn(() => []) })) },
  services: {},
}));

import * as queries from "@/lib/api/queries";
import { GET as getHealth } from "@/app/api/monitor/health/route";
import { POST as postRunOnce } from "@/app/api/run-once/route";
import * as poller from "@/lib/poller";

// ---------------------------------------------------------------------------
// GET /api/monitor/health
// ---------------------------------------------------------------------------
describe("GET /api/monitor/health", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns ok=true with lastRunAt when checks exist", async () => {
    const ts = new Date("2024-01-01T12:00:00Z");
    vi.mocked(queries.queryLastRunAt).mockResolvedValueOnce(ts);
    const res = await getHealth();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.lastRunAt).toBe("2024-01-01T12:00:00.000Z");
  });

  it("returns ok=true with null lastRunAt when no checks yet", async () => {
    vi.mocked(queries.queryLastRunAt).mockResolvedValueOnce(null);
    const res = await getHealth();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.lastRunAt).toBeNull();
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
});
